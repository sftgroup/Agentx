// ---------------------------------------------------------------------------
// AgentX Gateway — A2A Task Results API
// ---------------------------------------------------------------------------
// GET   /api/v1/a2a/pending-tasks?agentId=X     → tasks ready for agent to complete
// GET   /api/v1/a2a/task-result/:taskId          → single task LLM result
// GET   /api/v1/a2a/worker-status                 → A2A worker health
// POST  /api/v1/a2a/tasks/:id/resume              → 充值后恢复 awaiting_payment 任务
// ---------------------------------------------------------------------------

import { Router, Request, Response } from 'express'
import { getPool } from '../lib/db'
import { paymentsService } from '../services/payments'
import { getWorkerStatus } from '../services/a2a-worker'
import { emitA2ATaskEvent, subscribeA2ATaskEvents, getA2ATaskEvent } from '../services/a2a-events'

const router = Router()

// ── Resume an awaiting_payment task after top-up ───────────────────────────
// 调用者：payment_payer（X-End-User-Id: 0x…）本人 或 Admin（X-Admin-Key）。
// 流程：校验任务挂起 → 余额足够则 deduct 并写 a2a_pay_log（幂等 ref）→ 状态回
// processing → a2a-worker 下一轮重放任务（canAccessAgentOrPay 命中已付记录放行）。
router.post('/tasks/:id/resume', async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.id)
    if (!taskId || isNaN(taskId)) {
      res.status(400).json({ error: 'Invalid task id' })
      return
    }

    const caller = (String(req.headers['x-end-user-id'] ?? '')).toLowerCase()
    const adminKey = String(req.headers['x-admin-key'] ?? '').replace(/^Bearer\s+/i, '')
    const isAdmin = Boolean(adminKey && process.env.ADMIN_KEY && adminKey === process.env.ADMIN_KEY)

    const pool = getPool()
    const { rows } = await pool.query(
      `SELECT task_id, status, payment_payer, payment_amount_wei, payment_pay_to,
              payment_target_agent_id, payment_ref, error_message
       FROM a2a_task_results WHERE task_id = $1`,
      [taskId]
    )
    if (rows.length === 0) {
      res.status(404).json({ error: 'Task not found', taskId })
      return
    }
    const task = rows[0]
    if (Number(task.status) !== 4) {
      res.status(409).json({ error: `Task is not awaiting payment (status=${task.status})`, taskId })
      return
    }
    if (!isAdmin && (!task.payment_payer || caller !== String(task.payment_payer).toLowerCase())) {
      res.status(403).json({ error: 'Only the task payer or an admin can resume this task', taskId })
      return
    }

    const payer = String(task.payment_payer).toLowerCase()
    const amountWei = BigInt(task.payment_amount_wei || '0')
    const balance = await paymentsService.balanceOf(payer)
    if (balance < amountWei) {
      res.status(402).json({
        error: 'Insufficient x402 balance — top up first',
        payment: { payTo: task.payment_pay_to ?? '', priceWei: amountWei.toString(), balance: balance.toString() },
      })
      return
    }

    const deducted = await paymentsService.deduct(payer, amountWei)
    if (!deducted) {
      res.status(402).json({ error: 'Insufficient x402 balance — top up first', payment: { payTo: task.payment_pay_to ?? '', priceWei: amountWei.toString() } })
      return
    }

    // 幂等审计：与委派扣费同一 ref（task:<rootTaskId>），重放时 canAccessAgentOrPay 命中已付记录放行。
    if (task.payment_ref && task.payment_target_agent_id) {
      await pool.query(
        `INSERT INTO a2a_pay_log (payer, agent_id, amount_wei, ref_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (payer, agent_id, ref_id) DO NOTHING`,
        [payer, Number(task.payment_target_agent_id), amountWei.toString(), String(task.payment_ref)]
      )
    }

    // 恢复处理：清 payment 字段（保留 payment_ref 供幂等），worker 下轮重放。
    await pool.query(
      `UPDATE a2a_task_results SET status = 1, error_message = NULL,
         payment_payer = NULL, payment_amount_wei = NULL, payment_pay_to = NULL,
         payment_target_agent_id = NULL, payment_pending_since = NULL
       WHERE task_id = $1`,
      [taskId]
    )
    emitA2ATaskEvent({ type: 'status', taskId, status: 1, ts: Date.now() })

    console.log(`[a2a] resume task #${taskId}: deducted ${amountWei.toString()} wei from ${payer}`)
    res.json({ resumed: true, taskId, deductedWei: amountWei.toString() })
  } catch (err: any) {
    console.error('[a2a] resume error:', err.message)
    res.status(500).json({ error: 'Failed to resume task' })
  }
})

