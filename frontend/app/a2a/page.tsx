// app/a2a/page.tsx — A2A Tasks with Gateway Auto-Processing (v4)
'use client'

import { useTranslation } from 'react-i18next'
import { AppLayout } from '@/components/layout/AppLayout'
import { useAccount, useWriteContract } from 'wagmi'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useMyAgentIds } from '@/hooks/user/useMyAgentIds'
import {
  Cpu, Plus, RefreshCw, Loader2, AlertCircle, ArrowRight, Info, Zap,
} from 'lucide-react'
import {
  A2A_CREATE_TASK_ABI, A2A_COMPLETE_TASK_ABI, A2A_TASK_ABI, A2A_USER_TASKS_ABI,
} from '@/abis/A2AProtocol'
import { CreateTaskPanel } from '@/components/a2a/CreateTaskPanel'
import { CompleteTaskModal } from '@/components/a2a/CompleteTaskModal'
import { TaskItem } from '@/components/a2a/TaskItem'
import { A2A_REGISTRY, GATEWAY_URL, publicClient, friendlyError } from './a2a-utils'
import type { A2ATaskDisplay, AgentOption, TaskFilter, GatewayTaskStatus } from './a2a-utils'

export default function A2ATasksPage() {
  const { t } = useTranslation()
  const { address, isConnected } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const { myAgentIds } = useMyAgentIds()

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
  const [creating, setCreating] = useState(false)
  const [createTxHash, setCreateTxHash] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)

  // Complete task
  const [completeTarget, setCompleteTarget] = useState<number | null>(null)

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

  // Filter to only agents the user owns or is subscribed to
  const mySelectableAgents = useMemo(() =>
    agents.filter(a => myAgentIds.has(a.id)),
    [agents, myAgentIds]
  )

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

  const fetchTasks = useCallback(async () => {
    if (!address) return
    setLoading(true); setError(null); setContractWarning(false)
    try {
      let taskIds: bigint[] = []
      try {
        taskIds = await publicClient.readContract({
          address: A2A_REGISTRY, abi: [A2A_USER_TASKS_ABI], functionName: 'getUserTasks', args: [address],
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
                address: A2A_REGISTRY, abi: [A2A_TASK_ABI], functionName: 'getTask', args: [BigInt(id)],
              }) as unknown as any[]
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
            address: A2A_REGISTRY, abi: [A2A_TASK_ABI], functionName: 'getTask', args: [id],
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

  const handleCreateTask = async (agent: AgentOption, taskType: string, inputData: string) => {
    if (!address || !agent || !taskType) return
    setCreating(true); setCreateError(null); setCreateTxHash(null)
    try {
      const hash = await writeContractAsync({
        address: A2A_REGISTRY, abi: [A2A_CREATE_TASK_ABI], functionName: 'createTask',
        args: [BigInt(agent.id), taskType, inputData],
      })
      setCreateTxHash(hash)
      // Wait for tx to be mined, then refresh
      await publicClient.waitForTransactionReceipt({ hash })
      setShowCreate(false)
      // Refresh immediately after tx confirmed
      setTimeout(() => fetchTasks(), 1500)
    } catch (e: any) {
      setCreateError(friendlyError(e, t))
    } finally { setCreating(false) }
  }

  const handleCompleteTask = async (output: string, status: string) => {
    if (completeTarget === null) return
    try {
      await writeContractAsync({
        address: A2A_REGISTRY, abi: [A2A_COMPLETE_TASK_ABI], functionName: 'completeTask',
        args: [BigInt(completeTarget), output, BigInt(status)],
      })
      setCompleteTarget(null)
      fetchTasks()
    } catch (e: any) {
      setCreateError(friendlyError(e, t))
      throw e
    }
  }

  // Open the complete modal for a task (pre-filled from Gateway result when available)
  const openComplete = (task: A2ATaskDisplay) => {
    setCompleteTarget(task.taskId); setCreateError(null)
  }

  const filtered = tasks.filter(t => {
    if (filter === 'active') return t.status <= 2
    if (filter === 'completed') return t.status >= 3
    return true
  })

  // Check if a task is the current user's own (they created it)
  const isMyTask = (task: A2ATaskDisplay): boolean => !!address && task.clientAddress.toLowerCase() === address.toLowerCase()

  // Complete modal data
  const gwForComplete = completeTarget !== null ? gatewayStatuses[completeTarget] : undefined
  const initialCompleteOutput = gwForComplete?.status === 2 && gwForComplete.output_data ? gwForComplete.output_data : ''

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
              <button onClick={() => { setCreateError(null); setCreateTxHash(null); setShowCreate(true) }} className="btn-primary text-sm py-2 px-4 flex items-center gap-2">
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
          <CreateTaskPanel
            agents={mySelectableAgents}
            creating={creating}
            createTxHash={createTxHash}
            createError={createError}
            onSubmit={handleCreateTask}
            onClose={() => setShowCreate(false)}
          />
        )}

        {/* Complete Task Modal */}
        {completeTarget !== null && (
          <CompleteTaskModal
            key={completeTarget}
            taskId={completeTarget}
            initialOutput={initialCompleteOutput}
            llmModel={gwForComplete?.llm_model}
            error={createError}
            onSubmit={handleCompleteTask}
            onClose={() => setCompleteTarget(null)}
          />
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
              <button onClick={() => { setCreateError(null); setCreateTxHash(null); setShowCreate(true) }} className="btn-primary text-sm py-2 px-6">
                <Plus className="w-4 h-4" /> {t('a2a.createTask')}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(task => (
              <TaskItem key={task.taskId} task={task} gw={gatewayStatuses[task.taskId]} isMine={isMyTask(task)} onOpenComplete={openComplete} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
