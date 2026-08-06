// ---------------------------------------------------------------------------
// AgentX Gateway — Schedule Daemon (R10)
// ---------------------------------------------------------------------------
// Polls due `schedules` every 30s and creates a chat task on behalf of the
// owning tenant. Single-flight: each due row is claimed with an optimistic
// lock on next_run_at, so concurrent ticks/instances never double-fire.
// P9 gate is enforced before triggering (mirrors routes/chat-tasks.ts).
// ---------------------------------------------------------------------------

import { getPool } from '../lib/db'
import { getConversationProxy } from './conversation-proxy'

const POLL_INTERVAL_MS = 30_000
const MAX_DUE_PER_TICK = 20

/** Compute the next execution time. one_time schedules never reschedule. */
function nextRunAt(s: { schedule_type: string; interval_seconds: number | null }): Date | null {
  if (s.schedule_type !== 'interval' || !s.interval_seconds) return null
  return new Date(Date.now() + s.interval_seconds * 1000)
}

/**
 * P9 gate — effective = tenant.allow_parallel_tasks ?? plan.features.parallel_tasks ?? true
 * (same precedence as routes/chat-tasks.ts).
 */
async function parallelTasksEnabled(tenantWallet: string): Promise<boolean> {
  const pool = getPool()
  const { rows } = await pool.query(
    `SELECT t.allow_parallel_tasks, p.features
     FROM tenants t
     LEFT JOIN plans p ON p.id = t.plan_id
     WHERE t.wallet_address = $1`,
    [tenantWallet],
  )
  if (rows.length === 0) return true
  const allow = rows[0].allow_parallel_tasks
  const features = rows[0].features ?? null
  const planBit = features && typeof features === 'object'
    ? (features as { parallel_tasks?: unknown }).parallel_tasks
    : undefined
  return allow ?? (typeof planBit === 'boolean' ? planBit : true)
}

async function recordRun(scheduleId: number, taskId: string | null, status: string, error: string | null): Promise<void> {
  const pool = getPool()
  await pool.query(
    `INSERT INTO schedule_runs (schedule_id, task_id, status, error) VALUES ($1, $2, $3, $4)`,
    [scheduleId, taskId, status, error],
  )
}

async function processDue(s: any): Promise<void> {
  const pool = getPool()

  // Single-flight claim: only the tick that wins the UPDATE proceeds.
  const claimed = await pool.query(
    `UPDATE schedules
     SET next_run_at = $2, updated_at = NOW()
     WHERE id = $1 AND next_run_at = $3
     RETURNING id`,
    [s.id, nextRunAt(s), s.next_run_at],
  )
  if (claimed.rowCount === 0) return // already handled elsewhere

  try {
    if (!(await parallelTasksEnabled(s.tenant))) {
      await recordRun(s.id, null, 'failed', 'PARALLEL_TASKS_DISABLED')
      return
    }

    // Stable per-schedule session: the schedule reuses its own dialog,
    // so the resulting task is listable via GET /sessions/sched-{id}/tasks.
    const sessionId = `sched-${s.id}`
    const proxy = getConversationProxy()
    await proxy.createSession({ sessionId, agentId: s.agent_id, title: s.title, tenantAddress: s.tenant })

    const res = await proxy.createTask({
      sessionId,
      tenantAddress: s.tenant,
      agentId: s.agent_id ?? undefined,
      message: s.message,
      endUserId: 'scheduler',
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      await recordRun(s.id, null, 'failed', `HTTP ${res.status}: ${body?.error ?? body?.code ?? 'conversation error'}`)
      return
    }
    await recordRun(s.id, body?.id ?? null, 'triggered', null)
  } catch (err) {
    await recordRun(s.id, null, 'failed', (err as Error).message)
  }
}

async function tick(): Promise<void> {
  const pool = getPool()
  const { rows } = await pool.query(
    `SELECT * FROM schedules
     WHERE enabled = true AND deleted_at IS NULL
       AND next_run_at IS NOT NULL AND next_run_at <= NOW()
     ORDER BY next_run_at
     LIMIT $1`,
    [MAX_DUE_PER_TICK],
  )
  for (const s of rows) {
    await processDue(s)
  }
}

let timer: ReturnType<typeof setInterval> | null = null

export function startScheduleDaemon(): void {
  if (timer) return
  timer = setInterval(() => {
    tick().catch((err) => console.error('[schedule-daemon] tick failed:', (err as Error).message))
  }, POLL_INTERVAL_MS)
  console.log(`[schedule-daemon] started (poll every ${POLL_INTERVAL_MS / 1000}s)`)
}
