// AgentX Conversation Service — Session Routes
// POST /sessions — create a chat session (dialog container for parallel tasks)

import { Router, Request, Response } from 'express'
import type { Pool } from 'pg'
import { config } from '../config'
import { v4 as uuidv4 } from 'uuid'

export function createSessionsRouter(db: Pool): Router {
  const router = Router()

  // Internal auth middleware — X-Internal-Token
  router.use((req, res, next) => {
    const token = req.headers['x-internal-token'] as string
    if (!token || token !== config.internalAuthToken) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    next()
  })

  // POST /sessions — create a session
  router.post('/', async (req: Request, res: Response) => {
    const tenant = (req.headers['x-tenant-address'] as string) || 'unknown'
    const { sessionId, agentId, endUserId, title } = req.body || {}

    const id = typeof sessionId === 'string' && sessionId ? sessionId.slice(0, 64) : uuidv4()

    try {
      await db.query(
        `INSERT INTO chat_sessions (id, tenant, agent_id, end_user_id, title)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO NOTHING`,
        [id, tenant, agentId !== undefined && agentId !== null ? Number(agentId) : null, endUserId || 'default', title || null],
      )
      const { rows } = await db.query('SELECT * FROM chat_sessions WHERE id = $1', [id])
      return res.status(201).json(rows[0])
    } catch (err) {
      console.error('[Session] create failed:', (err as Error).message)
      return res.status(500).json({ error: 'Failed to create session' })
    }
  })

  // GET /sessions/:sessionId — session detail
  router.get('/:sessionId', async (req: Request, res: Response) => {
    try {
      const { rows } = await db.query('SELECT * FROM chat_sessions WHERE id = $1', [req.params.sessionId])
      if (rows.length === 0) return res.status(404).json({ error: 'Session not found' })
      return res.json(rows[0])
    } catch (err) {
      console.error('[Session] get failed:', (err as Error).message)
      return res.status(500).json({ error: 'Failed to get session' })
    }
  })

  return router
}
