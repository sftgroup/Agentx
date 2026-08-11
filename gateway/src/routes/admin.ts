// ---------------------------------------------------------------------------
// AgentX Gateway — Admin Routes (mod, split in R7)
// ---------------------------------------------------------------------------
// POST   /api/v1/admin/platform-keys          — Add platform API key
// GET    /api/v1/admin/platform-keys          — List platform API keys
// PATCH  /api/v1/admin/platform-keys/:id      — Update platform API key (fields optional)
// DELETE /api/v1/admin/platform-keys/:id      — Delete platform API key
// GET    /api/v1/admin/plans                  — List plans
// PATCH  /api/v1/admin/plans/:id              — Edit plan capability features
// GET    /api/v1/admin/tenants               — List tenants (paginated)
// PATCH  /api/v1/admin/tenants/:id           — Update tenant plan/status
// GET    /api/v1/admin/usage                 — Usage stats
// GET    /api/v1/admin/system                — Service / DB / chain health
// ├── admin-finance.ts                       — /revenue /payments /channels (R7 split)
// └── admin-partners.ts                      — /applications /integrations (R7 split)
// ---------------------------------------------------------------------------
// All admin routes require admin auth — applied once here, before sub-routers.
// ---------------------------------------------------------------------------

import crypto from 'crypto'
import { Router, Request, Response } from 'express'
import { getPool } from '../lib/db'
import { adminAuth } from '../middleware/adminAuth'
import { encryptApiKey } from '../lib/crypto'
import { config } from '../config'
import { chainDataReader, log } from '../services/chain-data-reader'
import financeRouter from './admin-finance'
import partnersRouter from './admin-partners'

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

// PATCH /api/v1/admin/plans/:id — edit plan capability features AND quota
// Body (R19.6 / G6): { features?: {...}, quota_daily?, quota_monthly?,
//                      rate_limit_rpm?, max_concurrent?, price_monthly? }
// features is deep-merged into plans.features JSONB; scalar quotas update
// directly and take effect immediately (tenants read plan_id → quota_daily).
router.patch('/plans/:id', async (req: Request, res: Response) => {
  try {
    const { features, quota_daily, quota_monthly, rate_limit_rpm, max_concurrent, price_monthly } = req.body || {}
    const pool = getPool()

    const featureExpr = features && typeof features === 'object' && !Array.isArray(features)
      ? `features = COALESCE(features, '{}'::jsonb) || $1::jsonb`
      : null
    const sets: string[] = []
    const values: unknown[] = []
    if (featureExpr) {
      sets.push(featureExpr)
      values.push(JSON.stringify(features))
    }
    if (quota_daily !== undefined) { sets.push('quota_daily = $' + (values.length + 1)); values.push(Number(quota_daily)) }
    if (quota_monthly !== undefined) { sets.push('quota_monthly = $' + (values.length + 1)); values.push(Number(quota_monthly)) }
    if (rate_limit_rpm !== undefined) { sets.push('rate_limit_rpm = $' + (values.length + 1)); values.push(Number(rate_limit_rpm)) }
    if (max_concurrent !== undefined) { sets.push('max_concurrent = $' + (values.length + 1)); values.push(Number(max_concurrent)) }
    if (price_monthly !== undefined) { sets.push('price_monthly = $' + (values.length + 1)); values.push(Number(price_monthly)) }

    if (sets.length === 0) {
      res.status(400).json({ error: 'No editable fields provided' })
      return
    }
    values.push(req.params.id)
    const result = await pool.query(
      `UPDATE plans SET ${sets.join(', ')} WHERE id = $${values.length}
       RETURNING id, name, slug, price_monthly, quota_daily, quota_monthly,
                 byok_enabled, rate_limit_rpm, max_concurrent, features, is_active`,
      values
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

// ── Sub-routers (R7 split) ─────────────────────────────────────────────────
// Auth is enforced above via router.use(adminAuth), so the sub-routers run
// only after the admin key is verified.
router.use(financeRouter)
router.use(partnersRouter)

export default router
