// ---------------------------------------------------------------------------
// ── Agents API (public, read-only)
// ---------------------------------------------------------------------------
// GET /api/v1/agents          → list agents (filter + pagination)
// GET /api/v1/agents/count    → total / active counts
// GET /api/v1/agents/:id      → single agent detail
// ---------------------------------------------------------------------------

import { Router, Request, Response } from 'express'
import { getPool } from '../lib/db'

const router = Router()

// ── Query param helpers ─────────────────────────────────────────────────────

function parseBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'string') return ['true', '1', 'yes'].includes(value.toLowerCase())
  return fallback
}

function parseIntOptional(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const n = parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}

// ── List agents (filter + pagination) ───────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  try {
    const pool = getPool()

    const activeOnly = parseBool(req.query.activeOnly)
    const capabilities = typeof req.query.capabilities === 'string'
      ? req.query.capabilities.split(',').map((s) => s.trim()).filter(Boolean)
      : []
    const fromId = parseIntOptional(req.query.fromId)
    const toId = parseIntOptional(req.query.toId)
    const page = Math.max(1, parseIntOptional(req.query.page) ?? 1)
    const pageSize = Math.min(100, Math.max(1, parseIntOptional(req.query.pageSize) ?? 50))

    const where: string[] = []
    const params: unknown[] = []

    if (activeOnly) {
      params.push(true)
      where.push(`is_active = $${params.length}`)
    }
    if (capabilities.length > 0) {
      params.push(capabilities)
      where.push(`capabilities && $${params.length}`)
    }
    if (fromId !== null) {
      params.push(fromId)
      where.push(`id >= $${params.length}`)
    }
    if (toId !== null) {
      params.push(toId)
      where.push(`id <= $${params.length}`)
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

    const [{ rows }] = await Promise.all([
      pool.query(
        `SELECT id, owner, name, description, tags, capabilities, skills, is_active,
                agent_created_at, synced_at, created_at
         FROM agents
         ${whereSql}
         ORDER BY id DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, (page - 1) * pageSize]
      ),
    ])

    const count = await pool.query(`SELECT COUNT(*) AS total FROM agents ${whereSql}`, params)
    const total = parseInt(count.rows[0]?.total ?? '0', 10)

    res.json({ agents: rows, total, page, pageSize })
  } catch (err: any) {
    console.error('[agents] list error:', err.message)
    res.status(500).json({ error: 'Failed to fetch agents' })
  }
})

// ── Count agents ────────────────────────────────────────────────────────────

router.get('/count', async (_req: Request, res: Response) => {
  try {
    const pool = getPool()
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE is_active) AS active
       FROM agents`
    )
    res.json({
      total: parseInt(rows[0]?.total ?? '0', 10),
      active: parseInt(rows[0]?.active ?? '0', 10),
    })
  } catch (err: any) {
    console.error('[agents] count error:', err.message)
    res.status(500).json({ error: 'Failed to count agents' })
  }
})

// ── Single agent detail ─────────────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool()
    const id = parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid agent id' })
    }
    const { rows } = await pool.query(
      `SELECT id, owner, name, description, tags, capabilities, skills, is_active,
              agent_created_at, token_uri, metadata_json, synced_at, created_at, updated_at
       FROM agents WHERE id = $1`,
      [id]
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
