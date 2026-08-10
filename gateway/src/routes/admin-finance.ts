// ---------------------------------------------------------------------------
// AgentX Gateway — Admin Finance Routes (split from admin.ts, R7)
// ---------------------------------------------------------------------------
// GET    /api/v1/admin/revenue               — On-chain fees + fiat + channel + x402
// GET    /api/v1/admin/payments              — Stripe / x402 / channel config & state
// POST   /api/v1/admin/channels              — Create channel
// PATCH  /api/v1/admin/channels/:id          — Update channel (name/share_bps/wallet/active)
// DELETE /api/v1/admin/channels/:id          — Delete channel
// GET    /api/v1/admin/channels/:id/report   — Channel attribution detail + settlements
// POST   /api/v1/admin/channels/:id/settle   — Record a settlement batch for a channel
// ---------------------------------------------------------------------------
// Mounted under /api/v1/admin (adminAuth applied by parent admin mod router).
// ---------------------------------------------------------------------------

import { Router, Request, Response } from 'express'
import { getPool } from '../lib/db'
import { config } from '../config'
import { chainDataReader, log } from '../services/chain-data-reader'
import { x402Available, priceWei } from '../services/x402'
import { KNOWN_ERC20_SYMBOLS } from '../lib/constants'

const router = Router()

// Unlisted tokens fall back to a short address label.
const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const tokenLabel = (a: string) => KNOWN_ERC20_SYMBOLS[a.toLowerCase()] || shortAddr(a)

// ── Revenue ────────────────────────────────────────────────────────────────

router.get('/revenue', async (req: Request, res: Response) => {
  const t0 = Date.now()
  log.info(`admin/revenue called (ip=${req.ip}, query=${JSON.stringify(req.query)}, ua=${req.headers['user-agent'] ?? '-'})`)
  try {
    const pool = getPool()
    const [sepoliaFees, oxaFees, feeBps, fiatResult, channelResult, x402Payments, x402Balances, erc20Tokens] = await Promise.all([
      chainDataReader.platformFeesCollected('sepolia').then(f => f.toString()).catch(() => null),
      chainDataReader.platformFeesCollected('oxachain').then(f => f.toString()).catch(() => null),
      chainDataReader.platformFeeBps('oxachain').catch(() => null),
      pool.query(
        `SELECT COUNT(*) AS payouts,
                COALESCE(SUM(amount_cents), 0) AS total_cents,
                COALESCE(SUM(platform_cut_cents), 0) AS platform_cut_cents,
                COALESCE(SUM(amount_cents) FILTER (WHERE status = 'pending'), 0) AS pending_cents
         FROM fiat_payouts`
      ),
      pool.query(
        `SELECT COUNT(*) AS attributions,
                COALESCE(SUM(a.amount_paid::numeric), 0) AS amount_paid_wei,
                COALESCE(SUM(a.amount_paid::numeric * c.share_bps / 10000), 0) AS channel_share_wei,
                COALESCE(SUM(a.amount_paid::numeric * c.share_bps / 10000) FILTER (WHERE a.settled), 0) AS settled_share_wei
         FROM channel_attributions a
         JOIN channels c ON c.id = a.channel_id`
      ),
      pool.query(
        `SELECT COUNT(*) AS payments, COALESCE(SUM(amount_wei::numeric), 0) AS total_wei FROM x402_payments`
      ),
      pool.query(`SELECT COALESCE(SUM(balance_wei::numeric), 0) AS outstanding_wei FROM x402_balances`),
      pool.query(
        `SELECT DISTINCT pay_token FROM subscription_plans
         WHERE pay_token IS NOT NULL AND pay_token <> ''
           AND lower(pay_token) <> '0x0000000000000000000000000000000000000000'`
      ),
    ])

    // R9: platform fees held per ERC20 token (native sentinel = address(0) handled by
    // the native queries above). Grouped by chain so the admin UI can show token-wise revenue.
    const erc20 = await Promise.all(
      (['sepolia', 'oxachain'] as const).flatMap((chain) =>
        erc20Tokens.rows.map(async (r: any) => {
          const fees = await chainDataReader
            .platformFeesCollected(chain, r.pay_token)
            .then((f) => f.toString())
            .catch(() => null)
          return { chain, token: r.pay_token, symbol: tokenLabel(r.pay_token), feesWei: fees }
        })
      )
    )

    const result = {
      onChain: {
        platformFeeBps: feeBps,
        sepolia: { nativeFeesWei: sepoliaFees },
        oxachain: { nativeFeesWei: oxaFees },
        erc20,
      },
      fiat: fiatResult.rows[0],
      channel: channelResult.rows[0],
      x402: { ...x402Payments.rows[0], ...x402Balances.rows[0] },
      note: 'on-chain/x402 amounts in wei; fiat amounts in cents',
    }
    log.info(
      `admin/revenue result (${Date.now() - t0}ms) ` +
      `onChain=[sepolia=${result.onChain.sepolia.nativeFeesWei} wei, oxachain=${result.onChain.oxachain.nativeFeesWei} wei, feeBps=${result.onChain.platformFeeBps}] ` +
      `fiat=${JSON.stringify(result.fiat)} channel=${JSON.stringify(result.channel)} x402=${JSON.stringify(result.x402)}`
    )
    res.json(result)
  } catch (err: any) {
    log.error(`admin/revenue failed after ${Date.now() - t0}ms: ${err.message}`)
    res.status(500).json({ error: err.message })
  }
})

