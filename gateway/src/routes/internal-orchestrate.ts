// AgentX Gateway — Internal Orchestration Endpoints
// Off-chain multi-agent orchestration: the Conversation Service calls these
// endpoints (protected by ORCHESTRATE_TOKEN) to enumerate the agents a caller
// may delegate to, to authorize a delegation, and to create an on-chain A2A
// task when the caller explicitly requests an auditable / settled delegation.
// Execution itself stays in the Conversation Service (synchronous, no on-chain
// writes) unless the caller opts into the on-chain rail.
//
// Layering strategy (2026-08-07):
//   - off-chain (default): same-platform, high-frequency, real-time delegation
//     through the conversation channel — zero cost, no on-chain writes.
//   - on-chain (opt-in): cross-org / settlement / reputation / third-party
//     verification — A2A protocol task created via POST /create-task below.
//
// Access boundary: agents the caller owns OR has subscription access to
// (chain / fiat / x402). Mirrors the chat-path rules in routes/agent-runs.ts.

import { Router, Request, Response } from 'express'
import { config } from '../config'
import { canAccessAgent, filterAccessibleAgents } from '../services/agent-access'
import { getPool } from '../lib/db'
import { createTaskOnChain } from '../services/a2a-worker'

const router = Router()

/** Shared-secret guard — only the Conversation Service may call these. */
function guard(req: Request, res: Response, next: () => void): void {
  const token = String(req.headers['x-orchestrate-token'] || '')
  if (!config.orchestrateToken || token !== config.orchestrateToken) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
}

router.use(guard)

interface DbAgentRow {
  id: number
  name: string
  description: string
  owner: string
  category?: string
}

/** GET-agnostic list of agents the caller may delegate to (owned or subscribed). */
router.post('/list', async (req: Request, res: Response) => {
  try {
    const tenantAddress = String(req.body?.tenantAddress || '')
    if (!tenantAddress || tenantAddress === 'unknown') {
      return res.json({ agents: [] })
    }

    const { rows } = await getPool().query(
      `SELECT id, owner, name, description, category
       FROM agents
       ORDER BY id DESC
       LIMIT 200`
    )
    const accessible = await filterAccessibleAgents(
      tenantAddress,
      rows as DbAgentRow[],
    )

    res.json({
      agents: accessible.map(a => ({
        id: a.id,
        name: a.name,
        description: a.description || '',
        category: a.category || 'other',
      })),
    })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

/** Authorize a delegation to a specific agent. */
router.post('/check', async (req: Request, res: Response) => {
  try {
    const tenantAddress = String(req.body?.tenantAddress || '')
    const agentId = Number(req.body?.agentId)
    if (!tenantAddress || tenantAddress === 'unknown' || !Number.isInteger(agentId) || agentId <= 0) {
      return res.status(400).json({ error: 'tenantAddress and agentId are required' })
    }
    const allowed = await canAccessAgent(tenantAddress, agentId)
    res.json({ allowed, agentId })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

/**
 * On-chain rail: create an A2A task for an auditable / settled delegation.
 * Called by the Conversation Service when the user explicitly requests
 * settlement / audit trail (rail: onchain). The a2a-worker picks the task up
 * asynchronously and stores the result in a2a_task_results.
 */
router.post('/create-task', async (req: Request, res: Response) => {
  try {
    const tenantAddress = String(req.body?.tenantAddress || '')
    const targetAgentId = Number(req.body?.targetAgentId)
    const taskType = String(req.body?.taskType || 'delegate')
    const inputData = String(req.body?.inputData || '')

    if (!tenantAddress || tenantAddress === 'unknown' || !Number.isInteger(targetAgentId) || targetAgentId <= 0 || !inputData) {
      return res.status(400).json({ error: 'tenantAddress, targetAgentId and inputData are required' })
    }

    // Access boundary: only delegate to agents the caller owns or is subscribed to.
    const allowed = await canAccessAgent(tenantAddress, targetAgentId)
    if (!allowed) {
      return res.status(403).json({ error: 'No access to this agent', code: 'AGENT_ACCESS_DENIED' })
    }

    const taskId = await createTaskOnChain(targetAgentId, taskType, inputData)
    res.json({ taskId, agentId: targetAgentId, rail: 'onchain', status: 'queued' })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

export default router
