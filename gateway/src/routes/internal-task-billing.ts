// AgentX Gateway — Internal Task Billing Callback
// The Conversation Service reports a completed background task's platform-mode
// usage here (POST /api/v1/internal/task-billing), covering tasks that complete
// without any SSE subscriber. Together with the SSE metering path in
// routes/chat-tasks.ts, every platform-LLM task is counted exactly once
// (shared idempotent billed-task set in services/task-billing.ts).
//
// Guarded by the same shared secret the Conversation Service already uses for
// the orchestrate endpoints (X-Orchestrate-Token) — same trust boundary.

import { Router, Request, Response } from 'express'
import { config } from '../config'
import { getPool } from '../lib/db'
import { updateQuota } from '../middleware/rate-limiter'
import { isTaskBilled, markTaskBilled } from '../services/task-billing'
import { recordUsage } from '../services/usage'

const router = Router()

/** Shared-secret guard — only the Conversation Service may call these. */
router.use((req: Request, res: Response, next: () => void) => {
  const token = String(req.headers['x-orchestrate-token'] || '')
  if (!config.orchestrateToken || token !== config.orchestrateToken) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
})

interface TaskBillingBody {
  taskId?: unknown
  tenantAddress?: unknown
  totalTokens?: unknown
  promptTokens?: unknown
  completionTokens?: unknown
  llmSource?: unknown
  model?: unknown
  agentId?: unknown
  toolCalls?: unknown
}

// POST /api/v1/internal/task-billing — meter a completed task's platform tokens
router.post('/', async (req: Request, res: Response) => {
  try {
    const body = (req.body || {}) as TaskBillingBody
    const taskId = String(body.taskId ?? '')
    const tenantAddress = String(body.tenantAddress ?? '')
    const totalTokens = Number(body.totalTokens ?? 0)
    const promptTokens = Number(body.promptTokens ?? 0)
    const completionTokens = Number(body.completionTokens ?? 0)
    const llmSource = String(body.llmSource ?? '')
    const model = String(body.model ?? '').trim()
    const agentId = body.agentId == null ? null : Number(body.agentId)
    const toolCalls = Number(body.toolCalls ?? 0)

    if (!taskId || !tenantAddress || tenantAddress === 'unknown') {
      return res.status(400).json({ error: 'taskId and tenantAddress are required' })
    }
    // Only platform-mode usage is metered; BYOK tasks bill on the caller's own key.
    if (llmSource !== 'platform' || !Number.isFinite(totalTokens) || totalTokens <= 0) {
      return res.json({ ok: true, skipped: 'not platform usage' })
    }
    if (isTaskBilled(taskId)) {
      return res.json({ ok: true, skipped: 'already billed' })
    }

    // Map the caller's wallet address to a tenant id (quotas live per tenant).
    const { rows } = await getPool().query<{ id: string }>(
      'SELECT id FROM tenants WHERE wallet_address = $1 LIMIT 1',
      [tenantAddress],
    )
    const tenantId = rows[0]?.id
    if (!tenantId) {
      // No tenant record (e.g. anonymous x402 flow) — nothing to meter against.
      return res.json({ ok: true, skipped: 'no tenant record' })
    }

    // Idempotent claim stays EARLY (synchronous, before any await) so the SSE
    // channel + this callback can never double-meter the same task even when
    // both fire concurrently.
    markTaskBilled(taskId)
    // Best-effort quota meter — a transient Redis outage must not drop the
    // usage detail below nor lose the task forever (it stays claimed).
    try {
      await updateQuota(tenantId, totalTokens)
    } catch { /* non-critical */ }
    // Background-task usage detail (platform mode) — shared recordUsage mirrors
    // chat.ts so tasks completed without an SSE subscriber still appear in
    // /tenant/usage. Fire-and-forget: usage logging is non-critical.
    recordUsage({
      tenantId,
      keySource: 'platform',
      model: model || 'unknown',
      tokensPrompt: promptTokens,
      tokensCompletion: completionTokens,
      tokensTotal: totalTokens,
      toolCalls,
      agentId,
    })
    return res.json({ ok: true })
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message })
  }
})

export default router
