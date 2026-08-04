// ---------------------------------------------------------------------------
// AgentX Gateway — x402 pay-per-request (A2)
// ---------------------------------------------------------------------------
// HTTP 402-based micropayments: a caller without a subscription receives
// HTTP 402 + x-price/x-pay-to/x-network headers; after paying on-chain it
// either retries with `X-PAYMENT: <txHash>` (verify-and-allow, per request)
// or tops up a per-address balance (verify → credit → deduct per request).
// Native-token only for now (token/stablecoin is a follow-up).
// ---------------------------------------------------------------------------

import { Request } from 'express'
import type { Address } from 'viem'
import { getPool } from '../lib/db'
import { config } from '../config'
import { chainDataReader, log } from './chain-data-reader'
import type { ChainKey } from './chain-data-reader'

/** Resolve which chain x402 payments are verified on. */
function resolveChain(): ChainKey {
  return config.x402Chain === 'sepolia' ? 'sepolia' : 'oxachain'
}

export function priceWei(): bigint {
  return BigInt(config.x402PriceWei)
}

/** HTTP 402 response headers per the x402 protocol. */
export function paymentRequired(res: { status: (code: number) => any; set: (h: Record<string, string>) => any }, chain: ChainKey) {
  res.status(402)
  res.set({
    'x-price': priceWei().toString(),
    'x-pay-to': config.x402PayTo,
    'x-network': `eip155:${chain === 'sepolia' ? config.chainId : config.chainIdOxaChain}`,
  })
}

/**
 * Verify an on-chain native transfer to the platform wallet and credit the
 * sender's balance. Idempotent per tx_hash.
 * @returns credited amount in wei, or null when the tx is not a valid payment.
 */
export async function verifyAndCredit(txHash: string, chain?: ChainKey): Promise<bigint | null> {
  const c = chain ?? resolveChain()
  if (!config.x402PayTo) {
    log.warn(`verifyAndCredit() x402PayTo not configured`)
    return null
  }
  const client = chainDataReader.getPublicClient(c)
  const [receipt, tx] = await Promise.all([
    client.getTransactionReceipt({ hash: txHash as `0x${string}` }).catch(() => null),
    client.getTransaction({ hash: txHash as `0x${string}` }).catch(() => null),
  ])
  if (!receipt || receipt.status !== 'success' || !tx) {
    log.warn(`verifyAndCredit(txHash=${txHash}) receipt/tx not found or failed`)
    return null
  }
  const payTo = config.x402PayTo.toLowerCase()
  if ((tx.to ?? '').toLowerCase() !== payTo) {
    log.warn(`verifyAndCredit(txHash=${txHash}) recipient mismatch (${tx.to})`)
    return null
  }
  const amount = tx.value ?? 0n
  if (amount < priceWei()) {
    log.warn(`verifyAndCredit(txHash=${txHash}) amount ${amount} < price ${priceWei()}`)
    return null
  }
  const from = tx.from.toLowerCase()
  const pool = getPool()
  // Idempotency: already credited txs are not double-counted.
  const exists = await pool.query('SELECT 1 FROM x402_payments WHERE tx_hash = $1', [txHash.toLowerCase()])
  if (exists.rowCount === 0) {
    await pool.query(
      `INSERT INTO x402_payments (tx_hash, from_address, amount_wei, chain_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tx_hash) DO NOTHING`,
      [txHash.toLowerCase(), from, amount.toString(), c === 'sepolia' ? config.chainId : config.chainIdOxaChain]
    )
    await pool.query(
      `INSERT INTO x402_balances (address, balance_wei) VALUES ($1, $2)
       ON CONFLICT (address) DO UPDATE SET
         balance_wei = (x402_balances.balance_wei::numeric + $2)::text,
         updated_at = NOW()`,
      [from, amount.toString()]
    )
  }
  log.info(`verifyAndCredit(txHash=${txHash}, chain=${c}) credited ${amount} wei to ${from}`)
  return amount
}

/** Current balance (wei) of an address. */
export async function balanceOf(address: string): Promise<bigint> {
  const { rows } = await getPool().query('SELECT balance_wei FROM x402_balances WHERE address = $1', [address.toLowerCase()])
  return rows.length ? BigInt(rows[0].balance_wei) : 0n
}

/** Deduct one payment unit; returns true when the balance covered it. */
export async function deduct(address: string, amount = priceWei()): Promise<boolean> {
  const result = await getPool().query(
    `UPDATE x402_balances SET balance_wei = (balance_wei::numeric - $2)::text, updated_at = NOW()
     WHERE address = $1 AND balance_wei::numeric >= $2`,
    [address.toLowerCase(), amount.toString()]
  )
  const ok = (result.rowCount ?? 0) > 0
  if (ok) log.info(`deduct(address=${address.toLowerCase()}, ${amount} wei) → ok`)
  else log.warn(`deduct(address=${address.toLowerCase()}, ${amount} wei) → insufficient balance`)
  return ok
}

/**
 * Express middleware for pay-per-request endpoints.
 * - `X-PAYMENT: <txHash>` present → verify-and-allow (per request).
 * - otherwise → check balance, deduct one unit, or reply HTTP 402.
 * `identity` is the charging dimension (e.g. tenant api-key holder / end user).
 */
export function x402Guard(req: Request, res: any, next: (err?: unknown) => void) {
  const chain = resolveChain()
  const headerPayment = String(req.headers['x-payment'] ?? '')

  ;(async () => {
    if (headerPayment) {
      const credited = await verifyAndCredit(headerPayment, chain)
      if (credited !== null) {
        log.info(`x402Guard allow via X-PAYMENT (tx=${headerPayment})`)
        next()
        return
      }
    }
    const identity = (String(req.headers['x-end-user-id'] ?? '') || String((req as any).user?.address ?? '')).toLowerCase()
    if (!identity) {
      paymentRequired(res, chain)
      return
    }
    const balance = await balanceOf(identity)
    if (balance >= priceWei() && (await deduct(identity))) {
      log.info(`x402Guard allow via balance (identity=${identity}, remaining=${(balance - priceWei()).toString()})`)
      next()
      return
    }
    log.info(`x402Guard 402 (identity=${identity || 'unknown'}, balance=${balance.toString()})`)
    paymentRequired(res, chain)
  })().catch((err) => {
    log.error(`x402Guard failed: ${(err as Error).message}`)
    next(err)
  })
}

/** Check x402 availability: enabled + pay-to wallet configured. */
export function x402Available(): boolean {
  return config.x402Enabled && Boolean(config.x402PayTo)
}
