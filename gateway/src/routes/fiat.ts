// ---------------------------------------------------------------------------
// AgentX Gateway — Fiat Subscriptions (A1, SaaS-style card billing)
// ---------------------------------------------------------------------------
// Thin transport layer over the generic @0xinfrax/payments engine:
//   - checkout  → paymentsService.createPayment({ method: 'fiat', ... })
//   - webhook   → paymentsService.handleWebhook (signature verified in-engine;
//                 business events handled by the AgentX payments bridge)
// The on-chain SubscriptionManager stays the primary rail; fiat never touches
// it. Feature is inert without STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET (503).
// ---------------------------------------------------------------------------

import { Router, Request, Response } from 'express'
import { getPool } from '../lib/db'
import { config } from '../config'
import { log } from '../services/chain-data-reader'
import { paymentsService } from '../services/payments'
import { isPaymentError } from '@0xinfrax/payments'

const router = Router()

function fiatEnabled(): boolean {
  return Boolean(config.stripeSecretKey)
}

// POST /api/v1/fiat/checkout — create a Stripe Checkout Session
// body: { subscriber, agentId, planId?, period?, amountCents?, currency?, chain?, successUrl?, cancelUrl? }
// amountCents may be omitted when planId is provided — the engine auto-prices
// the on-chain plan (planWei / 1e18 × FIAT_TOKEN_USD_PRICE × 100).
router.post('/checkout', async (req: Request, res: Response, next) => {
  try {
    if (!fiatEnabled()) {
      res.status(503).json({ error: 'Fiat checkout is not configured (STRIPE_SECRET_KEY missing)' })
      return
    }
    const { subscriber, agentId, planId, period = 'month', amountCents, currency = 'usd', chain, successUrl, cancelUrl } = req.body || {}
    if (!subscriber || !agentId || (!amountCents && !planId)) {
      res.status(400).json({ error: 'subscriber, agentId and amountCents (or planId for auto-pricing) are required' })
      return
    }
    const chainSlot: 'oxachain' | 'sepolia' = String(chain ?? config.x402Chain).toLowerCase() === 'sepolia' ? 'sepolia' : 'oxachain'
    const result = await paymentsService.createPayment({
      method: 'fiat',
      subscriber,
      period,
      currency,
      chain: chainSlot,
      amountCents: amountCents ? Number(amountCents) : undefined,
      pricing: planId ? { planId: Number(planId) } : undefined,
      // Business encoding lives here (AgentX side); the module only echoes it.
      metadata: { agentId: Number(agentId), planId: planId ? Number(planId) : undefined, resourceLabel: `agent #${agentId}` },
      clientReference: `${subscriber}|${Number(agentId)}|${planId ? Number(planId) : ''}`,
      successUrl,
      cancelUrl,
    })
    if (result.method !== 'fiat') {
      throw new Error('Fiat checkout returned an unexpected payment result')
    }
    res.json({ url: result.sessionUrl, sessionId: result.sessionId })
  } catch (err) {
    // Machine-readable PaymentError codes — no string matching.
    if (isPaymentError(err)) {
      switch (err.code) {
        case 'PROVIDER_ERROR':
          res.status(502).json({ error: 'Failed to create Stripe checkout session' })
          return
        case 'NOT_CONFIGURED':
          res.status(503).json({ error: err.message })
          return
        case 'AUTO_PRICE_FAILED':
        case 'AMOUNT_TOO_SMALL':
        case 'INVALID_INPUT':
          res.status(400).json({ error: err.message })
          return
      }
    }
    log.error(`checkout() failed: ${(err as Error).message}`)
    next(err)
  }
})

// POST /api/v1/fiat/webhook — Stripe event webhook (signature verified in-engine)
// Normalized events are forwarded to the AgentX payments bridge, which owns
// the fiat_subscriptions / fiat_payouts business state.
router.post('/webhook', async (req: Request, res: Response, next) => {
  try {
    if (!config.stripeWebhookSecret) {
      res.status(503).json({ error: 'Fiat webhook is not configured (STRIPE_WEBHOOK_SECRET missing)' })
      return
    }
    const signature = req.headers['stripe-signature']
    const rawBody: Buffer | undefined = (req as any).rawBody
    if (!signature || !rawBody) {
      log.warn('webhook() invalid Stripe signature')
      res.status(400).json({ error: 'Invalid signature' })
      return
    }
    await paymentsService.handleWebhook(rawBody.toString(), String(signature))
    res.json({ received: true })
  } catch (err) {
    if (isPaymentError(err) && err.code === 'INVALID_SIGNATURE') {
      res.status(400).json({ error: 'Invalid signature' })
      return
    }
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
