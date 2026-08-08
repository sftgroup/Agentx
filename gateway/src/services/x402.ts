// ---------------------------------------------------------------------------
// AgentX Gateway — x402 pay-per-request (thin layer over the payments engine)
// ---------------------------------------------------------------------------
// All verification / balance / deduct logic now lives in the generic
// @0xinfrax/payments engine (X402Adapter + injected AgentX store). This file
// only keeps the express middleware and the legacy export surface used by
// routes, so callers (`x402Guard`, `routes/x402.ts`) are unchanged.
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto'
import { Request } from 'express'
import type { ChainKey } from '@0xinfrax/payments'
import { encodeHeader } from '@0xinfrax/payments'
import { log } from './chain-data-reader'
import { paymentsService } from './payments'

/** Resolve which chain x402 payments are verified on. */
function resolveChain(): ChainKey {
  return paymentsService.x402?.chain() ?? 'oxachain'
}

export function priceWei(): bigint {
  return paymentsService.x402?.priceWei() ?? 0n
}

/** HTTP 402 response headers per the x402 protocol (v2 challenge + v1 compat). */
export function paymentRequired(res: { status: (code: number) => any; set: (h: Record<string, string>) => any }, _chain: ChainKey, resource?: string) {
  res.status(402)
  res.set(paymentsService.x402?.paymentRequiredHeaders(resource) ?? {})
}

/**
 * Verify an on-chain native transfer to the platform wallet and credit the
 * sender's balance. Idempotent per tx_hash.
 * @returns credited amount in wei, or null when the tx is not a valid payment.
 */
export async function verifyAndCredit(txHash: string, chain?: ChainKey): Promise<bigint | null> {
  const verified = await paymentsService.verifyPayment(txHash, chain)
  return verified ? BigInt(verified.creditedWei) : null
}

/** Current balance (wei) of an address. */
export async function balanceOf(address: string): Promise<bigint> {
  return paymentsService.balanceOf(address)
}

/** Deduct one payment unit; returns true when the balance covered it. */
export async function deduct(address: string, amount = priceWei()): Promise<boolean> {
  return paymentsService.deduct(address, amount)
}

/**
 * Express middleware for pay-per-request endpoints. Resolution order:
 *   1. `PAYMENT-SIGNATURE` (x402 v2, EIP-712 + native verifyOnly)
 *   2. `X-PAYMENT: <txHash>` (v1, verify-and-allow)
 *   3. ledger balance → deduct one unit
 *   4. reply HTTP 402 with the v2 challenge headers
 * `identity` is the charging dimension for the balance path (e.g. tenant
 * api-key holder / end user).
 */
export function x402Guard(req: Request, res: any, next: (err?: unknown) => void) {
  const chain = resolveChain()
  const headerPayment = String(req.headers['x-payment'] ?? '')
  const sigHeader = String(req.headers['payment-signature'] ?? '')

  ;(async () => {
    // ── v2: PAYMENT-SIGNATURE (EIP-712 proof + native verifyOnly tx) ───────
    if (sigHeader && paymentsService.x402) {
      const expected = paymentsService.x402.paymentRequired(String(req.originalUrl))
      const result = await paymentsService.x402.verifyPaymentSignature(sigHeader, expected)
      if (result && (await paymentsService.deduct(result.payer, result.settledAmount))) {
        res.set('payment-response', encodeHeader({
          status: 'success',
          reference: `req:${randomUUID()}`,
          settledAmount: result.settledAmount.toString(),
          network: paymentsService.x402.network(),
          payer: result.payer,
        }))
        log.info(`x402Guard allow via PAYMENT-SIGNATURE (scheme=${result.accepted.scheme}, amount=${result.settledAmount}, payer=${result.payer.slice(0, 10)})`)
        // Mark paid-through so downstream access checks (e.g. agent-runs) exempt this caller
        ;(req as any).x402Access = true
        next()
        return
      }
      log.warn('x402Guard rejected PAYMENT-SIGNATURE')
    }
    // ── v1: X-PAYMENT ──────────────────────────────────────────────────────
    if (headerPayment) {
      const credited = await verifyAndCredit(headerPayment, chain)
      if (credited !== null) {
        log.info(`x402Guard allow via X-PAYMENT (tx=${headerPayment})`)
        ;(req as any).x402Access = true
        next()
        return
      }
    }
    const identity = (String(req.headers['x-end-user-id'] ?? '') || String((req as any).user?.address ?? '')).toLowerCase()
    if (!identity) {
      paymentRequired(res, chain, String(req.originalUrl))
      res.json({ error: 'Payment required' })
      return
    }
    const balance = await balanceOf(identity)
    if (balance >= priceWei() && (await deduct(identity))) {
      log.info(`x402Guard allow via balance (identity=${identity}, remaining=${(balance - priceWei()).toString()})`)
      ;(req as any).x402Access = true
      next()
      return
    }
    log.info(`x402Guard 402 (identity=${identity || 'unknown'}, balance=${balance.toString()})`)
    paymentRequired(res, chain, String(req.originalUrl))
    res.json({ error: 'Payment required' })
  })().catch((err) => {
    log.error(`x402Guard failed: ${(err as Error).message}`)
    next(err)
  })
}

/** Check x402 availability: enabled + pay-to wallet configured. */
export function x402Available(): boolean {
  return paymentsService.x402?.available() ?? false
}
