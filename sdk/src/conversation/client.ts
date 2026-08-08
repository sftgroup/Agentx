// ---------------------------------------------------------------------------
// AgentX SDK — ConversationClient (remote conversation service client)
// ---------------------------------------------------------------------------
// Wraps the hosted Conversation Service via the Gateway:
//   POST /api/v1/agent/runs  (SSE stream)
//
// Auth (either one is required):
//   - Tenant API Key:  X-Api-Key: agentx_xxx  (issued after registration)
//   - Gateway JWT:     Authorization: Bearer <accessToken>  (wallet-signed login)
// Isolation: X-End-User-Id (per end-user memory isolation within a tenant)
// ---------------------------------------------------------------------------

export interface ConversationClientConfig {
  /** Gateway base URL, e.g. http://43.159.60.46:3090 */
  gatewayUrl: string
  /** Tenant API Key (agentx_...) issued after registration (alternative to accessToken) */
  apiKey?: string
  /** Gateway JWT access token from wallet-signed login (alternative to apiKey) */
  accessToken?: string
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
  /**
   * Per-request end-user id. For B-end (partner) callers, a `0x<wallet>` value
   * triggers subscription proxying on the Gateway (access is authorized by that
   * wallet's ownership/subscription). Any other value is used for memory
   * isolation only. Overrides the constructor-level `endUserId`.
   */
  endUserId?: string
  /** Inline mode: caller-supplied system prompt, bypasses Gateway agent lookup */
  prompt?: string
  /** Inline mode: caller-supplied tools (MCP/HTTP), injected into the run */
  skills?: ConversationSkillDef[]
  /** BYOK: id of a stored tenant-owned API key (resolved server-side by the Gateway) */
  tenantKeyId?: string
}

/**
 * On-chain rail (2026-08-08): the user's own wallet must create the A2A task —
 * they pay the gas and become the on-chain client. Emitted by the Conversation
 * Service when a run requests an auditable / settled delegation.
 */
export interface OnChainApprovalRequest {
  targetAgentId: number
  taskType: string
  inputData: string
}

export interface ConversationSSEEvent {
  type: 'text' | 'tool_call' | 'tool_result' | 'thinking' | 'done' | 'error' | 'clarification' | 'onchain_approval_required'
  content?: string
  /** Clarification question when the service decides the request needs disambiguation */
  question?: string
  toolName?: string
  toolArgs?: Record<string, unknown>
  toolResult?: unknown
  /** Attached to tool_result when tool execution failed */
  error?: string
  /** On-chain rail: the agent requested an A2A delegation the user must approve in their wallet */
  approval?: OnChainApprovalRequest
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
  iterations?: number
}

export interface ConversationChatResult {
  text: string
  toolCalls: { name: string; arguments: Record<string, unknown>; result?: unknown }[]
  /** When set, the service asked the user to clarify instead of running the run */
  clarification?: string
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
  iterations?: number
}

// ── Tasks (parallel runs, P8) ─────────────────────────────────────────────

export type ConversationTaskStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled'

export interface ConversationTask {
  id: string
  sessionId: string
  tenant: string
  agentId?: number | null
  endUserId?: string | null
  message: string
  status: ConversationTaskStatus
  enableMemory: boolean
  history?: unknown
  prompt?: string | null
  skills?: unknown
  result?: string | null
  error?: string | null
  usage?: unknown
  iterations?: number | null
  createdAt: string
  startedAt?: string | null
  finishedAt?: string | null
}

export interface ConversationCreateTaskParams {
  sessionId: string
  /** AgentX agent id (omit when using inline prompt/skills mode) */
  agentId?: number
  message: string
  enableMemory?: boolean
  /** Full conversation history (optional) */
  history?: { role: 'user' | 'assistant'; content: string }[]
  /** Inline mode: caller-supplied system prompt */
  prompt?: string
  /** Inline mode: caller-supplied tools */
  skills?: ConversationSkillDef[]
  /** BYOK: id of a stored tenant-owned API key */
  tenantKeyId?: string
  /**
   * Per-request end-user id. For B-end (partner) callers, a `0x<wallet>` value
   * triggers subscription proxying on the Gateway (access is authorized by that
   * wallet's ownership/subscription). Any other value is used for memory
   * isolation only.
   */
  endUserId?: string
}

export interface ConversationCreateSessionParams {
  sessionId?: string
  agentId?: number
  endUserId?: string
  title?: string
}

/**
 * Thrown by task APIs when the platform rejects the request.
 * `code === 'PARALLEL_TASKS_DISABLED'` (HTTP 403) means the integrator/tenant
 * is configured to disallow multi-task / sub-agent (P9).
 */
export class ConversationTaskError extends Error {
  readonly status: number
  readonly code?: string
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'ConversationTaskError'
    this.status = status
    this.code = code
  }
}

export class ConversationClient {
  private readonly baseUrl: string

