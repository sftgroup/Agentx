// ---------------------------------------------------------------------------
// AgentX Gateway — Payments bridge (AgentX side of the generic payments engine)
// ---------------------------------------------------------------------------
// Implements the PaymentStore over AgentX's own tables (x402_*, fiat_*) and
// handles the business callbacks (webhook → fiat_subscriptions, x402 subscribe
// registration) that the generic @0xinfrax/payments module intentionally
// does NOT know about. All AgentX-specific persistence lives here.
// ---------------------------------------------------------------------------

import type {
  AccessCheckOptions,
  AccessResource,
  ChainKey,
  PaymentCredit,
  PaymentIntentInput,
  PaymentIntentStatus,
  PaymentStore,
  WebhookEvent,
} from '@0xinfrax/payments'
import { getPool } from '../lib/db'
import { config } from '../config'
import { chainDataReader, log } from './chain-data-reader'

// ── Platform fee (basis points) with a short TTL cache ─────────────────────
let platformFeeBpsCache: { bps: number; at: number } | null = null
const PLATFORM_FEE_BPS_TTL_MS = 5 * 60_000
const PLATFORM_FEE_BPS_FALLBACK = 250

async function resolvePlatformFeeBps(): Promise<number> {
  const now = Date.now()
  if (platformFeeBpsCache && now - platformFeeBpsCache.at < PLATFORM_FEE_BPS_TTL_MS) {
    return platformFeeBpsCache.bps
  }
  try {
    const bps = await chainDataReader.platformFeeBps('oxachain')
    platformFeeBpsCache = { bps, at: now }
    return bps
  } catch {
    return PLATFORM_FEE_BPS_FALLBACK
  }
}

// ── AgentX PaymentStore (over AgentX tables) ───────────────────────────────

export class AgentxPaymentStore implements PaymentStore {
  async balanceOf(address: string, _asset?: string): Promise<bigint> {
    const { rows } = await getPool().query('SELECT balance_wei FROM x402_balances WHERE address = $1', [address.toLowerCase()])
    return rows.length ? BigInt(rows[0].balance_wei) : 0n
  }

  async credit(credit: PaymentCredit): Promise<void> {
    const pool = getPool()
    const res = await pool.query(
      `INSERT INTO x402_payments (tx_hash, from_address, amount_wei, chain_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tx_hash) DO NOTHING`,
      [credit.reference.toLowerCase(), credit.payer, credit.amountWei, credit.chainId]
    )
    if ((res.rowCount ?? 0) === 0) return // already credited
    await pool.query(
      `INSERT INTO x402_balances (address, balance_wei) VALUES ($1, $2)
       ON CONFLICT (address) DO UPDATE SET
         balance_wei = (x402_balances.balance_wei::numeric + $2::numeric)::text,
         updated_at = NOW()`,
      [credit.payer, credit.amountWei]
    )
  }

  async isCreditRecorded(reference: string): Promise<boolean> {
    const { rows } = await getPool().query('SELECT 1 FROM x402_payments WHERE tx_hash = $1', [reference.toLowerCase()])
    return rows.length > 0
  }

  async deduct(address: string, amount: bigint, _asset?: string): Promise<boolean> {
    const res = await getPool().query(
      `UPDATE x402_balances SET balance_wei = (balance_wei::numeric - $2)::text, updated_at = NOW()
       WHERE address = $1 AND balance_wei::numeric >= $2`,
      [address.toLowerCase(), amount.toString()]
    )
    return (res.rowCount ?? 0) > 0
  }

  /** Unified access: off-chain (fiat/x402) first, then on-chain contract. */
  async resolveAccess(subscriber: string, resource: AccessResource, opts?: AccessCheckOptions): Promise<boolean> {
    const agentId = Number(typeof resource === 'object' && resource !== null ? (resource as Record<string, unknown>).agentId : resource)
    if (!subscriber || !agentId) return false

    const chain = opts?.chain ?? 'oxachain'
    try {
      const { rows } = await getPool().query(
        `SELECT 1 FROM fiat_subscriptions
         WHERE subscriber = $1 AND agent_id = $2 AND status = 'active'
           AND (expires_at IS NULL OR expires_at > NOW())
         LIMIT 1`,
        [subscriber.toLowerCase(), agentId]
      )
      if (rows.length > 0) return true
    } catch (err) {
      log.warn(`resolveAccess offchain check failed: ${(err as Error).message}`)
    }

    try {
      return await chainDataReader.hasActiveSubscription(chain, subscriber as `0x${string}`, agentId)
    } catch (err) {
      log.warn(`resolveAccess onchain check failed: ${(err as Error).message}`)
      return false
    }
  }

