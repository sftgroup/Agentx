// ---------------------------------------------------------------------------
// AgentX Gateway — Billing Routes
// ---------------------------------------------------------------------------
// Balance query API for B-end (partner) callers and their end users:
//   GET /api/v1/billing/balance
// Read-only, idempotent, no side effects. Auth is enforced by the api router
// mount (X-Api-Key via apiKeyAuth or Bearer JWT via authMiddleware).
// ---------------------------------------------------------------------------

import { Router, Request, Response } from 'express'
import { getPool } from '../lib/db'
import { config } from '../config'
import { paymentsService } from '../services/payments'
import { x402Available } from '../services/x402'
import { resolveAccessSubject } from '../services/agent-access'
import { log } from '../services/chain-data-reader'

const router = Router()

const WEI_PER_TOKEN = 10n ** 18n

/** wei string → OXA decimal string (high precision, never float). '0' → "0". */
function formatWeiToToken(wei: string): string {
  const n = BigInt(wei || '0')
  if (n === 0n) return '0'
  const whole = n / WEI_PER_TOKEN
  const frac = (n % WEI_PER_TOKEN).toString().padStart(18, '0')
  return `${whole}.${frac}`
}

// GET /api/v1/billing/balance
// Returns the x402 ledger balance for the tenant (default) or a proxied
// end-user wallet (`X-End-User-Id: 0x…`, same subject resolution as R19.7
// access checks). Zero / never-funded → balance "0" (normal response).
router.get('/balance', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }
    const endUserId = String(req.headers['x-end-user-id'] ?? '') || undefined
    const subject = resolveAccessSubject(req.tenant.walletAddress, req.tenant.kind, endUserId)

    const balanceWei = (await paymentsService.balanceOf(subject)).toString()
    const { rows } = await getPool().query(
      'SELECT updated_at FROM x402_balances WHERE address = $1',
      [subject.toLowerCase()]
    )
    const updatedAt = rows[0]?.updated_at ?? null

    const body: Record<string, unknown> = {
      balance: formatWeiToToken(balanceWei), // OXA decimal string (high precision)
      balanceWei,                            // raw wei string for exact comparison
      currency: 'OXA',
      updatedAt,
      subject,
    }
    // Optional enhancement: top-up address + per-request price so callers can
    // build a funding prompt directly when the balance is short.
    if (x402Available()) {
      body.payTo = config.x402PayTo
      body.priceWei = (paymentsService.x402?.priceWei() ?? 0n).toString()
    }
    res.json(body)
  } catch (err) {
    log.error(`billing/balance failed: ${(err as Error).message}`)
    res.status(500).json({ error: (err as Error).message })
  }
})

export default router
