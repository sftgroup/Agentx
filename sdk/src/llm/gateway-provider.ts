// ---------------------------------------------------------------------------
// @agentx/sdk — Gateway Provider
// ---------------------------------------------------------------------------
// Routes LLM requests through AgentX Gateway for multi-tenant SaaS mode.
// Gateway handles: auth, rate limiting, API key injection, usage tracking.
// API Key never appears in the browser.
// ---------------------------------------------------------------------------

import type { ChatRequest, ChatStreamEvent, LLMProvider } from '../agent-loop/types'
import type { GatewayProviderConfig } from './types'

interface GatewaySSEData {
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
  error?: { message: string; code?: string }
}

export class GatewayProvider implements LLMProvider {
  private config: Required<Omit<GatewayProviderConfig, 'model' | 'tenantKeyId'>>
    & Pick<GatewayProviderConfig, 'model' | 'tenantKeyId'>

  constructor(config: GatewayProviderConfig) {
    this.config = {
      gatewayUrl: config.gatewayUrl.replace(/\/$/, ''),
      accessToken: config.accessToken,
      keySource: config.keySource ?? 'platform',
      model: config.model,
      tenantKeyId: config.tenantKeyId,
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 4096,
      timeoutMs: config.timeoutMs ?? 120_000,
    }
  }

  async *chatStream(request: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatStreamEvent> {
    const endpoint = `${this.config.gatewayUrl}/api/v1/chat/completions`

    const body: Record<string, unknown> = {
      model: request.model || this.config.model || 'gpt-4o',
      messages: request.messages,
      stream: true,
      key_source: this.config.keySource,
    }
    if (request.tools && request.tools.length > 0) body.tools = request.tools
    if (request.temperature !== undefined) body.temperature = request.temperature
    if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens
    if (this.config.tenantKeyId) body.tenant_key_id = this.config.tenantKeyId

    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.accessToken}`,
        },
        body: JSON.stringify(body),
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
      let errorMsg = `Gateway HTTP ${response.status}`
      try {
        const errBody = await response.json() as { error?: string; message?: string }
        errorMsg = errBody.error || errBody.message || errorMsg
      } catch { /* use default */ }

      yield { type: 'error', error: new Error(errorMsg) }
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      yield { type: 'error', error: new Error('No response body from gateway') }
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
          if (dataStr === '[DONE]') continue

          let data: GatewaySSEData
          try { data = JSON.parse(dataStr) } catch { continue }

          if (data.error) {
            yield { type: 'error', error: new Error(data.error.message) }
            return
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
