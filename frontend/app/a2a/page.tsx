// app/a2a/page.tsx — A2A Tasks with Gateway Auto-Processing (v4)
'use client'

import { useTranslation } from 'react-i18next'
import { AppLayout } from '@/components/layout/AppLayout'
import { useAccount, useWriteContract } from 'wagmi'
import { useState, useEffect, useCallback } from 'react'
import {
  Cpu, Plus, RefreshCw, Clock, CheckCircle, AlertCircle,
  Loader2, ArrowRight, Filter, Info, Send, X, Check, Search, Zap, Brain
} from 'lucide-react'
import { createPublicClient, http } from 'viem'

const oxaChain = { id: 19505, name: 'OxaChain L1', nativeCurrency: { name: 'OXA', symbol: 'OXA', decimals: 18 }, rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_OXACHAIN_RPC_URL || 'https://rpc-oxa.0xainet.top'] } } }
const A2A_REGISTRY = (process.env.NEXT_PUBLIC_A2A_PROTOCOL_ADDRESS || '0x7F42a7dC4A0F3C107664C3750bE1B5B6fa6BEb86') as `0x${string}`
const GATEWAY_URL = process.env.NEXT_PUBLIC_AGENTX_GATEWAY_URL || 'http://43.156.99.215:3090'

const publicClient = createPublicClient({ chain: oxaChain, transport: http() })

const A2A_ABI_CREATE_TASK = {
  inputs: [{ name: 'agentId', type: 'uint256' }, { name: 'taskType', type: 'string' }, { name: 'inputData', type: 'string' }],
  name: 'createTask', outputs: [{ name: 'taskId', type: 'uint256' }], stateMutability: 'nonpayable', type: 'function',
} as const

const A2A_ABI_COMPLETE_TASK = {
  inputs: [{ name: 'taskId', type: 'uint256' }, { name: 'outputData', type: 'string' }, { name: 'status', type: 'uint256' }],
  name: 'completeTask', outputs: [], stateMutability: 'nonpayable', type: 'function',
} as const

const A2A_ABI_TASK = {
  inputs: [{ name: 'taskId', type: 'uint256' }], name: 'getTask',
  outputs: [
    { name: 'taskId', type: 'uint256' }, { name: 'agentId', type: 'uint256' }, { name: 'taskType', type: 'string' },
    { name: 'inputData', type: 'string' }, { name: 'outputData', type: 'string' }, { name: 'status', type: 'uint256' },
    { name: 'clientAddress', type: 'address' }, { name: 'createdAt', type: 'uint256' }, { name: 'completedAt', type: 'uint256' },
  ], stateMutability: 'view', type: 'function',
} as const

const A2A_ABI_USER_TASKS = {
  inputs: [{ name: 'user', type: 'address' }], name: 'getUserTasks',
  outputs: [{ name: '', type: 'uint256[]' }], stateMutability: 'view', type: 'function',
} as const

const TASK_TYPE_PRESETS = ['Audit', 'Analyze', 'Summarize', 'Research', 'Translate', 'Generate Report']

interface A2ATaskDisplay {
  taskId: number; agentId: number; taskType: string
  inputData: string; outputData: string; status: number
  clientAddress: string; createdAt: number; completedAt: number
}

interface GatewayTaskStatus {
  status: number  // 0=pending, 1=processing, 2=completed, 3=failed
  output_data?: string
  llm_model?: string
  processed_at?: string
}

interface AgentOption { id: number; name: string; description: string; owner?: string }

type TaskFilter = 'all' | 'active' | 'completed'

function friendlyError(e: any, t: any): string {
  const msg = e?.message || e?.toString?.() || ''
  if (msg.includes('User rejected') || msg.includes('denied')) return t('a2a.userRejected')
  if (msg.includes('insufficient funds')) return t('a2a.insufficientFunds')
  return msg.length > 120 ? msg.slice(0, 120) + '...' : msg
}

