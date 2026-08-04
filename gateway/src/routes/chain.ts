// ---------------------------------------------------------------------------
// AgentX Gateway — Real-time Chain Data API
// ---------------------------------------------------------------------------
// Public read-only endpoints backed by the SDK-based ChainDataReader service.
// These query the chain directly (no DB cache) — complementary to the indexed
// /api/v1/agents endpoints. All support ?chain=sepolia|oxachain (default: oxachain).
// ---------------------------------------------------------------------------

import { Router, Request, Response } from 'express'
import { chainDataReader } from '../services/chain-data-reader'
import type { ChainKey } from '../services/chain-data-reader'

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
  try {
    const chain = resolveChain(req)
    const [blockNumber, totalAgents] = await Promise.all([
      chainDataReader.getBlockNumber(chain),
      chainDataReader.totalAgents(chain),
    ])
    res.json({ status: 'ok', chain, blockNumber, totalAgents, time: new Date().toISOString() })
  } catch (err) {
    next(err)
  }
})

// GET /api/v1/chain/total?chain= → total agent count
router.get('/total', async (req: Request, res: Response, next) => {
  try {
    const chain = resolveChain(req)
    res.json({ chain, totalAgents: await chainDataReader.totalAgents(chain) })
  } catch (err) {
    next(err)
  }
})

// GET /api/v1/chain/agents?chain=&fromId=&toId=&activeOnly=&capabilities=
router.get('/agents', async (req: Request, res: Response, next) => {
  try {
    const chain = resolveChain(req)
    const fromId = req.query.fromId ? Number(req.query.fromId) : undefined
    const toId = req.query.toId ? Number(req.query.toId) : undefined
    const activeOnly = req.query.activeOnly === 'true' || req.query.activeOnly === '1'
    const capabilities = String(req.query.capabilities ?? '')
      .split(',').map(s => s.trim()).filter(Boolean)
    const agents = await chainDataReader.listAgents(chain, { fromId, toId, activeOnly, capabilities })
    res.json({ chain, agents, total: agents.length })
  } catch (err) {
    next(err)
  }
})

// GET /api/v1/chain/agents/:agentId?chain=
router.get('/agents/:agentId', async (req: Request, res: Response, next) => {
  try {
    const chain = resolveChain(req)
    const agentId = Number(req.params.agentId)
    const [exists, metadata] = await Promise.all([
      chainDataReader.agentExists(chain, agentId),
      chainDataReader.getAgentMetadata(chain, agentId),
    ])
    res.json({ chain, agentId, exists, metadata })
  } catch (err) {
    next(err)
  }
})

// GET /api/v1/chain/plans/:planId?chain=
router.get('/plans/:planId', async (req: Request, res: Response, next) => {
  try {
    const chain = resolveChain(req)
    const planId = Number(req.params.planId)
    const plan = await chainDataReader.getPlan(chain, planId)
    res.json({ chain, plan: serializePlan(plan) })
  } catch (err) {
    next(err)
  }
})

// GET /api/v1/chain/check-subscription?chain=&subscriber=&agentId=
router.get('/check-subscription', async (req: Request, res: Response, next) => {
  try {
    const chain = resolveChain(req)
    const subscriber = String(req.query.subscriber ?? '')
    const agentId = Number(req.query.agentId)
    if (!subscriber || !agentId) {
      res.status(400).json({ error: 'subscriber and agentId are required' })
      return
    }
    const active = await chainDataReader.hasActiveSubscription(chain, subscriber as `0x${string}`, agentId)
    res.json({ chain, subscriber, agentId, active })
  } catch (err) {
    next(err)
  }
})

export default router
