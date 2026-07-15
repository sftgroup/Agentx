// ---------------------------------------------------------------------------
// @agentx/sdk — OpenAI Provider
// ---------------------------------------------------------------------------
// Direct OpenAI-compatible chat completions with SSE streaming.
// Supports: OpenAI, DeepSeek, and any /v1/chat/completions endpoint.
// ---------------------------------------------------------------------------

import type { ChatRequest, ChatStreamEvent, LLMProvider } from '../agent-loop/types'
import type { OpenAIProviderConfig } from './types'

const DEFAULT_ENDPOINT = 'https://api.openai.com/v1'

interface SSEData {
  choices?: {
    index: number
    delta?: {
      content?: string
      tool_calls?: {
        index: number
        id?: string
        function?: { name?: string; arguments?: string }
      }[]
    }
    finish_reason?: string | null
  }[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export class OpenAIProvider implements LLMProvider {
  private config: Required<OpenAIProviderConfig>

  constructor(config: OpenAIProviderConfig) {
    this.config = {
      endpoint: config.endpoint ?? DEFAULT_ENDPOINT,
      model: config.model,
      apiKey: config.apiKey,
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 4096,
      timeoutMs: config.timeoutMs ?? 60_000,
    }
  }

  async *chatStream(request: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatStreamEvent> {
    const endpoint = `${this.config.endpoint}/chat/completions`

    const body = JSON.stringify({
      model: request.model || this.config.model,
      messages: request.messages,
      tools: request.tools,
      temperature: request.temperature ?? this.config.temperature,
      max_tokens: request.maxTokens ?? this.config.maxTokens,
      stream: true,
      stream_options: { include_usage: true },
    })

    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body,
        signal,
      })
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        yield { type: 'error', error: new Error('Request aborted') }
      } else {
        yield { type: 'error', error: err instanceof Error ? err : new Error(String(err)) }
      }
      return
    }

    if (!response.ok) {
      let errorText = ''
      try { errorText = await response.text() } catch { /* ignore */ }
      yield { type: 'error', error: new Error(`HTTP ${response.status}: ${errorText}`) }
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      yield { type: 'error', error: new Error('No response body') }
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data:')) continue

          const dataStr = trimmed.slice(5).trim()
          if (dataStr === '[DONE]') {
            continue
          }

          let data: SSEData
          try {
            data = JSON.parse(dataStr)
          } catch {
            continue
          }

          if (data.usage) {
            yield {
              type: 'done',
              usage: {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens,
              },
            }
            continue
          }

          const choice = data.choices?.[0]
          if (!choice) continue

          if (choice.delta?.content) {
            yield { type: 'text_delta', content: choice.delta.content }
          }

          if (choice.delta?.tool_calls) {
            for (const tc of choice.delta.tool_calls) {
              if (tc.id && tc.function?.name) {
                yield { type: 'tool_call_start', callId: tc.id, name: tc.function.name }
              }
              if (tc.function?.arguments) {
                yield {
                  type: 'tool_call_delta',
                  callId: tc.id ?? `call_${tc.index}`,
                  arguments: tc.function.arguments,
                }
              }
            }
          }

          if (choice.finish_reason === 'stop' && !data.usage) {
            yield {
              type: 'done',
              usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        yield { type: 'error', error: err instanceof Error ? err : new Error(String(err)) }
      }
    } finally {
      reader.releaseLock()
    }
  }
}
