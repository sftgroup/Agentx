// ---------------------------------------------------------------------------
// AgentX Gateway — self-hosted a2a-pay + period-authorization rails (R17.5)
// ---------------------------------------------------------------------------
// @0xinfrax/payments@0.1.2 removed the a2a rail (create → settle) and the
// period-authorization rail. To keep the public HTTP contract and the SDK
// client signatures unchanged (B-side callers see zero change), both rails are
// re-implemented here on AgentX-owned tables:
//   - a2a     → payment_intents (method='a2a', payee column); settle reuses the
//               module's x402 verify path for on-chain verification + crediting
//   - period  → payment_authorizations (atomic one-period charge, drain → exhausted)
// The generic engine stays locked at @0xinfrax/payments@0.1.1 for the rails it
// still provides (chain / fiat / x402 / MPP / stablecoin).
// ---------------------------------------------------------------------------
import { randomUUID } from 'node:crypto'
import type { ChainKey } from '@0xinfrax/payments'
import { getPool } from '../lib/db'
import { config } from '../config'
import { paymentsService } from './payments'

export interface A2ACreateInput {
  payer: string
  amountWei: string
  payee?: string
  asset?: string
  chain?: ChainKey
  metadata?: Record<string, unknown>
}

export interface A2ACreateResult {
  paymentId: string
  amountWei: string
  payee: string
}

export interface A2ASettleInput {
  paymentId: string
  txHash: string
  chain?: ChainKey
}

export interface A2ASettleResult {
  verified: boolean
  paymentId: string
  payer: string
  creditedWei: string
  balanceWei: string
}

export interface PeriodChargeResult {
  renewed: boolean
  remainingWei: string
}

export interface PeriodAuthorizeInput {
  payer: string
  txHash: string
  amountWei: string
  /** Defaults to config.periodPriceWei when omitted. */
  periodPriceWei?: string
  /** Defaults to config.periodMaxPeriods when omitted. */
  periods?: number
  asset?: string
  chain?: ChainKey
}

export interface PeriodAuthorizeResult extends PeriodAuthorizationView {
  authorizationId: string
}

export interface PeriodAuthorizationView {
  id: string
  owner: string
  amountWei: string
  remainingWei: string
  periods: number
  status: string
}

export class A2APeriodService {
  /** Phase 1: create an a2a intent → paymentId + amount + payee. */
  async createA2AIntent(input: A2ACreateInput): Promise<A2ACreateResult> {
    const payer = String(input.payer ?? '').toLowerCase()
    const payee = String(input.payee ?? paymentsService.x402?.payTo() ?? '').toLowerCase()
    const amountWei = String(input.amountWei ?? '')
    if (!payer || !payee || !amountWei) {
      throw new Error('a2a: payer, payee (or x402 payTo) and amountWei are required')
    }
    const paymentId = `a2a_${randomUUID()}`
    await getPool().query(
      `INSERT INTO payment_intents (intent_id, method, subscriber, amount_wei, chain, status, metadata, payee, asset)
       VALUES ($1, 'a2a', $2, $3, $4, 'created', $5, $6, $7)`,
      [paymentId, payer, amountWei, input.chain ?? 'oxachain', input.metadata ? JSON.stringify(input.metadata) : null, payee, input.asset ?? '0x0000000000000000000000000000000000000000']
    )
    return { paymentId, amountWei, payee }
  }

  /**
   * Phase 2: verify the payer's on-chain payment tx and credit it. Reuses the
   * module's x402 verify path (idempotent per tx hash — replay cannot double
   * credit), then marks the intent paid.
   */
  async a2aSettle(input: A2ASettleInput): Promise<A2ASettleResult> {
    const verified = await paymentsService.verifyPayment(input.txHash, input.chain)
    if (!verified) {
      return { verified: false, paymentId: input.paymentId, payer: '', creditedWei: '0', balanceWei: '0' }
    }
    await getPool().query(
      `UPDATE payment_intents SET status = 'paid', updated_at = NOW() WHERE intent_id = $1 AND status <> 'paid'`,
      [input.paymentId]
    )
    const balanceWei = (await paymentsService.balanceOf(verified.payer)).toString()
    return {
      verified: true,
      paymentId: input.paymentId,
      payer: verified.payer,
      creditedWei: verified.creditedWei,
      balanceWei,
    }
  }

