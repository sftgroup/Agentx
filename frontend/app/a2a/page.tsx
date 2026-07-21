// app/a2a/page.tsx — A2A Tasks with On-Chain Index (v2 — OxaChain L1)
'use client'

import { useTranslation } from 'react-i18next'
import { AppLayout } from '@/components/layout/AppLayout'
import { useAccount } from 'wagmi'
import { useState, useEffect, useCallback } from 'react'
import {
  Cpu, Plus, RefreshCw, Clock, CheckCircle, AlertCircle,
  Loader2, ArrowRight, Filter, Info
} from 'lucide-react'
import { createPublicClient, http } from 'viem'

const oxaChain = { id: 19505, name: 'OxaChain L1', nativeCurrency: { name: 'OXA', symbol: 'OXA', decimals: 18 }, rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_OXACHAIN_RPC_URL || 'https://rpc-oxa.0xainet.top'] } } }
const A2A_REGISTRY = (process.env.NEXT_PUBLIC_A2A_PROTOCOL_ADDRESS || '0x7F42a7dC4A0F3C107664C3750bE1B5B6fa6BEb86') as `0x${string}`

const publicClient = createPublicClient({ chain: oxaChain, transport: http() })

const A2A_ABI_TASK = {
  inputs: [{ name: 'taskId', type: 'uint256' }], name: 'getTask',
  outputs: [
    { name: 'taskId', type: 'uint256' }, { name: 'agentId', type: 'uint256' },
    { name: 'taskType', type: 'string' }, { name: 'inputData', type: 'string' },
    { name: 'outputData', type: 'string' }, { name: 'status', type: 'uint256' },
    { name: 'clientAddress', type: 'address' }, { name: 'createdAt', type: 'uint256' },
    { name: 'completedAt', type: 'uint256' },
  ], stateMutability: 'view', type: 'function',
} as const

const A2A_ABI_USER_TASKS = {
  inputs: [{ name: 'user', type: 'address' }], name: 'getUserTasks',
  outputs: [{ name: '', type: 'uint256[]' }], stateMutability: 'view', type: 'function',
} as const

interface A2ATaskDisplay {
  taskId: number; agentId: number; taskType: string
  inputData: string; outputData: string; status: number
  clientAddress: string; createdAt: number; completedAt: number
}

type TaskFilter = 'all' | 'active' | 'completed'

export default function A2ATasksPage() {
  const { t } = useTranslation()
  const { address, isConnected } = useAccount()
  const [tasks, setTasks] = useState<A2ATaskDisplay[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<TaskFilter>('all')
  const [contractWarning, setContractWarning] = useState(false)

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
          address: A2A_REGISTRY,
          abi: [A2A_ABI_USER_TASKS], functionName: 'getUserTasks', args: [address],
        }) as bigint[]
      } catch (e: any) {
        // getUserTasks not supported on independent contract — probe sequentially instead
        if (e.message?.includes('returned no data') || e.message?.includes('reverted')) {
          setContractWarning(true)
          // Try sequential probe: check taskId 1..N
          for (let id = 1; id <= 20; id++) {
            try {
              const r = await publicClient.readContract({
                address: A2A_REGISTRY,
                abi: [A2A_ABI_TASK], functionName: 'getTask', args: [BigInt(id)],
              }) as any[]
              const clientAddr = (r[6] as string).toLowerCase()
              if (clientAddr === address.toLowerCase()) {
                taskIds.push(BigInt(id))
              }
            } catch { break /* no more tasks */ }
          }
        } else {
          throw e
        }
      }

      const results: A2ATaskDisplay[] = []
      for (const id of taskIds.slice(0, 20)) {
        try {
          const r = await publicClient.readContract({
            address: A2A_REGISTRY,
            abi: [A2A_ABI_TASK], functionName: 'getTask', args: [id],
          }) as any
          results.push({
            taskId: Number(r[0]), agentId: Number(r[1]), taskType: r[2] as string,
            inputData: r[3] as string, outputData: r[4] as string, status: Number(r[5]),
            clientAddress: r[6] as string, createdAt: Number(r[7]), completedAt: Number(r[8]),
          })
        } catch { /* skip corrupted tasks */ }
      }
      setTasks(results.reverse())
    } catch (e: any) { setError(e.message || 'Failed to load tasks') }
    finally { setLoading(false) }
  }, [address])

  useEffect(() => { if (isConnected) fetchTasks() }, [isConnected, fetchTasks])

  const filtered = tasks.filter(t => {
    if (filter === 'active') return t.status <= 2
    if (filter === 'completed') return t.status >= 3
    return true
  })

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto py-8 px-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="heading-md flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-accent-cyan/10 flex items-center justify-center"><Cpu className="w-5 h-5 text-accent-cyan" /></div>
              {t('a2a.title')}
            </h1>
            <p className="body text-text-secondary mt-1">{t('a2a.desc')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchTasks} disabled={loading} className="btn-secondary text-sm py-2 px-3">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {contractWarning && (
          <div className="p-4 rounded-xl bg-amber-400/5 border border-amber-400/10 text-sm text-amber-400 flex items-center gap-2">
            <Info className="w-4 h-4 flex-shrink-0" />
            {t('a2a.upgradeNote')}
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-red-400/5 border border-red-400/10 text-sm text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        {isConnected && tasks.length > 0 && (
          <div className="flex gap-1 p-1 bg-white/3 rounded-xl w-fit">
            {(['all', 'active', 'completed'] as TaskFilter[]).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-lg text-sm capitalize transition-colors ${filter === f ? 'bg-white/10 text-text-primary' : 'text-text-muted hover:text-text-secondary'}`}>
                {f === 'all' ? t('a2a.filterAll') : f === 'active' ? t('a2a.filterActive') : t('a2a.filterCompleted')}
              </button>
            ))}
          </div>
        )}

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
            <p className="body text-text-muted mb-4 max-w-md mx-auto">
              {t('a2a.noTasksDesc')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(task => {
              const st = STATUS_CONFIG[task.status] ?? STATUS_CONFIG[0]
              const Icon = st.icon
              return (
                <div key={task.taskId} className="glass-card glass-card-hover p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium truncate">{task.taskType || t('a2a.unknownTask')}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full bg-white/5 flex items-center gap-1 ${st.color}`}>
                          <Icon className="w-3 h-3" /> {st.label}
                        </span>
                      </div>
                      <p className="text-xs text-text-muted mb-2">
                        Agent #{task.agentId} · {new Date(task.createdAt * 1000).toLocaleDateString()}
                        {task.completedAt > 0 && ` · ${t('a2a.done')} ${new Date(task.completedAt * 1000).toLocaleDateString()}`}
                      </p>
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
                    <div className="text-xs text-text-muted flex-shrink-0">#{task.taskId}</div>
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