  constructor(private readonly config: ConversationClientConfig) {
    this.baseUrl = config.gatewayUrl.replace(/\/$/, '')
  }

  /** Common auth/tenant headers for all Gateway API calls. */
  private _headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (this.config.apiKey) headers['X-Api-Key'] = this.config.apiKey
    if (this.config.accessToken) headers['Authorization'] = `Bearer ${this.config.accessToken}`
    if (!this.config.apiKey && !this.config.accessToken) {
      throw new Error('ConversationClient requires either apiKey or accessToken')
    }
    if (this.config.endUserId) headers['X-End-User-Id'] = this.config.endUserId
    if (this.config.llmApiKey) headers['X-Llm-Api-Key'] = this.config.llmApiKey
    if (this.config.llmEndpoint) headers['X-Llm-Endpoint'] = this.config.llmEndpoint
    if (this.config.llmModel) headers['X-Llm-Model'] = this.config.llmModel
    return headers
  }

  /**
   * Stream an agent conversation (SSE). Yields parsed events.
   * @param opts.signal external AbortSignal — aborts the stream (e.g. user "stop")
   */
  async *stream(params: ConversationChatParams, opts?: { signal?: AbortSignal }): AsyncGenerator<ConversationSSEEvent> {
    const headers = this._headers()
    if (params.endUserId) headers['X-End-User-Id'] = params.endUserId

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 120_000)
    const onExternalAbort = () => controller.abort()
    opts?.signal?.addEventListener('abort', onExternalAbort, { once: true })

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
      opts?.signal?.removeEventListener('abort', onExternalAbort)
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

  // ── Sessions & Tasks (parallel runs) ────────────────────────────────────

  /**
   * Query the integrator's capability flags (P9). When `parallelTasks` is false,
   * `createTask` will be rejected with HTTP 403 `PARALLEL_TASKS_DISABLED` —
   * callers should degrade to single-turn `chat()` in that case.
   */
  async getCapabilities(): Promise<{ parallelTasks: boolean; parallelTasksOverride: boolean | null }> {
    const res = await fetch(`${this.baseUrl}/api/v1/tenant/me`, { headers: this._headers() })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new ConversationTaskError(res.status, body?.error || `Capability lookup failed (HTTP ${res.status})`)
    }
    return {
      parallelTasks: body?.capabilities?.parallel_tasks ?? true,
      parallelTasksOverride: body?.capabilities?.parallel_tasks_override ?? null,
    }
  }

  /**
   * Create a session (dialog container that owns many tasks). Idempotent.
   */
  async createSession(params: ConversationCreateSessionParams): Promise<{ id: string; tenant: string; agentId?: number | null; endUserId?: string | null; title?: string | null }> {
    const res = await fetch(`${this.baseUrl}/api/v1/sessions`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify(params),
    })
    if (!res.ok) {
      throw new ConversationTaskError(res.status, `Session creation failed (HTTP ${res.status})`)
    }
    return res.json()
  }

  /**
   * Create a task — returns immediately with the task row (`status: queued`);
   * execution happens in the background. Throws `ConversationTaskError` with
   * `code === 'PARALLEL_TASKS_DISABLED'` (HTTP 403) when the tenant/plan is
   * configured to disallow multi-task / sub-agent.
   */
  async createTask(params: ConversationCreateTaskParams): Promise<ConversationTask> {
    const headers = this._headers()
    if (params.endUserId) headers['X-End-User-Id'] = params.endUserId
    const res = await fetch(`${this.baseUrl}/api/v1/sessions/${params.sessionId}/tasks`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new ConversationTaskError(
        res.status,
        body?.error || `Task creation failed (HTTP ${res.status})`,
        body?.code,
      )
    }
    return body as ConversationTask
  }

  /** Fetch a single task by id. */
  async getTask(taskId: string): Promise<ConversationTask> {
    const res = await fetch(`${this.baseUrl}/api/v1/tasks/${taskId}`, { headers: this._headers() })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new ConversationTaskError(res.status, body?.error || `Task lookup failed (HTTP ${res.status})`, body?.code)
    }
    return body as ConversationTask
  }

  /** List tasks of a session. */
  async listTasks(sessionId: string): Promise<ConversationTask[]> {
    const res = await fetch(`${this.baseUrl}/api/v1/sessions/${sessionId}/tasks`, { headers: this._headers() })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new ConversationTaskError(res.status, body?.error || `Task list failed (HTTP ${res.status})`, body?.code)
    }
    return (body.tasks ?? []) as ConversationTask[]
  }

  /** Cancel a task (queued → cancelled directly, running → aborted). */
  async cancelTask(taskId: string): Promise<ConversationTask> {
    const res = await fetch(`${this.baseUrl}/api/v1/tasks/${taskId}`, {
      method: 'DELETE',
      headers: this._headers(),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new ConversationTaskError(res.status, body?.error || `Task cancel failed (HTTP ${res.status})`, body?.code)
    }
    return body as ConversationTask
  }
}
