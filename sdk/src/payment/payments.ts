// ---------------------------------------------------------------------------
// @agentx/sdk — SubscriptionPayments: unified three-rail subscription payment
// ---------------------------------------------------------------------------
// A single entry point for subscribing across all AgentX payment rails:
//
//   method: 'chain'  → on-chain SubscriptionManager (native / ERC20, escrow)
//   method: 'fiat'   → Stripe checkout via the AgentX Gateway (card, no wallet)
//   method: 'x402'   → native-token period payment verified by the Gateway
//
// 'fiat' and 'x402' require an AgentX Gateway URL. 'chain' works fully
// off-Gateway with just a SubscriptionManager.
// ---------------------------------------------------------------------------

import type { Address, Hash, WalletClient } from 'viem'
import { SubscriptionManager } from '../subscription/subscription'

export type SubscriptionPaymentMethod = 'chain' | 'fiat' | 'x402'
export type SubscriptionPeriod = 'day' | 'week' | 'month' | 'year'
export type ChainKey = 'oxachain' | 'sepolia'

export interface SubscriptionPaymentsConfig {
  /** AgentX Gateway base URL (required for fiat / x402 rails). */
  gatewayUrl?: string
  /** Optional gateway bearer token. */
  accessToken?: string
  /** Chain rail — required for `method: 'chain'` and for automatic x402 payment. */
  subscriptionManager?: SubscriptionManager
  /** Wallet used to automatically fund an x402 payment (if txHash is not supplied). */
  walletClient?: WalletClient
  /** Which chain to verify x402 payments on (default: oxachain). */
  chain?: ChainKey
}

export interface PaySubscriptionInput {
  planId: number
  agentId: number
  method: SubscriptionPaymentMethod
  /** Buyer wallet. Required for fiat / x402; chain resolves from the wallet client. */
  subscriber?: Address
  /** Chain rail: native value override (defaults to the plan price). */
  valueWei?: bigint
  /** Chain rail: approve the ERC20 token before subscribing. */
  approveTokenFirst?: boolean
  /** Fiat rail: amount in minor units (cents). Optional — the Gateway
   *  auto-prices from the on-chain plan when planId is sent without it
   *  (see /api/v1/fiat/checkout). */
  amountCents?: number
  /** Fiat rail: currency code (default 'usd'). */
  currency?: string
  /** Fiat rail: redirect targets after Stripe checkout. */
  successUrl?: string
  cancelUrl?: string
  /** x402 rail: already-sent on-chain payment tx. When omitted and a wallet
   *  client is configured, the payment is sent automatically. */
  txHash?: string
  /** Billing period (default 'month'). */
  period?: SubscriptionPeriod
}

export type PaySubscriptionResult =
  | { method: 'chain'; subscriptionId: number; txHash: Hash }
  | { method: 'fiat'; sessionUrl: string; sessionId: string; redirect: true }
  | { method: 'x402'; subscriptionId: number; txHash: string; creditedWei?: string }

/** x402 protocol discovery returned by the Gateway. */
export interface X402Info {
  enabled: boolean
  priceWei: string
  payTo: string
  network: string
  chain: ChainKey
}

const PERIODS: readonly SubscriptionPeriod[] = ['day', 'week', 'month', 'year']

export class SubscriptionPayments {
  constructor(private config: SubscriptionPaymentsConfig) {}

  // ── Public API ──────────────────────────────────────────────────────────

  /** Pay for (or renew) a subscription using the chosen rail. */
  async pay(input: PaySubscriptionInput): Promise<PaySubscriptionResult> {
    switch (input.method) {
      case 'chain':
        return this._payChain(input)
      case 'fiat':
        return this._payFiat(input)
      case 'x402':
        return this._payX402(input)
    }
  }

  /**
   * Unified access check across all rails (chain OR fiat/x402) via the Gateway
   * `/api/v1/chain/check-subscription` endpoint (which already merges them).
   */
  async hasAccess(agentId: number, subscriber: Address): Promise<boolean> {
    if (!this.config.gatewayUrl) {
      throw new Error('hasAccess() requires a gatewayUrl')
    }
    const params = new URLSearchParams({
      chain: this.config.chain ?? 'oxachain',
      subscriber,
      agentId: String(agentId),
    })
    const data = await this._fetchJson<{ active: boolean }>(`/api/v1/chain/check-subscription?${params}`)
    return data.active === true
  }

