// ---------------------------------------------------------------------------
// AgentX — TaskItem Component
// ---------------------------------------------------------------------------
// A single A2A task card: on-chain status, gateway processing status,
// input/output details and complete action.
// ---------------------------------------------------------------------------

'use client'

import { useTranslation } from 'react-i18next'
import { Clock, RefreshCw, CheckCircle, AlertCircle, Loader2, Check } from 'lucide-react'
import type { A2ATaskDisplay, GatewayTaskStatus } from '@/app/a2a/a2a-utils'

interface TaskItemProps {
  task: A2ATaskDisplay
  gw?: GatewayTaskStatus
  isMine: boolean
  onOpenComplete: (task: A2ATaskDisplay) => void
}

export function TaskItem({ task, gw, isMine, onOpenComplete }: TaskItemProps) {
  const { t } = useTranslation()

  const STATUS_CONFIG: Record<number, { label: string; icon: typeof Clock; color: string }> = {
    0: { label: t('a2a.statusCreated'), icon: Clock, color: 'text-yellow-400' },
    1: { label: t('a2a.statusAccepted'), icon: RefreshCw, color: 'text-blue-400' },
    2: { label: t('a2a.statusInProgress'), icon: RefreshCw, color: 'text-accent-cyan' },
    3: { label: t('a2a.statusCompleted'), icon: CheckCircle, color: 'text-green-400' },
    4: { label: t('a2a.statusFailed'), icon: AlertCircle, color: 'text-red-400' },
  }

  const st = STATUS_CONFIG[task.status] ?? STATUS_CONFIG[0]
  const Icon = st.icon

  return (
    <div className={`glass-card glass-card-hover p-5 ${!isMine ? 'border-l-2 border-l-accent-purple/20' : ''}`}>
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
              {gw.status === 4 && (
                <span className="text-xs text-yellow-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {t('a2a.awaitingPayment')}
                  {gw.payment_amount_wei && (
                    <span className="opacity-80">· {(Number(gw.payment_amount_wei) / 1e18).toFixed(4)} OXA</span>
                  )}
                </span>
              )}
              {gw.status === 2 && (
                <span className="text-xs text-green-400 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> {t('a2a.gatewayDone')}
                  <button onClick={() => onOpenComplete(task)}
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
            <button onClick={() => onOpenComplete(task)}
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
}
