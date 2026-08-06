// ---------------------------------------------------------------------------
// AgentX Gateway — Admin Partner Routes (split from admin.ts, R7)
// ---------------------------------------------------------------------------
// GET    /api/v1/admin/applications          — List B-end partner applications
// POST   /api/v1/admin/applications/:id/decide — Approve/reject (approve auto-creates channel)
// GET    /api/v1/admin/integrations          — List integration partners (multi-caller access config)
// POST   /api/v1/admin/integrations          — Create partner: auto-create tenant + issue api key (shown once)
// PATCH  /api/v1/admin/integrations/:id      — Update partner (name/gateway_url/plan/active/notes)
// POST   /api/v1/admin/integrations/:id/rotate-key — Rotate tenant api key (shown once)
// DELETE /api/v1/admin/integrations/:id      — Delete partner (tenant retained for audit)
// ---------------------------------------------------------------------------
// Mounted under /api/v1/admin (adminAuth applied by parent admin mod router).
// ---------------------------------------------------------------------------

import crypto from 'crypto'
import { Router, Request, Response } from 'express'
import { getPool } from '../lib/db'
import { config } from '../config'

const router = Router()

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
              channel_id_hint, desired_share_bps, wallet, type, status, decision_note, decided_at, created_at
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

// Decide an application: approve → for type=channel auto-create channel; for
// type=developer auto-create tenant + integration partner + issue api key.
// reject → mark rejected.
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
        // R13: type=developer → auto-create tenant + integration partner + issue api key
        if (app.type === 'developer') {
          const baseSlug = String(app.company).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'developer'
          let slug = baseSlug
          for (let attempt = 1; attempt <= 50; attempt++) {
            const dup = await client.query(`SELECT id FROM integration_partners WHERE slug = $1`, [slug])
            if (dup.rowCount === 0) break
            if (attempt === 50) throw new Error('could not allocate a unique partner slug')
            slug = `${baseSlug}-${attempt}`
          }
          const wallet = `partner-${slug}`
          const apiKey = 'agentx_' + crypto.randomBytes(16).toString('hex')
          const plan = await client.query(`SELECT id, quota_daily FROM plans WHERE slug = 'enterprise'`)
          if (plan.rows.length === 0) throw new Error('enterprise plan not found')
          const tenant = await client.query(
            `INSERT INTO tenants (wallet_address, name, plan_id, quota_daily, rate_limit_rpm, max_concurrent, api_key, kind)
             VALUES ($1, $2, $3, $4, 100, 10, $5, 'partner')
             ON CONFLICT (wallet_address) DO UPDATE
               SET plan_id = EXCLUDED.plan_id, api_key = EXCLUDED.api_key, kind = 'partner', updated_at = NOW()
             RETURNING id`,
            [wallet, `Integration: ${app.company}`, plan.rows[0].id, plan.rows[0].quota_daily, apiKey]
          )
          const partner = await client.query(
            `INSERT INTO integration_partners (slug, name, gateway_url, tenant_id, active, notes)
             VALUES ($1, $2, $3, $4, true, $5)
             ON CONFLICT (slug) DO UPDATE
               SET name = EXCLUDED.name, tenant_id = EXCLUDED.tenant_id,
                   gateway_url = EXCLUDED.gateway_url, notes = EXCLUDED.notes, updated_at = NOW()
             RETURNING id, slug, name, gateway_url, tenant_id, active`,
            [slug, app.company, config.publicGatewayUrl, tenant.rows[0].id, note || null]
          )
          await client.query(
            `UPDATE partner_applications SET status = 'approved', decision_note = $1, decided_at = NOW()
             WHERE id = $2`,
            [note || `Approved as integration partner "${slug}"`, app.id]
          )
          await client.query('COMMIT')
          res.json({
            success: true, decision: 'approved', type: 'developer',
            integration: partner.rows[0],
            api_key: apiKey,
            warning: "api_key is shown only on approval — store it in the caller's AGENTX_CONVERSATION_API_KEY",
          })
          return
        }
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

// ── Integration Partners (R11: multi-caller access config) ──────────────────
// Each partner row owns a tenant whose tenants.api_key is the caller's
// AGENTX_CONVERSATION_API_KEY (generated as `agentx_` + 32 hex, shown only once
// on create / rotate).

