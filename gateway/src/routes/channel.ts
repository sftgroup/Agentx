// ---------------------------------------------------------------------------
// AgentX Gateway — Channel Attribution & Revenue Share
// ---------------------------------------------------------------------------
// Off-chain attribution of on-chain subscriptions to recommending platforms
// (see docs/payment-architecture.md §6). Each attribution binds a chain event
// (tx_hash/block_number) so shares are auditable. Channel fee comes from the
// platform fee giveback — never from the creator's share.
// ---------------------------------------------------------------------------

import { Router, Request, Response } from 'express'
import { getPool } from '../lib/db'
import { log } from '../services/chain-data-reader'

const router = Router()

// POST /api/v1/channel/attribute — report an on-chain subscription to a channel
// body: { subscriber, agentId, planId?, channelId, source?, amountPaid?, txHash?, blockNumber?, expiresAt? }
router.post('/attribute', async (req: Request, res: Response, next) => {
  try {
    const { subscriber, agentId, planId, channelId, source, amountPaid, txHash, blockNumber, expiresAt } = req.body || {}
    if (!subscriber || !agentId || !channelId) {
      res.status(400).json({ error: 'subscriber, agentId and channelId are required' })
      return
    }
    const pool = getPool()
    const channel = await pool.query('SELECT id FROM channels WHERE id = $1 AND active = true', [channelId])
    if (channel.rowCount === 0) {
      log.warn(`attribute() unknown or inactive channel "${channelId}"`)
      res.status(404).json({ error: `Unknown or inactive channel "${channelId}"` })
      return
    }
    // Upsert; keep first attribution on duplicate (UNIQUE subscriber+agent+channel).
    const result = await pool.query(
      `INSERT INTO channel_attributions
         (subscriber, agent_id, plan_id, channel_id, source, amount_paid, tx_hash, block_number, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (subscriber, agent_id, channel_id) DO NOTHING
       RETURNING id`,
      [subscriber, agentId, planId ?? null, channelId, source ?? null, amountPaid ?? null, txHash ?? null,
       blockNumber ? Number(blockNumber) : null, expiresAt ? Number(expiresAt) : null]
    )
    const created = (result.rowCount ?? 0) > 0
    log.info(`attribute(subscriber=${subscriber}, agentId=${agentId}, channelId=${channelId}, txHash=${txHash ?? '-'}) → ${created ? 'attributed' : 'already attributed'}`)
    res.json({ attributed: created })
  } catch (err) {
    log.error(`attribute() failed: ${(err as Error).message}`)
    next(err)
  }
})

// GET /api/v1/channel/report?channelId=&from=&to= — channel reconciliation report
router.get('/report', async (req: Request, res: Response, next) => {
  try {
    const channelId = String(req.query.channelId ?? '')
    if (!channelId) {
      res.status(400).json({ error: 'channelId is required' })
      return
    }
    const from = req.query.from ? new Date(String(req.query.from)) : null
    const to = req.query.to ? new Date(String(req.query.to)) : null
    const pool = getPool()

    const channel = await pool.query('SELECT * FROM channels WHERE id = $1', [channelId])
    if (channel.rowCount === 0) {
      res.status(404).json({ error: `Unknown channel "${channelId}"` })
      return
    }
    const ch = channel.rows[0]

    const params: unknown[] = [channelId]
    let where = 'a.channel_id = $1'
    if (from) { params.push(from); where += ` AND a.created_at >= $${params.length}` }
    if (to) { params.push(to); where += ` AND a.created_at <= $${params.length}` }

    const { rows } = await pool.query(
      `SELECT a.id, a.subscriber, a.agent_id, a.plan_id, a.amount_paid, a.tx_hash, a.block_number,
              a.expires_at, a.settled, a.created_at
       FROM channel_attributions a
       WHERE ${where}
       ORDER BY a.created_at DESC`,
      params
    )

    const shareBps = Number(ch.share_bps)
    const items = rows.map((r) => ({
      id: r.id,
      subscriber: r.subscriber,
      agentId: r.agent_id,
      planId: r.plan_id,
      amountPaid: r.amount_paid,
      shareBps,
      channelShare: r.amount_paid ? (BigInt(r.amount_paid) * BigInt(shareBps)) / 10000n : 0n,
      txHash: r.tx_hash,
      blockNumber: r.block_number,
      expiresAt: r.expires_at,
      settled: r.settled,
      createdAt: r.created_at,
    }))
    const totalShare = items.reduce((acc, it) => acc + (typeof it.channelShare === 'bigint' ? it.channelShare : 0n), 0n)

    log.info(`report(channelId=${channelId}, from=${from?.toISOString() ?? '-'}, to=${to?.toISOString() ?? '-'}) → ${items.length} attributions`)
    res.json({
      channel: { id: ch.id, name: ch.name, shareBps, wallet: ch.wallet, active: ch.active },
      count: items.length,
      totalShareWei: totalShare.toString(),
      items: items.map((it) => ({ ...it, channelShare: it.channelShare.toString() })),
    })
  } catch (err) {
    log.error(`report() failed: ${(err as Error).message}`)
    next(err)
  }
})

export default router
