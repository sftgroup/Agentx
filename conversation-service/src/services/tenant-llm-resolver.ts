// AgentX Conversation Service — Tenant LLM Resolver
// Hybrid LLM key resolution: tenant's own key → AgentX official key.
//
// Flow:
//   1. Check tenant_llm_configs for tenant's encrypted API key
//   2. If found → decrypt → use OpenAIProvider with tenant's key + model
//   3. If not found → fall back to AgentX official key
//
// This supports Plan C: tenant can bring their own key for lower platform fees,
// or use AgentX managed key for convenience.

import type { Pool } from 'pg'
import type { LLMProvider, LoopRunContext } from '@agentxv2/sdk/agent-loop'
import { OpenAIProvider, GatewayProvider } from '@agentxv2/sdk/llm'
import { config } from '../config'
import { decryptSecret } from '../lib/crypto'

interface TenantLlmRecord {
  tenant_address: string
  provider: string
  encrypted_key: string
  model: string | null
  endpoint_url: string | null
}

export class TenantLLMResolver {
  constructor(private readonly db: Pool) {}

  /**
   * Resolve LLM provider with tenant priority.
   *
   * Priority:
   *   1. Tenant's own API key from DB (encrypted at rest)
   *   2. Tenant's own key from request header (X-Llm-Api-Key, for stateless mode)
   *   3. AgentX official key (platform default)
   */
  async resolve(
    ctx: LoopRunContext,
    tenantAddress: string,
    headerApiKey?: string,
    headerEndpoint?: string,
  ): Promise<LLMProvider> {
    // 1. Stateless BYOK request headers (ephemeral, not stored) — caller's own
    //    key + endpoint, so no AgentX-side configuration is needed at all.
    if (headerApiKey) {
      return new OpenAIProvider({
        apiKey: headerApiKey,
        model: ctx.model || 'gpt-4o',
        // Provider-specific endpoint (e.g. DeepSeek) — falls back to OpenAI default
        endpoint: headerEndpoint || undefined,
      })
    }

    // 2. Check DB for tenant's persistent key
    try {
      const record = await this.getTenantKey(this.db, tenantAddress)
      if (record) {
        const decrypted = decryptSecret(record.encrypted_key)
        return new OpenAIProvider({
          apiKey: decrypted,
          model: record.model || ctx.model || 'gpt-4o',
          // Provider-specific endpoint (e.g. DeepSeek) — falls back to OpenAI default
          endpoint: record.endpoint_url || undefined,
        })
      }
    } catch (err) {
      console.warn(`[TenantLLM] Failed to load/decrypt tenant key for ${tenantAddress}:`, (err as Error).message)
    }

    // 3. Fallback: AgentX official key
    if (config.openaiApiKey) {
      return new OpenAIProvider({
        apiKey: config.openaiApiKey,
        model: ctx.model || 'gpt-4o',
      })
    }

    // 4. Last resort: internal Gateway
    return new GatewayProvider({
      gatewayUrl: config.gatewayUrl,
      accessToken: '',
      keySource: 'platform',
    })
  }

  /** Fetch tenant LLM config from DB */
  private async getTenantKey(db: Pool, tenantAddress: string): Promise<TenantLlmRecord | null> {
    const result = await db.query<TenantLlmRecord>(
      `SELECT tenant_address, provider, encrypted_key, model, endpoint_url
       FROM tenant_llm_configs
       WHERE tenant_address = $1`,
      [tenantAddress]
    )
    return result.rows[0] || null
  }

  /** Save/update tenant LLM key (encrypted at rest) */
  async saveTenantKey(
    tenantAddress: string,
    apiKey: string,
    provider: string = 'openai',
    model?: string,
    endpointUrl?: string,
  ): Promise<void> {
    const { encryptSecret } = await import('../lib/crypto')
    const encrypted = encryptSecret(apiKey)

    await this.db.query(
      `INSERT INTO tenant_llm_configs (tenant_address, provider, encrypted_key, model, endpoint_url)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_address) DO UPDATE SET
         provider = $2, encrypted_key = $3, model = $4, endpoint_url = $5, updated_at = NOW()`,
      [tenantAddress, provider, encrypted, model || null, endpointUrl || null]
    )
  }

  /** Delete tenant LLM key → revert to AgentX official key */
  async deleteTenantKey(tenantAddress: string): Promise<void> {
    await this.db.query(
      `DELETE FROM tenant_llm_configs WHERE tenant_address = $1`,
      [tenantAddress]
    )
  }
}
