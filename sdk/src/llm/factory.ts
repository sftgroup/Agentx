// ---------------------------------------------------------------------------
// @agentx/sdk — Provider Factory
// ---------------------------------------------------------------------------
// Creates the appropriate LLMProvider based on config.
// ---------------------------------------------------------------------------

import type { LLMProvider } from '../agent-loop/types'
import type { ProviderFactoryConfig } from './types'
import { OpenAIProvider } from './openai-provider'
import { GatewayProvider } from './gateway-provider'

export function createLLMProvider(config: ProviderFactoryConfig): LLMProvider {
  switch (config.type) {
    case 'gateway':
      if (!config.gatewayUrl || !config.accessToken) {
        throw new Error('GatewayProvider requires gatewayUrl and accessToken')
      }
      return new GatewayProvider({
        gatewayUrl: config.gatewayUrl,
        accessToken: config.accessToken,
        model: config.model,
        keySource: config.keySource,
        tenantKeyId: config.tenantKeyId,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        timeoutMs: config.timeoutMs,
      })

    case 'openai':
      if (!config.apiKey) {
        throw new Error('OpenAIProvider requires apiKey')
      }
      return new OpenAIProvider({
        apiKey: config.apiKey,
        endpoint: config.endpoint,
        model: config.model ?? 'gpt-4o',
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        timeoutMs: config.timeoutMs,
      })

    case 'direct':
      if (!config.apiKey) {
        throw new Error('Direct provider requires apiKey')
      }
      return new OpenAIProvider({
        apiKey: config.apiKey,
        endpoint: config.endpoint,
        model: config.model ?? 'gpt-4o',
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        timeoutMs: config.timeoutMs,
      })

    default:
      throw new Error(`Unknown provider type: ${(config as { type: string }).type}`)
  }
}
