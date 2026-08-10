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
import { canAccessAgent, resolveAccessSubject } from '../services/agent-access'
import { getPool } from '../lib/db'
import { decryptApiKey } from '../lib/crypto'
import { config } from '../config'
import { pipeSSEWithUsage } from '../services/sse-usage'
import { updateQuota } from '../middleware/rate-limiter'

const router = Router()

/**
 * Quota metering for background tasks — idempotent per task across repeated
 * SSE subscriptions (replay + live) so tokens are counted exactly once.
 */
const billedTaskIds = new Set<string>()

/**
 * P9 capability gate (2026-08-08): sessions / tasks are gated uniformly by
 * capability bits for ALL tenants — user JWT and B-end (partner) keys alike.
 * effective = tenant.allow_parallel_tasks ?? plan.features.parallel_tasks ?? true.
 * (Replaces the former R14 partner-only block: B-end keys now get the same
 * parallel-task surface as registered users, controlled by their plan.)
 */
function parallelTaskGate(req: Request, res: ExpressResponse, next: () => void): void {
  const planBit = req.tenant?.planFeatures?.parallel_tasks
  const effective = req.tenant?.allowParallelTasks ?? (typeof planBit === 'boolean' ? planBit : true)
  if (!effective) {
    res.status(403).json({
      error: 'Parallel tasks are disabled for this tenant',
      code: 'PARALLEL_TASKS_DISABLED',
    })
    return
  }
  next()
}

router.use(parallelTaskGate)

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

/**
 * Pipe a task's SSE stream to the client, metering platform-LLM tokens exactly
 * once per task. The `done` event carries usage + llmSource from the
 * conversation service (exact billing source). If llmSource is absent (older
 * conversation-service versions), no metering happens for tasks — the caller's
 * BYOK headers at creation time gate platform-key usage anyway.
 */
async function pipeTaskSSE(
  upstream: globalThis.Response,
  res: ExpressResponse,
  taskId: string,
  tenantId?: string,
): Promise<void> {
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

  let platformTokens = 0
  await pipeSSEWithUsage(upstream, res, ({ totalTokens, llmSource }) => {
    if (llmSource === 'platform' && totalTokens > 0) {
      platformTokens += totalTokens
    }
  })

  if (platformTokens > 0 && tenantId && !billedTaskIds.has(taskId)) {
    billedTaskIds.add(taskId)
    updateQuota(tenantId, platformTokens).catch(() => {})
  }
}

// POST /api/v1/sessions — create a session
router.post('/sessions', async (req: Request, res: ExpressResponse) => {
  try {
    const { sessionId, agentId, title } = req.body || {}
    const endUserId = (req.headers['x-end-user-id'] as string | undefined) || req.body?.endUserId

    // Access boundary: sessions may only be created for agents the caller
    // owns or has an active subscription to. B-end (partner) callers may
    // proxy an end-user's subscription via X-End-User-Id (0x wallet).
    if (agentId !== undefined && agentId !== null && agentId !== '') {
      const subject = resolveAccessSubject(req.tenant?.walletAddress || 'unknown', req.tenant?.kind, endUserId)
      const ok = await canAccessAgent(subject, Number(agentId))
      if (!ok) {
        return res.status(403).json({ error: 'No subscription access to this agent', code: 'AGENT_ACCESS_DENIED' })
      }
    }

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
    const endUserId = (req.headers['x-end-user-id'] as string | undefined) || req.body?.endUserId

    if (!message) return res.status(400).json({ error: 'message is required' })
    const hasAgentId = agentId !== undefined && agentId !== null && agentId !== ''
    const hasInline = typeof prompt === 'string' || (Array.isArray(skills) && skills.length > 0)
    if (!hasAgentId && !hasInline) {
      return res.status(400).json({ error: 'agentId or inline prompt/skills is required' })
    }

    // Access boundary: tasks may only run for agents the caller owns or is
    // subscribed to. Inline mode (no agentId) is unaffected. B-end (partner)
    // callers may proxy an end-user's subscription via X-End-User-Id (0x wallet).
    if (hasAgentId && !hasInline) {
      const subject = resolveAccessSubject(req.tenant?.walletAddress || 'unknown', req.tenant?.kind, endUserId)
      const ok = await canAccessAgent(subject, Number(agentId))
      if (!ok) {
        return res.status(403).json({ error: 'No subscription access to this agent', code: 'AGENT_ACCESS_DENIED' })
      }
    }

    // P9 capability gate is enforced once at router.use(parallelTaskGate).

    // B-end budget guard: partner tasks must carry their own LLM key (BYOK) so
    // background/parallel work never consumes the platform fallback key budget.
    const hasByok = !!req.headers['x-llm-api-key'] || !!tenantKeyId || !!req.body?.llmApiKey
    if (req.tenant?.kind === 'partner' && !hasByok) {
      return res.status(400).json({
        error: 'Partner tasks require a BYOK LLM key (X-Llm-Api-Key header or tenantKeyId)',
        code: 'LLM_KEY_REQUIRED',
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
    await pipeTaskSSE(upstream, res, req.params.taskId, req.tenant?.id)
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
