// AgentX Conversation Service — Task Manager
// Async task execution with persistence, concurrency control, and SSE events.
// Mirrors DeerFlow's Run model: POST returns a taskId immediately, execution runs
// in the background (queued → running → done/error/cancelled), and every SSE event
// is persisted to chat_task_events so a client can replay a task after disconnect.

import { EventEmitter } from 'events'
import type { Pool } from 'pg'
import { v4 as uuidv4 } from 'uuid'
import { AgentRunnerService, type AgentRunRequest } from './agent-runner'
import { config } from '../config'
import { decryptSecret } from '../lib/crypto'

export interface TaskCreateInput {
  sessionId: string
  tenant: string
  agentId?: number
  message: string
  enableMemory?: boolean
  history?: { role: 'user' | 'assistant'; content: string }[]
  endUserId?: string
  prompt?: string
  skills?: unknown[]
  /** Stateless BYOK key, already AES-encrypted at rest by the caller */
  llmApiKeyEnc?: string
  llmEndpoint?: string
  llmModel?: string
}

export interface TaskRecord {
  id: string
  sessionId: string
  tenant: string
  agentId: number | null
  endUserId: string
  message: string
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled'
  enableMemory: boolean
  history: { role: 'user' | 'assistant'; content: string }[]
  prompt: string | null
  skills: unknown[] | null
  llmApiKeyEnc: string | null
  llmEndpoint: string | null
  llmModel: string | null
  result: string | null
  error: string | null
  usage: unknown
  iterations: number | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export interface TaskEvent {
  seq: number
  type: string
  payload: unknown
}

interface TaskRow {
  id: string
  session_id: string
  tenant: string
  agent_id: number | null
  end_user_id: string
  message: string
  status: TaskRecord['status']
  enable_memory: boolean
  history: string
  prompt: string | null
  skills: string | null
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

function rowToTask(row: TaskRow): TaskRecord {
  // pg auto-parses jsonb columns into JS values — only stringify-parse when raw
  const parseJson = <T,>(raw: unknown, fallback: T): T =>
    typeof raw === 'string' ? JSON.parse(raw) as T : ((raw ?? fallback) as T)
  return {
    id: row.id,
    sessionId: row.session_id,
    tenant: row.tenant,
    agentId: row.agent_id,
    endUserId: row.end_user_id,
    message: row.message,
    status: row.status,
    enableMemory: row.enable_memory,
    history: parseJson<{ role: 'user' | 'assistant'; content: string }[]>(row.history, []),
    prompt: row.prompt,
    skills: parseJson<unknown[] | null>(row.skills, null),
    llmApiKeyEnc: row.llm_api_key_enc,
    llmEndpoint: row.llm_endpoint,
    llmModel: row.llm_model,
    result: row.result,
    error: row.error,
    usage: row.usage,
    iterations: row.iterations,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }
}

export class TaskManager {
  private readonly controllers = new Map<string, AbortController>()
  private readonly reasons = new Map<string, 'cancel' | 'timeout'>()
  private readonly emitters = new Map<string, EventEmitter>()
  private readonly running = new Set<string>()
  private readonly queue: string[] = []

  constructor(
    private readonly db: Pool,
    private readonly runner: AgentRunnerService,
    private readonly maxConcurrent: number = config.taskMaxConcurrent,
    private readonly timeoutMs: number = config.taskTimeoutMs,
  ) {}

  /** Create a task and return immediately — execution is queued in the background. */
  async createTask(input: TaskCreateInput): Promise<TaskRecord> {
    const taskId = uuidv4()
    await this.db.query(
      `INSERT INTO chat_tasks
        (id, session_id, tenant, agent_id, end_user_id, message, enable_memory, history, prompt, skills, llm_api_key_enc, llm_endpoint, llm_model, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'queued')`,
      [
        taskId,
        input.sessionId,
        input.tenant,
        input.agentId ?? null,
        input.endUserId ?? 'default',
        input.message,
        Boolean(input.enableMemory),
        JSON.stringify(input.history ?? []),
        input.prompt ?? null,
        input.skills ? JSON.stringify(input.skills) : null,
        input.llmApiKeyEnc ?? null,
        input.llmEndpoint ?? null,
        input.llmModel ?? null,
      ],
    )
    this.queue.push(taskId)
    this.pump()
    const task = await this.getTask(taskId)
    if (!task) throw new Error('Task creation failed')
    return task
  }