  /**
   * Record a payment intent (audit trail). Since 0.1.3 the generic engine
   * calls this for every rail (chain / a2a / batch / x402 verify path); the
   * AgentX-owned `payment_intents` table (migration 021) is the shared sink.
   */
  async recordIntent(intent: PaymentIntentInput): Promise<void> {
    const { paymentId, method, subscriber, asset, amountWei, currency, chain, status, metadata } = intent
    if (!paymentId) return
    await getPool().query(
      `INSERT INTO payment_intents (intent_id, method, subscriber, asset, amount_wei, currency, chain, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (intent_id) DO NOTHING`,
      [
        paymentId,
        method,
        subscriber?.toLowerCase() ?? null,
        asset ?? null,
        amountWei !== undefined ? String(amountWei) : null,
        currency ?? null,
        chain ?? null,
        status ?? 'created',
        metadata ? JSON.stringify(metadata) : null,
      ]
    )
  }

  /** Advance a payment intent's lifecycle (a2a / batch settle → paid). */
  async updateIntentStatus(paymentId: string, status: PaymentIntentStatus): Promise<void> {
    await getPool().query(
      `UPDATE payment_intents SET status = $2, updated_at = NOW() WHERE intent_id = $1`,
      [paymentId, status]
    )
  }
}

export const agentxPaymentStore = new AgentxPaymentStore()

// ── Payments bridge: business callbacks from the generic engine ────────────

const PERIOD_SECONDS: Record<string, number> = {
  day: 86_400,
  week: 604_800,
  month: 2_592_000, // 30 days (matches on-chain _periodToSeconds)
  year: 31_536_000, // 365 days
}

