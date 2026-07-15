// ---------------------------------------------------------------------------
// @agentx/sdk — LLM Provider Types
// ---------------------------------------------------------------------------

export type { ChatRequest, ChatStreamEvent, LLMProvider } from '../agent-loop/types'

export interface OpenAIProviderConfig {
  apiKey: string
  endpoint?: string
  model: string
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
}

export interface GatewayProviderConfig {
  gatewayUrl: string
  accessToken: string
  model?: string
  keySource?: 'platform' | 'tenant_owned'
  tenantKeyId?: string
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
}

export interface ProviderFactoryConfig {
  type: 'openai' | 'gateway' | 'direct'
  gatewayUrl?: string
  accessToken?: string
  apiKey?: string
  endpoint?: string
  model?: string
  keySource?: 'platform' | 'tenant_owned'
  tenantKeyId?: string
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
}