  async getTask(taskId: string): Promise<TaskRecord | null> {
    const { rows } = await this.db.query('SELECT * FROM chat_tasks WHERE id = $1', [taskId])
    return rows.length ? rowToTask(rows[0]) : null
  }

  async listTasks(sessionId: string): Promise<TaskRecord[]> {
    const { rows } = await this.db.query(
      'SELECT * FROM chat_tasks WHERE session_id = $1 ORDER BY created_at ASC',
      [sessionId],
    )
    return rows.map(rowToTask)
  }

  /** Persisted events of a task (for SSE replay after disconnect). */
  async listEvents(taskId: string): Promise<TaskEvent[]> {
    const { rows } = await this.db.query(
      'SELECT seq, type, payload FROM chat_task_events WHERE task_id = $1 ORDER BY seq ASC',
      [taskId],
    )
    return rows.map((r) => ({ seq: r.seq, type: r.type, payload: r.payload }))
  }

  /** Live event emitter for a task. Emits { seq, type, payload }. */
  subscribe(taskId: string): EventEmitter {
    let emitter = this.emitters.get(taskId)
    if (!emitter) {
      emitter = new EventEmitter()
      this.emitters.set(taskId, emitter)
    }
    return emitter
  }

  /** Cancel a queued/running task (aborts the underlying AgentLoop). */
  async cancelTask(taskId: string): Promise<TaskRecord | null> {
    const controller = this.controllers.get(taskId)
    if (controller) {
      this.reasons.set(taskId, 'cancel')
      controller.abort()
    }
    // Queued-but-not-started tasks get cancelled directly
    const { rows } = await this.db.query(
      `UPDATE chat_tasks SET status = 'cancelled', finished_at = NOW()
        WHERE id = $1 AND status IN ('queued', 'running')
        RETURNING *`,
      [taskId],
    )
    if (rows.length) return rowToTask(rows[0])
    return this.getTask(taskId)
  }

  /** Drain the queue respecting the concurrency limit. */
  private pump(): void {
    while (this.running.size < this.maxConcurrent && this.queue.length > 0) {
      const taskId = this.queue.shift()!
      this.running.add(taskId)
      void this.execute(taskId)
    }
  }

  private async execute(taskId: string): Promise<void> {
    try {
      await this.run(taskId)
    } catch (err) {
      console.error(`[TaskManager] Task ${taskId} crashed:`, (err as Error).message)
      try {
        await this.db.query(
          `UPDATE chat_tasks SET status = 'error', error = $2, finished_at = NOW() WHERE id = $1`,
          [taskId, (err as Error).message],
        )
      } catch {}
    } finally {
      this.running.delete(taskId)
      this.controllers.delete(taskId)
      this.reasons.delete(taskId)
      this.emitters.delete(taskId)
      this.pump()
    }
  }

