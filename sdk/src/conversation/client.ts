// ---------------------------------------------------------------------------
// AgentX SDK — ConversationClient (remote conversation service client)
// ---------------------------------------------------------------------------
// Wraps the hosted Conversation Service via the Gateway:
//   POST /api/v1/agent/runs  (SSE stream)
//
// Auth:    X-Api-Key: agentx_xxx  (tenant API Key issued after registration)
// Isolation: X-End-User-Id (per end-user memory isolation within a tenant)
// ---------------------------------------------------------------------------

export interface ConversationClientConfig {
  /** Gateway base URL, e.g. http://43.159.60.46:3090 */
  gatewayUrl: string
  /** Tenant API Key (agentx_...) issued after registration */
  apiKey: string
  /** End-user ID for memory isolation within the tenant (optional) */
  endUserId?: string
  /** LLM API Key override — uses the caller's key instead of the tenant's (optional) */
  llmApiKey?: string
  /** LLM endpoint override for the caller's key, e.g. DeepSeek https://api.deepseek.com/v1 (optional) */
  llmEndpoint?: string
  /** LLM model override for the caller's key, e.g. deepseek-chat (optional; default gpt-4o) */
  llmModel?: string
  /** Abort timeout in ms for a single stream (default 120s) */
  timeoutMs?: number
}

export interface ConversationSkillDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  execution?: {
    type: 'mcp' | 'http' | 'a2a'
    endpoint?: string
    toolName?: string
    targetAgentId?: number
    skillFilter?: string[]
    promptOverride?: string
  }
}

export interface ConversationChatParams {
  /** AgentX agent id (omit when using inline prompt/skills mode) */
  agentId?: number
  message: string
  /** Full conversation history — caller is responsible for per-end-user isolation */
  history?: { role: 'user' | 'assistant'; content: string }[]
  enableMemory?: boolean
  contextBudget?: number
  /** Inline mode: caller-supplied system prompt, bypasses Gateway agent lookup */
  prompt?: string
  /** Inline mode: caller-supplied tools (MCP/HTTP), injected into the run */
  skills?: ConversationSkillDef[]
}

export interface ConversationSSEEvent {
  type: 'text' | 'tool_call' | 'tool_result' | 'thinking' | 'done' | 'error' | 'clarification'
  content?: string
  /** Clarification question when the service decides the request needs disambiguation */
  question?: string
  toolName?: string
  toolArgs?: Record<string, unknown>
  toolResult?: unknown
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
  iterations?: number
  error?: string
}

export interface ConversationChatResult {
  text: string
  toolCalls: { name: string; arguments: Record<string, unknown>; result?: unknown }[]
  /** When set, the service asked the user to clarify instead of running the run */
  clarification?: string
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
  iterations?: number
}

export class ConversationClient {
  private readonly baseUrl: string

  constructor(private readonly config: ConversationClientConfig) {
    this.baseUrl = config.gatewayUrl.replace(/\/$/, '')
  }

  /**
   * Stream an agent conversation (SSE). Yields parsed events.
   */
  async *stream(params: ConversationChatParams): AsyncGenerator<ConversationSSEEvent> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Api-Key': this.config.apiKey,
    }
    if (this.config.endUserId) headers['X-End-User-Id'] = this.config.endUserId
    if (this.config.llmApiKey) headers['X-Llm-Api-Key'] = this.config.llmApiKey
    if (this.config.llmEndpoint) headers['X-Llm-Endpoint'] = this.config.llmEndpoint
    if (this.config.llmModel) headers['X-Llm-Model'] = this.config.llmModel

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 120_000)

    try {
      const res = await fetch(`${this.baseUrl}/api/v1/agent/runs`, {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
        signal: controller.signal,
      })

      if (!res.ok) {
        let detail = ''
        try {
          const body = await res.json()
          detail = body?.error ?? ''
        } catch {}
        throw new Error(`Conversation request failed (HTTP ${res.status}) ${detail}`.trim())
      }

      if (!res.body) {
        throw new Error('Conversation stream unavailable')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() ?? ''

        for (const chunk of chunks) {
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue
            try {
              const event = JSON.parse(line.slice(6)) as ConversationSSEEvent
              yield event
              if (event.type === 'error') {
                throw new Error(event.error || 'Conversation error')
              }
            } catch (err) {
              if (err instanceof SyntaxError) continue
              throw err
            }
          }
        }
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  /**
   * Run a conversation and collect the full result.
   */
  async chat(params: ConversationChatParams): Promise<ConversationChatResult> {
    const result: ConversationChatResult = { text: '', toolCalls: [] }

    for await (const event of this.stream(params)) {
      switch (event.type) {
        case 'text':
          result.text += event.content ?? ''
          break
        case 'tool_call':
          result.toolCalls.push({ name: event.toolName ?? '', arguments: event.toolArgs ?? {} })
          break
        case 'tool_result': {
          const last = result.toolCalls[result.toolCalls.length - 1]
          if (last) {
            last.result = event.toolResult
          }
          break
        }
        case 'clarification':
          result.clarification = event.question ?? ''
          break
        case 'done':
          result.usage = event.usage
          result.iterations = event.iterations
          break
      }
    }

    return result
  }
}
