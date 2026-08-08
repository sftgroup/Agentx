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
  PaymentStore,
  WebhookEvent,
} from '@0xinfrax/payments'
import { getPool } from '../lib/db'
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
}

export const paymentsBridge = new PaymentsBridge()
