// ---------------------------------------------------------------------------
// AgentX Gateway — A2A Task Results API
// ---------------------------------------------------------------------------
// GET  /api/v1/a2a/pending-tasks?agentId=X     → tasks ready for agent to complete
// GET  /api/v1/a2a/task-result/:taskId          → single task LLM result
// GET  /api/v1/a2a/worker-status                 → A2A worker health
// ---------------------------------------------------------------------------

import { Router, Request, Response } from 'express'
import { getPool } from '../lib/db'
import { getWorkerStatus } from '../services/a2a-worker'

const router = Router()

// ── List pending task results for an agent ─────────────────────────────────

router.get('/pending-tasks', async (req: Request, res: Response) => {
  try {
    const agentId = parseInt(req.query.agentId as string)
    if (!agentId || isNaN(agentId)) {
      res.status(400).json({ error: 'agentId query parameter required' })
      return
    }

    const pool = getPool()
    const { rows } = await pool.query(
      `SELECT task_id, agent_id, task_type, input_data, output_data, status,
              llm_model, tokens_used, processed_at, created_at
       FROM a2a_task_results
       WHERE agent_id = $1 AND status = 2
       ORDER BY created_at DESC
       LIMIT 50`,
      [agentId]
    )

    res.json({ tasks: rows, total: rows.length, agentId })
  } catch (err: any) {
    console.error('[a2a] pending-tasks error:', err.message)
    res.status(500).json({ error: 'Failed to fetch pending tasks' })
  }
})

// ── Single task result ─────────────────────────────────────────────────────

router.get('/task-result/:taskId', async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.taskId)
    if (!taskId || isNaN(taskId)) {
      res.status(400).json({ error: 'Invalid taskId' })
      return
    }

    const pool = getPool()
    const { rows } = await pool.query(
      `SELECT * FROM a2a_task_results WHERE task_id = $1`,
      [taskId]
    )

    if (rows.length === 0) {
      res.status(404).json({ error: 'Task result not found', taskId })
      return
    }

    res.json(rows[0])
  } catch (err: any) {
    console.error('[a2a] task-result error:', err.message)
    res.status(500).json({ error: 'Failed to fetch task result' })
  }
})

// ── Worker status ──────────────────────────────────────────────────────────

router.get('/worker-status', async (_req: Request, res: Response) => {
  try {
    const status = getWorkerStatus()
    const pool = getPool()
    const { rows: stats } = await pool.query(
      `SELECT status, COUNT(*) as count
       FROM a2a_task_results
       GROUP BY status`
    )
    const counts: Record<string, number> = { pending: 0, processing: 0, completed: 0, failed: 0 }
    for (const r of stats) {
      if (r.status === 0) counts.pending = Number(r.count)
      else if (r.status === 1) counts.processing = Number(r.count)
      else if (r.status === 2) counts.completed = Number(r.count)
      else if (r.status === 3) counts.failed = Number(r.count)
    }

    res.json({ ...status, taskCounts: counts })
  } catch (err: any) {
    console.error('[a2a] worker-status error:', err.message)
    res.status(500).json({ error: 'Failed to fetch worker status' })
  }
})

export default router
