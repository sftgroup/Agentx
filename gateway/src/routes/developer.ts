// ---------------------------------------------------------------------------
// AgentX Gateway — Developer Application Routes (R13)
// ---------------------------------------------------------------------------
// POST /api/v1/developer/apply — External teams self-service apply for
//   API-key integration. Creates a `type='developer'` row in
//   partner_applications; an admin approves it via
//   POST /api/v1/admin/applications/:id/decide which auto-creates a tenant,
//   issues an `agentx_` key, and registers an integration partner.
// ---------------------------------------------------------------------------

import { Router, Request, Response } from 'express'
import { getPool } from '../lib/db'
import { log } from '../services/chain-data-reader'

const router = Router()

// Public — no auth required
router.post('/apply', async (req: Request, res: Response) => {
  try {
    const { company, contact_name, contact_email, website, description } = req.body
    if (!company || !contact_name || !contact_email) {
      res.status(400).json({ error: 'company, contact_name, and contact_email are required' })
      return
    }

    const pool = getPool()
    const result = await pool.query(
      `INSERT INTO partner_applications (company, contact_name, contact_email, website, description, type)
       VALUES ($1, $2, $3, $4, $5, 'developer')
       RETURNING id, company, type, status, created_at`,
      [String(company).trim(), String(contact_name).trim(), String(contact_email).trim(),
       website ? String(website).trim() : null, description ? String(description).trim() : null]
    )

    log.info(`developer/apply(company=${company}, email=${contact_email}) → application #${result.rows[0].id} created`)
    res.status(201).json({ application: result.rows[0] })
  } catch (err: any) {
    log.error(`developer/apply() failed: ${err.message}`)
    res.status(500).json({ error: err.message })
  }
})

export default router
