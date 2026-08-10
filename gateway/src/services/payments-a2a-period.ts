// ---------------------------------------------------------------------------
// AgentX Gateway — a2a-pay + period-authorization rails (R17.6)
// ---------------------------------------------------------------------------
// @0xinfrax/payments@0.1.2 removed the a2a rail (create → settle) and the
// period-authorization rail, so AgentX self-hosted both (R17.5). Since
// @0xinfrax/payments@0.1.3 restored both rails inside the generic engine, this
// service now delegates to the module:
//   - a2a    → PaymentsService.createPayment({ method: 'a2a' }) + a2aSettle()
//   - period → PaymentsService.getAuthorization() + chargePeriod()
// The public HTTP contract and the SDK client signatures are unchanged, so
// B-side callers see zero change.
// ---------------------------------------------------------------------------
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
  /** Phase 1: create an a2a intent → paymentId + amount + payee (module rail). */
  async createA2AIntent(input: A2ACreateInput): Promise<A2ACreateResult> {
    const payer = String(input.payer ?? '').toLowerCase()
    const payee = String(input.payee ?? paymentsService.x402?.payTo() ?? '').toLowerCase()
    const amountWei = String(input.amountWei ?? '')
    if (!payer || !payee || !amountWei) {
      throw new Error('a2a: payer, payee (or x402 payTo) and amountWei are required')
    }
    const result = await paymentsService.createPayment({
      method: 'a2a',
      subscriber: payer,
      valueWei: amountWei,
      payee,
      asset: input.asset,
      chain: input.chain,
      metadata: input.metadata,
    })
    if (result.method !== 'a2a') throw new Error('Unexpected a2a payment result')
    // The module's recordIntent (PaymentIntentInput) carries no payee column,
    // but the AgentX payment_intents audit table (migration 021) has one —
    // backfill it so the a2a receiving wallet is recorded like the self-hosted
    // rail did.
    await getPool().query(
      `UPDATE payment_intents SET payee = $2, updated_at = NOW() WHERE intent_id = $1 AND payee IS NULL`,
      [result.paymentId, payee]
    )
    return { paymentId: result.paymentId, amountWei: result.amountWei, payee: result.payee }
  }

  /**
   * Phase 2: verify the payer's on-chain payment tx and credit it. Delegates to
   * the module's a2aSettle (idempotent per tx hash — replay cannot double
   * credit), then reports the payer's ledger balance.
   */
  async a2aSettle(input: A2ASettleInput): Promise<A2ASettleResult> {
    const verified = await paymentsService.a2aSettle({
      paymentId: input.paymentId,
      txHash: input.txHash,
      chain: input.chain,
    })
    if (!verified) {
      return { verified: false, paymentId: input.paymentId, payer: '', creditedWei: '0', balanceWei: '0' }
    }
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
   * Charge one period of an authorization. Delegates to the module's atomic
   * chargePeriod (remaining -= periodPrice; marks `exhausted` when the
   * remainder can no longer cover a full period).
   */
  async chargePeriod(authorizationId: string): Promise<PeriodChargeResult> {
    return paymentsService.chargePeriod(authorizationId)
  }

  /** Read a period authorization via the module seam (HTTP contract unchanged). */
  async getAuthorization(authorizationId: string): Promise<PeriodAuthorizationView | null> {
    const auth = await paymentsService.getAuthorization(authorizationId)
    if (!auth) return null
    return {
      id: auth.id,
      owner: auth.owner,
      amountWei: auth.amountWei,
      remainingWei: auth.remainingWei,
      periods: auth.periods,
      status: auth.status,
    }
  }
}

export const a2aPeriodService = new A2APeriodService()
