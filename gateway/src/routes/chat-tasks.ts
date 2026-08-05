// AgentX Gateway — Chat Sessions & Tasks Route
// Parallel task management inside a dialog (proxied to Conversation Service):
//   POST   /api/v1/sessions                    — create a session
//   POST   /api/v1/sessions/:sessionId/tasks   — create a task (returns taskId immediately)
//   GET    /api/v1/sessions/:sessionId/tasks   — list tasks
//   GET    /api/v1/tasks/:taskId               — task detail
//   GET    /api/v1/tasks/:taskId/events        — SSE event stream
//   DELETE /api/v1/tasks/:taskId               — cancel task

import { Router, type Request, type Response as ExpressResponse } from 'express'
import { getConversationProxy } from '../services/conversation-proxy'
import { getPool } from '../lib/db'
import { decryptApiKey } from '../lib/crypto'
import { config } from '../config'

const router = Router()

/** Resolve stored BYOK (tenantKeyId) → plaintext key/endpoint/model. */
async function resolveStoredKey(
  req: Request,
  tenantKeyId: string | undefined,
): Promise<{ key?: string; endpoint?: string; model?: string }> {
  if (!tenantKeyId || !req.tenant) return {}
  const pool = getPool()
  const { rows } = await pool.query(
    `SELECT * FROM tenant_api_keys WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
    [tenantKeyId, req.tenant.id],
  )
  if (rows.length === 0) {
    const err = new Error('Tenant API key not found or inactive') as Error & { status?: number }
    err.status = 400
    throw err
  }
  const tk = rows[0]
  return { key: decryptApiKey(tk.api_key, config.masterEncryptionKey), endpoint: tk.endpoint, model: tk.model }
}

async function pipeSSE(upstream: globalThis.Response, res: ExpressResponse): Promise<void> {
  if (!upstream.ok) {
    res.status(upstream.status).json({ error: 'Conversation service error' })
    return
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  const reader = upstream.body?.getReader()
  if (!reader) {
    res.end()
    return
  }
  const decoder = new TextDecoder()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(decoder.decode(value, { stream: true }))
    }
  } finally {
    reader.releaseLock()
    res.end()
  }
}

// POST /api/v1/sessions — create a session
router.post('/sessions', async (req: Request, res: ExpressResponse) => {
  try {
    const { sessionId, agentId, endUserId, title } = req.body || {}
    const upstream = await getConversationProxy().createSession({
      sessionId,
      agentId,
      endUserId,
      title,
      tenantAddress: req.tenant?.walletAddress || 'unknown',
    })
    const body = await upstream.json()
    return res.status(upstream.status).json(body)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return res.status((err as Error & { status?: number }).status ?? 500).json({ error: message })
  }
})

// POST /api/v1/sessions/:sessionId/tasks — create a task (executes in background)
router.post('/sessions/:sessionId/tasks', async (req: Request, res: ExpressResponse) => {
  try {
    const { sessionId } = req.params
    const { agentId, message, enableMemory, history, prompt, skills, tenantKeyId } = req.body || {}
    const endUserId = req.headers['x-end-user-id'] as string | undefined

    if (!message) return res.status(400).json({ error: 'message is required' })
    const hasAgentId = agentId !== undefined && agentId !== null && agentId !== ''
    const hasInline = typeof prompt === 'string' || (Array.isArray(skills) && skills.length > 0)
    if (!hasAgentId && !hasInline) {
      return res.status(400).json({ error: 'agentId or inline prompt/skills is required' })
    }

    // P9 capability gate: integrators can disable multi-task / sub-agent.
    // effective = tenant.allow_parallel_tasks ?? plan.features.parallel_tasks ?? true
    const planBit = req.tenant?.planFeatures?.parallel_tasks
    const effective = req.tenant?.allowParallelTasks ?? (typeof planBit === 'boolean' ? planBit : true)
    if (!effective) {
      return res.status(403).json({
        error: 'Parallel tasks are disabled for this tenant',
        code: 'PARALLEL_TASKS_DISABLED',
      })
    }

    // Stored BYOK: resolve the tenant's own key server-side (never leaves the gateway)
    const { key: headerApiKey, endpoint, model } = await resolveStoredKey(req, tenantKeyId)
    const upstream = await getConversationProxy().createTask({
      sessionId,
      tenantAddress: req.tenant?.walletAddress || 'unknown',
      agentId: hasAgentId ? Number(agentId) : undefined,
      message: String(message),
      enableMemory: Boolean(enableMemory),
      history,
      endUserId,
      prompt: typeof prompt === 'string' ? prompt : undefined,
      skills,
      headerApiKey: headerApiKey || (req.headers['x-llm-api-key'] as string | undefined),
      headerEndpoint: endpoint || (req.headers['x-llm-endpoint'] as string | undefined),
      headerModel: model || (req.headers['x-llm-model'] as string | undefined),
    })
    const body = await upstream.json()
    return res.status(upstream.status).json(body)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return res.status((err as Error & { status?: number }).status ?? 500).json({ error: message })
  }
})

// GET /api/v1/sessions/:sessionId/tasks — list tasks
router.get('/sessions/:sessionId/tasks', async (req: Request, res: ExpressResponse) => {
  try {
    const upstream = await getConversationProxy().listTasks(req.params.sessionId)
    const body = await upstream.json()
    return res.status(upstream.status).json(body)
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message })
  }
})

// GET /api/v1/tasks/:taskId — task detail
router.get('/tasks/:taskId', async (req: Request, res: ExpressResponse) => {
  try {
    const upstream = await getConversationProxy().getTask(req.params.taskId)
    const body = await upstream.json()
    return res.status(upstream.status).json(body)
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message })
  }
})

// GET /api/v1/tasks/:taskId/events — SSE stream (replay + live)
router.get('/tasks/:taskId/events', async (req: Request, res: ExpressResponse) => {
  try {
    const upstream = await getConversationProxy().streamTaskEvents(req.params.taskId)
    await pipeSSE(upstream, res)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res.write(`data: ${JSON.stringify({ type: 'error', error: message })}\n\n`)
    res.end()
  }
})

// DELETE /api/v1/tasks/:taskId — cancel task
router.delete('/tasks/:taskId', async (req: Request, res: ExpressResponse) => {
  try {
    const upstream = await getConversationProxy().cancelTask(req.params.taskId)
    const body = await upstream.json()
    return res.status(upstream.status).json(body)
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message })
  }
})

export default router
