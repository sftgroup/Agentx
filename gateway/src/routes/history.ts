// ---------------------------------------------------------------------------
// AgentX Gateway — Chat History Routes
// ---------------------------------------------------------------------------

import { Router, Request, Response } from 'express'
import { getPool } from '../lib/db'

const router = Router()

// GET /api/v1/chat/history/:agentId
router.get('/history/:agentId', async (req: Request, res: Response) => {
  const agentId = parseInt(req.params.agentId, 10)
  if (isNaN(agentId)) {
    res.status(400).json({ error: 'Invalid agentId' })
    return
  }

  const limit = Math.min(parseInt(req.query.limit as string || '100', 10), 500)
  const before = req.query.before as string | undefined

  const pool = getPool()
  let result
  if (before) {
    result = await pool.query(
      `SELECT id, agent_id, role, content, tool_name, tool_input, tool_output, created_at
       FROM chat_messages
       WHERE tenant_id = $1 AND agent_id = $2 AND id < $3
       ORDER BY id DESC
       LIMIT $4`,
      [req.tenant!.id, agentId, before, limit]
    )
  } else {
    result = await pool.query(
      `SELECT id, agent_id, role, content, tool_name, tool_input, tool_output, created_at
       FROM chat_messages
       WHERE tenant_id = $1 AND agent_id = $2
       ORDER BY id DESC
       LIMIT $3`,
      [req.tenant!.id, agentId, limit]
    )
  }

  res.json({
    messages: result.rows.reverse(),
    agent_id: agentId,
    has_more: result.rows.length >= limit,
  })
})

// POST /api/v1/chat/history/:agentId
router.post('/history/:agentId', async (req: Request, res: Response) => {
  const agentId = parseInt(req.params.agentId, 10)
  if (isNaN(agentId)) {
    res.status(400).json({ error: 'Invalid agentId' })
    return
  }

  const { messages } = req.body
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages array is required' })
    return
  }

  const pool = getPool()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    await client.query(
      `DELETE FROM chat_messages WHERE tenant_id = $1 AND agent_id = $2`,
      [req.tenant!.id, agentId]
    )
    for (const msg of messages) {
      await client.query(
        `INSERT INTO chat_messages (tenant_id, agent_id, role, content, tool_name, tool_input, tool_output)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          req.tenant!.id,
          agentId,
          msg.role,
          msg.content || '',
          msg.tool_name || null,
          msg.tool_input ? JSON.stringify(msg.tool_input) : null,
          msg.tool_output ? JSON.stringify(msg.tool_output) : null,
        ]
      )
    }
    await client.query('COMMIT')
    res.json({ saved: messages.length, agent_id: agentId })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})

// DELETE /api/v1/chat/history/:agentId
router.delete('/history/:agentId', async (req: Request, res: Response) => {
  const agentId = parseInt(req.params.agentId, 10)
  if (isNaN(agentId)) {
    res.status(400).json({ error: 'Invalid agentId' })
    return
  }

  const pool = getPool()
  await pool.query(
    `DELETE FROM chat_messages WHERE tenant_id = $1 AND agent_id = $2`,
    [req.tenant!.id, agentId]
  )
  res.json({ cleared: true, agent_id: agentId })
})

export default router
