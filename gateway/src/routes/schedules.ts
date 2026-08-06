// ---------------------------------------------------------------------------
// AgentX Gateway — User Scheduled Tasks (R10)
// ---------------------------------------------------------------------------
//   POST   /api/v1/schedules               — create a one_time / interval schedule
//   GET    /api/v1/schedules               — list own schedules (excl. soft-deleted)
//   PATCH  /api/v1/schedules/:id           — enable/disable or edit timing
//   DELETE /api/v1/schedules/:id           — soft delete (history kept)
//   GET    /api/v1/schedules/:id/runs      — trigger history
// Mounted under the JWT-protected /api/v1 router (authMiddleware).
// ---------------------------------------------------------------------------

import { Router, type Request, type Response as ExpressResponse } from 'express'
import { getPool } from '../lib/db'

const router = Router()

const MAX_SCHEDULES_PER_TENANT = 10
const MIN_INTERVAL_SECONDS = 60

// R14: B-end integration keys (kind='partner') are limited to the chat service.
// Scheduled tasks would consume platform LLM budget via a2a-worker fallback keys.
router.use((req: Request, res: ExpressResponse, next: () => void): void => {
  if (req.tenant?.kind === 'partner') {
    res.status(403).json({
      error: 'B-end integration keys are limited to the chat service',
      code: 'PARTNER_TASKS_DISABLED',
    })
    return
  }
  next()
})

// POST /api/v1/schedules — create
router.post('/', async (req: Request, res: ExpressResponse) => {
  try {
    const tenant = req.tenant?.walletAddress
    if (!tenant) {
      res.status(401).json({ error: 'Authenticated tenant is required' })
      return
    }
    const { agentId, title, message, scheduleType, runAt, intervalSeconds, timezone } = req.body || {}
    if (typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ error: 'message is required' })
      return
    }
    const hasAgent = agentId !== undefined && agentId !== null && agentId !== ''
    if (!hasAgent) {
      res.status(400).json({ error: 'agentId is required for scheduled tasks' })
      return
    }
    if (scheduleType !== 'one_time' && scheduleType !== 'interval') {
      res.status(400).json({ error: 'scheduleType must be "one_time" or "interval"' })
      return
    }

    let runAtDate: Date | null = null
    let interval: number | null = null
    let nextRun: Date | null = null
    if (scheduleType === 'one_time') {
      if (!runAt) {
        res.status(400).json({ error: 'runAt is required for one_time schedules' })
        return
      }
      runAtDate = new Date(runAt)
      if (Number.isNaN(runAtDate.getTime())) {
        res.status(400).json({ error: 'runAt is not a valid date' })
        return
      }
      nextRun = runAtDate
    } else {
      interval = Number(intervalSeconds)
      if (!Number.isInteger(interval) || interval < MIN_INTERVAL_SECONDS) {
        res.status(400).json({ error: `intervalSeconds must be an integer >= ${MIN_INTERVAL_SECONDS}` })
        return
      }
      nextRun = new Date(Date.now() + interval * 1000)
    }

    const pool = getPool()
    const count = await pool.query(
      `SELECT COUNT(*) AS n FROM schedules WHERE tenant = $1 AND deleted_at IS NULL`,
      [tenant],
    )
    if (Number(count.rows[0].n) >= MAX_SCHEDULES_PER_TENANT) {
      res.status(429).json({ error: `Schedule limit reached (max ${MAX_SCHEDULES_PER_TENANT} per tenant)` })
      return
    }

    const result = await pool.query(
      `INSERT INTO schedules
         (tenant, agent_id, title, message, schedule_type, run_at, interval_seconds, timezone, next_run_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, tenant, agent_id, title, message, schedule_type, run_at, interval_seconds,
                 timezone, enabled, next_run_at, created_at`,
      [tenant, Number(agentId), title || null, message.trim(), scheduleType, runAtDate, interval, timezone || 'UTC', nextRun],
    )
    res.status(201).json({ schedule: result.rows[0] })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
})

