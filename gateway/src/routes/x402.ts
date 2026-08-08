// ---------------------------------------------------------------------------
// AgentX Gateway — x402 verification & balance API
// ---------------------------------------------------------------------------

import { Router, Request, Response } from 'express'
import { getPool } from '../lib/db'
import { config } from '../config'
import { balanceOf, verifyAndCredit, priceWei, x402Available, paymentRequired, x402Guard } from '../services/x402'
import { decodeHeader } from '@0xinfrax/payments'
import type { X402PaymentRequired } from '@0xinfrax/payments'
import { chainDataReader, log } from '../services/chain-data-reader'
import { paymentsBridge } from '../services/payments-bridge'
import type { ChainKey } from '../services/chain-data-reader'

const router = Router()

// GET /api/v1/x402/info — protocol discovery (price / pay-to / network)
router.get('/info', (_req: Request, res: Response) => {
  const chain: ChainKey = config.x402Chain === 'sepolia' ? 'sepolia' : 'oxachain'
  res.json({
    enabled: x402Available(),
    priceWei: priceWei().toString(),
    payTo: config.x402PayTo,
    network: `eip155:${chain === 'sepolia' ? config.chainId : config.chainIdOxaChain}`,
    chain,
  })
})

// POST /api/v1/x402/verify — verify an on-chain payment tx and credit balance
// body: { txHash, chain? }
router.post('/verify', async (req: Request, res: Response, next) => {
  try {
    const { txHash } = req.body || {}
    if (!txHash) {
      res.status(400).json({ error: 'txHash is required' })
      return
    }
    const chain = (String(req.body?.chain ?? config.x402Chain).toLowerCase() === 'sepolia' ? 'sepolia' : 'oxachain') as ChainKey
    const credited = await verifyAndCredit(String(txHash), chain)
    if (credited === null) {
      res.status(422).json({ error: 'Transaction is not a valid x402 payment to the platform wallet' })
      return
    }
    const { rows } = await getPool().query('SELECT from_address FROM x402_payments WHERE tx_hash = $1', [String(txHash).toLowerCase()])
    const payer = rows[0]?.from_address ?? ''
    const balance = await balanceOf(payer)
    res.json({ verified: true, creditedWei: credited.toString(), payer, balanceWei: balance.toString() })
  } catch (err) {
    log.error(`x402/verify failed: ${(err as Error).message}`)
    next(err)
  }
})

// GET /api/v1/x402/balance?address= — current balance of an address
router.get('/balance', async (req: Request, res: Response, next) => {
  try {
    const address = String(req.query.address ?? '')
    if (!address) {
      res.status(400).json({ error: 'address is required' })
      return
    }
    res.json({ address, balanceWei: (await balanceOf(address)).toString() })
  } catch (err) {
    log.error(`x402/balance failed: ${(err as Error).message}`)
    next(err)
  }
})

// Standalone helper: respond with HTTP 402 payment-required headers.
router.get('/paywall', (_req: Request, res: Response) => {
  const chain: ChainKey = config.x402Chain === 'sepolia' ? 'sepolia' : 'oxachain'
  paymentRequired(res, chain)
  res.json({ error: 'Payment required', payWith: `Send ${priceWei().toString()} wei to ${config.x402PayTo}, then retry with X-PAYMENT header or top up via /api/v1/x402/verify` })
})

// GET /api/v1/x402/echo — pay-per-request demo/protected endpoint.
// Behind x402Guard: v2 PAYMENT-SIGNATURE → v1 X-PAYMENT → balance → 402.
router.get('/echo', x402Guard, (_req: Request, res: Response) => {
  res.json({ ok: true, protected: 'x402 v2' })
})

// GET /api/v1/x402/quote?url=… — fetch the v2 challenge for a protected
// resource (equivalent to the client-side fetchChallenge). SSRF-guarded:
// only targets on this gateway's own origin (or loopback) are allowed.
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
    log.error(`x402/quote failed: ${(err as Error).message}`)
    next(err)
  }
})

// ── x402 subscription (period payment) ─────────────────────────────────────
// User pays one billing period of an on-chain plan (native token) to the
// platform wallet; the tx is verified here and access is registered in
// fiat_subscriptions (provider='x402') so the unified access-control layer
// (chain OR fiat/x402) accepts it. Mirrors the Stripe rail, no new table.

const PERIOD_SECONDS: Record<string, number> = {
  day: 86_400,
  week: 604_800,
  month: 2_592_000,   // 30 days (matches on-chain _periodToSeconds)
  year: 31_536_000,   // 365 days
}

// POST /api/v1/x402/subscribe
// body: { subscriber, agentId, planId, period?, txHash, chain? }
// Thin transport — verification + access registration live in the payments
// bridge (PaymentsBridge.subscribeX402), shared with the unified endpoint.
router.post('/subscribe', async (req: Request, res: Response, next) => {
  try {
    if (!x402Available()) {
      res.status(503).json({ error: 'x402 is not configured (X402_ENABLED / X402_PAY_TO missing)' })
      return
    }
    const { subscriber, agentId, planId, period = 'month', txHash } = req.body || {}
    if (!subscriber || !agentId || !planId || !txHash) {
      res.status(400).json({ error: 'subscriber, agentId, planId and txHash are required' })
      return
    }
    if (!PERIOD_SECONDS[period]) {
      res.status(400).json({ error: 'period must be one of: day | week | month | year' })
      return
    }
    const chain = (String(req.body?.chain ?? config.x402Chain).toLowerCase() === 'sepolia' ? 'sepolia' : 'oxachain') as ChainKey

    const registered = await paymentsBridge.subscribeX402({
      subscriber: String(subscriber),
      agentId: Number(agentId),
      planId: Number(planId),
      period,
      txHash: String(txHash),
      chain,
      verify: verifyAndCredit,
    })
    if (!registered) {
      res.status(422).json({ error: 'Transaction is not a valid x402 payment to the platform wallet' })
      return
    }
    res.json({
      verified: true,
      subscriptionId: registered.subscriptionId,
      subscriber: String(subscriber).toLowerCase(),
      agentId: Number(agentId),
      period,
      expiresAt: registered.expiresAt,
      creditedWei: registered.creditedWei,
    })
  } catch (err) {
    log.error(`x402/subscribe failed: ${(err as Error).message}`)
    next(err)
  }
})

export default router
