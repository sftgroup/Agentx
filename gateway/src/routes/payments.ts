// ---------------------------------------------------------------------------
// AgentX Gateway — Unified payments endpoint (P5)
// ---------------------------------------------------------------------------
// One transport entry for every payment rail, backed by the generic
// @0xinfrax/payments engine + the AgentX payments bridge:
//
//   POST /api/v1/payments          → create a payment (fiat checkout / chain
//                                    intent / x402 subscription)
//   POST /api/v1/payments/verify   → verify an on-chain payment tx + credit
//   GET  /api/v1/payments/access   → unified access check (chain OR fiat/x402)
//   GET  /api/v1/payments/info     → rails discovery / pricing
//   GET  /api/v1/payments/quote    → x402 v2 challenge for a protected resource
//   POST /api/v1/payments/webhook  → provider webhook (fiat)
//
// Auth: public by default — payment security rests on the on-chain credential
// itself (the module verifies signatures / txs; forged proofs never credit).
// SDK callers may still pass a Bearer token which is forwarded to the engine
// callers as-is (transport-level auth is opt-in per deployment).
// ---------------------------------------------------------------------------

import { Router, Request, Response } from 'express'
import { config } from '../config'
import { decodeHeader, isPaymentError } from '@0xinfrax/payments'
import type { X402PaymentRequired } from '@0xinfrax/payments'
import { paymentsService } from '../services/payments'
import { a2aPeriodService } from '../services/payments-a2a-period'
import { paymentsBridge } from '../services/payments-bridge'
import { verifyAndCredit, x402Available } from '../services/x402'
import { log } from '../services/chain-data-reader'
import type { ChainKey } from '../services/chain-data-reader'

const router = Router()

function resolveChain(slot?: string): ChainKey {
  return String(slot ?? config.x402Chain).toLowerCase() === 'sepolia' ? 'sepolia' : 'oxachain'
}

function sendPaymentError(res: Response, err: unknown): boolean {
  if (isPaymentError(err)) {
    switch (err.code) {
      case 'PROVIDER_ERROR':
        res.status(502).json({ error: 'Payment provider error' })
        return true
      case 'NOT_CONFIGURED':
        res.status(503).json({ error: err.message })
        return true
      default:
        // Respect the module's suggested status (401/404/422/…), fall back to 400.
        res.status(err.status >= 400 && err.status < 600 ? err.status : 400).json({ error: err.message })
        return true
    }
  }
  return false
}

