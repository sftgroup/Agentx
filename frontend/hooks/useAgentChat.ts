// @agentx/frontend — useAgentChat Hook
// Agent conversation via SDK ConversationClient → Gateway → Conversation Service.
//
// Two execution modes (R1: sessions+tasks frontend integration):
//   - Parallel-task mode (default when the tenant/plan allows it, P9):
//     POST /sessions → POST /sessions/:id/tasks returns a taskId immediately,
//     runs in the background; tasks are polled and surfaced as a task list.
//   - Single-turn SSE streaming (fallback): used when parallel tasks are
//     disabled (P9 gate) or when task creation is rejected.
//
// Supports Plan C (Hybrid LLM):
//   - Platform mode: uses AgentX official key (headerApiKey = undefined)
//   - BYOK mode:     passes X-Llm-Api-Key header for tenant's own key

'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { ConversationClient, ConversationTaskError } from '@agentxv2/sdk/conversation'
import type { ConversationTask } from '@agentxv2/sdk/conversation'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result'
  content: string
  timestamp: number
  toolName?: string
  toolInput?: Record<string, unknown>
  toolResult?: unknown
  toolError?: string
  toolStatus?: 'pending' | 'done' | 'error'
  toolDurationMs?: number
}

interface AgentChatOptions {
  agentId: number
  gatewayUrl: string
  accessToken: string
  /** Ephemeral API key for BYOK mode (X-Llm-Api-Key header) */
  llmApiKey?: string
  /** BYOK: id of a stored tenant-owned API key (resolved server-side by the Gateway) */
  tenantKeyId?: string
  /** localStorage key used to persist the chat session id for this dialog */
  sessionKey?: string
  enableMemory?: boolean
  contextBudget?: number
  onTextDelta?: (delta: string, fullText: string) => void
  onToolCall?: (msg: ChatMessage) => void
  onToolResult?: (msg: ChatMessage) => void
  onThinking?: (text: string) => void
  onClarification?: (question: string) => void
  onComplete?: (usage?: { totalTokens: number }) => void
  onError?: (error: string) => void
}

const TASK_POLL_MS = 2000

function isTaskTerminal(status: ConversationTask['status']): boolean {
  return status === 'done' || status === 'error' || status === 'cancelled'
}

