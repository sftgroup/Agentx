// ---------------------------------------------------------------------------
// @agentx/sdk — TenantPlanPayments: platform subscription-tier purchases (R19.3)
// ---------------------------------------------------------------------------
// R19.3 (D11): buying a *platform* subscription tier (the `plans` table on the
// Gateway — quota_daily / rate limits) reuses the same @0xinfrax/payments
// engine via the unified `/api/v1/payments` endpoint. Unlike
// SubscriptionPayments (agent subscriptions, planId+agentId), a tenant plan
// purchase binds onto the tenant: `purpose='tenant-plan'` + `tenantPlanId`.
//
//   method: 'chain' | 'x402' → verify the on-chain payment then bind the plan
//   method: 'fiat'           → Stripe checkout (client_reference carries the
//                              purpose); the webhook binds on completion
// ---------------------------------------------------------------------------

import type { Address, Hash } from 'viem'
import type { ChainKey } from './payments'

export type TenantPlanPaymentMethod = 'chain' | 'fiat' | 'x402'

export interface TenantPlanPaymentsConfig {
  /** AgentX Gateway base URL. */
  gatewayUrl: string
  /** Optional gateway bearer token (B-end wallet JWT). */
  accessToken?: string
  /** Which chain to verify on-chain payments on (default: oxachain). */
  chain?: ChainKey
}

export interface BuyTenantPlanInput {
  /** Platform plan id (plans table UUID). */
  tenantPlanId: string
  /** Buying wallet address. */
  subscriber: Address
  method: TenantPlanPaymentMethod
  /** chain | x402: already-sent on-chain payment tx. */
  txHash?: Hash | string
  /** fiat: redirect targets after Stripe checkout. */
  successUrl?: string
  cancelUrl?: string
}

export type BuyTenantPlanResult =
  | { method: 'chain' | 'x402'; tenantId: string; planId: string; planSlug: string; quotaDaily: string; txHash: string }
  | { method: 'fiat'; sessionUrl: string; sessionId: string; redirect: true }

export class TenantPlanPayments {
  constructor(private config: TenantPlanPaymentsConfig) {}

  /** Buy a platform subscription tier on the chosen rail. */
  async buy(input: BuyTenantPlanInput): Promise<BuyTenantPlanResult> {
    if (!input.txHash && input.method !== 'fiat') {
      throw new Error('txHash is required for the chain / x402 rails')
    }
    const body: Record<string, unknown> = {
      method: input.method,
      purpose: 'tenant-plan',
      tenantPlanId: input.tenantPlanId,
      subscriber: input.subscriber,
      chain: this.config.chain ?? 'oxachain',
      txHash: input.txHash,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
    }
    const data = await this._fetchJson<Record<string, any>>('/api/v1/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (input.method === 'fiat') {
      if (!data.sessionUrl) throw new Error('Fiat checkout returned no redirect URL')
      return { method: 'fiat', sessionUrl: data.sessionUrl, sessionId: data.sessionId, redirect: true }
    }
    return {
      method: input.method,
      tenantId: String(data.tenantId ?? ''),
      planId: String(data.planId ?? ''),
      planSlug: String(data.planSlug ?? ''),
      quotaDaily: String(data.quotaDaily ?? '0'),
      txHash: String(input.txHash ?? ''),
    }
  }

  // ── HTTP helpers ────────────────────────────────────────────────────────

  private async _fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const base = (this.config.gatewayUrl ?? '').replace(/\/$/, '')
    const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) }
    if (this.config.accessToken) headers.Authorization = `Bearer ${this.config.accessToken}`
    const resp = await fetch(`${base}${path}`, { ...init, headers })
    if (!resp.ok) {
      let message = `Gateway request failed (${resp.status}): ${path}`
      try {
        const body = (await resp.json()) as { error?: string }
        if (body.error) message = body.error
      } catch { /* non-JSON error body */ }
      throw new Error(message)
    }
    return (await resp.json()) as T
  }
}
