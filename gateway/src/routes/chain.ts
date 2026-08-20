// ---------------------------------------------------------------------------
// AgentX Gateway — Real-time Chain Data API
// ---------------------------------------------------------------------------
// Public read-only endpoints backed by the SDK-based ChainDataReader service.
// These query the chain directly (no DB cache) — complementary to the indexed
// /api/v1/agents endpoints. All support ?chain=sepolia|oxachain (default: oxachain).
// ---------------------------------------------------------------------------

import { Router, Request, Response } from 'express'
import { chainDataReader, log } from '../services/chain-data-reader'
import type { ChainKey } from '../services/chain-data-reader'
import { hasSubscriptionAccess } from '../services/subscription-access'

const router = Router()

function resolveChain(req: Request): ChainKey {
  const c = String(req.query.chain ?? 'oxachain').toLowerCase()
  return c === 'sepolia' ? 'sepolia' : 'oxachain'
}

function serializePlan(plan: { planId: number; agentId: number; creator: string; price: bigint; period: string; active: boolean; payToken: string; trialDays: number }) {
  return { ...plan, price: plan.price.toString() }
}

// GET /api/v1/chain/health?chain= → live chain status (block number + totals)
router.get('/health', async (req: Request, res: Response, next) => {
  const t0 = Date.now()
  try {
    const chain = resolveChain(req)
    const [blockNumber, totalAgents] = await Promise.all([
      chainDataReader.getBlockNumber(chain),
      chainDataReader.totalAgents(chain),
    ])
    log.info(`GET /chain/health (chain=${chain}) → block=${blockNumber} total=${totalAgents} in ${Date.now() - t0}ms`)
    res.json({ status: 'ok', chain, blockNumber, totalAgents, time: new Date().toISOString() })
  } catch (err) {
    log.error(`GET /chain/health failed: ${(err as Error).message}`)
    next(err)
  }
})

// GET /api/v1/chain/total?chain= → total agent count
router.get('/total', async (req: Request, res: Response, next) => {
  const t0 = Date.now()
  try {
    const chain = resolveChain(req)
    const totalAgents = await chainDataReader.totalAgents(chain)
    log.info(`GET /chain/total (chain=${chain}) → ${totalAgents} in ${Date.now() - t0}ms`)
    res.json({ chain, totalAgents })
  } catch (err) {
    log.error(`GET /chain/total failed: ${(err as Error).message}`)
    next(err)
  }
})

// GET /api/v1/chain/agents?chain=&fromId=&toId=&activeOnly=&capabilities=
router.get('/agents', async (req: Request, res: Response, next) => {
  const t0 = Date.now()
  try {
    const chain = resolveChain(req)
    const fromId = req.query.fromId ? Number(req.query.fromId) : undefined
    const toId = req.query.toId ? Number(req.query.toId) : undefined
    const activeOnly = req.query.activeOnly === 'true' || req.query.activeOnly === '1'
    const capabilities = String(req.query.capabilities ?? '')
      .split(',').map(s => s.trim()).filter(Boolean)
    const agents = await chainDataReader.listAgents(chain, { fromId, toId, activeOnly, capabilities })
    log.info(`GET /chain/agents (chain=${chain}, fromId=${fromId ?? '-'}, toId=${toId ?? '-'}, activeOnly=${activeOnly}, capabilities=[${capabilities.join(',')}]) → ${agents.length} agents in ${Date.now() - t0}ms`)
    res.json({ chain, agents, total: agents.length })
  } catch (err) {
    log.error(`GET /chain/agents failed: ${(err as Error).message}`)
    next(err)
  }
})

// GET /api/v1/chain/agents/:agentId?chain=
router.get('/agents/:agentId', async (req: Request, res: Response, next) => {
  const t0 = Date.now()
  try {
    const chain = resolveChain(req)
    const agentId = Number(req.params.agentId)
    if (!Number.isInteger(agentId) || agentId <= 0) {
      res.status(400).json({ error: 'Invalid agent id' })
      return
    }
    const [exists, metadata] = await Promise.all([
      chainDataReader.agentExists(chain, agentId),
      chainDataReader.getAgentMetadata(chain, agentId),
    ])
    log.info(`GET /chain/agents/${agentId} (chain=${chain}) → exists=${exists} name="${metadata.name}" in ${Date.now() - t0}ms`)
    res.json({ chain, agentId, exists, metadata })
  } catch (err) {
    log.error(`GET /chain/agents/:id failed (agentId=${req.params.agentId}): ${(err as Error).message}`)
    next(err)
  }
})

// GET /api/v1/chain/plans/:planId?chain=
router.get('/plans/:planId', async (req: Request, res: Response, next) => {
  const t0 = Date.now()
  try {
    const chain = resolveChain(req)
    const planId = Number(req.params.planId)
    if (!Number.isInteger(planId) || planId <= 0) {
      res.status(400).json({ error: 'Invalid plan id' })
      return
    }
    const plan = await chainDataReader.getPlan(chain, planId)
    log.info(`GET /chain/plans/${planId} (chain=${chain}) → agentId=${plan.agentId} period="${plan.period}" active=${plan.active} in ${Date.now() - t0}ms`)
    res.json({ chain, plan: serializePlan(plan) })
  } catch (err) {
    log.error(`GET /chain/plans/:id failed (planId=${req.params.planId}): ${(err as Error).message}`)
    next(err)
  }
})

// GET /api/v1/chain/check-subscription?chain=&subscriber=&agentId=
router.get('/check-subscription', async (req: Request, res: Response, next) => {
  const t0 = Date.now()
  try {
    const chain = resolveChain(req)
    const subscriber = String(req.query.subscriber ?? '')
    const agentId = Number(req.query.agentId)
    if (!subscriber || !agentId) {
      log.warn(`GET /chain/check-subscription missing params (subscriber="${subscriber}", agentId=${req.query.agentId})`)
      res.status(400).json({ error: 'subscriber and agentId are required' })
      return
    }
    const active = await hasSubscriptionAccess(subscriber, agentId, chain)
    log.info(`GET /chain/check-subscription (chain=${chain}, subscriber=${subscriber}, agentId=${agentId}) → active=${active} in ${Date.now() - t0}ms`)
    res.json({ chain, subscriber, agentId, active })
  } catch (err) {
    log.error(`GET /chain/check-subscription failed: ${(err as Error).message}`)
    next(err)
  }
})

export default router
