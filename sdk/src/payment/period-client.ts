// ---------------------------------------------------------------------------
// @agentxv2/sdk — PeriodClient (self-hosted period rail, R17.5)
// ---------------------------------------------------------------------------
// @0xinfrax/payments@0.1.2 removed the period-authorization rail from the
// generic engine. AgentX re-implements it on the gateway
// (payment_authorizations table) while keeping the public client contract
// identical, so B-side callers see zero change.
// ---------------------------------------------------------------------------

import type { ClientOptions } from '@0xinfrax/payments'
import { request } from './a2a-client'

/** Period-authorization client (P4): charge a period / read state. */
export class PeriodClient {
  constructor(private opts: ClientOptions) {}

  async charge(authorizationId: string): Promise<{ renewed: boolean; remainingWei: string }> {
    return request(
      this.opts.baseUrl,
      '/api/v1/payments/period/charge',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ authorizationId }) },
      this.opts.accessToken
    )
  }

  async authorization(authorizationId: string): Promise<{ id: string; owner: string; remainingWei: string; periods: number; status: string }> {
    return request(this.opts.baseUrl, `/api/v1/payments/period/authorization?authorizationId=${encodeURIComponent(authorizationId)}`, undefined, this.opts.accessToken)
  }
}