// POST /api/v1/payments — unified create (dispatch by rail)
// body: { method, subscriber, agentId, planId?, period?, amountCents?, currency?,
//         chain?, txHash?, valueWei?, successUrl?, cancelUrl? }
router.post('/', async (req: Request, res: Response, next) => {
  try {
    const body = req.body ?? {}
    const method = String(body.method ?? '')
    const subscriber = String(body.subscriber ?? '')
    // Business params may arrive top-level (host-native callers) OR inside the
    // generic `metadata` / `pricing` bags (PaymentsClient / generic module
    // callers) — resolve both so the unified endpoint accepts either shape.
    const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {}
    const agentId = Number(body.agentId ?? metadata.agentId ?? 0)
    const planId =
      body.planId !== undefined ? Number(body.planId)
      : body.pricing?.planId !== undefined ? Number(body.pricing.planId)
      : metadata.planId !== undefined ? Number(metadata.planId)
      : undefined
    const chain = resolveChain(body.chain)

    switch (method) {
      case 'fiat': {
        if (!subscriber || !agentId || (!body.amountCents && planId === undefined)) {
          res.status(400).json({ error: 'fiat: subscriber, agentId and amountCents (or planId for auto-pricing) are required' })
          return
        }
        const result = await paymentsService.createPayment({
          method: 'fiat',
          subscriber,
          period: body.period ?? 'month',
          currency: body.currency ?? 'usd',
          chain,
          amountCents: body.amountCents ? Number(body.amountCents) : undefined,
          pricing: planId !== undefined ? { planId } : undefined,
          metadata: { agentId, planId, resourceLabel: `agent #${agentId}` },
          clientReference: `${subscriber}|${agentId}|${planId ?? ''}`,
          successUrl: body.successUrl,
          cancelUrl: body.cancelUrl,
        })
        if (result.method !== 'fiat') throw new Error('Unexpected fiat payment result')
        // `url` is the host-native shape (kept for backward compat); `sessionUrl`
        // aligns with the generic client's CreatePaymentResult type.
        res.json({ method: 'fiat', paymentId: result.paymentId, url: result.sessionUrl, sessionUrl: result.sessionUrl, sessionId: result.sessionId, redirect: true })
        return
      }
      case 'chain': {
        if (!subscriber || planId === undefined) {
          res.status(400).json({ error: 'chain: subscriber and planId are required' })
          return
        }
        const result = await paymentsService.createPayment({
          method: 'chain',
          subscriber,
          chain,
          valueWei: body.valueWei,
          pricing: { planId },
          metadata: { agentId, planId },
        })
        if (result.method !== 'chain') throw new Error('Unexpected chain payment result')
        res.json({ method: 'chain', paymentId: result.paymentId })
        return
      }
      case 'x402': {
        if (!x402Available()) {
          res.status(503).json({ error: 'x402 is not configured (X402_ENABLED / X402_PAY_TO missing)' })
          return
        }
        const txHash = body.txHash ?? metadata.txHash
        if (!subscriber || !agentId || planId === undefined || !txHash) {
          res.status(400).json({ error: 'x402: subscriber, agentId, planId and txHash are required' })
          return
        }
        const registered = await paymentsBridge.subscribeX402({
          subscriber,
          agentId,
          planId,
          period: body.period ?? 'month',
          txHash: String(txHash),
          chain,
          verify: verifyAndCredit,
        })
        if (!registered) {
          res.status(422).json({ error: 'Transaction is not a valid x402 payment to the platform wallet' })
          return
        }
        res.json({
          method: 'x402',
          subscriptionId: registered.subscriptionId,
          subscriber: subscriber.toLowerCase(),
          agentId,
          period: body.period ?? 'month',
          expiresAt: registered.expiresAt,
          creditedWei: registered.creditedWei,
        })
        return
      }
      case 'mpp': {
        // Open a payment channel: verify the deposit tx and freeze the deposit.
        const txHash = body.txHash ?? metadata.txHash
        const valueWei = body.valueWei ?? metadata.valueWei
        const salt = body.salt ?? metadata.salt
        if (!subscriber || !valueWei || !salt || !txHash) {
          res.status(400).json({ error: 'mpp: subscriber, valueWei (deposit), salt and txHash are required' })
          return
        }
        const result = await paymentsService.createPayment({
          method: 'mpp',
          subscriber,
          valueWei: String(valueWei),
          salt: String(salt),
          txHash: String(txHash),
          chain,
          metadata,
        })
        if (result.method !== 'mpp') throw new Error('Unexpected mpp payment result')
        res.json({ method: 'mpp', channelId: result.channelId, depositWei: result.depositWei, payee: result.payee })
        return
      }
      case 'a2a': {
        // Phase 1 of a2a-pay: create a payment intent (paymentId, amount, payee).
        // Self-hosted rail (R17.5): @0xinfrax/payments removed a2a from the
        // generic engine, so this goes through A2APeriodService on the
        // AgentX-owned payment_intents table.
        const amountWei = body.valueWei ?? metadata.valueWei ?? body.amountWei
        if (!subscriber || !amountWei) {
          res.status(400).json({ error: 'a2a: subscriber and valueWei are required' })
          return
        }
        const result = await a2aPeriodService.createA2AIntent({
          payer: subscriber,
          amountWei: String(amountWei),
          payee: body.payee,
          asset: body.asset,
          chain,
          metadata,
        })
        res.json({ method: 'a2a', paymentId: result.paymentId, amountWei: result.amountWei, payee: result.payee })
        return
      }
      default:
        res.status(400).json({ error: `Unsupported payment method "${method}" (use fiat | chain | x402 | mpp | a2a)` })
    }
  } catch (err) {
    if (sendPaymentError(res, err)) return
    log.error(`payments create failed: ${(err as Error).message}`)
    next(err)
  }
})

// POST /api/v1/payments/verify — verify an on-chain payment tx and credit balance
// body: { txHash, chain? }
router.post('/verify', async (req: Request, res: Response, next) => {
  try {
    const txHash = String(req.body?.txHash ?? '')
    if (!txHash) {
      res.status(400).json({ error: 'txHash is required' })
      return
    }
    const chain = resolveChain(req.body?.chain)
    const verified = await paymentsService.verifyPayment(txHash, chain)
    if (!verified) {
      res.status(422).json({ error: 'Transaction is not a valid payment to the platform wallet' })
      return
    }
    const balance = await paymentsService.balanceOf(verified.payer)
    res.json({
      verified: true,
      creditedWei: verified.creditedWei,
      payer: verified.payer,
      chain: verified.chain,
      balanceWei: balance.toString(),
    })
  } catch (err) {
    if (sendPaymentError(res, err)) return
    log.error(`payments verify failed: ${(err as Error).message}`)
    next(err)
  }
})

