// ---------------------------------------------------------------------------
// AgentX — ToolCallBubble Component
// ---------------------------------------------------------------------------
// Collapsible tool call bubble showing tool name, input args, result/error.
// ---------------------------------------------------------------------------

'use client'

import { useState } from 'react'
import { Wrench, ChevronDown, ChevronRight, Loader2, Check, AlertTriangle } from 'lucide-react'

interface ToolCallBubbleProps {
  toolName: string
  input?: Record<string, unknown>
  result?: unknown
  error?: string
  status: 'pending' | 'done' | 'error'
  durationMs?: number
}

export function ToolCallBubble({ toolName, input, result, error, status, durationMs }: ToolCallBubbleProps) {
  const [expanded, setExpanded] = useState(false)

  const statusIcon = status === 'pending'
    ? <Loader2 className="w-3.5 h-3.5 animate-spin text-accent-cyan" />
    : status === 'error'
      ? <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
      : <Check className="w-3.5 h-3.5 text-green-400" />

  const formatValue = (val: unknown): string => {
    if (val === null || val === undefined) return 'null'
    if (typeof val === 'string') {
      try { return JSON.stringify(JSON.parse(val), null, 2) } catch { return val }
    }
    return JSON.stringify(val, null, 2)
  }

  return (
    <div className="my-2 max-w-2xl">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-accent-cyan/5 border border-accent-cyan/10 text-sm text-accent-cyan hover:bg-accent-cyan/10 transition-colors w-full text-left"
      >
        {expanded ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />}
        <Wrench className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="font-medium">{toolName}</span>
        {statusIcon}
        {durationMs ? <span className="ml-auto text-xs opacity-60">{durationMs}ms</span> : null}
      </button>

      {expanded && (
        <div className="mt-2 ml-6 space-y-2">
          {input && (
            <div>
              <div className="text-xs font-medium text-text-muted mb-1">Input</div>
              <pre className="text-xs p-2 rounded-lg bg-white/5 border border-white/5 overflow-x-auto max-h-32">
                {formatValue(input)}
              </pre>
            </div>
          )}
          {result && (
            <div>
              <div className="text-xs font-medium text-text-muted mb-1">Result</div>
              <pre className="text-xs p-2 rounded-lg bg-white/5 border border-white/5 overflow-x-auto max-h-48">
                {formatValue(result)}
              </pre>
            </div>
          )}
          {error && (
            <div>
              <div className="text-xs font-medium text-red-400 mb-1">Error</div>
              <pre className="text-xs p-2 rounded-lg bg-red-400/5 border border-red-400/10 text-red-300 overflow-x-auto max-h-32">
                {error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
