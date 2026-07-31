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
    agentId: number
    message: string
    tenantAddress: string
    enableMemory?: boolean
    contextBudget?: number
    history?: { role: 'user' | 'assistant'; content: string }[]
  }): Promise<Response> {
    return fetch(`${this.serviceUrl}/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Address': params.tenantAddress,
        'X-Internal-Token': this.internalToken,
      },
      body: JSON.stringify({
        agentId: params.agentId,
        message: params.message,
        enableMemory: params.enableMemory,
        contextBudget: params.contextBudget,
        history: params.history,
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