// ── Payment / Merchant Status ──────────────────────────────────────────────

router.get('/payments', async (req: Request, res: Response) => {
  const t0 = Date.now()
  log.info(`admin/payments called (ip=${req.ip}, query=${JSON.stringify(req.query)}, ua=${req.headers['user-agent'] ?? '-'})`)
  try {
    const pool = getPool()
    const [fiatSubs, channelList, x402Payments, planCount] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'active') AS active FROM fiat_subscriptions`
      ),
      pool.query(
        `SELECT c.id, c.name, c.share_bps, c.wallet, c.active, COUNT(a.id) AS attributions
         FROM channels c
         LEFT JOIN channel_attributions a ON a.channel_id = c.id
         GROUP BY c.id
         ORDER BY c.id`
      ),
      pool.query(`SELECT COUNT(*) AS payments FROM x402_payments`),
      pool.query(`SELECT COUNT(*) AS total FROM subscription_plans`),
    ])

    const result = {
      stripe: {
        configured: Boolean(config.stripeSecretKey && config.stripeWebhookSecret),
        secretKeySet: Boolean(config.stripeSecretKey),
        webhookSecretSet: Boolean(config.stripeWebhookSecret),
        subscriptions: fiatSubs.rows[0],
      },
      x402: {
        enabled: x402Available(),
        payTo: config.x402PayTo,
        priceWei: priceWei().toString(),
        chain: config.x402Chain,
        payments: Number(x402Payments.rows[0]?.payments ?? 0),
      },
      channels: channelList.rows,
      onChain: { subscriptionPlans: Number(planCount.rows[0]?.total ?? 0) },
    }
    log.info(
      `admin/payments result (${Date.now() - t0}ms) ` +
      `stripe=${JSON.stringify(result.stripe)} x402=${JSON.stringify(result.x402)} ` +
      `channels=${JSON.stringify(result.channels)} onChain=${JSON.stringify(result.onChain)}`
    )
    res.json(result)
  } catch (err: any) {
    log.error(`admin/payments failed after ${Date.now() - t0}ms: ${err.message}`)
    res.status(500).json({ error: err.message })
  }
})

// ── Channels (CRUD + settlement) ───────────────────────────────────────────

// List channels (with attribution counts)
router.get('/channels', async (_req: Request, res: Response) => {
  try {
    const pool = getPool()
    const result = await pool.query(
      `SELECT c.id, c.name, c.share_bps, c.wallet, c.active, COUNT(a.id) AS attributions
       FROM channels c
       LEFT JOIN channel_attributions a ON a.channel_id = c.id
       GROUP BY c.id
       ORDER BY c.id`
    )
    res.json({ channels: result.rows })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Create channel
router.post('/channels', async (req: Request, res: Response) => {
  try {
    const { id, name, share_bps, wallet } = req.body
    if (!id || !name || share_bps === undefined) {
      res.status(400).json({ error: 'id, name, and share_bps are required' })
      return
    }
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(String(id))) {
      res.status(400).json({ error: 'id must be alphanumeric, 1-64 chars (no spaces)' })
      return
    }
    const bps = Number(share_bps)
    if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
      res.status(400).json({ error: 'share_bps must be an integer between 0 and 10000' })
      return
    }
    const pool = getPool()
    await pool.query(
      `INSERT INTO channels (id, name, share_bps, wallet, active) VALUES ($1, $2, $3, $4, true)`,
      [String(id), name, bps, wallet || null]
    )
    res.status(201).json({ success: true, channel: { id: String(id), name, share_bps: bps, wallet: wallet || null } })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Update channel
router.patch('/channels/:id', async (req: Request, res: Response) => {
  try {
    const { name, share_bps, wallet, active } = req.body
    const pool = getPool()
    const existing = await pool.query(`SELECT id FROM channels WHERE id = $1`, [req.params.id])
    if (existing.rowCount === 0) {
      res.status(404).json({ error: 'Channel not found' })
      return
    }
    if (share_bps !== undefined) {
      const bps = Number(share_bps)
      if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
        res.status(400).json({ error: 'share_bps must be an integer between 0 and 10000' })
        return
      }
    }
    const sets: string[] = []
    const params: unknown[] = []
    if (name !== undefined) { params.push(name); sets.push(`name = $${params.length}`) }
    if (share_bps !== undefined) { params.push(Number(share_bps)); sets.push(`share_bps = $${params.length}`) }
    if (wallet !== undefined) { params.push(wallet); sets.push(`wallet = $${params.length}`) }
    if (active !== undefined) { params.push(Boolean(active)); sets.push(`active = $${params.length}`) }
    if (sets.length === 0) {
      res.status(400).json({ error: 'No fields to update' })
      return
    }
    params.push(req.params.id)
    await pool.query(`UPDATE channels SET ${sets.join(', ')} WHERE id = $${params.length}`, params)
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Delete channel (only if it has no attributions; otherwise deactivate)
router.delete('/channels/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool()
    const attrs = await pool.query(
      `SELECT COUNT(*) FROM channel_attributions WHERE channel_id = $1`,
      [req.params.id]
    )
    if (Number(attrs.rows[0].count) > 0) {
      await pool.query(`UPDATE channels SET active = false WHERE id = $1`, [req.params.id])
      res.json({ success: true, deactivated: true, reason: 'Channel has attributions — deactivated instead of deleted' })
      return
    }
    const result = await pool.query(`DELETE FROM channels WHERE id = $1 RETURNING id`, [req.params.id])
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Channel not found' })
      return
    }
    res.json({ success: true, deleted: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Channel detail report: attributions + settlement ledger
router.get('/channels/:id/report', async (req: Request, res: Response) => {
  try {
    const pool = getPool()
    const channel = await pool.query(`SELECT * FROM channels WHERE id = $1`, [req.params.id])
    if (channel.rowCount === 0) {
      res.status(404).json({ error: 'Channel not found' })
      return
    }
    const ch = channel.rows[0]
    const [attrs, settlements] = await Promise.all([
      pool.query(
        `SELECT id, subscriber, agent_id, plan_id, amount_paid, tx_hash, block_number,
                expires_at, settled, settled_at, settlement_id, created_at
         FROM channel_attributions
         WHERE channel_id = $1
         ORDER BY created_at DESC
         LIMIT 500`,
        [req.params.id]
      ),
      pool.query(
        `SELECT id, channel_id, amount_wei, tx_hash, note, created_at
         FROM channel_settlements
         WHERE channel_id = $1
         ORDER BY created_at DESC`,
        [req.params.id]
      ),
    ])

    const shareBps = Number(ch.share_bps)
    const items = attrs.rows.map(r => ({
      id: r.id,
      subscriber: r.subscriber,
      agentId: r.agent_id,
      planId: r.plan_id,
      amountPaid: r.amount_paid,
      channelShare: r.amount_paid ? (BigInt(r.amount_paid) * BigInt(shareBps)) / 10000n : 0n,
      txHash: r.tx_hash,
      blockNumber: r.block_number,
      expiresAt: r.expires_at,
      settled: r.settled,
      settledAt: r.settled_at,
      settlementId: r.settlement_id,
      createdAt: r.created_at,
    }))
    const totalShare = items.reduce((acc, it) => acc + (typeof it.channelShare === 'bigint' ? it.channelShare : 0n), 0n)
    const outstanding = items
      .filter(it => !it.settled)
      .reduce((acc, it) => acc + (typeof it.channelShare === 'bigint' ? it.channelShare : 0n), 0n)

    res.json({
      channel: { id: ch.id, name: ch.name, shareBps, wallet: ch.wallet, active: ch.active },
      count: items.length,
      totalShareWei: totalShare.toString(),
      outstandingWei: outstanding.toString(),
      attributions: items.map(it => ({ ...it, channelShare: it.channelShare.toString() })),
      settlements: settlements.rows.map((r: any) => ({
        id: r.id,
        channelId: r.channel_id,
        amountWei: r.amount_wei,
        txHash: r.tx_hash,
        note: r.note,
        createdAt: r.created_at,
      })),
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Record a settlement batch: mark all outstanding attributions settled and write a ledger row.
// Note: this is a record-keeping settlement — the on-chain payout itself is executed manually.
router.post('/channels/:id/settle', async (req: Request, res: Response) => {
  try {
    const { tx_hash, note } = req.body
    if (!tx_hash) {
      res.status(400).json({ error: 'tx_hash is required (the on-chain payout transaction)' })
      return
    }
    const pool = getPool()
    const channel = await pool.query(`SELECT * FROM channels WHERE id = $1`, [req.params.id])
    if (channel.rowCount === 0) {
      res.status(404).json({ error: 'Channel not found' })
      return
    }
    const ch = channel.rows[0]
    const shareBps = Number(ch.share_bps)

    const attrs = await pool.query(
      `SELECT id, amount_paid FROM channel_attributions WHERE channel_id = $1 AND settled = false`,
      [req.params.id]
    )
    const ids = attrs.rows
    if (ids.length === 0) {
      res.json({ success: true, settled: 0, amountWei: '0', note: 'No outstanding attributions' })
      return
    }

    const totalWei = ids.reduce(
      (acc: bigint, r: any) => acc + (r.amount_paid ? (BigInt(r.amount_paid) * BigInt(shareBps)) / 10000n : 0n),
      0n
    )

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const settlement = await client.query(
        `INSERT INTO channel_settlements (channel_id, amount_wei, tx_hash, note)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [req.params.id, totalWei.toString(), String(tx_hash), note || null]
      )
      const settlementId = settlement.rows[0].id
      await client.query(
        `UPDATE channel_attributions
         SET settled = true, settled_at = NOW(), settlement_id = $1
         WHERE id = ANY($2)`,
        [settlementId, ids.map((r: any) => r.id)]
      )
      await client.query('COMMIT')
      res.json({ success: true, settled: ids.length, amountWei: totalWei.toString(), settlementId })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
