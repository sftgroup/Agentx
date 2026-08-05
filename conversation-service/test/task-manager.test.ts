// AgentX Conversation Service — TaskManager unit tests.
// Covers the P8 parallel-task engine:
//   rowToTask JSONB type-aware parsing (pg auto-parsed vs raw strings),
//   createTask insert + immediate return, run state machine (done/error/cancelled),
//   cancel contract, persisted event replay, concurrency limit.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Pool } from 'pg'
import { TaskManager, type TaskRecord } from '../src/services/task-manager'
import type { AgentRunnerService } from '../src/services/agent-runner'

interface TaskRow {
  id: string
  session_id: string
  tenant: string
  agent_id: number | null
  end_user_id: string
  message: string
  status: TaskRecord['status']
  enable_memory: boolean
  history: unknown
  prompt: string | null
  skills: unknown
  llm_api_key_enc: string | null
  llm_endpoint: string | null
  llm_model: string | null
  result: string | null
  error: string | null
  usage: unknown
  iterations: number | null
  created_at: string
  started_at: string | null
  finished_at: string | null
}

const rowFor = (id: string, over: Partial<TaskRow> = {}): TaskRow => ({
  id,
  session_id: 's1',
  tenant: '0xTenant',
  agent_id: null,
  end_user_id: 'default',
  message: 'hi',
  status: 'queued',
  enable_memory: false,
  history: JSON.stringify([]),
  prompt: null,
  skills: null,
  llm_api_key_enc: null,
  llm_endpoint: null,
  llm_model: null,
  result: null,
  error: null,
  usage: null,
  iterations: null,
  created_at: new Date().toISOString(),
  started_at: null,
  finished_at: null,
  ...over,
})

interface DbCall { sql: string; params: unknown[] }

function makeDb() {
  const calls: DbCall[] = []
  const rowsById = new Map<string, TaskRow>()
  const db = {
    calls,
    rowsById,
    query: vi.fn(async (sql: string, params: unknown[] = []): Promise<{ rows: unknown[] }> => {
      calls.push({ sql, params })
      if (sql.includes('INSERT INTO chat_tasks')) {
        // params: [id, session_id, tenant, agent_id, end_user_id, message, enable_memory, history, ...]
        const [id, sessionId, tenant, agentId, endUserId, message, enableMemory, history] = params
        rowsById.set(String(id), rowFor(String(id), {
          session_id: String(sessionId),
          tenant: String(tenant),
          agent_id: agentId as number | null,
          end_user_id: String(endUserId),
          message: String(message),
          enable_memory: Boolean(enableMemory),
          history,
        }))
        return { rows: [] }
      }
      if (sql.includes('UPDATE chat_tasks SET status') && sql.includes('RETURNING *')) {
        const id = String(params[0])
        const row = rowsById.get(id)
        // only queued/running rows match the cancel predicate — terminal rows fall through to getTask
        if (row && (row.status === 'queued' || row.status === 'running')) {
          row.status = 'cancelled'
          row.finished_at = new Date().toISOString()
          return { rows: [row] }
        }
        return { rows: [] }
      }
      if (sql.includes('FROM chat_tasks WHERE id')) {
        const id = String(params[0])
        const row = rowsById.get(id)
        return { rows: row ? [row] : [] }
      }
      if (sql.includes('FROM chat_tasks WHERE session_id')) {
        return { rows: [...rowsById.values()].filter((r) => r.session_id === String(params[0])) }
      }
      if (sql.includes('FROM chat_task_events')) {
        return { rows: (params[1] as unknown[]) ?? [] }
      }
      if (sql.includes('INSERT INTO chat_task_events')) return { rows: [] }
      if (sql.includes('UPDATE chat_tasks SET status')) return { rows: [] }
      return { rows: [] }
    }),
  }
  return db
}

type RunnerImpl = AgentRunnerService

function makeRunner(events: unknown[] = []): RunnerImpl {
  return {
    streamRun: vi.fn(async function* (_req: unknown, opts?: { signal?: AbortSignal }) {
      for (const e of events) {
        if (opts?.signal?.aborted) return
        yield e
      }
    }) as unknown as RunnerImpl['streamRun'],
  } as RunnerImpl
}

