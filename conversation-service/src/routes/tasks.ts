// AgentX Conversation Service — Task Routes
// Parallel task management inside a session (DeerFlow Run model):
//   POST   /sessions/:sessionId/tasks   — create a task, returns taskId immediately
//   GET    /sessions/:sessionId/tasks   — list tasks (status/result per task)
//   GET    /tasks/:taskId               — task detail
//   GET    /tasks/:taskId/events        — SSE event stream (replays persisted events)
//   DELETE /tasks/:taskId               — cancel a queued/running task

import { Router, Request, Response } from 'express'
import { TaskManager, type TaskEvent } from '../services/task-manager'
import { config } from '../config'
import { encryptSecret } from '../lib/crypto'

export function createTasksRouter(taskManager: TaskManager): Router {
  const router = Router()

  // Internal auth middleware — X-Internal-Token
  router.use((req, res, next) => {
    const token = req.headers['x-internal-token'] as string
    if (!token || token !== config.internalAuthToken) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    next()
  })

  // POST /sessions/:sessionId/tasks — create a task (executes in the background)
  router.post('/sessions/:sessionId/tasks', async (req: Request, res: Response) => {
    const { sessionId } = req.params
    const tenant = (req.headers['x-tenant-address'] as string) || 'unknown'
    const { agentId, message, enableMemory, history, prompt, skills } = req.body || {}
    const endUserId = (req.headers['x-end-user-id'] as string) || undefined
    const headerApiKey = (req.headers['x-llm-api-key'] as string) || undefined
    const llmEndpoint = (req.headers['x-llm-endpoint'] as string) || undefined
    const llmModel = (req.headers['x-llm-model'] as string) || undefined

    if (!message) {
      return res.status(400).json({ error: 'message is required' })
    }
    const hasAgentId = agentId !== undefined && agentId !== null && agentId !== ''
    const hasInline = typeof prompt === 'string' || (Array.isArray(skills) && skills.length > 0)
    if (!hasAgentId && !hasInline) {
      return res.status(400).json({ error: 'agentId or inline prompt/skills is required' })
    }

    try {
      const task = await taskManager.createTask({
        sessionId,
        tenant,
        agentId: hasAgentId ? Number(agentId) : undefined,
        message: String(message),
        enableMemory: Boolean(enableMemory),
        history: history || [],
        endUserId,
        prompt: typeof prompt === 'string' ? prompt : undefined,
        skills,
        // Stateless BYOK key is encrypted at rest so the background executor can use it
        llmApiKeyEnc: headerApiKey ? encryptSecret(headerApiKey) : undefined,
        llmEndpoint,
        llmModel,
      })
      return res.status(201).json(task)
    } catch (err) {
      console.error('[Task] create failed:', (err as Error).message)
      return res.status(500).json({ error: 'Failed to create task' })
    }
  })

  // GET /sessions/:sessionId/tasks — list tasks in a session (ascending creation order)
  router.get('/sessions/:sessionId/tasks', async (req: Request, res: Response) => {
    try {
      const tasks = await taskManager.listTasks(req.params.sessionId)
      return res.json({ tasks })
    } catch (err) {
      console.error('[Task] list failed:', (err as Error).message)
      return res.status(500).json({ error: 'Failed to list tasks' })
    }
  })

  // GET /tasks/:taskId — task detail
  router.get('/tasks/:taskId', async (req: Request, res: Response) => {
    const task = await taskManager.getTask(req.params.taskId)
    if (!task) return res.status(404).json({ error: 'Task not found' })
    return res.json(task)
  })

  // DELETE /tasks/:taskId — cancel a queued/running task
  router.delete('/tasks/:taskId', async (req: Request, res: Response) => {
    const task = await taskManager.cancelTask(req.params.taskId)
    if (!task) return res.status(404).json({ error: 'Task not found' })
    return res.json(task)
  })

  // GET /tasks/:taskId/events — SSE stream (replay persisted events, then live)
  router.get('/tasks/:taskId/events', async (req: Request, res: Response) => {
    const { taskId } = req.params
    const task = await taskManager.getTask(taskId)
    if (!task) return res.status(404).json({ error: 'Task not found' })

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    res.flushHeaders?.()

    const writeEvent = (e: TaskEvent) => {
      res.write(`data: ${JSON.stringify(e)}\n\n`)
    }

    // 1. Replay persisted events (dedupe by seq against live events below)
    const seen = new Set<number>()
    let terminalReplayed = false
    const persisted = await taskManager.listEvents(taskId)
    for (const e of persisted) {
      seen.add(e.seq)
      writeEvent(e)
    }
    // If the task already finished, close after replay (nothing new will arrive)
    if (task.status === 'done' || task.status === 'error' || task.status === 'cancelled') {
      terminalReplayed = true
    }

    // 2. Subscribe to live events (attach before reading DB to avoid a gap)
    const emitter = taskManager.subscribe(taskId)
    const onEvent = (e: TaskEvent) => {
      if (seen.has(e.seq)) return
      seen.add(e.seq)
      writeEvent(e)
    }
    emitter.on('event', onEvent)

    // 3. Heartbeat keeps proxies from closing idle connections
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 30_000)
    const cleanup = () => {
      clearInterval(heartbeat)
      emitter.removeListener('event', onEvent)
      res.end()
    }
    req.on('close', cleanup)

    // Auto-close shortly after terminal replay so the connection is not leaked
    if (terminalReplayed) {
      setTimeout(() => {
        cleanup()
      }, 500)
    }
  })

  return router
}
