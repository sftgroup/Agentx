// ---------------------------------------------------------------------------
// AgentX — TaskCard Component
// ---------------------------------------------------------------------------
// Parallel task card (R1): status badge + cancel action for a ConversationTask.
// ---------------------------------------------------------------------------

'use client'

import { X } from 'lucide-react'
import type { ConversationTask } from '@agentxv2/sdk/conversation'

export const TASK_STATUS_STYLE: Record<string, string> = {
  queued: 'bg-white/5 text-text-muted',
  running: 'bg-accent-cyan/10 text-accent-cyan',
  done: 'bg-green-400/10 text-green-400',
  error: 'bg-red-400/10 text-red-400',
  cancelled: 'bg-white/5 text-text-muted',
}

export function TaskCard({ task, onCancel }: { task: ConversationTask; onCancel: (taskId: string) => void }) {
  const terminal = task.status === 'done' || task.status === 'error' || task.status === 'cancelled'
  return (
    <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-text-secondary truncate">{task.message}</p>
          <p className="text-[11px] text-text-muted/60 mt-0.5">
            #{task.id.slice(0, 8)} · {new Date(task.createdAt).toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${TASK_STATUS_STYLE[task.status] || ''}`}>
            {task.status === 'running' ? '● running' : task.status}
          </span>
          {!terminal && (
            <button onClick={() => onCancel(task.id)} title="Cancel task"
              className="p-1.5 rounded-lg hover:bg-red-400/10 text-text-muted hover:text-red-400 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      {task.status === 'done' && task.result && (
        <p className="mt-2 text-xs text-text-secondary whitespace-pre-wrap line-clamp-3">{task.result as string}</p>
      )}
      {task.status === 'error' && (
        <p className="mt-2 text-xs text-red-400 line-clamp-2">{task.error || 'Task failed'}</p>
      )}
    </div>
  )
}
