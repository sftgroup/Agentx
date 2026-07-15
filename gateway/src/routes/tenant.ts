// ---------------------------------------------------------------------------
// AgentX Gateway — Tenant Management Routes
// ---------------------------------------------------------------------------

import { Router, Request, Response } from 'express'
import { getPool } from '../lib/db'
import { encryptApiKey, decryptApiKey } from '../lib/crypto'
import { config } from '../config'

const router = Router()

// GET /api/v1/tenant/me
router.get('/me', async (req: Request, res: Response) => {
  const tenant = req.tenant

  const pool = getPool()
  const [planRow, keysRow, usageRow] = await Promise.all([
    pool.query(`SELECT name, slug, quota_daily, quota_monthly, platform_models, byok_enabled, rate_limit_rpm, max_concurrent, features FROM plans WHERE id = $1`, [tenant!.planId]),
    pool.query(`SELECT id, provider, model, label, endpoint, is_active, last_validated, created_at FROM tenant_api_keys WHERE tenant_id = $1 ORDER BY created_at DESC`, [tenant!.id]),
    pool.query(`SELECT COALESCE(SUM(tokens_total), 0) as total_tokens, COALESCE(SUM(tool_calls), 0) as total_tool_calls FROM usage_logs WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`, [tenant!.id]),
  ])

  const platformModels = planRow.rows[0] ? planRow.rows[0].platform_models : []
  const ownKeys = keysRow.rows.map(r => ({
    id: r.id,
    provider: r.provider,
    model: r.model,
    label: r.label,
    endpoint: r.endpoint,
    is_active: r.is_active,
    last_validated: r.last_validated,
    created_at: r.created_at,
  }))

  res.json({
    tenant: {
      id: tenant!.id,
      wallet_address: tenant!.walletAddress,
      status: tenant!.status,
    },
    plan: planRow.rows[0] ? {
      name: planRow.rows[0].name,
      slug: planRow.rows[0].slug,
      quota_daily: planRow.rows[0].quota_daily,
      quota_used: tenant!.quotaUsed,
      platform_models: platformModels,
      byok_enabled: planRow.rows[0].byok_enabled,
      rate_limit_rpm: planRow.rows[0].rate_limit_rpm,
      max_concurrent: planRow.rows[0].max_concurrent,
    } : null,
    own_keys: ownKeys,
    usage_today: {
      total_tokens: parseInt(usageRow.rows[0]?.total_tokens || '0', 10),
      total_tool_calls: parseInt(usageRow.rows[0]?.total_tool_calls || '0', 10),
    },
  })
})

// GET /api/v1/tenant/keys
router.get('/keys', async (req: Request, res: Response) => {
  const pool = getPool()
  const result = await pool.query(
    `SELECT id, provider, model, label, endpoint, is_active, last_validated, created_at FROM tenant_api_keys WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [req.tenant!.id]
  )
  res.json({ keys: result.rows })
})

// POST /api/v1/tenant/keys
router.post('/keys', async (req: Request, res: Response) => {
  const { provider, endpoint, api_key, model, label } = req.body

  if (!provider || !endpoint || !api_key || !model) {
    res.status(400).json({ error: 'provider, endpoint, api_key, and model are required' })
    return
  }

  const encrypted = encryptApiKey(api_key, config.masterEncryptionKey)

  const pool = getPool()
  const result = await pool.query(
    `INSERT INTO tenant_api_keys (tenant_id, provider, endpoint, api_key, model, label)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, provider, model, label, endpoint, is_active, created_at`,
    [req.tenant!.id, provider, endpoint, encrypted, model, label || null]
  )

  res.status(201).json({ key: result.rows[0] })
})

// DELETE /api/v1/tenant/keys/:keyId
router.delete('/keys/:keyId', async (req: Request, res: Response) => {
  const pool = getPool()
  const result = await pool.query(
    `DELETE FROM tenant_api_keys WHERE id = $1 AND tenant_id = $2 RETURNING id`,
    [req.params.keyId, req.tenant!.id]
  )
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Key not found' })
    return
  }
  res.json({ deleted: true })
})

// POST /api/v1/tenant/keys/:keyId/validate
router.post('/keys/:keyId/validate', async (req: Request, res: Response) => {
  const pool = getPool()
  const keyRow = await pool.query(
    `SELECT * FROM tenant_api_keys WHERE id = $1 AND tenant_id = $2`,
    [req.params.keyId, req.tenant!.id]
  )
  if (keyRow.rows.length === 0) {
    res.status(404).json({ error: 'Key not found' })
    return
  }

  const tk = keyRow.rows[0]
  const key = decryptApiKey(tk.api_key, config.masterEncryptionKey)

  try {
    const testRes = await fetch(`${tk.endpoint}/models`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (testRes.ok) {
      await pool.query(
        `UPDATE tenant_api_keys SET is_active = true, last_validated = NOW() WHERE id = $1`,
        [tk.id]
      )
      res.json({ valid: true, provider: tk.provider, endpoint: tk.endpoint })
    } else {
      await pool.query(
        `UPDATE tenant_api_keys SET is_active = false WHERE id = $1`,
        [tk.id]
      )
      res.json({ valid: false, error: `HTTP ${testRes.status}` })
    }
  } catch (err) {
    res.json({ valid: false, error: String(err) })
  }
})

// GET /api/v1/tenant/usage
router.get('/usage', async (req: Request, res: Response) => {
  const days = parseInt(req.query.days as string || '30', 10)
  const pool = getPool()

  const [summaryRow, timelineRows] = await Promise.all([
    pool.query(
      `SELECT
         key_source,
         COALESCE(SUM(tokens_total), 0) as total_tokens,
         COALESCE(SUM(tool_calls), 0) as total_tool_calls,
         COUNT(*) as request_count
       FROM usage_logs
       WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '1 day' * $2
       GROUP BY key_source`,
      [req.tenant!.id, days]
    ),
    pool.query(
      `SELECT DATE(created_at) as day, key_source, COALESCE(SUM(tokens_total), 0) as tokens
       FROM usage_logs
       WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '1 day' * $2
       GROUP BY DATE(created_at), key_source
       ORDER BY day`,
      [req.tenant!.id, days]
    ),
  ])

  res.json({
    summary: summaryRow.rows,
    timeline: timelineRows.rows,
  })
})

// GET /api/v1/models
router.get('/models', async (req: Request, res: Response) => {
  const tenant = req.tenant

  const pool = getPool()
  const [planRow, keysRow] = await Promise.all([
    pool.query(`SELECT platform_models FROM plans WHERE id = $1`, [tenant!.planId]),
    pool.query(`SELECT id, provider, model, label FROM tenant_api_keys WHERE tenant_id = $1 AND is_active = true`, [tenant!.id]),
  ])

  res.json({
    platform: planRow.rows[0]?.platform_models || [],
    tenant_owned: keysRow.rows.map(r => ({
      id: r.id,
      provider: r.provider,
      model: r.model,
      label: r.label,
    })),
  })
})

export default router
