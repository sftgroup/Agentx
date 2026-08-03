// AgentX Gateway — Conversation Proxy
// Forwards agent conversation requests to the Conversation Service microservice

import { config } from '../config'

export class ConversationProxy {
  constructor(
    private readonly serviceUrl: string = config.conversationServiceUrl,
    private readonly internalToken: string = config.conversationServiceToken,
  ) {}

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
