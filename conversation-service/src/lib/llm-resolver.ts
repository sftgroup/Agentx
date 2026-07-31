// AgentX Conversation Service — LLM Resolver
// Factory for LLM providers based on agent context

import type { LLMProvider, LoopRunContext } from '@agentxv2/sdk/agent-loop'
import { OpenAIProvider } from '@agentxv2/sdk/llm'
import { GatewayProvider } from '@agentxv2/sdk/llm'
import { config } from '../config'

export class LLMResolver {
  /**
   * Resolve an LLM provider from agent context.
   * Priority: agent-configured model → OpenAI API key → AgentX Gateway
   */
  resolve(ctx: LoopRunContext): LLMProvider {
    // If agent has explicit model config with API key → use OpenAI direct
    if (ctx.model && config.openaiApiKey) {
      return new OpenAIProvider({
        apiKey: config.openaiApiKey,
        model: ctx.model,
      })
    }

    // Default: use AgentX Gateway as multi-tenant LLM proxy
    return new GatewayProvider({
      gatewayUrl: process.env.GATEWAY_URL || 'http://localhost:3090',
      accessToken: '',   // internal service → no user token needed
      keySource: 'platform',
    })
  }
}
