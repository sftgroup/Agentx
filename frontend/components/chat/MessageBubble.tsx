// ---------------------------------------------------------------------------
// AgentX — MessageBubble Component
// ---------------------------------------------------------------------------
// Renders a single chat message: tool calls use ToolCallBubble, text/user
// messages use a standard bubble layout.
// ---------------------------------------------------------------------------

'use client'

import { ToolCallBubble } from '@/components/chat/ToolCallBubble'
import type { ChatMessage } from '@/hooks/useAgentChat'

export function MessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === 'tool_call' || msg.role === 'tool_result') {
    return (
      <ToolCallBubble
        key={msg.id}
        toolName={msg.toolName || 'unknown'}
        input={msg.toolInput}
        result={msg.toolResult}
        error={msg.toolError}
        status={msg.toolStatus || 'pending'}
        durationMs={msg.toolDurationMs}
      />
    )
  }

  return (
    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-2xl rounded-2xl px-4 py-3 ${
        msg.role === 'user'
          ? 'bg-accent-purple/20 border border-accent-purple/20'
          : 'bg-white/5 border border-white/5'
      }`}>
        <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content || '...'}</div>
        <div className="text-xs mt-2 opacity-40">{new Date(msg.timestamp).toLocaleTimeString()}</div>
      </div>
    </div>
  )
}
