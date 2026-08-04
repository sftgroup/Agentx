// @agentx/frontend — useAgentChat Hook
// SSE-streaming agent conversation via Gateway /api/v1/agent/runs
//
// Supports Plan C (Hybrid LLM):
//   - Platform mode: uses AgentX official key (headerApiKey = undefined)
//   - BYOK mode:     passes X-Llm-Api-Key header for tenant's own key

'use client'

import { useState, useRef, useCallback } from 'react'

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

export function useAgentChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [thinkingText, setThinkingText] = useState('')
  const abortRef = useRef<AbortController | null>(null)

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

    const abort = new AbortController()
    abortRef.current = abort

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${options.accessToken}`,
    }
    if (options.llmApiKey) {
      headers['X-Llm-Api-Key'] = options.llmApiKey
    }

    let assistantId = ''
    let assistantText = ''

    try {
      const res = await fetch(`${options.gatewayUrl}/api/v1/agent/runs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          agentId: options.agentId,
          message: userInput,
          enableMemory: options.enableMemory ?? false,
          contextBudget: options.contextBudget,
          history,
        }),
        signal: abort.signal,
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(errText || `Gateway error: ${res.status}`)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))

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
                options.onThinking?.(event.content)
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
                options.onError?.(event.error)
                break
            }
          } catch { /* skip malformed SSE lines */ }
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
  }, [])

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  return { messages, setMessages, isStreaming, thinkingText, sendMessage, stopStreaming, clearMessages }
}