  /**
   * Create a period authorization from an on-chain funding tx (replaces the
   * x402 `period` accept that @0xinfrax/payments@0.1.2 removed). Verifies the
   * payment via the engine (native or stablecoin path, idempotent per txHash),
   * credits the payer ledger, then commits the authorization — idempotent on
   * the tx reference, so a replayed funding tx cannot double-create.
   */
  async createPeriodAuthorization(input: PeriodAuthorizeInput): Promise<PeriodAuthorizeResult> {
    const payer = String(input.payer ?? '').toLowerCase()
    const txHash = String(input.txHash ?? '').toLowerCase()
    const amountWei = String(input.amountWei ?? '')
    const periodPriceWei = String(input.periodPriceWei ?? config.periodPriceWei ?? '')
    const periods = Number(input.periods ?? config.periodMaxPeriods ?? 0)
    const asset = String(input.asset ?? '0x0000000000000000000000000000000000000000').toLowerCase()
    const chain = input.chain ?? 'oxachain'
    if (!payer || !txHash || !amountWei) {
      throw new Error('period: payer, txHash and amountWei are required')
    }
    if (!periodPriceWei || periods <= 0) {
      throw new Error('period: periodPriceWei and periods are required (or configured via PERIOD_PRICE_WEI / PERIOD_MAX_PERIODS)')
    }
    if (BigInt(amountWei) !== BigInt(periodPriceWei) * BigInt(periods)) {
      throw new Error('period: amountWei must equal periodPriceWei × periods')
    }
    const verified = await paymentsService.verifyPayment(txHash, chain)
    if (!verified) {
      throw new Error('period: transaction is not a valid payment to the platform wallet')
    }
    const id = `auth:${txHash}`
    await getPool().query(
      `INSERT INTO payment_authorizations
        (id, owner, asset, chain, amount_wei, remaining_wei, period_price_wei, periods, nonce, reference, status)
       VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $8, 'active')
       ON CONFLICT (reference) DO NOTHING`,
      [id, payer, asset, chain, amountWei, periodPriceWei, periods, txHash]
    )
    const view = await this.getAuthorization(id)
    if (!view) throw new Error('period: authorization commit failed')
    return { authorizationId: id, ...view }
  }

  /**
   * Charge one period of an authorization. Atomic: remaining -= periodPrice;
   * marks `exhausted` when the remainder can no longer cover a full period.
   * Throws when not active / insufficient funds (matches the generic store).
   */
  async chargePeriod(authorizationId: string): Promise<PeriodChargeResult> {
    const res = await getPool().query(
      `UPDATE payment_authorizations
       SET remaining_wei = (remaining_wei::numeric - period_price_wei::numeric)::text,
           status = CASE
             WHEN (remaining_wei::numeric - period_price_wei::numeric) < period_price_wei::numeric THEN 'exhausted'
             ELSE 'active'
           END
       WHERE id = $1 AND status = 'active' AND remaining_wei::numeric >= period_price_wei::numeric
       RETURNING remaining_wei, status`,
      [authorizationId]
    )
    if (!res.rows.length) {
      throw new Error(`Authorization ${authorizationId} cannot be charged (not active or insufficient funds)`)
    }
    return { renewed: res.rows[0].status === 'active', remainingWei: res.rows[0].remaining_wei }
  }

  /** Read a period authorization (HTTP contract kept unchanged). */
  async getAuthorization(authorizationId: string): Promise<PeriodAuthorizationView | null> {
    const { rows } = await getPool().query(
      'SELECT id, owner, amount_wei, remaining_wei, periods, status FROM payment_authorizations WHERE id = $1',
      [authorizationId]
    )
    if (!rows.length) return null
    const r = rows[0]
    return {
      id: r.id,
      owner: r.owner,
      amountWei: r.amount_wei,
      remainingWei: r.remaining_wei,
      periods: r.periods,
      status: r.status,
    }
  }
}

export const a2aPeriodService = new A2APeriodService()
