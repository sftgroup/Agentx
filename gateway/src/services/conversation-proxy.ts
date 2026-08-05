// AgentX Gateway — Conversation Proxy
// Forwards agent conversation requests to the Conversation Service microservice

import { config } from '../config'

export class ConversationProxy {
  constructor(
    private readonly serviceUrl: string = config.conversationServiceUrl,
    private readonly internalToken: string = config.conversationServiceToken,
  ) {}

  /** Base headers for internal calls to the Conversation Service. */
  private baseHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-Internal-Token': this.internalToken,
      ...extra,
    }
  }

  /** Create a chat session (dialog container for parallel tasks). */
  async createSession(params: {
    sessionId?: string
    agentId?: number
    endUserId?: string
    title?: string
    tenantAddress: string
  }): Promise<Response> {
    return fetch(`${this.serviceUrl}/sessions`, {
      method: 'POST',
      headers: this.baseHeaders({ 'X-Tenant-Address': params.tenantAddress }),
      body: JSON.stringify({
        sessionId: params.sessionId,
        agentId: params.agentId,
        endUserId: params.endUserId,
        title: params.title,
      }),
    })
  }

  /** Create a task inside a session — returns taskId immediately. */
  async createTask(params: {
    sessionId: string
    tenantAddress: string
    agentId?: number
    message: string
    enableMemory?: boolean
    history?: unknown[]
    endUserId?: string
    prompt?: string
    skills?: unknown[]
    headerApiKey?: string
    headerEndpoint?: string
    headerModel?: string
  }): Promise<Response> {
    const headers = this.baseHeaders({ 'X-Tenant-Address': params.tenantAddress })
    if (params.endUserId) headers['X-End-User-Id'] = params.endUserId
    if (params.headerApiKey) headers['X-Llm-Api-Key'] = params.headerApiKey
    if (params.headerEndpoint) headers['X-Llm-Endpoint'] = params.headerEndpoint
    if (params.headerModel) headers['X-Llm-Model'] = params.headerModel
    return fetch(`${this.serviceUrl}/sessions/${encodeURIComponent(params.sessionId)}/tasks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        agentId: params.agentId,
        message: params.message,
        enableMemory: params.enableMemory,
        history: params.history,
        prompt: params.prompt,
        skills: params.skills,
      }),
    })
  }

  /** List tasks of a session. */
  async listTasks(sessionId: string): Promise<Response> {
    return fetch(`${this.serviceUrl}/sessions/${encodeURIComponent(sessionId)}/tasks`, {
      headers: this.baseHeaders(),
    })
  }

  /** Get a single task. */
  async getTask(taskId: string): Promise<Response> {
    return fetch(`${this.serviceUrl}/tasks/${encodeURIComponent(taskId)}`, {
      headers: this.baseHeaders(),
    })
  }

  /** Cancel a queued/running task. */
  async cancelTask(taskId: string): Promise<Response> {
    return fetch(`${this.serviceUrl}/tasks/${encodeURIComponent(taskId)}`, {
      method: 'DELETE',
      headers: this.baseHeaders(),
    })
  }

  /** Open the SSE event stream of a task (piped through to the client). */
  async streamTaskEvents(taskId: string): Promise<Response> {
    return fetch(`${this.serviceUrl}/tasks/${encodeURIComponent(taskId)}/events`, {
      headers: this.baseHeaders(),
    })
  }

  /**
   * Stream an agent conversation run.
   * Gateway validates JWT/API Key → extracts tenant → forwards to Conversation Service.
   */
  async streamRun(params: {
    agentId?: number
    message: string
    tenantAddress: string
    enableMemory?: boolean
    contextBudget?: number
    history?: { role: 'user' | 'assistant'; content: string }[]
    endUserId?: string
    headerApiKey?: string
    /** Stateless BYOK: caller's LLM endpoint (e.g. DeepSeek) */
    headerEndpoint?: string
    /** Stateless BYOK: caller's LLM model (e.g. deepseek-chat) */
    headerModel?: string
    prompt?: string
    skills?: unknown[]
  }): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Tenant-Address': params.tenantAddress,
      'X-Internal-Token': this.internalToken,
    }
    if (params.endUserId) {
      headers['X-End-User-Id'] = params.endUserId
    }
    if (params.headerApiKey) {
      headers['X-Llm-Api-Key'] = params.headerApiKey
    }
    if (params.headerEndpoint) {
      headers['X-Llm-Endpoint'] = params.headerEndpoint
    }
    if (params.headerModel) {
      headers['X-Llm-Model'] = params.headerModel
    }
    return fetch(`${this.serviceUrl}/runs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        agentId: params.agentId,
        message: params.message,
        enableMemory: params.enableMemory,
        contextBudget: params.contextBudget,
        history: params.history,
        prompt: params.prompt,
        skills: params.skills,
      }),
    })
  }
}

// Singleton
let instance: ConversationProxy | null = null

export function getConversationProxy(): ConversationProxy {
  if (!instance) {
    instance = new ConversationProxy()
  }
  return instance
}
