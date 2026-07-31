// AgentX Gateway — Traces Route
// Query trace events for observability (publisher/admin views)

import { Router, Request, Response } from 'express'
import { getPool } from '../lib/db'

const router = Router()

// GET /api/v1/traces/sessions?agentId=:id&limit=20
// Publisher: list session summaries for an agent
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const agentId = parseInt(req.query.agentId as string) || undefined
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100)

    const pool = getPool()
    const result = await pool.query(
      `SELECT session_id, agent_id, tenant_id,
              COUNT(*) AS event_count,
              MAX(created_at) AS last_event_at,
              MIN(created_at) AS first_event_at
       FROM traces
       WHERE ($1::integer IS NULL OR agent_id = $1)
         AND ($2::varchar IS NULL OR tenant_id = $2)
       GROUP BY session_id, agent_id, tenant_id
       ORDER BY MAX(created_at) DESC
       LIMIT $3`,
      [agentId, user?.tenantId || null, limit]
    )

    res.json({ sessions: result.rows })
  } catch (err) { next(err) }

  function next(err: unknown) {
    console.error('[Traces] Query error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/v1/traces/session/:sessionId
// Detail: all events for a single session
router.get('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params

    const pool = getPool()
    const result = await pool.query(
      `SELECT id, type, data, created_at
       FROM traces
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [sessionId]
    )

    res.json({ sessionId, events: result.rows })
  } catch (err) {
    console.error('[Traces] Query error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