// GET /api/v1/payments/access?subscriber=&agentId=&chain= — unified access check
router.get('/access', async (req: Request, res: Response, next) => {
  try {
    const subscriber = String(req.query.subscriber ?? '')
    const agentId = Number(req.query.agentId ?? 0)
    if (!subscriber || !agentId) {
      res.status(400).json({ error: 'subscriber and agentId are required' })
      return
    }
    const chain = resolveChain(String(req.query.chain ?? ''))
    const active = await paymentsService.resolveAccess(subscriber, { agentId }, { chain })
    res.json({ subscriber, agentId, chain, active })
  } catch (err) {
    log.error(`payments access failed: ${(err as Error).message}`)
    next(err)
  }
})

// GET /api/v1/payments/info — rails discovery / pricing
router.get('/info', (_req: Request, res: Response) => {
  const chain = resolveChain()
  const x402 = paymentsService.x402
  const mpp = paymentsService.mpp
  res.json({
    rails: {
      fiat: { enabled: Boolean(config.stripeSecretKey) },
      chain: { enabled: true },
      x402: { enabled: x402Available() },
      stablecoin: x402?.stablecoinAvailable() ?? false,
      period: Boolean(config.periodEnabled),
      mpp: mpp?.available() ?? false,
    },
    x402: x402
      ? {
          enabled: x402.available(),
          priceWei: x402.priceWei().toString(),
          payTo: x402.payTo(),
          network: x402.network(),
          chain,
        }
      : { enabled: false },
    stablecoin: x402?.stablecoinAvailable()
      ? { enabled: true, asset: x402.stablecoinAsset(), chain: x402.chain() }
      : { enabled: false },
    mpp: mpp?.available() ? { enabled: true, payee: mpp.payeeOf(), chain: mpp.chain() } : { enabled: false },
    chains: { chain, chainId: chain === 'sepolia' ? config.chainId : config.chainIdOxaChain },
  })
})

// GET /api/v1/payments/quote?url=… — fetch the x402 v2 challenge for a
// protected resource (SSRF-guarded: same origin or loopback only).
router.get('/quote', async (req: Request, res: Response, next) => {
  try {
    const target = String(req.query.url ?? '')
    if (!target) {
      res.status(400).json({ error: 'url is required' })
      return
    }
    let parsed: URL
    try {
      parsed = new URL(target)
    } catch {
      res.status(400).json({ error: 'url must be an absolute URL' })
      return
    }
    const host = req.get('host')
    const loopback = ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)
    if (!loopback && parsed.host !== host) {
      res.status(400).json({ error: 'url must target this gateway (same origin)' })
      return
    }
    const resp = await fetch(target)
    if (resp.status === 402 && resp.headers.get('payment-required')) {
      const challenge = decodeHeader<X402PaymentRequired>(resp.headers.get('payment-required')!)
      res.json({ free: false, challenge })
      return
    }
    res.json({ free: true, status: resp.status })
  } catch (err) {
    log.error(`payments quote failed: ${(err as Error).message}`)
    next(err)
  }
})