/** Final status UPDATE call: `SET status = $2, result = $3, error = $4 ...` */
const finalUpdate = (db: { calls: DbCall[] }) =>
  db.calls.find((c) => c.sql.includes('SET status = $2, result = $3, error = $4'))

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('TaskManager — parallel tasks (P8)', () => {
  let db: ReturnType<typeof makeDb>
  let runner: RunnerImpl
  let manager: TaskManager

  beforeEach(() => {
    db = makeDb()
    runner = makeRunner()
    manager = new TaskManager(db as unknown as Pool, runner, 2, 1000)
  })

  describe('rowToTask JSONB parsing', () => {
    it('parses string-encoded history/skills (raw pg text) and leaves parsed objects intact', async () => {
      const raw = rowFor('raw1', { history: '[{"role":"user","content":"a"}]', skills: '[{"name":"s"}]' })
      const parsed = rowFor('parsed1', { history: [{ role: 'user', content: 'b' }], skills: [{ name: 't' }] })
      db.rowsById.set('raw1', raw)
      db.rowsById.set('parsed1', parsed)

      const a = await manager.getTask('raw1')
      const b = await manager.getTask('parsed1')
      expect(a!.history).toEqual([{ role: 'user', content: 'a' }])
      expect(a!.skills).toEqual([{ name: 's' }])
      // pg already-parsed JSONB values pass through untouched (no double-parse crash)
      expect(b!.history).toEqual([{ role: 'user', content: 'b' }])
      expect(b!.skills).toEqual([{ name: 't' }])
    })

    it('falls back to [] / null for missing history/skills', async () => {
      db.rowsById.set('n', rowFor('n', { history: null, skills: null }))
      const task = await manager.getTask('n')
      expect(task!.history).toEqual([])
      expect(task!.skills).toBeNull()
    })
  })

  describe('createTask', () => {
    it('inserts a queued task and returns it immediately', async () => {
      const task = await manager.createTask({
        sessionId: 's1',
        tenant: '0xTenant',
        agentId: 7,
        message: 'run me',
        enableMemory: true,
        history: [{ role: 'user', content: 'x' }],
        endUserId: 'u-9',
        prompt: 'sys',
      })
      expect(task.id).toBeTruthy()
      expect(task.status).toBe('queued')
      expect(task.sessionId).toBe('s1')
      expect(task.agentId).toBe(7)
      expect(task.enableMemory).toBe(true)

      const insert = db.calls.find((c) => c.sql.startsWith('INSERT INTO chat_tasks'))!
      expect(insert.params[1]).toBe('s1')            // session_id
      expect(insert.params[2]).toBe('0xTenant')      // tenant
      expect(insert.params[3]).toBe(7)               // agent_id
      expect(insert.params[5]).toBe('run me')        // message
      expect(insert.params[6]).toBe(true)            // enable_memory
      expect(JSON.parse(insert.params[7] as string)).toEqual([{ role: 'user', content: 'x' }])
      expect(insert.params[8]).toBe('sys')           // prompt
    })
  })

  describe('run state machine', () => {
    it('completes a task (done) and persists each event', async () => {
      runner = makeRunner([
        { type: 'text', content: 'A' },
        { type: 'text', content: 'B' },
        { type: 'done', usage: { totalTokens: 10 }, iterations: 3 },
      ])
      manager = new TaskManager(db as unknown as Pool, runner, 2, 1000)
      const task = await manager.createTask({ sessionId: 's1', tenant: '0xTenant', message: 'go' })

      await vi.waitFor(() => {
        const up = finalUpdate(db)
        expect(up).toBeTruthy()
        expect(up!.params[1]).toBe('done')
      })
      const up = finalUpdate(db)!
      expect(up.params[2]).toBe('AB')                              // result = concatenated text
      expect(up.params[3]).toBeNull()                              // no error
      expect(JSON.parse(up.params[4] as string)).toEqual({ totalTokens: 10 })
      expect(up.params[5]).toBe(3)                                 // iterations

      const eventInserts = db.calls.filter((c) => c.sql.startsWith('INSERT INTO chat_task_events'))
      expect(eventInserts).toHaveLength(3)                         // text, text, done
      expect(JSON.parse(eventInserts[2].params[3] as string).type).toBe('done')

      const events = await manager.listEvents(task.id)
      expect(events).toEqual([])                                   // no persisted rows mocked
    })

    it('marks a task error when the runner emits an error event', async () => {
      runner = makeRunner([{ type: 'error', error: 'boom' }])
      manager = new TaskManager(db as unknown as Pool, runner, 2, 1000)
      await manager.createTask({ sessionId: 's1', tenant: '0xTenant', message: 'go' })

      await vi.waitFor(() => {
        const up = finalUpdate(db)
        expect(up).toBeTruthy()
        expect(up!.params[1]).toBe('error')
      })
      expect(finalUpdate(db)!.params[3]).toBe('boom')
    })

    it('aborts a running task on cancel → status cancelled', async () => {
      let release!: () => void
      const gate = new Promise<void>((r) => { release = r })
      let startedResolve!: () => void
      const started = new Promise<void>((r) => { startedResolve = r })
      runner.streamRun = vi.fn(async function* (_req: unknown, opts?: { signal?: AbortSignal }) {
        startedResolve()
        yield { type: 'text', content: 'partial' }
        await gate
        if (opts?.signal?.aborted) return
        yield { type: 'done' }
      }) as unknown as RunnerImpl['streamRun']
      manager = new TaskManager(db as unknown as Pool, runner, 2, 1000)

      const task = await manager.createTask({ sessionId: 's1', tenant: '0xTenant', message: 'go' })
      await started
      await manager.cancelTask(task.id)
      release()

      await vi.waitFor(() => {
        const up = finalUpdate(db)
        expect(up).toBeTruthy()
        expect(up!.params[1]).toBe('cancelled')
      })
      expect(finalUpdate(db)!.params[3]).toBe('Task cancelled')
    })
  })

  describe('cancel contract', () => {
    it('cancels a queued task directly (no controller) and returns the cancelled row', async () => {
      const task = await manager.createTask({ sessionId: 's1', tenant: '0xTenant', message: 'go' })
      // Force the task to stay queued: no running pump yet in this direct flow
      const cancelled = await manager.cancelTask(task.id)
      expect(cancelled!.status).toBe('cancelled')
      expect(cancelled!.finishedAt).toBeTruthy()
      const update = db.calls.find((c) => c.sql.includes('RETURNING *'))!
      expect(update.sql).toContain("status IN ('queued', 'running')")
    })

    it('returns the current row unchanged when the task is already terminal', async () => {
      db.rowsById.set('done1', rowFor('done1', { status: 'done', result: 'ok', finished_at: new Date().toISOString() }))
      const task = await manager.cancelTask('done1')
      expect(task!.status).toBe('done')
    })
  })

  describe('concurrency limit', () => {
    it('pumps at most maxConcurrent tasks at a time', async () => {
      let release!: () => void
      const gate = new Promise<void>((r) => { release = r })
      let startedResolve!: () => void
      const started = new Promise<void>((r) => { startedResolve = r })
      runner.streamRun = vi.fn(async function* (_req: unknown) {
        startedResolve()
        yield { type: 'text', content: 'x' }
        await gate
      }) as unknown as RunnerImpl['streamRun']

      manager = new TaskManager(db as unknown as Pool, runner, 1, 1000)
      await manager.createTask({ sessionId: 's1', tenant: '0xTenant', message: 'first' })
      await started
      await manager.createTask({ sessionId: 's1', tenant: '0xTenant', message: 'second' })
      // Only one runner invocation while the first is still executing
      expect(runner.streamRun).toHaveBeenCalledTimes(1)

      release()
      await vi.waitFor(() => expect(runner.streamRun).toHaveBeenCalledTimes(2))
    })
  })

  describe('task lookup', () => {
    it('getTask returns null for an unknown id', async () => {
      await expect(manager.getTask('nope')).resolves.toBeNull()
    })

    it('listTasks orders by creation', async () => {
      db.rowsById.set('t1', rowFor('t1', { session_id: 's1' }))
      db.rowsById.set('t2', rowFor('t2', { session_id: 's1' }))
      db.rowsById.set('other', rowFor('other', { session_id: 's2' }))
      const tasks = await manager.listTasks('s1')
      expect(tasks.map((t) => t.id)).toEqual(['t1', 't2'])
    })
  })
})