  private async run(taskId: string): Promise<void> {
    const { rows } = await this.db.query('SELECT * FROM chat_tasks WHERE id = $1', [taskId])
    if (rows.length === 0) return
    const task = rowToTask(rows[0])

    // Cancelled while queued
    if (task.status !== 'queued') return

    await this.db.query(
      `UPDATE chat_tasks SET status = 'running', started_at = NOW() WHERE id = $1`,
      [taskId],
    )

    // Reconstruct the run request (BYOK key decrypted from encrypted at-rest storage)
    let headerApiKey: string | undefined
    if (task.llmApiKeyEnc) {
      try {
        headerApiKey = decryptSecret(task.llmApiKeyEnc)
      } catch (err) {
        await this.db.query(
          `UPDATE chat_tasks SET status = 'error', error = $2, finished_at = NOW() WHERE id = $1`,
          [taskId, `Failed to decrypt task LLM key: ${(err as Error).message}`],
        )
        return
      }
    }

    const request: AgentRunRequest = {
      agentId: task.agentId ?? undefined,
      message: task.message,
      tenantAddress: task.tenant,
      enableMemory: task.enableMemory,
      history: task.history,
      endUserId: task.endUserId,
      prompt: task.prompt ?? undefined,
      skills: (task.skills as AgentRunRequest['skills']) ?? undefined,
      headerApiKey,
      llmEndpoint: task.llmApiKeyEnc ? (task.llmEndpoint ?? undefined) : undefined,
      llmModel: task.llmApiKeyEnc ? (task.llmModel ?? undefined) : undefined,
    }

    const controller = new AbortController()
    this.controllers.set(taskId, controller)
    const timer = setTimeout(() => {
      this.reasons.set(taskId, 'timeout')
      controller.abort()
    }, this.timeoutMs)

    const emitter = this.subscribe(taskId)
    let seq = 0
    let finalText = ''
    let errorMsg: string | null = null
    let usage: unknown = null
    let iterations: number | null = null
    let llmSource: 'byok' | 'platform' | null = null
    let model: string | null = null
    let toolCalls = 0

    try {
      for await (const event of this.runner.streamRun(request, { signal: controller.signal })) {
        if (controller.signal.aborted) break
        if (event.type === 'text') finalText += event.content ?? ''
        if (event.type === 'error') errorMsg = event.error ?? 'Run failed'
        if (event.type === 'done') {
          usage = event.usage ?? null
          iterations = event.iterations ?? null
          llmSource = event.llmSource ?? null
          model = event.model ?? null
          toolCalls = event.toolCalls ?? 0
        }
        seq += 1
        const record: TaskEvent = { seq, type: event.type, payload: event }
        try {
          await this.db.query(
            'INSERT INTO chat_task_events (task_id, seq, type, payload) VALUES ($1,$2,$3,$4)',
            [taskId, seq, event.type, JSON.stringify(event)],
          )
        } catch {}
        emitter.emit('event', record)
      }
    } finally {
      clearTimeout(timer)
    }

    // Final status
    const aborted = controller.signal.aborted
    const reason = this.reasons.get(taskId)
    const status = aborted
      ? reason === 'timeout'
        ? 'error'
        : 'cancelled'
      : errorMsg
        ? 'error'
        : 'done'
    const finalError = aborted
      ? reason === 'timeout'
        ? `Task timed out after ${Math.round(this.timeoutMs / 1000)}s`
        : 'Task cancelled'
      : errorMsg

    await this.db.query(
      `UPDATE chat_tasks
         SET status = $2, result = $3, error = $4, usage = $5, iterations = $6, finished_at = NOW()
        WHERE id = $1`,
      [taskId, status, finalText || null, finalError, usage ? JSON.stringify(usage) : null, iterations],
    )

    emitter.emit('event', {
      seq: seq + 1,
      type: 'task_status',
      payload: { taskId, status, error: finalError },
    })

    // Report platform-mode usage to the Gateway for quota metering (idempotent
    // on the gateway side) — covers tasks that complete with no SSE subscriber.
    this.reportBilling(taskId, task.tenant, usage, llmSource, model, task.agentId, toolCalls)
  }

  /**
   * Fire-and-forget callback to the Gateway's internal task-billing endpoint.
   * Only platform-mode usage is metered (BYOK bills on the caller's own key);
   * failures are logged, never block task completion.
   */
  private async reportBilling(
    taskId: string,
    tenantAddress: string,
    usage: unknown,
    llmSource: 'byok' | 'platform' | null,
    model: string | null,
    agentId: number | null,
    toolCalls: number,
  ): Promise<void> {
    if (llmSource !== 'platform' || !config.gatewayUrl || !config.orchestrateToken) return
    const u = (usage && typeof usage === 'object' ? usage : {}) as {
      promptTokens?: unknown
      completionTokens?: unknown
      totalTokens?: unknown
    }
    const totalTokens = Number(u.totalTokens ?? 0)
    if (!Number.isFinite(totalTokens) || totalTokens <= 0) return
    try {
      await fetch(`${config.gatewayUrl}/api/v1/internal/task-billing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Orchestrate-Token': config.orchestrateToken,
        },
        body: JSON.stringify({
          taskId,
          tenantAddress,
          totalTokens,
          promptTokens: Number(u.promptTokens ?? 0),
          completionTokens: Number(u.completionTokens ?? 0),
          llmSource,
          model: model || undefined,
          agentId: agentId ?? undefined,
          toolCalls,
        }),
        signal: AbortSignal.timeout(10_000),
      })
    } catch (err) {
      console.warn(`[TaskBilling] callback failed for task ${taskId}:`, (err as Error).message)
    }
  }
}
