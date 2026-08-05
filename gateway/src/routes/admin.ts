// ---------------------------------------------------------------------------
// AgentX Gateway — Admin Routes
// ---------------------------------------------------------------------------
// POST   /api/v1/admin/platform-keys          — Add platform API key
// GET    /api/v1/admin/platform-keys          — List platform API keys
// PATCH  /api/v1/admin/platform-keys/:id      — Update platform API key (fields optional)
// DELETE /api/v1/admin/platform-keys/:id      — Delete platform API key
// GET    /api/v1/admin/plans                  — List plans
// GET    /api/v1/admin/tenants               — List tenants (paginated)
// PATCH  /api/v1/admin/tenants/:id           — Update tenant plan/status
// GET    /api/v1/admin/usage                 — Usage stats
// GET    /api/v1/admin/system                — Service / DB / chain health
// GET    /api/v1/admin/revenue               — On-chain fees + fiat + channel + x402
// GET    /api/v1/admin/payments              — Stripe / x402 / channel config & state
// POST   /api/v1/admin/channels              — Create channel
// PATCH  /api/v1/admin/channels/:id          — Update channel (name/share_bps/wallet/active)
// DELETE /api/v1/admin/channels/:id          — Delete channel
// GET    /api/v1/admin/channels/:id/report   — Channel attribution detail + settlements
// POST   /api/v1/admin/channels/:id/settle   — Record a settlement batch for a channel
// GET    /api/v1/admin/applications          — List B-end partner applications
// POST   /api/v1/admin/applications/:id/decide — Approve/reject (approve auto-creates channel)
// ---------------------------------------------------------------------------

import { Router, Request, Response } from 'express'
import { getPool } from '../lib/db'
import { adminAuth } from '../middleware/adminAuth'
import { encryptApiKey } from '../lib/crypto'
import { config } from '../config'
import { chainDataReader, log } from '../services/chain-data-reader'
import { x402Available, priceWei } from '../services/x402'

const router = Router()

// All admin routes require admin auth
router.use(adminAuth)

// ── Platform API Keys ─────────────────────────────────────────────────────