export class PaymentsBridge {
  /** Normalized provider webhook event → AgentX fiat_subscriptions state. */
  async handleWebhookEvent(event: WebhookEvent): Promise<void> {
    const pool = getPool()
    const obj = event.object

    switch (event.type) {
      case 'checkout.session.completed': {
        const ref = String(obj.client_reference_id ?? '').split('|')
        const subscriber = ref[0] ?? ''
        // R19.3 / D11: clientReference shape `${subscriber}|0|${planId}|tenant-plan`
        // — bind the purchased platform plan onto the tenant instead of an agent sub.
        if (ref[3] === 'tenant-plan') {
          const planId = ref[2] ?? ''
          if (!subscriber || !planId) break
          await this.bindTenantPlan({ subscriber, planId, reference: String(obj.id ?? '') })
          break
        }
        const agentId = Number(ref[1] ?? 0)
        if (!subscriber || !agentId) break
        const amountCents = Number(obj.amount_total ?? 0)
        await pool.query(
          `INSERT INTO fiat_subscriptions (subscriber, agent_id, provider, provider_sub_id, status, currency, amount_cents, starts_at)
           VALUES ($1, $2, 'stripe', $3, 'active', $4, $5, NOW())
           ON CONFLICT (provider_sub_id) DO UPDATE SET status='active', updated_at=NOW()`,
          [subscriber, agentId, String(obj.subscription ?? ''), String(obj.currency ?? 'usd'), amountCents]
        )
        log.info(`webhook checkout.session.completed (subscriber=${subscriber}, agentId=${agentId}, amountCents=${amountCents})`)
        break
      }
      case 'invoice.paid': {
        const subId = String(obj.subscription ?? '')
        if (!subId) break
        const line = Array.isArray(obj.lines?.data) ? obj.lines.data[0] : null
        const periodEnd = line?.period?.end ? new Date(line.period.end * 1000) : null
        const amountCents = Number(obj.amount_paid ?? 0)
        // Prefer the real buyer row created by checkout.session.completed.
        const { rows: existing } = await pool.query(
          'SELECT id, subscriber, agent_id FROM fiat_subscriptions WHERE provider_sub_id = $1',
          [subId]
        )
        let sub = existing[0] ?? null
        if (sub) {
          await pool.query(
            `UPDATE fiat_subscriptions SET status='active', amount_cents=$2, expires_at=$3, updated_at=NOW()
             WHERE provider_sub_id = $1`,
            [subId, amountCents, periodEnd]
          )
        } else {
          const { rows: inserted } = await pool.query(
            `INSERT INTO fiat_subscriptions (subscriber, agent_id, provider, provider_sub_id, status, currency, amount_cents, starts_at, expires_at)
             VALUES ('', 0, 'stripe', $1, 'active', $2, $3, NOW(), $4)
             ON CONFLICT (provider_sub_id) DO NOTHING
             RETURNING id, subscriber, agent_id`,
            [subId, String(obj.currency ?? 'usd'), amountCents, periodEnd]
          )
          sub = inserted[0] ?? null
        }
        // Per-period payout row for creator/platform reconciliation.
        if (sub && Number(sub.agent_id) > 0) {
          const creator = await pool.query('SELECT creator FROM subscription_plans WHERE agent_id = $1 LIMIT 1', [sub.agent_id])
          const platformCut = Math.floor((amountCents * await resolvePlatformFeeBps()) / 10000)
          await pool.query(
            `INSERT INTO fiat_payouts (subscription_id, creator, agent_id, amount_cents, currency, platform_cut_cents, invoice_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [sub.id, creator.rows[0]?.creator ?? null, sub.agent_id, amountCents, String(obj.currency ?? 'usd'), platformCut, String(obj.id ?? '')]
          )
        }
        log.info(`webhook invoice.paid (sub=${subId}, amountCents=${amountCents}, periodEnd=${periodEnd?.toISOString() ?? '-'})`)
        break
      }
      case 'customer.subscription.deleted': {
        const subId = String(obj.id ?? '')
        await pool.query(`UPDATE fiat_subscriptions SET status='cancelled', updated_at=NOW() WHERE provider_sub_id = $1`, [subId])
        log.info(`webhook customer.subscription.deleted (sub=${subId})`)
        break
      }
      default:
        break
    }
  }

  /** Register/refresh an x402 (native-token period) subscription. */
  async registerX402Subscription(input: {
    subscriber: string
    agentId: number
    planId: number
    period: string
    txHash: string
    chain: ChainKey
  }): Promise<{ id: number; subscriber: string; agent_id: number; expires_at: Date }> {
    const seconds = PERIOD_SECONDS[input.period] ?? PERIOD_SECONDS.month
    const { rows } = await getPool().query(
      `INSERT INTO fiat_subscriptions (subscriber, agent_id, plan_id, provider, provider_sub_id, status, period, starts_at, expires_at)
       VALUES ($1, $2, $3, 'x402', $4, 'active', $5, NOW(), NOW() + ($6 * INTERVAL '1 second'))
       ON CONFLICT (provider_sub_id) DO UPDATE
         SET status = 'active', period = $5, expires_at = NOW() + ($6 * INTERVAL '1 second'), updated_at = NOW()
       RETURNING id, subscriber, agent_id, expires_at`,
      [input.subscriber.toLowerCase(), input.agentId, input.planId, input.txHash.toLowerCase(), input.period, seconds]
    )
    const sub = rows[0]
    log.info(`registerX402Subscription(subscriber=${input.subscriber}, agentId=${input.agentId}, planId=${input.planId}, period=${input.period}, tx=${input.txHash}) → id=${sub.id}, expires=${sub.expires_at.toISOString()}`)
    return sub
  }

  /**
   * Full x402 subscription rail: verify the on-chain payment, enforce that the
   * payer is the subscriber and covers the plan price, then register access.
   * Shared by `POST /api/v1/x402/subscribe` and the unified
   * `POST /api/v1/payments` (method='x402').
   * @returns the registered subscription + credited amount, or null when the
   *          payment is not a valid x402 payment for this subscriber.
   */
  async subscribeX402(input: {
    subscriber: string
    agentId: number
    planId: number
    period?: string
    txHash: string
    chain: ChainKey
    verify: (txHash: string, chain: ChainKey) => Promise<bigint | null>
  }): Promise<{ subscriptionId: number; expiresAt: string; creditedWei: string } | null> {
    const credited = await input.verify(input.txHash, input.chain)
    if (credited === null) return null
    const { rows: payRows } = await getPool().query(
      'SELECT from_address FROM x402_payments WHERE tx_hash = $1',
      [input.txHash.toLowerCase()]
    )
    const from = (payRows[0]?.from_address ?? '').toLowerCase()
    if (!from || from !== input.subscriber.toLowerCase()) return null
    try {
      const plan = await chainDataReader.getPlan(input.chain, input.planId)
      if (credited < plan.price) return null
    } catch { /* plan lookup is best-effort */ }
    const sub = await this.registerX402Subscription({
      subscriber: from,
      agentId: input.agentId,
      planId: input.planId,
      period: input.period ?? 'month',
      txHash: input.txHash,
      chain: input.chain,
    })
    return { subscriptionId: sub.id, expiresAt: sub.expires_at.toISOString(), creditedWei: credited.toString() }
  }

  // ── Tenant-plan purchases (R19.3 / D11) ───────────────────────────────────
  // Platform subscription tiers live in the `plans` table (UUID, USD pricing);
  // buying one binds it onto the tenant (plan_id + quota_daily) — the quota
  // billing then flows through the R18 updateQuota pipeline. Only the engine
  // verifies payments; AgentX only binds.

  /** USD price of a platform plan → wei (uses FIAT_TOKEN_USD_PRICE). */
  async resolveTenantPlanAmountWei(planId: string): Promise<{ priceWei: bigint; slug: string } | null> {
    const { rows } = await getPool().query(
      `SELECT price_monthly, slug FROM plans WHERE id = $1 AND is_active = true`,
      [planId]
    )
    if (!rows.length) return null
    const usd = parseFloat(String(rows[0].price_monthly))
    if (!Number.isFinite(usd) || usd <= 0) return null
    const priceWei = BigInt(Math.round((usd / config.fiatTokenUsdPrice) * 1e18))
    return { priceWei, slug: rows[0].slug }
  }

  /**
   * Bind a purchased platform plan onto the tenant (D6/D11): the order callback
   * only updates `plan_id` / `quota_daily`; billing keeps flowing through the
   * R18 updateQuota pipeline. Idempotent by nature (re-runs overwrite).
   * @throws when the tenant or plan does not exist / plan is inactive.
   */
  async bindTenantPlan(input: {
    subscriber: string
    planId: string
    reference: string
  }): Promise<{ tenantId: string; planSlug: string; quotaDaily: string }> {
    const pool = getPool()
    const { rows } = await pool.query(
      `UPDATE tenants t
       SET plan_id = p.id,
           quota_daily = p.quota_daily,
           quota_used = 0,
           updated_at = NOW()
       FROM plans p
       WHERE t.wallet_address = $1 AND p.id = $2 AND p.is_active = true
       RETURNING t.id AS tenant_id, p.slug AS plan_slug, p.quota_daily`,
      [input.subscriber.toLowerCase(), input.planId]
    )
    if (!rows.length) {
      const missing = await pool.query('SELECT 1 FROM tenants WHERE wallet_address = $1', [input.subscriber.toLowerCase()])
      if (!missing.rows.length) {
        throw new Error(`bindTenantPlan: tenant not found for ${input.subscriber}`)
      }
      throw new Error(`bindTenantPlan: plan ${input.planId} not found or inactive`)
    }
    log.info(`bindTenantPlan(subscriber=${input.subscriber}, plan=${input.planId}, ref=${input.reference}) → tenant=${rows[0].tenant_id}, slug=${rows[0].plan_slug}`)
    return { tenantId: rows[0].tenant_id, planSlug: rows[0].plan_slug, quotaDaily: String(rows[0].quota_daily) }
  }

  /**
   * Full tenant-plan chain/x402 rail: verify the on-chain payment, enforce the
   * payer is the tenant wallet and that the credited amount covers the plan
   * price, then bind the plan. Shared by `POST /api/v1/payments`
   * (purpose='tenant-plan', method='chain' | 'x402').
   * @returns the bound plan, or null when the tx is not a valid payment.
   */
  async buyTenantPlan(input: {
    subscriber: string
    planId: string
    txHash: string
    chain: ChainKey
    verify: (txHash: string, chain: ChainKey) => Promise<bigint | null>
  }): Promise<{ tenantId: string; planSlug: string; quotaDaily: string } | null> {
    const planAmount = await this.resolveTenantPlanAmountWei(input.planId)
    if (!planAmount) return null
    const credited = await input.verify(input.txHash, input.chain)
    if (credited === null || credited < planAmount.priceWei) return null
    const { rows: payRows } = await getPool().query(
      'SELECT from_address FROM x402_payments WHERE tx_hash = $1',
      [input.txHash.toLowerCase()]
    )
    const from = (payRows[0]?.from_address ?? '').toLowerCase()
    if (!from || from !== input.subscriber.toLowerCase()) return null
    return this.bindTenantPlan({ subscriber: from, planId: input.planId, reference: input.txHash })
  }
}

export const paymentsBridge = new PaymentsBridge()