export default function A2ATasksPage() {
  const { t } = useTranslation()
  const { address, isConnected } = useAccount()
  const { writeContractAsync } = useWriteContract()

  // Task list
  const [tasks, setTasks] = useState<A2ATaskDisplay[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<TaskFilter>('all')
  const [contractWarning, setContractWarning] = useState(false)

  // Gateway task status map: taskId → GatewayTaskStatus
  const [gatewayStatuses, setGatewayStatuses] = useState<Record<number, GatewayTaskStatus>>({})

  // Create task
  const [showCreate, setShowCreate] = useState(false)
  const [agents, setAgents] = useState<AgentOption[]>([])
  const [agentSearch, setAgentSearch] = useState('')
  const [selectedAgent, setSelectedAgent] = useState<AgentOption | null>(null)
  const [taskType, setTaskType] = useState('')
  const [inputData, setInputData] = useState('')
  const [creating, setCreating] = useState(false)
  const [createTxHash, setCreateTxHash] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)

  // Complete task
  const [completeTarget, setCompleteTarget] = useState<number | null>(null)
  const [completeOutput, setCompleteOutput] = useState('')
  const [completeStatus, setCompleteStatus] = useState('3')
  const [completing, setCompleting] = useState(false)

  // Auto-processing status
  const [workerStatus, setWorkerStatus] = useState<{ running: boolean; taskCounts: Record<string, number> } | null>(null)

  // Poll Gateway worker status
  useEffect(() => {
    const pollWorker = () => {
      fetch(`${GATEWAY_URL}/api/v1/a2a/worker-status`)
        .then(r => r.json())
        .then(d => setWorkerStatus(d))
        .catch(() => setWorkerStatus(null))
    }
    pollWorker()
    const interval = setInterval(pollWorker, 30_000)
    return () => clearInterval(interval)
  }, [])

  // Load agents
  useEffect(() => {
    fetch(`${GATEWAY_URL}/api/v1/agents`)
      .then(r => r.json())
      .then(d => setAgents((d.agents || []).map((a: any) => ({
        id: a.id, name: a.name || `Agent #${a.id}`, description: a.description || '', owner: a.owner || '',
      }))))
      .catch(() => {})
  }, [])

  // Poll Gateway for each active task's processing status
  useEffect(() => {
    if (tasks.length === 0) return
    const activeTasks = tasks.filter(t => t.status <= 2)
    if (activeTasks.length === 0) return

    const pollGateway = async () => {
      const updates: Record<number, GatewayTaskStatus> = {}
      for (const task of activeTasks) {
        try {
          const res = await fetch(`${GATEWAY_URL}/api/v1/a2a/task-result/${task.taskId}`)
          if (res.ok) {
            const data = await res.json()
            updates[task.taskId] = data
          }
        } catch { /* gateway may not have this task */ }
      }
      if (Object.keys(updates).length > 0) {
        setGatewayStatuses(prev => ({ ...prev, ...updates }))
      }
    }
    pollGateway()
    const interval = setInterval(pollGateway, 15_000)
    return () => clearInterval(interval)
  }, [tasks])

  const resetCreateForm = () => {
    setSelectedAgent(null); setTaskType(''); setInputData(''); setCreateError(null); setCreateTxHash(null)
    setAgentSearch('')
  }

  const filteredAgents = agents.filter(a =>
    !agentSearch || a.name.toLowerCase().includes(agentSearch.toLowerCase())
  ).slice(0, 20)

  const STATUS_CONFIG: Record<number, { label: string; icon: typeof Clock; color: string }> = {
    0: { label: t('a2a.statusCreated'), icon: Clock, color: 'text-yellow-400' },
    1: { label: t('a2a.statusAccepted'), icon: RefreshCw, color: 'text-blue-400' },
    2: { label: t('a2a.statusInProgress'), icon: RefreshCw, color: 'text-accent-cyan' },
    3: { label: t('a2a.statusCompleted'), icon: CheckCircle, color: 'text-green-400' },
    4: { label: t('a2a.statusFailed'), icon: AlertCircle, color: 'text-red-400' },
  }

  const fetchTasks = useCallback(async () => {
    if (!address) return
    setLoading(true); setError(null); setContractWarning(false)
    try {
      let taskIds: bigint[] = []
      try {
        taskIds = await publicClient.readContract({
          address: A2A_REGISTRY, abi: [A2A_ABI_USER_TASKS], functionName: 'getUserTasks', args: [address],
        }) as bigint[]
      } catch (e: any) {
        if (e.message?.includes('returned no data') || e.message?.includes('reverted')) {
          setContractWarning(true)
          // Use consecutive-miss counter instead of breaking on first error
          let consecutiveMisses = 0
          const MAX_MISSES = 8
          for (let id = 1; consecutiveMisses < MAX_MISSES && id <= 200; id++) {
            try {
              const r = await publicClient.readContract({
                address: A2A_REGISTRY, abi: [A2A_ABI_TASK], functionName: 'getTask', args: [BigInt(id)],
              }) as any[]
              consecutiveMisses = 0
              if ((r[6] as string).toLowerCase() === address.toLowerCase()) {
                taskIds.push(BigInt(id))
              }
            } catch { consecutiveMisses++ }
          }
        } else { throw e }
      }
      const results: A2ATaskDisplay[] = []
      for (const id of taskIds.slice(-50)) {
        try {
          const r = await publicClient.readContract({
            address: A2A_REGISTRY, abi: [A2A_ABI_TASK], functionName: 'getTask', args: [id],
          }) as any
          results.push({
            taskId: Number(r[0]), agentId: Number(r[1]), taskType: r[2] as string,
            inputData: r[3] as string, outputData: r[4] as string, status: Number(r[5]),
            clientAddress: r[6] as string, createdAt: Number(r[7]), completedAt: Number(r[8]),
          })
        } catch { /* skip */ }
      }
      setTasks(results.reverse())
    } catch (e: any) { setError(e.message || 'Failed') }
    finally { setLoading(false) }
  }, [address])

  useEffect(() => { if (isConnected) fetchTasks() }, [isConnected, fetchTasks])

  const handleCreateTask = async () => {
    if (!address || !selectedAgent || !taskType) return
    setCreating(true); setCreateError(null); setCreateTxHash(null)
    try {
      const hash = await writeContractAsync({
        address: A2A_REGISTRY, abi: [A2A_ABI_CREATE_TASK], functionName: 'createTask',
        args: [BigInt(selectedAgent.id), taskType, inputData],
      })
      setCreateTxHash(hash)
      // Wait for tx to be mined, then refresh
      await publicClient.waitForTransactionReceipt({ hash })
      setShowCreate(false); resetCreateForm()
      // Refresh immediately after tx confirmed
      setTimeout(() => fetchTasks(), 1500)
    } catch (e: any) {
      setCreateError(friendlyError(e, t))
    } finally { setCreating(false) }
  }

  const handleCompleteTask = async () => {
    if (completeTarget === null) return
    setCompleting(true)
    try {
      await writeContractAsync({
        address: A2A_REGISTRY, abi: [A2A_ABI_COMPLETE_TASK], functionName: 'completeTask',
        args: [BigInt(completeTarget), completeOutput, BigInt(completeStatus)],
      })
      setCompleteTarget(null); setCompleteOutput(''); setCompleteStatus('3')
      fetchTasks()
    } catch (e: any) {
      setCreateError(friendlyError(e, t))
    } finally { setCompleting(false) }
  }

  // Auto-fill complete output from Gateway result
  const openComplete = (task: A2ATaskDisplay) => {
    const gw = gatewayStatuses[task.taskId]
    if (gw?.status === 2 && gw.output_data) {
      setCompleteOutput(gw.output_data)
    } else {
      setCompleteOutput('')
    }
    setCompleteStatus('3'); setCompleteTarget(task.taskId); setCreateError(null)
  }

  const filtered = tasks.filter(t => {
    if (filter === 'active') return t.status <= 2
    if (filter === 'completed') return t.status >= 3
    return true
  })

  // Check if a task is the current user's own (they created it)
  const isMyTask = (task: A2ATaskDisplay) => address && task.clientAddress.toLowerCase() === address.toLowerCase()

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto py-8 px-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="heading-md flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-accent-cyan/10 flex items-center justify-center"><Cpu className="w-5 h-5 text-accent-cyan" /></div>
              {t('a2a.title')}
            </h1>
            <p className="body text-text-secondary mt-1">{t('a2a.desc')}</p>
            {/* Auto-processing status */}
            {workerStatus && (
              <div className="flex flex-wrap items-center gap-3 mt-3">
                <div className={`flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full ${
                  workerStatus.running ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${workerStatus.running ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                  {workerStatus.running ? t('a2a.workerRunning') : t('a2a.workerStopped')}
                </div>
                <span className="text-xs text-text-muted">
                  <Zap className="w-3 h-3 inline mr-1 text-accent-cyan" />
                  {t('a2a.autoProcessed')}: {workerStatus.taskCounts?.completed || 0}
                </span>
                {(workerStatus.taskCounts?.processing || 0) > 0 && (
                  <span className="text-xs text-accent-cyan flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {t('a2a.processing')}: {workerStatus.taskCounts?.processing}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isConnected && (
              <button onClick={() => { resetCreateForm(); setShowCreate(true) }} className="btn-primary text-sm py-2 px-4 flex items-center gap-2">
                <Plus className="w-4 h-4" /> {t('a2a.createTask')}
              </button>
            )}
            <button onClick={fetchTasks} disabled={loading} className="btn-secondary text-sm py-2 px-3">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Create Task Panel */}
        {showCreate && (
          <div className="glass-card p-6 space-y-4 border border-accent-purple/10">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{t('a2a.createTaskTitle')}</h3>
              <button onClick={() => setShowCreate(false)} className="text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
            </div>

            {/* Step 1: Pick Agent */}
            <div>
              <label className="text-sm text-text-secondary mb-2 block">
                {selectedAgent ? `${t('a2a.targetAgent')}: ` : t('a2a.selectAgent')}
                {selectedAgent && <span className="text-accent-purple ml-1">{selectedAgent.name}</span>}
              </label>
              {!selectedAgent ? (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                    <input value={agentSearch} onChange={e => setAgentSearch(e.target.value)}
                      placeholder={t('a2a.searchAgent')}
                      className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40" />
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {filteredAgents.map(a => (
                      <button key={a.id} type="button" onClick={() => setSelectedAgent(a)}
                        className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors flex items-center justify-between group">
                        <div>
                          <span className="text-sm text-text-primary">{a.name}</span>
                          <span className="text-xs text-text-muted ml-2">#{a.id}</span>
                        </div>
                        <ArrowRight className="w-4 h-4 text-text-muted opacity-0 group-hover:opacity-100" />
                      </button>
                    ))}
                    {filteredAgents.length === 0 && (
                      <p className="text-xs text-text-muted text-center py-4">{t('a2a.noAgents')}</p>
                    )}
                  </div>
                </div>
              ) : (
                <button onClick={() => setSelectedAgent(null)} className="text-xs text-text-muted hover:text-text-secondary">
                  {t('a2a.changeAgent')}
                </button>
              )}
            </div>

            {/* Step 2: Task Type */}
            {selectedAgent && (
              <div>
                <label className="text-sm text-text-secondary mb-2 block">{t('a2a.whatToDo')}</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {TASK_TYPE_PRESETS.map(p => (
                    <button key={p} type="button" onClick={() => setTaskType(p)}
                      className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                        taskType === p ? 'bg-accent-purple/15 text-accent-purple border-accent-purple/20' : 'bg-white/3 border-white/5 text-text-muted hover:text-text-secondary'
                      }`}>{p}</button>
                  ))}
                </div>
                <input value={taskType} onChange={e => setTaskType(e.target.value)}
                  placeholder={t('a2a.taskTypeCustom')}
                  className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40" />
              </div>
            )}

            {/* Step 3: Task Detail */}
            {selectedAgent && taskType && (
              <div>
                <label className="text-sm text-text-secondary mb-2 block">{t('a2a.taskDetailLabel')}</label>
                <p className="text-xs text-text-muted mb-2">{t('a2a.taskDetailHint')}</p>
                <textarea value={inputData} onChange={e => setInputData(e.target.value)}
                  placeholder={t('a2a.taskDetailPlaceholder')} rows={4}
                  className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40 resize-none" />
              </div>
            )}

            {/* Submit */}
            {selectedAgent && taskType && (
              <>
                {createTxHash && (
                  <div className="p-3 rounded-lg bg-green-400/5 border border-green-400/10 text-sm text-green-400">
                    {t('a2a.taskCreated')} Tx: {createTxHash.slice(0, 10)}...{createTxHash.slice(-8)}
                  </div>
                )}
                {createError && (
                  <div className="p-3 rounded-lg bg-red-400/5 border border-red-400/10 text-sm text-red-400 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {createError}
                  </div>
                )}
                <button onClick={handleCreateTask} disabled={creating || !selectedAgent || !taskType}
                  className="btn-primary text-sm py-2.5 px-8 flex items-center gap-2">
                  {creating ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('a2a.creating')}</> :
                    <><Send className="w-4 h-4" /> {t('a2a.submitTask')}</>}
                </button>
              </>
            )}
          </div>
        )}

        {/* Complete Task Modal */}
        {completeTarget !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setCompleteTarget(null)}>
            <div className="glass-card p-6 w-full max-w-md mx-4 space-y-4" onClick={e => e.stopPropagation()}>
              <h3 className="font-semibold">{t('a2a.completeTaskTitle')} #{completeTarget}</h3>
              <div>
                <label className="text-sm text-text-secondary mb-1 block">{t('a2a.outputDataLabel')}</label>
                <textarea value={completeOutput} onChange={e => setCompleteOutput(e.target.value)}
                  placeholder={t('a2a.outputDataPlaceholder')} rows={3}
                  className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40 resize-none" />
                {completeOutput && gatewayStatuses[completeTarget]?.llm_model && (
                  <p className="text-xs text-accent-cyan mt-1 flex items-center gap-1">
                    <Brain className="w-3 h-3" /> {t('a2a.gatewayGenerated', { model: gatewayStatuses[completeTarget].llm_model! })}
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm text-text-secondary mb-1 block">{t('a2a.statusLabel')}</label>
                <div className="flex gap-2">
                  {[{ v: '3', l: t('a2a.statusCompleted') }, { v: '4', l: t('a2a.statusFailed') }].map(o => (
                    <button key={o.v} type="button" onClick={() => setCompleteStatus(o.v)}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                        completeStatus === o.v ? 'bg-accent-purple/15 text-accent-purple border-accent-purple/20' : 'bg-white/3 border-white/5 text-text-muted hover:text-text-secondary'
                      }`}>{o.l}</button>
                  ))}
                </div>
              </div>
              {createError && (
                <div className="p-2 rounded-lg bg-red-400/5 text-xs text-red-400 flex items-center gap-2">
                  <AlertCircle className="w-3 h-3" /> {createError}
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => setCompleteTarget(null)} className="btn-secondary text-sm py-2 flex-1">{t('studio.back')}</button>
                <button onClick={handleCompleteTask} disabled={completing}
                  className="btn-primary text-sm py-2 flex-1 flex items-center justify-center gap-2">
                  {completing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{t('a2a.submitComplete')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Alerts */}
        {contractWarning && (
          <div className="p-4 rounded-xl bg-amber-400/5 border border-amber-400/10 text-sm text-amber-400 flex items-center gap-2">
            <Info className="w-4 h-4 flex-shrink-0" />{t('a2a.upgradeNote')}
          </div>
        )}
        {error && (
          <div className="p-4 rounded-xl bg-red-400/5 border border-red-400/10 text-sm text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        {/* Filters */}
        {isConnected && tasks.length > 0 && (
          <div className="flex gap-1 p-1 bg-white/3 rounded-xl w-fit">
            {(['all', 'active', 'completed'] as TaskFilter[]).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${filter === f ? 'bg-white/10 text-text-primary' : 'text-text-muted hover:text-text-secondary'}`}>
                {f === 'all' ? t('a2a.filterAll') : f === 'active' ? t('a2a.filterActive') : t('a2a.filterCompleted')}
              </button>
            ))}
          </div>
        )}

        {/* Task List */}
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-text-muted animate-spin" /></div>
        ) : !isConnected ? (
          <div className="text-center py-16 glass-card">
            <Cpu className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-30" />
            <h3 className="font-semibold mb-1">{t('a2a.connectTitle')}</h3>
            <p className="body text-text-muted">{t('a2a.connectDesc')}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 glass-card">
            <div className="w-16 h-16 rounded-2xl bg-accent-cyan/10 flex items-center justify-center mx-auto mb-4">
              <ArrowRight className="w-8 h-8 text-accent-cyan/40" />
            </div>
            <h3 className="font-semibold mb-1">{t('a2a.noTasks')}</h3>
            <p className="body text-text-muted mb-4 max-w-md mx-auto">{t('a2a.noTasksDesc')}</p>
            {isConnected && (
              <button onClick={() => { resetCreateForm(); setShowCreate(true) }} className="btn-primary text-sm py-2 px-6">
                <Plus className="w-4 h-4" /> {t('a2a.createTask')}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(task => {
              const st = STATUS_CONFIG[task.status] ?? STATUS_CONFIG[0]
              const Icon = st.icon
              const gw = gatewayStatuses[task.taskId]
              const isMine = isMyTask(task)
              return (
                <div key={task.taskId} className={`glass-card glass-card-hover p-5 ${!isMine ? 'border-l-2 border-l-accent-purple/20' : ''}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-medium truncate">{task.taskType || t('a2a.unknownTask')}</span>
                        {/* On-chain status */}
                        <span className={`text-xs px-2 py-0.5 rounded-full bg-white/5 flex items-center gap-1 ${st.color}`}>
                          <Icon className="w-3 h-3" /> {st.label}
                        </span>
                        {/* Multi-tenant tag: only show on tasks created by others */}
                        {!isMine && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-accent-purple/10 text-accent-purple/70">
                            {t('a2a.fromOther')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-text-muted mb-2">
                        Agent #{task.agentId} · {new Date(task.createdAt * 1000).toLocaleDateString()}
                        {task.completedAt > 0 && ` · ${t('a2a.done')} ${new Date(task.completedAt * 1000).toLocaleDateString()}`}
                      </p>

                      {/* Gateway processing status */}
                      {task.status <= 2 && gw && (
                        <div className="mb-2">
                          {gw.status === 1 && (
                            <span className="text-xs text-accent-cyan flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" /> {t('a2a.gatewayProcessing')}
                              {gw.llm_model && <span className="opacity-60">({gw.llm_model})</span>}
                            </span>
                          )}
                          {gw.status === 2 && (
                            <span className="text-xs text-green-400 flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" /> {t('a2a.gatewayDone')}
                              <button onClick={() => openComplete(task)}
                                className="ml-2 underline hover:text-green-300">{t('a2a.clickToComplete')}</button>
                            </span>
                          )}
                          {gw.status === 3 && (
                            <span className="text-xs text-red-400 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> {t('a2a.gatewayFailed')}
                            </span>
                          )}
                        </div>
                      )}

                      {task.inputData && (
                        <details className="text-xs text-text-muted">
                          <summary className="cursor-pointer hover:text-text-secondary">{t('a2a.input')}</summary>
                          <pre className="mt-1 p-2 rounded bg-white/3 text-xs max-h-32 overflow-auto">{task.inputData}</pre>
                        </details>
                      )}
                      {task.outputData && (
                        <details className="text-xs text-text-muted mt-1">
                          <summary className="cursor-pointer hover:text-text-secondary">{t('a2a.output')}</summary>
                          <pre className="mt-1 p-2 rounded bg-white/3 text-xs max-h-32 overflow-auto">{task.outputData}</pre>
                        </details>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Only show Complete for tasks where we are the creator (our agent received the task) */}
                      {task.status <= 2 && isMine && (
                        <button onClick={() => openComplete(task)}
                          className="text-xs px-2 py-1 rounded bg-accent-purple/10 text-accent-purple hover:bg-accent-purple/20 transition-colors">
                          <Check className="w-3 h-3 inline mr-1" />{t('a2a.complete')}
                        </button>
                      )}
                      {/* For tasks created by us but assigned to other agents, show a waiting indicator */}
                      {task.status <= 2 && !isMine && (
                        <span className="text-xs px-2 py-1 rounded bg-white/3 text-text-muted">
                          <Clock className="w-3 h-3 inline mr-1" />{t('a2a.waiting')}
                        </span>
                      )}
                      <span className="text-xs text-text-muted">#{task.taskId}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