  /** x402 protocol discovery (price / pay-to wallet / network). */
  async fetchX402Info(): Promise<X402Info> {
    if (!this.config.gatewayUrl) {
      throw new Error('fetchX402Info() requires a gatewayUrl')
    }
    return this._fetchJson<X402Info>('/api/v1/x402/info')
  }

  // ── Rails ───────────────────────────────────────────────────────────────

  private async _payChain(input: PaySubscriptionInput): Promise<PaySubscriptionResult> {
    const sm = this.config.subscriptionManager
    if (!sm) throw new Error('method "chain" requires a SubscriptionManager in the config')
    const result = await sm.subscribe(input.planId, {
      valueWei: input.valueWei,
      approveTokenFirst: input.approveTokenFirst,
    })
    return { method: 'chain', subscriptionId: result.subscriptionId, txHash: result.txHash }
  }

  private async _payFiat(input: PaySubscriptionInput): Promise<PaySubscriptionResult> {
    if (!this.config.gatewayUrl) throw new Error('method "fiat" requires a gatewayUrl')
    if (!input.subscriber) throw new Error('method "fiat" requires a subscriber address')
    const body: Record<string, unknown> = {
      subscriber: input.subscriber,
      agentId: input.agentId,
      planId: input.planId,
      period: input.period ?? 'month',
      currency: input.currency ?? 'usd',
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
    }
    // amountCents is optional — the Gateway derives the USD amount from the
    // on-chain plan price when omitted (FIAT_TOKEN_USD_PRICE on the Gateway).
    if (input.amountCents) body.amountCents = input.amountCents
    const data = await this._fetchJson<{ url: string; sessionId: string }>('/api/v1/fiat/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!data.url) throw new Error('Fiat checkout returned no redirect URL')
    return { method: 'fiat', sessionUrl: data.url, sessionId: data.sessionId, redirect: true }
  }

  private async _payX402(input: PaySubscriptionInput): Promise<PaySubscriptionResult> {
    if (!this.config.gatewayUrl) throw new Error('method "x402" requires a gatewayUrl')
    if (!input.subscriber) throw new Error('method "x402" requires a subscriber address')
    if (!PERIODS.includes(input.period ?? 'month')) {
      throw new Error('period must be one of: day | week | month | year')
    }

    // Automatically fund the payment when no txHash is supplied.
    let txHash = input.txHash
    if (!txHash) {
      txHash = await this._autoFundX402(input)
    }

    const body = {
      subscriber: input.subscriber,
      agentId: input.agentId,
      planId: input.planId,
      period: input.period ?? 'month',
      txHash,
      chain: this.config.chain ?? 'oxachain',
    }
    const data = await this._fetchJson<{
      subscriptionId: number
      creditedWei?: string
    }>('/api/v1/x402/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return {
      method: 'x402',
      subscriptionId: data.subscriptionId,
      txHash,
      creditedWei: data.creditedWei,
    }
  }

  /** Send the on-chain native transfer to the platform wallet (x402 rail). */
  private async _autoFundX402(input: PaySubscriptionInput): Promise<string> {
    const { walletClient, subscriptionManager } = this.config
    if (!walletClient || !subscriptionManager) {
      throw new Error('x402 automatic payment needs a txHash, or a walletClient + subscriptionManager in the config')
    }
    const info = await this.fetchX402Info()
    if (!info.enabled || !info.payTo) {
      throw new Error('x402 is not enabled on the Gateway (X402_ENABLED / X402_PAY_TO missing)')
    }
    const plan = await subscriptionManager.getPlan(input.planId)
    const priceWei = BigInt(info.priceWei || '0')
    const amount = plan.price > priceWei ? plan.price : priceWei
    let account = (walletClient.account as { address?: Address } | undefined)?.address
    if (!account) {
      const [addr] = await walletClient.getAddresses()
      account = addr
    }
    if (!account) throw new Error('Wallet not connected for x402 payment')
    const hash = await walletClient.sendTransaction({
      to: info.payTo as Address,
      value: amount,
      chain: undefined,
      account,
    })
    return hash
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
