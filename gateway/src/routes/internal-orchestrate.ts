// AgentX Gateway — Internal Orchestration Endpoints
// Off-chain multi-agent orchestration: the Conversation Service calls these
// endpoints (protected by ORCHESTRATE_TOKEN) to enumerate the agents a caller
// may delegate to and to authorize a delegation. Execution stays in the
// Conversation Service (synchronous, no on-chain writes) unless the caller
// opts into the on-chain rail.
//
// Layering strategy (2026-08-08):
//   - off-chain (default): same-platform, high-frequency, real-time delegation
//     through the conversation channel — zero cost, no on-chain writes.
//   - on-chain (opt-in): cross-org / settlement / reputation / third-party
//     verification — the USER creates the A2A task from their own wallet (they
//     pay the gas and become the on-chain client), then the a2a-worker picks
//     it up. The gateway never signs.
//
// Access boundary: agents the caller owns OR has subscription access to
// (chain / fiat / x402). Mirrors the chat-path rules in routes/agent-runs.ts.

import { Router, Request, Response } from 'express'
import { config } from '../config'
import { canAccessAgent, filterAccessibleAgents } from '../services/agent-access'
import { getPool } from '../lib/db'

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
 * On-chain rail (removed 2026-08-08): the gateway no longer creates A2A tasks.
 * When the user explicitly requests an auditable / settled delegation, the
 * Conversation Service emits an `onchain_approval_required` event and the
 * user's own wallet submits `createTask` — they pay the gas and become the
 * on-chain client (contract records `clientAddress = msg.sender`). The
 * a2a-worker picks the task up asynchronously and stores the result in
 * a2a_task_results.
 */

export default router
