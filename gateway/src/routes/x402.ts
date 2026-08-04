// ---------------------------------------------------------------------------
// AgentX Gateway — x402 verification & balance API
// ---------------------------------------------------------------------------

import { Router, Request, Response } from 'express'
import { getPool } from '../lib/db'
import { config } from '../config'
import { balanceOf, verifyAndCredit, priceWei, x402Available, paymentRequired } from '../services/x402'
import { log } from '../services/chain-data-reader'
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

export default router