// List all platform keys (masked)
router.get('/platform-keys', async (_req: Request, res: Response) => {
  try {
    const pool = getPool()
    const result = await pool.query(
      `SELECT pk.id, pk.provider, pk.endpoint, pk.models, pk.plan_ids, pk.weight, pk.is_active,
              pk.created_at,
              array_agg(p.slug) as plan_slugs
       FROM platform_api_keys pk
       LEFT JOIN plans p ON p.id = ANY(pk.plan_ids)
       GROUP BY pk.id
       ORDER BY pk.created_at DESC`
    )
    res.json({ keys: result.rows })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Add platform API key
router.post('/platform-keys', async (req: Request, res: Response) => {
  try {
    const { provider, endpoint, api_key, models, plan_slugs } = req.body
    if (!provider || !endpoint || !api_key) {
      res.status(400).json({ error: 'provider, endpoint, and api_key are required' })
      return
    }

    const pool = getPool()

    // Resolve plan slugs to IDs
    const slugs: string[] = plan_slugs || ['pro', 'enterprise']
    const planResult = await pool.query(
      `SELECT id FROM plans WHERE slug = ANY($1)`, [slugs]
    )
    const planIds = planResult.rows.map((r: any) => r.id)

    const encrypted = encryptApiKey(api_key, config.masterEncryptionKey)
    const modelList: string[] = models || [provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o']

    await pool.query(
      `INSERT INTO platform_api_keys (provider, endpoint, api_key, plan_ids, models, weight, is_active)
       VALUES ($1, $2, $3, $4, $5, 1, true)`,
      [provider, endpoint, encrypted, planIds, modelList]
    )

    res.status(201).json({ success: true, provider, endpoint, models: modelList })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Update platform API key (any subset of fields; api_key is re-encrypted)
router.patch('/platform-keys/:id', async (req: Request, res: Response) => {
  try {
    const { provider, endpoint, api_key, models, plan_slugs, weight, is_active } = req.body
    const pool = getPool()

    const existing = await pool.query(`SELECT id FROM platform_api_keys WHERE id = $1`, [req.params.id])
    if (existing.rowCount === 0) {
      res.status(404).json({ error: 'Key not found' })
      return
    }

    const sets: string[] = []
    const params: unknown[] = []
    const push = (expr: string, value: unknown) => { params.push(value); sets.push(`${expr} = $${params.length}`) }

    if (provider !== undefined) push('provider', provider)
    if (endpoint !== undefined) push('endpoint', endpoint)
    if (api_key !== undefined) push('api_key', encryptApiKey(api_key, config.masterEncryptionKey))
    if (models !== undefined) push('models', models)
    if (weight !== undefined) push('weight', weight)
    if (is_active !== undefined) push('is_active', is_active)
    if (plan_slugs !== undefined) {
      const slugs: string[] = plan_slugs
      const planResult = await pool.query(`SELECT id FROM plans WHERE slug = ANY($1)`, [slugs])
      push('plan_ids', planResult.rows.map((r: any) => r.id))
    }
    if (sets.length === 0) {
      res.status(400).json({ error: 'No fields to update' })
      return
    }

    params.push(req.params.id)
    await pool.query(`UPDATE platform_api_keys SET ${sets.join(', ')} WHERE id = $${params.length}`, params)
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Delete platform API key
router.delete('/platform-keys/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool()
    const result = await pool.query(
      `DELETE FROM platform_api_keys WHERE id = $1 RETURNING id, provider`,
      [req.params.id]
    )
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Key not found' })
      return
    }
    res.json({ success: true, deleted: result.rows[0] })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── Plans ──────────────────────────────────────────────────────────────────

router.get('/plans', async (_req: Request, res: Response) => {
  try {
    const pool = getPool()
    const result = await pool.query(
      `SELECT id, name, slug, price_monthly, quota_daily, quota_monthly,
              byok_enabled, rate_limit_rpm, max_concurrent, platform_models, features, is_active
       FROM plans ORDER BY price_monthly ASC`
    )
    res.json({ plans: result.rows })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/v1/admin/plans/:id — edit plan capability features
// Body: { features: { parallel_tasks: false } } — deep-merged into plans.features JSONB
router.patch('/plans/:id', async (req: Request, res: Response) => {
  try {
    const { features } = req.body || {}
    if (!features || typeof features !== 'object' || Array.isArray(features)) {
      res.status(400).json({ error: 'features object is required' })
      return
    }
    const pool = getPool()
    const result = await pool.query(
      `UPDATE plans
         SET features = COALESCE(features, '{}'::jsonb) || $1::jsonb
       WHERE id = $2
       RETURNING id, name, slug, features`,
      [JSON.stringify(features), req.params.id]
    )
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Plan not found' })
      return
    }
    res.json({ plan: result.rows[0] })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── Tenants ────────────────────────────────────────────────────────────────

router.get('/tenants', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100)
    const offset = (page - 1) * limit

    const pool = getPool()
    const [countResult, tenantResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM tenants`),
      pool.query(
        `SELECT t.id, t.wallet_address, t.status,
                t.quota_daily, t.quota_used, t.rate_limit_rpm, t.max_concurrent,
                t.allow_parallel_tasks,
                t.created_at, t.updated_at,
                p.slug as plan_slug, p.name as plan_name
         FROM tenants t
         LEFT JOIN plans p ON t.plan_id = p.id
         ORDER BY t.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
    ])

    res.json({
      tenants: tenantResult.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.patch('/tenants/:id', async (req: Request, res: Response) => {
  try {
    const { plan_slug, status, allow_parallel_tasks } = req.body
    const pool = getPool()

    if (plan_slug) {
      const planResult = await pool.query(`SELECT id FROM plans WHERE slug = $1`, [plan_slug])
      if (planResult.rows.length === 0) {
        res.status(400).json({ error: 'Invalid plan slug' })
        return
      }
      const plan = planResult.rows[0]
      await pool.query(`UPDATE tenants SET plan_id = $1, updated_at = NOW() WHERE id = $2`,
        [plan.id, req.params.id])
    }

    if (status) {
      await pool.query(`UPDATE tenants SET status = $1, updated_at = NOW() WHERE id = $2`,
        [status, req.params.id])
    }

    // P9: tenant-level override for parallel tasks (null/omitted → inherit plan)
    if (allow_parallel_tasks !== undefined) {
      const value = allow_parallel_tasks === null ? null : Boolean(allow_parallel_tasks)
      await pool.query(`UPDATE tenants SET allow_parallel_tasks = $1, updated_at = NOW() WHERE id = $2`,
        [value, req.params.id])
    }

    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── Usage Stats ────────────────────────────────────────────────────────────

router.get('/usage', async (_req: Request, res: Response) => {
  try {
    const pool = getPool()
    const [total, recent, topTenants] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) as total_requests,
                COALESCE(SUM(tokens_total), 0) as total_tokens
         FROM usage_logs`
      ),
      pool.query(
        `SELECT DATE(created_at) as date,
                COUNT(*) as requests,
                SUM(tokens_total) as tokens
         FROM usage_logs
         WHERE created_at > NOW() - INTERVAL '30 days'
         GROUP BY DATE(created_at)
         ORDER BY date DESC
         LIMIT 30`
      ),
      pool.query(
        `SELECT t.wallet_address, p.slug as plan,
                COUNT(ul.*) as requests,
                COALESCE(SUM(ul.tokens_total), 0) as tokens
         FROM tenants t
         LEFT JOIN usage_logs ul ON ul.tenant_id = t.id
         LEFT JOIN plans p ON t.plan_id = p.id
         WHERE ul.created_at > NOW() - INTERVAL '30 days' OR ul.id IS NULL
         GROUP BY t.id, t.wallet_address, p.slug
         ORDER BY tokens DESC
         LIMIT 20`
      ),
    ])

    res.json({
      summary: total.rows[0],
      daily: recent.rows,
      topTenants: topTenants.rows,
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── System Status ──────────────────────────────────────────────────────────

// Probe an HTTP service health endpoint (short timeout).
async function probe(url: string): Promise<{ online: boolean; code: number | null; latencyMs: number }> {
  const t0 = Date.now()
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) })
    return { online: r.ok, code: r.status, latencyMs: Date.now() - t0 }
  } catch {
    return { online: false, code: null, latencyMs: Date.now() - t0 }
  }
}

router.get('/system', async (_req: Request, res: Response) => {
  try {
    const pool = getPool()
    const [dbResult, agentsResult, plansResult] = await Promise.all([
      pool.query('SELECT 1 AS ok'),
      pool.query('SELECT COUNT(*) AS total, MAX(synced_at) AS last_sync FROM agents'),
      pool.query('SELECT COUNT(*) AS total FROM subscription_plans'),
    ])
    const [sepoliaBlock, oxaBlock, convProbe, feProbe] = await Promise.all([
      chainDataReader.getBlockNumber('sepolia').catch(() => null),
      chainDataReader.getBlockNumber('oxachain').catch(() => null),
      probe(`${config.conversationServiceUrl}/health`),
      probe(process.env.FRONTEND_URL || 'http://127.0.0.1:3100'),
    ])

    res.json({
      services: {
        gateway: { online: true, uptimeSec: Math.floor(process.uptime()), memoryMB: Math.round(process.memoryUsage().rss / 1048576) },
        conversation: convProbe,
        frontend: feProbe,
      },
      database: {
        connected: (dbResult.rowCount ?? 0) === 1,
        agents: Number(agentsResult.rows[0]?.total ?? 0),
        lastSyncAt: agentsResult.rows[0]?.last_sync ?? null,
        plans: Number(plansResult.rows[0]?.total ?? 0),
      },
      chains: {
        sepolia: { chainId: config.chainId, blockNumber: sepoliaBlock },
        oxachain: { chainId: config.chainIdOxaChain, blockNumber: oxaBlock },
      },
      time: new Date().toISOString(),
    })
  } catch (err: any) {
    log.error(`admin/system failed: ${err.message}`)
    res.status(500).json({ error: err.message })
  }
})

// ── Revenue ────────────────────────────────────────────────────────────────

router.get('/revenue', async (req: Request, res: Response) => {
  const t0 = Date.now()
  log.info(`admin/revenue called (ip=${req.ip}, query=${JSON.stringify(req.query)}, ua=${req.headers['user-agent'] ?? '-'})`)
  try {
    const pool = getPool()
    const [sepoliaFees, oxaFees, feeBps, fiatResult, channelResult, x402Payments, x402Balances] = await Promise.all([
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
    ])

    const result = {
      onChain: {
        platformFeeBps: feeBps,
        sepolia: { nativeFeesWei: sepoliaFees },
        oxachain: { nativeFeesWei: oxaFees },
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

// ── B-end Partner Applications ─────────────────────────────────────────────

// List applications (filter by status via ?status=)
router.get('/applications', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined
    const pool = getPool()
    const params: unknown[] = []
    let where = ''
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      params.push(status)
      where = `WHERE status = $1`
    }
    const result = await pool.query(
      `SELECT id, company, contact_name, contact_email, website, description,
              channel_id_hint, desired_share_bps, wallet, status, decision_note, decided_at, created_at
       FROM partner_applications
       ${where}
       ORDER BY created_at DESC
       LIMIT 200`,
      params
    )
    res.json({ applications: result.rows })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Decide an application: approve → auto-create channel, reject → mark rejected.
// body: { decision: 'approved' | 'rejected', channel_id?, share_bps?, note? }
router.post('/applications/:id/decide', async (req: Request, res: Response) => {
  try {
    const { decision, channel_id, share_bps, note } = req.body
    if (!decision || !['approved', 'rejected'].includes(decision)) {
      res.status(400).json({ error: 'decision must be "approved" or "rejected"' })
      return
    }
    const pool = getPool()
    const existing = await pool.query(
      `SELECT * FROM partner_applications WHERE id = $1`,
      [req.params.id]
    )
    if (existing.rowCount === 0) {
      res.status(404).json({ error: 'Application not found' })
      return
    }
    const app = existing.rows[0]
    if (app.status !== 'pending') {
      res.status(400).json({ error: `Application already ${app.status}` })
      return
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      if (decision === 'approved') {
        // Resolve channel id: explicit > application hint > company slug
        let chId = channel_id || app.channel_id_hint || null
        if (!chId) {
          chId = String(app.company).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || `partner-${app.id}`
        }
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(String(chId))) {
          throw new Error('channel_id must be alphanumeric, 1-64 chars (no spaces)')
        }
        const bps = share_bps ?? app.desired_share_bps ?? 0
        if (!Number.isInteger(Number(bps)) || Number(bps) < 0 || Number(bps) > 10000) {
          throw new Error('share_bps must be an integer between 0 and 10000')
        }
        await client.query(
          `INSERT INTO channels (id, name, share_bps, wallet, active)
           VALUES ($1, $2, $3, $4, true)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, share_bps = EXCLUDED.share_bps, wallet = EXCLUDED.wallet`,
          [String(chId), app.company, Number(bps), app.wallet || null]
        )
        await client.query(
          `UPDATE partner_applications
           SET status = 'approved', decision_note = $1, decided_at = NOW()
           WHERE id = $2`,
          [note || `Approved as channel "${chId}"`, app.id]
        )
        await client.query('COMMIT')
        res.json({ success: true, decision: 'approved', channelId: String(chId) })
        return
      }

      await client.query(
        `UPDATE partner_applications SET status = 'rejected', decision_note = $1, decided_at = NOW() WHERE id = $2`,
        [note || null, app.id]
      )
      await client.query('COMMIT')
      res.json({ success: true, decision: 'rejected' })
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
