// ---------------------------------------------------------------------------
// @agentxv2/sdk — A2AClient (self-hosted a2a rail, R17.5)
// ---------------------------------------------------------------------------
// @0xinfrax/payments@0.1.2 removed the a2a rail from the generic engine.
// AgentX re-implements it on the gateway (payment_intents table) while keeping
// the public client contract byte-for-byte identical, so B-side callers that
// construct A2AClient with the same options see zero change.
// ---------------------------------------------------------------------------

import type { ChainKey, ClientOptions } from '@0xinfrax/payments'

/** Minimal JSON request helper against an AgentX gateway (shared with period-client). */
export async function request(baseUrl: string, path: string, init?: RequestInit, accessToken?: string): Promise<any> {
  const base = baseUrl.replace(/\/$/, '')
  const headers: Record<string, string> = {
    ...((init?.headers as Record<string, string>) ?? {}),
  }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  const resp = await fetch(`${base}${path}`, { ...init, headers })
  if (!resp.ok) {
    let message = `Payments request failed (${resp.status}): ${path}`
    try {
      const body = (await resp.json()) as { error?: string }
      if (body.error) message = body.error
    } catch { /* non-JSON */ }
    throw new Error(message)
  }
  return resp.json()
}

/** a2a-pay client: paymentId two-phase (create → pay → settle). */
export class A2AClient {
  constructor(private opts: ClientOptions) {}

  /** Phase 1: create a payment intent. */
  async create(input: { payer: string; amountWei: string; payee?: string; chain?: ChainKey; metadata?: Record<string, unknown> }): Promise<{ paymentId: string; amountWei: string; payee: string }> {
    return request(
      this.opts.baseUrl,
      '/api/v1/payments/a2a',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) },
      this.opts.accessToken
    )
  }

  /** Phase 2: verify the payer's on-chain payment tx and credit it. */
  async settle(input: { paymentId: string; txHash: string; chain?: ChainKey }): Promise<{ verified: boolean; paymentId: string; payer: string; creditedWei: string; balanceWei: string }> {
    return request(
      this.opts.baseUrl,
      '/api/v1/payments/a2a/settle',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) },
      this.opts.accessToken
    )
  }
}