// GET /api/v1/schedules — list own (with latest run info)
router.get('/', async (req: Request, res: ExpressResponse) => {
  try {
    const tenant = req.tenant?.walletAddress
    if (!tenant) {
      res.status(401).json({ error: 'Authenticated tenant is required' })
      return
    }
    const pool = getPool()
    const { rows } = await pool.query(
      `SELECT s.id, s.tenant, s.agent_id, s.title, s.message, s.schedule_type,
              s.run_at, s.interval_seconds, s.timezone, s.enabled, s.next_run_at, s.created_at,
              (SELECT COUNT(*) FROM schedule_runs r WHERE r.schedule_id = s.id) AS run_count,
              (SELECT COUNT(*) FROM schedule_runs r WHERE r.schedule_id = s.id AND r.status = 'failed') AS failed_count
       FROM schedules s
       WHERE s.tenant = $1 AND s.deleted_at IS NULL
       ORDER BY s.created_at DESC`,
      [tenant],
    )
    res.json({ schedules: rows })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// PATCH /api/v1/schedules/:id — enable/disable or edit timing
router.patch('/:id', async (req: Request, res: ExpressResponse) => {
  try {
    const tenant = req.tenant?.walletAddress
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid schedule id' })
      return
    }
    const { enabled, title, runAt, intervalSeconds, timezone } = req.body || {}
    const pool = getPool()

    const existing = await pool.query(
      `SELECT * FROM schedules WHERE id = $1 AND tenant = $2 AND deleted_at IS NULL`,
      [id, tenant],
    )
    if (existing.rowCount === 0) {
      res.status(404).json({ error: 'Schedule not found' })
      return
    }
    const s = existing.rows[0]

    // Compute new next_run_at based on the pending changes.
    let nextRun: Date | null = s.next_run_at
    if (s.schedule_type === 'one_time') {
      if (runAt !== undefined) {
        const d = new Date(runAt)
        if (Number.isNaN(d.getTime())) {
          res.status(400).json({ error: 'runAt is not a valid date' })
          return
        }
        nextRun = d
      }
    } else if (s.schedule_type === 'interval') {
      if (intervalSeconds !== undefined) {
        const iv = Number(intervalSeconds)
        if (!Number.isInteger(iv) || iv < MIN_INTERVAL_SECONDS) {
          res.status(400).json({ error: `intervalSeconds must be an integer >= ${MIN_INTERVAL_SECONDS}` })
          return
        }
        nextRun = new Date(Date.now() + iv * 1000)
      }
    }
    // Re-enabling reschedules if next_run_at is already past.
    const finalEnabled = enabled !== undefined ? Boolean(enabled) : s.enabled
    if (finalEnabled && nextRun && nextRun.getTime() <= Date.now() && s.schedule_type === 'interval') {
      nextRun = new Date(Date.now() + (s.interval_seconds ?? 60) * 1000)
    }

    const result = await pool.query(
      `UPDATE schedules SET
         enabled = COALESCE($3, enabled),
         title = COALESCE($4, title),
         run_at = CASE WHEN $5::timestamptz IS NOT NULL THEN $5::timestamptz ELSE run_at END,
         interval_seconds = COALESCE($6, interval_seconds),
         timezone = COALESCE($7, timezone),
         next_run_at = CASE WHEN $8::timestamptz IS NOT NULL THEN $8::timestamptz ELSE next_run_at END,
         updated_at = NOW()
       WHERE id = $1 AND tenant = $2
       RETURNING id, tenant, agent_id, title, message, schedule_type, run_at, interval_seconds,
                 timezone, enabled, next_run_at, created_at`,
      [id, tenant, finalEnabled, title ?? null, runAt !== undefined ? new Date(runAt) : null,
       intervalSeconds !== undefined ? Number(intervalSeconds) : null, timezone ?? null, nextRun],
    )
    res.json({ schedule: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// DELETE /api/v1/schedules/:id — soft delete (runs history preserved)
router.delete('/:id', async (req: Request, res: ExpressResponse) => {
  try {
    const tenant = req.tenant?.walletAddress
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid schedule id' })
      return
    }
    const pool = getPool()
    const result = await pool.query(
      `UPDATE schedules SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND tenant = $2 AND deleted_at IS NULL
       RETURNING id`,
      [id, tenant],
    )
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Schedule not found' })
      return
    }
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// GET /api/v1/schedules/:id/runs — trigger history
router.get('/:id/runs', async (req: Request, res: ExpressResponse) => {
  try {
    const tenant = req.tenant?.walletAddress
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid schedule id' })
      return
    }
    const pool = getPool()
    const { rows } = await pool.query(
      `SELECT id, schedule_id, task_id, status, error, triggered_at
       FROM schedule_runs
       WHERE schedule_id = $1
         AND schedule_id IN (SELECT id FROM schedules WHERE tenant = $2)
       ORDER BY triggered_at DESC
       LIMIT 100`,
      [id, tenant],
    )
    res.json({ runs: rows })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

export default router
