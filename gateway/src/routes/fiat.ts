// ---------------------------------------------------------------------------
// AgentX Gateway — Fiat Subscriptions (A1, SaaS-style card billing)
// ---------------------------------------------------------------------------
// Zero-dependency Stripe integration (native fetch + HMAC webhook verify).
// Fiat state is mirrored into fiat_subscriptions so the Gateway access-control
// layer can accept "chain subscription OR fiat subscription". The on-chain
// SubscriptionManager stays the primary rail; fiat never touches it.
// Feature is inert without STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET (503).
// ---------------------------------------------------------------------------

import { Router, Request, Response } from 'express'
import { createHmac, timingSafeEqual } from 'crypto'
import { getPool } from '../lib/db'
import { config } from '../config'
import { log } from '../services/chain-data-reader'

const router = Router()
const STRIPE_API = 'https://api.stripe.com/v1'

function fiatEnabled(): boolean {
  return Boolean(config.stripeSecretKey)
}

/** Verify Stripe webhook signature (v1 scheme: `t=...,v1=...` HMAC over payload). */
function verifyStripeSignature(payload: Buffer, signatureHeader: string, secret: string): boolean {
  const parts: Record<string, string> = {}
  for (const pair of signatureHeader.split(',')) {
    const idx = pair.indexOf('=')
    if (idx > 0) parts[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim()
  }
  const { t, v1 } = parts
  if (!t || !v1) return false
  const expected = createHmac('sha256', secret).update(`${t}.${payload.toString()}`).digest()
  const received = Buffer.from(v1, 'hex')
  return received.length === expected.length && timingSafeEqual(received, expected)
}

interface StripeSession {
  id: string
  url: string | null
  subscription: string | null
  amount_total: number | null
  currency: string | null
}

// POST /api/v1/fiat/checkout — create a Stripe Checkout Session
// body: { subscriber, agentId, planId?, period?, amountCents, currency?, successUrl?, cancelUrl? }
router.post('/checkout', async (req: Request, res: Response, next) => {
  try {
    if (!fiatEnabled()) {
      res.status(503).json({ error: 'Fiat checkout is not configured (STRIPE_SECRET_KEY missing)' })
      return
    }
    const { subscriber, agentId, planId, period = 'month', amountCents, currency = 'usd', successUrl, cancelUrl } = req.body || {}
    if (!subscriber || !agentId || !amountCents) {
      res.status(400).json({ error: 'subscriber, agentId and amountCents are required' })
      return
    }

    const body = new URLSearchParams()
    body.set('mode', 'subscription')
    body.set('client_reference_id', `${subscriber}|${agentId}|${planId ?? ''}`)
    body.set('line_items[0][quantity]', '1')
    body.set('line_items[0][price_data][currency]', String(currency))
    body.set('line_items[0][price_data][unit_amount]', String(amountCents))
    body.set('line_items[0][price_data][product_data][name]', `AgentX Subscription — agent #${agentId}`)
    body.set('line_items[0][price_data][recurring][interval]', String(period))
    body.set('success_url', String(successUrl || `https://agentx.local/pay/success?subscriber=${encodeURIComponent(subscriber)}&agentId=${agentId}`))
    body.set('cancel_url', String(cancelUrl || `https://agentx.local/pay/cancel?agentId=${agentId}`))

    const resp = await fetch(`${STRIPE_API}/checkout/sessions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.stripeSecretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    const data = (await resp.json()) as StripeSession
    if (!resp.ok || !data.url) {
      log.error(`checkout() Stripe error (${resp.status}): ${JSON.stringify(data).slice(0, 300)}`)
      res.status(resp.status >= 500 ? 502 : 400).json({ error: 'Failed to create Stripe checkout session' })
      return
    }
    log.info(`checkout(subscriber=${subscriber}, agentId=${agentId}, amountCents=${amountCents}, period=${period}) → session ${data.id}`)
    res.json({ url: data.url, sessionId: data.id })
  } catch (err) {
    log.error(`checkout() failed: ${(err as Error).message}`)
    next(err)
  }
})

interface StripeWebhookEvent {
  type: string
  data: { object: Record<string, any> }
}

// POST /api/v1/fiat/webhook — Stripe event webhook (signature verified)
router.post('/webhook', async (req: Request, res: Response, next) => {
  try {
    if (!config.stripeWebhookSecret) {
      res.status(503).json({ error: 'Fiat webhook is not configured (STRIPE_WEBHOOK_SECRET missing)' })
      return
    }
    const signature = req.headers['stripe-signature']
    const rawBody: Buffer | undefined = (req as any).rawBody
    if (!signature || !rawBody || !verifyStripeSignature(rawBody, String(signature), config.stripeWebhookSecret)) {
      log.warn('webhook() invalid Stripe signature')
      res.status(400).json({ error: 'Invalid signature' })
      return
    }
    const event = JSON.parse(rawBody.toString()) as StripeWebhookEvent
    const pool = getPool()
    const obj = event.data.object

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
        const { rows } = await pool.query(
          `INSERT INTO fiat_subscriptions (subscriber, agent_id, provider, provider_sub_id, status, currency, amount_cents, starts_at, expires_at)
           VALUES ('', 0, 'stripe', $1, 'active', $2, $3, NOW(), $4)
           ON CONFLICT (provider_sub_id) DO UPDATE SET status='active', amount_cents=$3, expires_at=$4, updated_at=NOW()
           RETURNING id, subscriber, agent_id`,
          [subId, String(obj.currency ?? 'usd'), amountCents, periodEnd]
        )
        const sub = rows[0]
        // Record a per-period payout row for creator/platform reconciliation.
        if (sub && Number(sub.agent_id) > 0) {
          const creator = await pool.query('SELECT creator FROM subscription_plans WHERE agent_id = $1 LIMIT 1', [sub.agent_id])
          const platformCut = Math.floor((amountCents * 250) / 10000) // 2.5% reference (platformFeeBps)
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
        break // ignore other events
    }
    res.json({ received: true })
  } catch (err) {
    log.error(`webhook() failed: ${(err as Error).message}`)
    next(err)
  }
})

// GET /api/v1/fiat/status?subscriber=&agentId= — active fiat subscription check
router.get('/status', async (req: Request, res: Response, next) => {
  try {
    const subscriber = String(req.query.subscriber ?? '')
    const agentId = Number(req.query.agentId)
    if (!subscriber || !agentId) {
      res.status(400).json({ error: 'subscriber and agentId are required' })
      return
    }
    const { rows } = await getPool().query(
      `SELECT * FROM fiat_subscriptions
       WHERE subscriber = $1 AND agent_id = $2 AND status = 'active'
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC LIMIT 1`,
      [subscriber, agentId]
    )
    const active = rows.length > 0
    log.info(`fiat/status(subscriber=${subscriber}, agentId=${agentId}) → active=${active}`)
    res.json({ subscriber, agentId, active, subscription: active ? rows[0] : null })
  } catch (err) {
    log.error(`fiat/status failed: ${(err as Error).message}`)
    next(err)
  }
})

export default router