// List partners (joined with their tenant plan; never returns the raw api_key)
router.get('/integrations', async (_req: Request, res: Response) => {
  try {
    const pool = getPool()
    const result = await pool.query(
      `SELECT ip.id, ip.slug, ip.name, ip.gateway_url, ip.tenant_id, ip.active, ip.notes,
              ip.created_at, ip.updated_at,
              t.wallet_address, t.api_key IS NOT NULL AS has_api_key, t.status AS tenant_status,
              p.slug AS plan_slug
       FROM integration_partners ip
       LEFT JOIN tenants t ON t.id = ip.tenant_id
       LEFT JOIN plans p ON p.id = t.plan_id
       ORDER BY ip.created_at DESC`
    )
    res.json({ integrations: result.rows })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Create partner: auto-create tenant (wallet = partner-<slug>) + issue api key
router.post('/integrations', async (req: Request, res: Response) => {
  try {
    const { slug, name, gateway_url, plan_slug, notes } = req.body
    if (!slug || !name || !gateway_url) {
      res.status(400).json({ error: 'slug, name, and gateway_url are required' })
      return
    }
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(String(slug))) {
      res.status(400).json({ error: 'slug must be lowercase alphanumeric + dashes, 2-64 chars' })
      return
    }
    const pool = getPool()

    // Resolve plan (default enterprise — partner callers need headroom)
    const planSlug = plan_slug || 'enterprise'
    const plan = await pool.query(`SELECT id, quota_daily FROM plans WHERE slug = $1`, [planSlug])
    if (plan.rows.length === 0) {
      res.status(400).json({ error: `Invalid plan_slug: ${planSlug}` })
      return
    }

    const wallet = `partner-${String(slug).toLowerCase()}`
    const apiKey = 'agentx_' + crypto.randomBytes(16).toString('hex')

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Tenant (api_key stored plaintext — same as JWT-registered tenants, 004 migration)
      const tenant = await client.query(
        `INSERT INTO tenants (wallet_address, name, plan_id, quota_daily, rate_limit_rpm, max_concurrent, api_key, kind)
         VALUES ($1, $2, $3, $4, 100, 10, $5, 'partner')
         ON CONFLICT (wallet_address) DO UPDATE
           SET plan_id = EXCLUDED.plan_id, api_key = EXCLUDED.api_key, kind = 'partner', updated_at = NOW()
         RETURNING id`,
        [wallet, `Integration: ${name}`, plan.rows[0].id, plan.rows[0].quota_daily, apiKey]
      )

      const partner = await client.query(
        `INSERT INTO integration_partners (slug, name, gateway_url, tenant_id, active, notes)
         VALUES ($1, $2, $3, $4, true, $5)
         ON CONFLICT (slug) DO UPDATE
           SET name = EXCLUDED.name, gateway_url = EXCLUDED.gateway_url,
               tenant_id = EXCLUDED.tenant_id, notes = EXCLUDED.notes, updated_at = NOW()
         RETURNING id, slug, name, gateway_url, tenant_id, active, notes, created_at`,
        [String(slug).toLowerCase(), name, gateway_url, tenant.rows[0].id, notes || null]
      )

      await client.query('COMMIT')
      res.status(201).json({
        success: true,
        integration: partner.rows[0],
        api_key: apiKey, // shown only once
        warning: 'api_key is shown only on creation/rotation — store it in the caller\'s AGENTX_CONVERSATION_API_KEY',
      })
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

// Update partner fields (optionally re-target the tenant plan)
router.patch('/integrations/:id', async (req: Request, res: Response) => {
  try {
    const { name, gateway_url, active, notes, plan_slug } = req.body
    const pool = getPool()
    const existing = await pool.query(
      `SELECT ip.*, t.plan_id FROM integration_partners ip
       LEFT JOIN tenants t ON t.id = ip.tenant_id
       WHERE ip.id = $1`,
      [req.params.id]
    )
    if (existing.rowCount === 0) {
      res.status(404).json({ error: 'Integration not found' })
      return
    }
    const row = existing.rows[0]

    const sets: string[] = []
    const params: unknown[] = []
    const push = (expr: string, value: unknown) => { params.push(value); sets.push(`${expr} = $${params.length}`) }

    if (name !== undefined) push('name', name)
    if (gateway_url !== undefined) push('gateway_url', gateway_url)
    if (notes !== undefined) push('notes', notes)
    if (active !== undefined) push('active', Boolean(active))
    if (plan_slug !== undefined) {
      const plan = await pool.query(`SELECT id FROM plans WHERE slug = $1`, [plan_slug])
      if (plan.rows.length === 0) {
        res.status(400).json({ error: `Invalid plan_slug: ${plan_slug}` })
        return
      }
      if (row.tenant_id) {
        await pool.query(`UPDATE tenants SET plan_id = $1, updated_at = NOW() WHERE id = $2`,
          [plan.rows[0].id, row.tenant_id])
      }
    }
    if (sets.length === 0) {
      res.status(400).json({ error: 'No fields to update' })
      return
    }
    params.push(req.params.id)
    sets.push(`updated_at = NOW()`)
    await pool.query(`UPDATE integration_partners SET ${sets.join(', ')} WHERE id = $${params.length}`, params)
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Rotate the partner tenant's api key (shown once)
router.post('/integrations/:id/rotate-key', async (req: Request, res: Response) => {
  try {
    const pool = getPool()
    const existing = await pool.query(
      `SELECT ip.tenant_id FROM integration_partners ip WHERE ip.id = $1`,
      [req.params.id]
    )
    if (existing.rowCount === 0) {
      res.status(404).json({ error: 'Integration not found' })
      return
    }
    const tenantId = existing.rows[0].tenant_id
    if (!tenantId) {
      res.status(400).json({ error: 'Integration has no tenant — recreate it' })
      return
    }
    const apiKey = 'agentx_' + crypto.randomBytes(16).toString('hex')
    await pool.query(`UPDATE tenants SET api_key = $1, updated_at = NOW() WHERE id = $2`, [apiKey, tenantId])
    res.json({ success: true, api_key: apiKey, warning: 'api_key is shown only on creation/rotation' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Delete partner row (tenant retained for audit)
router.delete('/integrations/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool()
    const result = await pool.query(
      `DELETE FROM integration_partners WHERE id = $1 RETURNING id, slug`,
      [req.params.id]
    )
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Integration not found' })
      return
    }
    res.json({ success: true, deleted: result.rows[0] })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