// POST /api/v1/payments/webhook — provider webhook (fiat; signature verified in-engine)
router.post('/webhook', async (req: Request, res: Response, next) => {
  try {
    if (!config.stripeWebhookSecret) {
      res.status(503).json({ error: 'Fiat webhook is not configured (STRIPE_WEBHOOK_SECRET missing)' })
      return
    }
    const signature = req.headers['stripe-signature']
    const rawBody: Buffer | undefined = (req as any).rawBody
    if (!signature || !rawBody) {
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
    log.error(`payments webhook failed: ${(err as Error).message}`)
    next(err)
  }
})

// ── MPP payment channels (P2) ────────────────────────────────────────────────

// POST /api/v1/payments/mpp/open — open a channel (verify the deposit tx)
router.post('/mpp/open', async (req: Request, res: Response, next) => {
  try {
    const body = req.body ?? {}
    const { payer, depositWei, salt, txHash } = body
    if (!payer || !depositWei || !salt || !txHash) {
      res.status(400).json({ error: 'payer, depositWei, salt and txHash are required' })
      return
    }
    const result = await paymentsService.createPayment({
      method: 'mpp',
      subscriber: String(payer),
      valueWei: String(depositWei),
      salt: String(salt),
      txHash: String(txHash),
      chain: resolveChain(body.chain),
      metadata: body.metadata,
    })
    if (result.method !== 'mpp') throw new Error('Unexpected mpp result')
    res.json({ method: 'mpp', channelId: result.channelId, depositWei: result.depositWei, payee: result.payee })
  } catch (err) {
    if (sendPaymentError(res, err)) return
    log.error(`mpp open failed: ${(err as Error).message}`)
    next(err)
  }
})

// POST /api/v1/payments/mpp/voucher — submit a cumulative voucher (EIP-712)
router.post('/mpp/voucher', async (req: Request, res: Response, next) => {
  try {
    const { channelId, cumulativeAmount, signature } = req.body ?? {}
    if (!channelId || !cumulativeAmount || !signature) {
      res.status(400).json({ error: 'channelId, cumulativeAmount and signature are required' })
      return
    }
    const result = await paymentsService.mppVoucher({
      channelId: String(channelId),
      cumulativeAmount: String(cumulativeAmount),
      signature: String(signature),
    })
    res.json(result)
  } catch (err) {
    if (sendPaymentError(res, err)) return
    log.error(`mpp voucher failed: ${(err as Error).message}`)
    next(err)
  }
})

// POST /api/v1/payments/mpp/topup — top up a channel
router.post('/mpp/topup', async (req: Request, res: Response, next) => {
  try {
    const { channelId, txHash, additionalWei } = req.body ?? {}
    if (!channelId || !txHash || !additionalWei) {
      res.status(400).json({ error: 'channelId, txHash and additionalWei are required' })
      return
    }
    const result = await paymentsService.mppTopUp({
      channelId: String(channelId),
      txHash: String(txHash),
      additionalWei: String(additionalWei),
    })
    res.json(result)
  } catch (err) {
    if (sendPaymentError(res, err)) return
    log.error(`mpp topup failed: ${(err as Error).message}`)
    next(err)
  }
})

// POST /api/v1/payments/mpp/settle — batch-deduct un-settled consumption
router.post('/mpp/settle', async (req: Request, res: Response, next) => {
  try {
    const channelId = String(req.body?.channelId ?? '')
    if (!channelId) {
      res.status(400).json({ error: 'channelId is required' })
      return
    }
    const result = await paymentsService.mppSettle(channelId)
    res.json(result)
  } catch (err) {
    if (sendPaymentError(res, err)) return
    log.error(`mpp settle failed: ${(err as Error).message}`)
    next(err)
  }
})

// POST /api/v1/payments/mpp/close — close a channel (settles the tail first)
router.post('/mpp/close', async (req: Request, res: Response, next) => {
  try {
    const channelId = String(req.body?.channelId ?? '')
    if (!channelId) {
      res.status(400).json({ error: 'channelId is required' })
      return
    }
    const result = await paymentsService.mppClose(channelId)
    res.json(result)
  } catch (err) {
    if (sendPaymentError(res, err)) return
    log.error(`mpp close failed: ${(err as Error).message}`)
    next(err)
  }
})

// GET /api/v1/payments/mpp/session?channelId= — current channel state
router.get('/mpp/session', async (req: Request, res: Response, next) => {
  try {
    const channelId = String(req.query.channelId ?? '')
    if (!channelId) {
      res.status(400).json({ error: 'channelId is required' })
      return
    }
    const session = await paymentsService.mppSession(channelId)
    if (!session) {
      res.status(404).json({ error: 'MPP session not found' })
      return
    }
    res.json({
      channelId: session.channelId,
      status: session.status,
      currentCum: session.currentCum,
      spentWei: session.spentWei,
      depositWei: session.depositWei,
      autoSettle: session.autoSettle,
    })
  } catch (err) {
    log.error(`mpp session failed: ${(err as Error).message}`)
    next(err)
  }
})

// ── a2a-pay (paymentId two-phase, P4) ────────────────────────────────────────

// POST /api/v1/payments/a2a — phase 1: create a payment intent
// (self-hosted rail, R17.5 — see services/payments-a2a-period.ts)
router.post('/a2a', async (req: Request, res: Response, next) => {
  try {
    const { payer, amountWei, payee, asset, chain, metadata } = req.body ?? {}
    if (!payer || !amountWei) {
      res.status(400).json({ error: 'payer and amountWei are required' })
      return
    }
    const result = await a2aPeriodService.createA2AIntent({
      payer: String(payer),
      amountWei: String(amountWei),
      payee: payee ? String(payee) : undefined,
      asset: asset ? String(asset) : undefined,
      chain: chain ? resolveChain(chain) : resolveChain(),
      metadata,
    })
    res.json({ method: 'a2a', paymentId: result.paymentId, amountWei: result.amountWei, payee: result.payee })
  } catch (err) {
    if (sendPaymentError(res, err)) return
    log.error(`a2a create failed: ${(err as Error).message}`)
    next(err)
  }
})

// POST /api/v1/payments/a2a/settle — phase 2: verify the payer's on-chain payment
// (self-hosted rail, R17.5 — reuses the module's x402 verify path internally)
router.post('/a2a/settle', async (req: Request, res: Response, next) => {
  try {
    const { paymentId, txHash, chain } = req.body ?? {}
    if (!paymentId || !txHash) {
      res.status(400).json({ error: 'paymentId and txHash are required' })
      return
    }
    const result = await a2aPeriodService.a2aSettle({
      paymentId: String(paymentId),
      txHash: String(txHash),
      chain: chain ? resolveChain(chain) : resolveChain(),
    })
    if (!result.verified) {
      res.status(422).json({ error: 'Transaction is not a valid payment to the platform wallet' })
      return
    }
    res.json({ verified: true, paymentId: String(paymentId), payer: result.payer, creditedWei: result.creditedWei, balanceWei: result.balanceWei })
  } catch (err) {
    if (sendPaymentError(res, err)) return
    log.error(`a2a settle failed: ${(err as Error).message}`)
    next(err)
  }
})

// ── Period authorizations (P4) ───────────────────────────────────────────────

// POST /api/v1/payments/period/authorize — create an authorization from an
// on-chain funding tx (replaces the x402 `period` accept removed in
// @0xinfrax/payments@0.1.2; self-hosted rail, R17.5)
router.post('/period/authorize', async (req: Request, res: Response, next) => {
  try {
    const body = req.body ?? {}
    const { payer, txHash, amountWei, periodPriceWei, periods, asset, chain } = body
    if (!payer || !txHash || !amountWei) {
      res.status(400).json({ error: 'payer, txHash and amountWei are required' })
      return
    }
    const result = await a2aPeriodService.createPeriodAuthorization({
      payer: String(payer),
      txHash: String(txHash),
      amountWei: String(amountWei),
      periodPriceWei: periodPriceWei !== undefined ? String(periodPriceWei) : undefined,
      periods: periods !== undefined ? Number(periods) : undefined,
      asset: asset !== undefined ? String(asset) : undefined,
      chain: chain ? resolveChain(chain) : resolveChain(),
    })
    res.json(result)
  } catch (err) {
    if (sendPaymentError(res, err)) return
    log.error(`period authorize failed: ${(err as Error).message}`)
    next(err)
  }
})

// POST /api/v1/payments/period/charge — charge one period of an authorization
// (self-hosted rail, R17.5 — atomic charge on payment_authorizations)
router.post('/period/charge', async (req: Request, res: Response, next) => {
  try {
    const authorizationId = String(req.body?.authorizationId ?? '')
    if (!authorizationId) {
      res.status(400).json({ error: 'authorizationId is required' })
      return
    }
    const result = await a2aPeriodService.chargePeriod(authorizationId)
    res.json({ authorizationId, ...result })
  } catch (err) {
    if (sendPaymentError(res, err)) return
    log.error(`period charge failed: ${(err as Error).message}`)
    next(err)
  }
})

// GET /api/v1/payments/period/authorization?authorizationId= — authorization state
router.get('/period/authorization', async (req: Request, res: Response, next) => {
  try {
    const authorizationId = String(req.query.authorizationId ?? '')
    if (!authorizationId) {
      res.status(400).json({ error: 'authorizationId is required' })
      return
    }
    const auth = await a2aPeriodService.getAuthorization(authorizationId)
    if (!auth) {
      res.status(404).json({ error: 'Authorization not found' })
      return
    }
    res.json({
      id: auth.id,
      owner: auth.owner,
      amountWei: auth.amountWei,
      remainingWei: auth.remainingWei,
      periods: auth.periods,
      status: auth.status,
    })
  } catch (err) {
    log.error(`period authorization failed: ${(err as Error).message}`)
    next(err)
  }
})

export default router
