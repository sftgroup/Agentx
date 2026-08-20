// ---------------------------------------------------------------------------
// AgentX Gateway — SSE Pipe with Usage Observation
// ---------------------------------------------------------------------------
// Transparently pipes an SSE upstream stream to the client while observing the
// `done` events for LLM token usage + billing source, so the caller can
// account tokens against the tenant's plan quota (platform-mode only).
//
// Bytes are forwarded unchanged — the client sees the exact same stream.
// ---------------------------------------------------------------------------

import type { Response as ExpressResponse } from 'express'

export interface SseUsage {
  totalTokens: number
  promptTokens: number
  completionTokens: number
  llmSource?: 'byok' | 'platform'
  /** Model actually used (from the done event) — usage_logs.model. */
  model?: string
  /** Agent id of the run — usage_logs.agent_id. */
  agentId?: number | null
  /** Number of tool calls executed in the run — usage_logs.tool_calls. */
  toolCalls?: number
}

/**
 * Pipe an SSE stream (as returned by fetch) through to the client, invoking
 * `onUsage` for every `done` event carrying a usage object.
 *
 * Events are delimited by `\n\n` (matching how conversation-service emits them)
 * and may be split across chunks — buffered until a complete event is seen.
 */
export async function pipeSSEWithUsage(
  upstream: globalThis.Response,
  res: ExpressResponse,
  onUsage: (usage: SseUsage) => void,
): Promise<void> {
  const reader = upstream.body?.getReader()
  if (!reader) {
    res.end()
    return
  }
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      res.write(chunk)
      buffer += chunk
      let sep: number
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const eventText = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        const dataLine = eventText.split('\n').find((l) => l.startsWith('data: '))
        if (!dataLine) continue
        try {
          const ev = JSON.parse(dataLine.slice(6)) as Record<string, unknown> | null
          if (!ev) continue
          // Task streams wrap the agent event as { seq, type, payload } — the
          // done event lives at payload; agent-run streams are flat. Unwrap so
          // usage + llmSource are read from the same shape either way.
          const inner =
            ev.payload && typeof ev.payload === 'object' && 'type' in (ev.payload as Record<string, unknown>)
              ? (ev.payload as Record<string, unknown>)
              : ev
          if (inner.type === 'done') {
            const usage = inner.usage as
              | { totalTokens?: number; promptTokens?: number; completionTokens?: number }
              | undefined
            onUsage({
              totalTokens: usage?.totalTokens ?? 0,
              promptTokens: usage?.promptTokens ?? 0,
              completionTokens: usage?.completionTokens ?? 0,
              llmSource: inner.llmSource as 'byok' | 'platform' | undefined,
              model: typeof inner.model === 'string' ? inner.model : undefined,
              agentId: typeof inner.agentId === 'number' ? inner.agentId : undefined,
              toolCalls: typeof inner.toolCalls === 'number' ? inner.toolCalls : undefined,
            })
          }
        } catch {
          // ignore malformed SSE lines
        }
      }
    }
  } finally {
    reader.releaseLock()
    res.end()
  }
}