export function useAgentChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [thinkingText, setThinkingText] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [tasks, setTasks] = useState<ConversationTask[]>([])
  /** null = capability unknown (before initSession), false = parallel disabled (fall back to streaming) */
  const [parallelEnabled, setParallelEnabled] = useState<boolean | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const clientRef = useRef<ConversationClient | null>(null)
  const clientConfigRef = useRef<{ gatewayUrl: string; accessToken: string; llmApiKey?: string } | null>(null)
  const optionsRef = useRef<AgentChatOptions | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const pollRef = useRef<Set<string>>(new Set()) // task ids currently being polled
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const surfacedRef = useRef<Set<string>>(new Set()) // task ids already surfaced into the message list

  // Build / reuse a client for the given options (rebuild when the auth/BYOK config changes).
  const getClient = useCallback((options: AgentChatOptions): ConversationClient => {
    optionsRef.current = options
    const cfg = { gatewayUrl: options.gatewayUrl, accessToken: options.accessToken, llmApiKey: options.llmApiKey }
    if (!clientRef.current || JSON.stringify(clientConfigRef.current) !== JSON.stringify(cfg)) {
      clientRef.current = new ConversationClient(cfg)
      clientConfigRef.current = cfg
    }
    return clientRef.current
  }, [])

  // Ensure a session exists for this dialog; persists the id in localStorage (per agent + wallet).
  const ensureSession = useCallback(async (options: AgentChatOptions): Promise<string> => {
    const client = getClient(options)
    let sid = sessionIdRef.current
    if (sid) return sid

    const storageKey = options.sessionKey || `agentx-chat-session-${options.agentId}`
    const cached = window.localStorage.getItem(storageKey)
    if (cached) {
      sessionIdRef.current = cached
      setSessionId(cached)
      return cached
    }

    const session = await client.createSession({
      agentId: options.agentId,
      title: `Chat · Agent #${options.agentId}`,
    })
    sid = session.id
    sessionIdRef.current = sid
    setSessionId(sid)
    try { window.localStorage.setItem(storageKey, sid) } catch { /* ignore */ }
    return sid
  }, [getClient])

  // Poll non-terminal tasks and surface completed results into the message list.
  const startPoller = useCallback((client: ConversationClient, options: AgentChatOptions) => {
    clientRef.current = client
    optionsRef.current = options
    if (pollTimerRef.current) return

    pollTimerRef.current = setInterval(async () => {
      const ids = [...pollRef.current]
      if (ids.length === 0) {
        if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
        return
      }
      const results = await Promise.allSettled(ids.map(id => client.getTask(id)))
      for (const r of results) {
        if (r.status !== 'fulfilled') continue
        const t = r.value
        setTasks(prev => prev.map(x => (x.id === t.id ? t : x)))
        if (!isTaskTerminal(t.status)) continue
        pollRef.current.delete(t.id)
        if (surfacedRef.current.has(t.id)) continue
        surfacedRef.current.add(t.id)
        if (t.status === 'done' && t.result) {
          setMessages(prev => [...prev, {
            id: `task-${t.id}`,
            role: 'assistant',
            content: t.result as string,
            timestamp: Date.now(),
          }])
          options.onComplete?.()
        } else if (t.status === 'error') {
          const errorMsg = t.error || 'Task failed'
          setMessages(prev => [...prev, {
            id: `task-err-${t.id}`,
            role: 'assistant',
            content: `Error: ${errorMsg}`,
            timestamp: Date.now(),
          }])
          options.onError?.(errorMsg)
        }
      }
    }, TASK_POLL_MS)
  }, [])

  // Initialize the chat: capability probe (P9) + session restore + task list restore.
  const initSession = useCallback(async (options: AgentChatOptions) => {
    const client = getClient(options)
    try {
      const caps = await client.getCapabilities().catch(() => ({ parallelTasks: true }))
      setParallelEnabled(caps.parallelTasks)
    } catch { /* default to enabled */ }

    try {
      const sid = await ensureSession(options)
      const restored = await client.listTasks(sid)
      setTasks(restored)
      for (const t of restored) {
        if (isTaskTerminal(t.status)) surfacedRef.current.add(t.id)
        else pollRef.current.add(t.id)
      }
      startPoller(client, options)
    } catch (err: any) {
      options.onError?.(err.message || 'Session init failed')
    }
  }, [getClient, ensureSession, startPoller])

  const sendMessage = useCallback(async (
    userInput: string,
    options: AgentChatOptions,
    history: { role: 'user' | 'assistant'; content: string }[] = [],
  ) => {
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userInput,
      timestamp: Date.now(),
    }
    setMessages(prev => [...prev, userMsg])
    setIsStreaming(true)
    setThinkingText('')

    // ── Parallel-task mode (R1) ────────────────────────────────────────
    // Enabled unless a capability probe (or a 403) told us the tenant/plan
    // disallows multi-task / sub-agent (P9).
    if (parallelEnabled !== false) {
      const client = getClient(options)
      try {
        const sid = await ensureSession(options)
        const task = await client.createTask({
          sessionId: sid,
          agentId: options.agentId,
          message: userInput,
          enableMemory: options.enableMemory ?? false,
          history,
          tenantKeyId: options.tenantKeyId,
        })
        setTasks(prev => [...prev, task])
        pollRef.current.add(task.id)
        startPoller(client, options)
        setIsStreaming(false) // task runs in the background; input is immediately free for more tasks
        return
      } catch (err: any) {
        if (err instanceof ConversationTaskError && err.code === 'PARALLEL_TASKS_DISABLED') {
          // P9 gate: integrator disabled multi-task → degrade to single-turn streaming
          setParallelEnabled(false)
        } else {
          const errorMsg = err.message || 'Unknown error'
          setMessages(prev => [...prev, {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: `Error: ${errorMsg}`,
            timestamp: Date.now(),
          }])
          options.onError?.(errorMsg)
          return
        }
      }
    }

    // ── Single-turn SSE streaming (fallback) ───────────────────────────
    const abort = new AbortController()
    abortRef.current = abort

    let assistantId = ''
    let assistantText = ''

    const client = new ConversationClient({
      gatewayUrl: options.gatewayUrl,
      accessToken: options.accessToken,
      llmApiKey: options.llmApiKey,
    })

    try {
      const stream = client.stream({
        agentId: options.agentId,
        message: userInput,
        enableMemory: options.enableMemory ?? false,
        contextBudget: options.contextBudget,
        history,
        tenantKeyId: options.tenantKeyId,
      }, { signal: abort.signal })

      for await (const event of stream) {
        switch (event.type) {
          case 'text': {
            const delta = event.content || ''
            assistantText += delta
            if (!assistantId) {
              assistantId = `asst-${Date.now()}`
              setMessages(prev => [...prev, {
                id: assistantId,
                role: 'assistant',
                content: delta,
                timestamp: Date.now(),
              }])
            } else {
              setMessages(prev => {
                const updated = [...prev]
                const idx = updated.findIndex(m => m.id === assistantId)
                if (idx !== -1) {
                  updated[idx] = { ...updated[idx], content: assistantText }
                }
                return updated
              })
            }
            options.onTextDelta?.(delta, assistantText)
            break
          }

          case 'tool_call': {
            const tcMsg: ChatMessage = {
              id: `tc-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
              role: 'tool_call',
              content: `Calling ${event.toolName}...`,
              timestamp: Date.now(),
              toolName: event.toolName,
              toolInput: event.toolArgs,
              toolStatus: 'pending',
            }
            setMessages(prev => [...prev, tcMsg])
            options.onToolCall?.(tcMsg)
            break
          }

          case 'tool_result': {
            setMessages(prev => {
              const updated = [...prev]
              // Find the last pending tool_call for this name
              for (let i = updated.length - 1; i >= 0; i--) {
                if (updated[i]!.toolName === event.toolName && updated[i]!.toolStatus === 'pending') {
                  updated[i] = {
                    ...updated[i]!,
                    role: 'tool_result',
                    content: event.error ? `Error: ${event.error}` : 'Tool result received',
                    toolStatus: event.error ? 'error' : 'done',
                    toolResult: event.toolResult,
                    toolError: event.error,
                  }
                  break
                }
              }
              return updated
            })
            break
          }

          case 'thinking':
            setThinkingText(event.content || '')
            options.onThinking?.(event.content ?? '')
            break

          case 'clarification':
            // Conversation Service interruption: the request was ambiguous
            // and the assistant asks a clarifying question. Surface it to the
            // user; the answer is re-sent as a follow-up message.
            setThinkingText('')
            options.onClarification?.(event.question || event.content || '')
            break

          case 'done':
            options.onComplete?.(event.usage)
            break

          case 'error':
            options.onError?.(event.error ?? '')
            break
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return
      const errorMsg = err.message || 'Unknown error'
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `Error: ${errorMsg}`,
        timestamp: Date.now(),
      }])
      options.onError?.(errorMsg)
    } finally {
      setIsStreaming(false)
      setThinkingText('')
      abortRef.current = null
    }
  }, [parallelEnabled, getClient, ensureSession, startPoller])

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  /** Cancel a running/queued task (terminal tasks cancel idempotently server-side). */
  const cancelTask = useCallback(async (taskId: string) => {
    const client = clientRef.current
    if (!client) return
    try {
      const updated = await client.cancelTask(taskId)
      setTasks(prev => prev.map(x => (x.id === taskId ? updated : x)))
      pollRef.current.delete(taskId)
    } catch (err: any) {
      optionsRef.current?.onError?.(err.message || 'Cancel failed')
    }
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
    setTasks([])
    pollRef.current.clear()
    surfacedRef.current.clear()
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
  }, [])

  // Cleanup the poller on unmount.
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
    }
  }, [])

  return {
    messages, setMessages, isStreaming, thinkingText,
    sendMessage, stopStreaming, clearMessages,
    sessionId, tasks, parallelEnabled, initSession, cancelTask,
  }
}
