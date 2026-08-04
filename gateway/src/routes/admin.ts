// ---------------------------------------------------------------------------
// AgentX Gateway — Admin Routes
// ---------------------------------------------------------------------------
// POST   /api/v1/admin/platform-keys          — Add platform API key
// GET    /api/v1/admin/platform-keys          — List platform API keys
// DELETE /api/v1/admin/platform-keys/:id      — Delete platform API key
// GET    /api/v1/admin/plans                  — List plans
// GET    /api/v1/admin/tenants               — List tenants (paginated)
// PATCH  /api/v1/admin/tenants/:id           — Update tenant plan/status
// GET    /api/v1/admin/usage                 — Usage stats
// GET    /api/v1/admin/system                — Service / DB / chain health
// GET    /api/v1/admin/revenue               — On-chain fees + fiat + channel + x402
// GET    /api/v1/admin/payments              — Stripe / x402 / channel config & state
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
              byok_enabled, rate_limit_rpm, max_concurrent, platform_models, is_active
       FROM plans ORDER BY price_monthly ASC`
    )
    res.json({ plans: result.rows })
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
    const { plan_slug, status } = req.body
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

export default router
