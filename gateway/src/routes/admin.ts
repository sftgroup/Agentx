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
// ---------------------------------------------------------------------------

import { Router, Request, Response } from 'express'
import { getPool } from '../lib/db'
import { adminAuth } from '../middleware/adminAuth'
import { encryptApiKey } from '../lib/crypto'
import { config } from '../config'

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

export default router
