// ---------------------------------------------------------------------------
// @agentxv2/sdk — PeriodClient (period rail, module-backed since R17.6)
// ---------------------------------------------------------------------------
// @0xinfrax/payments@0.1.2 removed the period-authorization rail; AgentX
// self-hosted it (R17.5) while keeping the client contract identical. Since
// 0.1.3 the rail lives in the generic engine again and the gateway delegates
// to it (module PgAuthorizationStore seam), but the public client contract is
// unchanged — B-side callers see zero change.
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