// ── SSE: task status event stream ──────────────────────────────────────────
// GET /api/v1/a2a/tasks/:id/events — replays the current DB status (if any)
// then streams live status transitions (awaiting_payment / completed / failed
// / resumed) emitted by the a2a-worker. Heartbeat every 15s keeps proxies
// from dropping the idle connection.
router.get('/tasks/:id/events', async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.id)
    if (!taskId || isNaN(taskId)) {
      res.status(400).json({ error: 'Invalid task id' })
      return
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    // Replay the current DB state so late subscribers always get a snapshot.
    try {
      const pool = getPool()
      const { rows } = await pool.query(
        `SELECT task_id, status, output_data, error_message,
                payment_payer, payment_amount_wei, payment_pay_to,
                payment_target_agent_id, payment_ref
         FROM a2a_task_results WHERE task_id = $1`,
        [taskId]
      )
      if (rows.length > 0) {
        const r = rows[0]
        const ev = {
          type: 'status' as const,
          taskId,
          status: Number(r.status),
          outputData: r.output_data ?? undefined,
          errorMessage: r.error_message ?? undefined,
          payment: Number(r.status) === 4 ? {
            payer: String(r.payment_payer ?? ''), payTo: String(r.payment_pay_to ?? ''),
            priceWei: String(r.payment_amount_wei ?? ''), targetAgentId: Number(r.payment_target_agent_id ?? 0),
            ref: String(r.payment_ref ?? ''),
          } : undefined,
          ts: Date.now(),
        }
        res.write(`data: ${JSON.stringify(ev)}\n\n`)
      }
    } catch (e: any) {
      console.warn('[a2a] SSE replay error:', e.message)
    }

    // Fall back to the in-memory latest event if the row is gone (e.g. replay).
    if (!res.writableEnded) {
      const cached = getA2ATaskEvent(taskId)
      if (cached) res.write(`data: ${JSON.stringify(cached)}\n\n`)
    }

    const unsubscribe = subscribeA2ATaskEvents(ev => {
      if (ev.taskId === taskId) res.write(`data: ${JSON.stringify(ev)}\n\n`)
    })
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000)

    req.on('close', () => { clearInterval(heartbeat); unsubscribe() })
  } catch (err: any) {
    console.error('[a2a] SSE error:', err.message)
    if (!res.headersSent) res.status(500).json({ error: 'Failed to open task event stream' })
  }
})

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
    const counts: Record<string, number> = { pending: 0, processing: 0, completed: 0, failed: 0, awaiting_payment: 0 }
    for (const r of stats) {
      if (r.status === 0) counts.pending = Number(r.count)
      else if (r.status === 1) counts.processing = Number(r.count)
      else if (r.status === 2) counts.completed = Number(r.count)
      else if (r.status === 3) counts.failed = Number(r.count)
      else if (r.status === 4) counts.awaiting_payment = Number(r.count)
    }

    res.json({ ...status, taskCounts: counts })
  } catch (err: any) {
    console.error('[a2a] worker-status error:', err.message)
    res.status(500).json({ error: 'Failed to fetch worker status' })
  }
})

export default router
