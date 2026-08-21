// AgentX Gateway — Agent Runs Route
// SSE proxy: forwards conversation requests to Conversation Service

import { Router, Request, Response } from 'express'
import { getConversationProxy } from '../services/conversation-proxy'
import { x402Available, x402Guard } from '../services/x402'
import { canAccessAgent, resolveAccessSubject } from '../services/agent-access'
import { getPool } from '../lib/db'
import { decryptApiKey } from '../lib/crypto'
import { config } from '../config'
import { pipeSSEWithUsage } from '../services/sse-usage'
import { updateQuota } from '../middleware/rate-limiter'
import { recordUsage } from '../services/usage'

const router = Router()

// POST /api/v1/agent/runs — SSE streaming agent conversation
// When x402 is enabled, unsubscribed callers get HTTP 402 + payment headers.
router.post('/runs', (req: Request, res: Response, next: () => void) => {
  if (x402Available()) x402Guard(req, res, next)
  else next()
}, async (req: Request, res: Response) => {
  const { agentId, message, enableMemory, contextBudget, history, prompt, skills, tenantKeyId } = req.body
  const tenantAddress = req.tenant?.walletAddress || 'unknown'
  const endUserId = req.headers['x-end-user-id'] as string || undefined
  let headerApiKey = req.headers['x-llm-api-key'] as string | undefined
  let llmEndpoint = req.headers['x-llm-endpoint'] as string | undefined
  let llmModel = req.headers['x-llm-model'] as string | undefined

  if (!message) {
    return res.status(400).json({ error: 'message is required' })
  }
  const hasAgentId = agentId !== undefined && agentId !== null && agentId !== ''
  const hasInline = typeof prompt === 'string' || (Array.isArray(skills) && skills.length > 0)
  if (!hasAgentId && !hasInline) {
    return res.status(400).json({ error: 'agentId or inline prompt/skills is required' })
  }

  // BYOK via stored tenant key: resolve the tenant's own key server-side so the
  // plaintext key never leaves the gateway. Takes precedence over X-Llm-* headers.
  if (tenantKeyId) {
    const pool = getPool()
    const keyRow = req.tenant
      ? await pool.query(
          `SELECT * FROM tenant_api_keys WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
          [tenantKeyId, req.tenant.id]
        )
      : { rows: [] }
    if (keyRow.rows.length === 0) {
      return res.status(400).json({ error: 'Tenant API key not found or inactive' })
    }
    const tk = keyRow.rows[0]
    headerApiKey = decryptApiKey(tk.api_key, config.masterEncryptionKey)
    llmEndpoint = tk.endpoint
    llmModel = tk.model
  }

  // Access boundary: chat only with agents the caller owns or is subscribed to.
  // Callers who paid through x402 (per-request) are exempt (x402Guard marked them).
  // B-end (partner) callers may proxy an end-user's subscription via X-End-User-Id.
  const isPaidThrough = (req as any).x402Access === true
  const accessSubject = resolveAccessSubject(tenantAddress, req.tenant?.kind, endUserId)
  if (hasAgentId && !hasInline && !isPaidThrough && accessSubject && accessSubject !== 'unknown') {
    const ok = await canAccessAgent(accessSubject, Number(agentId))
    if (!ok) {
      return res.status(403).json({ error: 'No subscription access to this agent', code: 'AGENT_ACCESS_DENIED' })
    }
  }

  try {
    const proxy = getConversationProxy()
    const upstream = await proxy.streamRun({
      agentId: hasAgentId ? Number(agentId) : undefined,
      message: String(message),
      tenantAddress,
      enableMemory: Boolean(enableMemory),
      contextBudget: contextBudget ? Number(contextBudget) : undefined,
      history,
      endUserId,
      headerApiKey,
      headerEndpoint: llmEndpoint,
      headerModel: llmModel,
      prompt: typeof prompt === 'string' ? prompt : undefined,
      skills,
    })
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: 'Conversation service error' })
    }

    // Pipe SSE stream from Conversation Service to client.
    // Platform-mode runs (no BYOK headers / stored key) are metered against the
    // tenant's plan quota using the `done` event's usage + llmSource.
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    let platformTokens = 0
    let promptTokens = 0
    let completionTokens = 0
    let toolCalls = 0
    let model: string | undefined
    let usageAgentId: number | null = null
    await pipeSSEWithUsage(upstream, res, ({ totalTokens, promptTokens: pt, completionTokens: ct, llmSource, model: m, agentId: aid, toolCalls: tc }) => {
      // Only count when the run actually used the platform LLM key. Fall back to
      // the header heuristic for older conversation-service versions that don't
      // emit llmSource yet.
      const isPlatform = llmSource === 'platform' || (llmSource === undefined && !headerApiKey && !tenantKeyId)
      if (isPlatform && totalTokens > 0) {
        platformTokens += totalTokens
        promptTokens += pt
        completionTokens += ct
        toolCalls += tc ?? 0
        if (m) model = m
        if (aid !== undefined && aid !== null) usageAgentId = aid
      }
    })
    // Meter after the stream closes — fire-and-forget, never blocks the response.
    if (platformTokens > 0 && req.tenant) {
      updateQuota(req.tenant.id, platformTokens).catch(() => {})
      // Single-turn path usage detail (platform mode) — shared recordUsage
      // mirrors chat.ts so the /agent/runs fallback also shows up in
      // /tenant/usage. Fire-and-forget.
      recordUsage({
        tenantId: req.tenant.id,
        keySource: 'platform',
        model: model || 'unknown',
        tokensPrompt: promptTokens,
        tokensCompletion: completionTokens,
        tokensTotal: platformTokens,
        toolCalls,
        agentId: usageAgentId,
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res.write(`data: ${JSON.stringify({ type: 'error', error: message })}\n\n`)
    res.end()
  }
})

// GET /api/v1/agent/runs/:runId — session detail (placeholder)
router.get('/runs/:runId', (_req, res) => {
  res.json({ runId: _req.params.runId, status: 'ok', note: 'Phase 2: Observability' })
})

export default router
