// ---------------------------------------------------------------------------
// AgentX SDK — BillingClient (B-end balance query)
// ---------------------------------------------------------------------------
// Lets B-end (partner) integrators check the x402 ledger balance before
// delegating to an unsubscribed agent (R19.7 pay-per-call), instead of
// hitting HTTP 403 / 402 first.
//   GET /api/v1/billing/balance
//
// Auth (either one is required, same as ConversationClient):
//   - Tenant API Key:  X-Api-Key: agentx_xxx
//   - Gateway JWT:     Authorization: Bearer <accessToken>
// Dimension: tenant wallet by default; pass `endUserId` (0x wallet) to query
// that end user's balance (same subject resolution as R19.7 access checks).
// ---------------------------------------------------------------------------

export interface BillingClientConfig {
  /** Gateway base URL, e.g. https://agentx.0xainet.top */
  gatewayUrl: string
  /** Tenant API Key (agentx_...) issued after registration (alternative to accessToken) */
  apiKey?: string
  /** Gateway JWT access token from wallet-signed login (alternative to apiKey) */
  accessToken?: string
  /** End-user wallet for balance queries within the tenant (optional) */
  endUserId?: string
}

export interface BalanceResult {
  /** Balance in OXA as a high-precision decimal string, e.g. "1.500000000000000000". "0" when never funded. */
  balance: string
  /** Raw balance in wei (string) — use for exact programmatic comparison against priceWei. */
  balanceWei: string
  currency: 'OXA'
  /** ISO timestamp of the last ledger update, or null when never funded. */
  updatedAt: string | null
  /** The wallet the balance was queried for (tenant or proxied end user). */
  subject: string
  /** Platform pay-to wallet for top-ups (present when x402 is enabled). */
  payTo?: string
  /** Per-request pay-per-call price in wei (present when x402 is enabled). */
  priceWei?: string
}

/**
 * Balance query client for B-end integrations.
 * @example
 * const billing = new BillingClient({ gatewayUrl, apiKey: 'agentx_xxx' })
 * const { balanceWei, priceWei } = await billing.getBalance()
 * if (balanceWei && priceWei && BigInt(balanceWei) < BigInt(priceWei)) {
 *   // show top-up prompt: send native token to billing.payTo
 * }
 */
export class BillingClient {
  private readonly baseUrl: string

  constructor(private readonly config: BillingClientConfig) {
    this.baseUrl = config.gatewayUrl.replace(/\/$/, '')
  }

  private _headers(endUserId?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (this.config.apiKey) headers['X-Api-Key'] = this.config.apiKey
    if (this.config.accessToken) headers['Authorization'] = `Bearer ${this.config.accessToken}`
    if (!this.config.apiKey && !this.config.accessToken) {
      throw new Error('BillingClient requires either apiKey or accessToken')
    }
    const uid = endUserId ?? this.config.endUserId
    if (uid) headers['X-End-User-Id'] = uid
    return headers
  }

  /**
   * Query the x402 ledger balance for the tenant (default) or a proxied
   * end-user wallet. Never throws on a zero balance — balance "0" is a normal
   * response. Throws only on auth/transport errors.
   * @param opts.endUserId 0x wallet to query instead of the tenant's own balance
   */
  async getBalance(opts: { endUserId?: string } = {}): Promise<BalanceResult> {
    const res = await fetch(`${this.baseUrl}/api/v1/billing/balance`, {
      method: 'GET',
      headers: this._headers(opts.endUserId),
    })
    if (!res.ok) {
      let detail = ''
      try {
        const body = await res.json()
        detail = body?.error ?? ''
      } catch {}
      throw new Error(`Balance query failed (HTTP ${res.status}) ${detail}`.trim())
    }
    return res.json() as Promise<BalanceResult>
  }
}
