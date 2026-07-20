// ---------------------------------------------------------------------------
// ── Agents API (public, read-only)
// ---------------------------------------------------------------------------
// GET /api/v1/agents         → list all agents
// GET /api/v1/agents/:id     → single agent detail
// ---------------------------------------------------------------------------

import { Router, Request, Response } from 'express'
import { getPool } from '../lib/db'

const router = Router()

// ── List all agents ─────────────────────────────────────────────────────────

router.get('/', async (_req: Request, res: Response) => {
  try {
    const pool = getPool()
    const { rows } = await pool.query(
      `SELECT id, owner, name, description, tags, capabilities, synced_at, created_at
       FROM agents
       ORDER BY id DESC`
    )
    res.json({ agents: rows, total: rows.length })
  } catch (err: any) {
    console.error('[agents] list error:', err.message)
    res.status(500).json({ error: 'Failed to fetch agents' })
  }
})

// ── Single agent detail ─────────────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool()
    const { rows } = await pool.query(
      `SELECT id, owner, name, description, tags, capabilities, token_uri, metadata_json, synced_at, created_at, updated_at
       FROM agents WHERE id = $1`,
      [parseInt(req.params.id)]
    )

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' })
    }

    res.json(rows[0])
  } catch (err: any) {
    console.error('[agents] detail error:', err.message)
    res.status(500).json({ error: 'Failed to fetch agent' })
  }
})

export default router
