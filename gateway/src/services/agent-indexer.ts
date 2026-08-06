// ---------------------------------------------------------------------------
// AgentX Gateway — Agent Indexer (reads chain → stores in PostgreSQL)
// ---------------------------------------------------------------------------
// Syncs agent metadata from IdentityRegistry (ERC-721) into the agents table.
// Handles: IPFS CIDs, base64 data URIs, and malformed tokenURIs.
// Also exposes syncAgentId() for event-driven incremental sync.
// ---------------------------------------------------------------------------

import { ethers } from 'ethers'
import { parseTokenURIJSON } from '@agentxv2/sdk'
import { getPool } from '../lib/db'
import { config } from '../config'

const IDENTITY_ABI = [
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function getAgentOwner(uint256 agentId) view returns (address)',
  'function totalAgents() view returns (uint256)',
  'event AgentRegistered(uint256 indexed agentId, address indexed creator, string tokenURI)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
]

const SUBSCRIPTION_ABI = [
  // Contract returns `SubscriptionPlan memory` (struct) — tuple encoding.
  'function getPlan(uint256 planId) view returns ((uint256,uint256,address,uint256,string,bool,address,uint256))',
  'event PlanCreated(uint256 indexed planId, uint256 indexed agentId, uint256 price, string period, address payToken, uint256 trialDays)',
]

// Subscription struct: (subscriptionId, subscriber, agentId, status, startedAt,
// expiresAt, period, payToken, amountPaid, trialActive, trialEndsAt, fundsReleased)
const SUBSCRIPTION_DETAIL_ABI = [
  'function getSubscriptionDetail(uint256 subscriptionId) view returns ((uint256,address,uint256,uint8,uint256,uint256,string,address,uint256,bool,uint256,bool))',
  'event Subscribed(uint256 indexed subscriptionId, address indexed subscriber, uint256 indexed agentId, uint256 expiresAt)',
  'event SubscriptionCancelled(uint256 indexed subscriptionId)',
  'event SubscriptionExpired(uint256 indexed subscriptionId)',
]

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// ── Structured metadata extraction ──────────────────────────────────────────

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : [])

function parseCreatedAt(parsed: Record<string, unknown> | null): number {
  const v = parsed?.created_at ?? parsed?.createdAt
  if (typeof v === 'number') return Math.floor(v)
  if (typeof v === 'string') {
    const t = Date.parse(v)
    if (!Number.isNaN(t)) return Math.floor(t / 1000)
  }
  return 0
}

// Normalize parsed tokenURI JSON into structured metadata.
// Exported for reuse by the MCP server.
export function extractMetadata(parsed: Record<string, unknown> | null, agentId: number) {
  return {
    name: str(parsed?.name) || `Agent ${agentId}`,
    description: str(parsed?.description),
    tags: arr(parsed?.tags),
    capabilities: arr(parsed?.capabilities),
    skills: arr(parsed?.skills),
    isActive:
      typeof parsed?.isActive === 'boolean' ? parsed.isActive
      : typeof parsed?.is_active === 'boolean' ? parsed.is_active
      : true,
    agentCreatedAt: parseCreatedAt(parsed),
  }
}

// ── Upsert ──────────────────────────────────────────────────────────────────

/** Fetch one agent from chain and upsert it into the agents table. */
async function fetchAndUpsertAgent(agentId: number, contract: ethers.Contract): Promise<boolean> {
  const pool = getPool()

  const [owner, tokenURI] = await Promise.all([
    contract.getAgentOwner(agentId).catch(() => null),
    contract.tokenURI(agentId).catch(() => null),
  ])
  if (!owner || owner === ZERO_ADDRESS || !tokenURI) return false

  const parsed = parseTokenURIJSON(tokenURI)
  const { name, description, tags, capabilities, skills, isActive, agentCreatedAt } =
    extractMetadata(parsed, agentId)

  await pool.query(
    `INSERT INTO agents (id, owner, name, description, tags, capabilities, skills, is_active, agent_created_at, token_uri, metadata_json, synced_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
     ON CONFLICT (id) DO UPDATE SET
       owner = EXCLUDED.owner,
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       tags = EXCLUDED.tags,
       capabilities = EXCLUDED.capabilities,
       skills = EXCLUDED.skills,
       is_active = EXCLUDED.is_active,
       agent_created_at = EXCLUDED.agent_created_at,
       token_uri = EXCLUDED.token_uri,
       metadata_json = EXCLUDED.metadata_json,
       synced_at = NOW(),
       updated_at = NOW()`,
    [
      agentId, owner, name, description, tags, capabilities, skills,
      isActive, agentCreatedAt, tokenURI, JSON.stringify(parsed || {}),
    ]
  )
  return true
}

// ── Full sync ───────────────────────────────────────────────────────────────

let fullSyncRunning = false

export async function syncAgents(): Promise<{ synced: number; total: number }> {
  if (fullSyncRunning) return { synced: 0, total: 0 }  // re-entrancy guard (timer + manual trigger)

  const provider = new ethers.JsonRpcProvider(config.rpcUrlOxaChain)
  const contract = new ethers.Contract(config.identityRegistryOxaChain, IDENTITY_ABI, provider)

  const total = Number(await contract.totalAgents().catch(() => 0))
  if (total <= 0) return { synced: 0, total: 0 }

  fullSyncRunning = true
  const batchSize = config.agentsIndexBatchSize
  let synced = 0

  try {
    for (let batchStart = 1; batchStart <= total; batchStart += batchSize) {
      const batchIds: number[] = []
      for (let i = batchStart; i < batchStart + batchSize && i <= total; i++) {
        batchIds.push(i)
      }

      const results = await Promise.allSettled(
        batchIds.map((id) => fetchAndUpsertAgent(id, contract))
      )
      synced += results.filter(r => r.status === 'fulfilled' && r.value).length
    }
  } finally {
    fullSyncRunning = false
  }

  return { synced, total }
}

// ── Incremental sync (event-driven) ─────────────────────────────────────────

/** Sync a single agent (mint/transfer event). Returns true when upserted. */
export async function syncAgentId(agentId: number): Promise<boolean> {
  const provider = new ethers.JsonRpcProvider(config.rpcUrlOxaChain)
  const contract = new ethers.Contract(config.identityRegistryOxaChain, IDENTITY_ABI, provider)
  return fetchAndUpsertAgent(agentId, contract)
}

/** Remove a destroyed agent (Transfer → 0x0 burn event). */
export async function removeAgent(agentId: number): Promise<void> {
  const pool = getPool()
  await pool.query('DELETE FROM agents WHERE id = $1', [agentId])
}

// ── Event-driven incremental sync watcher ──────────────────────────────────

/**
 * Watch IdentityRegistry Transfer events and keep the agents table fresh:
 * - mint / ownership transfer (to != 0x0) → upsert the agent (re-reads chain state)
 * - burn (to == 0x0) → remove the agent row
 * Covers AgentRegistered indirectly (mint emits Transfer from 0x0).
 */
export function startAgentSyncWatcher(): void {
  const provider = new ethers.JsonRpcProvider(config.rpcUrlOxaChain)
  const contract = new ethers.Contract(config.identityRegistryOxaChain, IDENTITY_ABI, provider)

  contract.on('Transfer', (from: string, to: string, tokenId: bigint | number) => {
    const agentId = Number(tokenId)
    if (to.toLowerCase() === ZERO_ADDRESS) {
      removeAgent(agentId).catch(err =>
        console.error(`[agent-indexer] remove failed for #${agentId}:`, err.message)
      )
    } else {
      syncAgentId(agentId).then(ok => {
        if (!ok) console.warn(`[agent-indexer] sync returned nothing for #${agentId}`)
      }).catch(err =>
        console.error(`[agent-indexer] incremental sync failed for #${agentId}:`, err.message)
      )
    }
  })

  console.log('[agent-indexer] Event-driven sync watcher started')
}

// ── Plans sync (SubscriptionManager) ────────────────────────────────────────
// The SubscriptionManager has no "list plans by agent" view, so we maintain a
// plans table from PlanCreated events (same event-driven pattern as agents).

/** Fetch one plan from chain and upsert it into the plans table. */
async function fetchAndUpsertPlan(planId: number, contract: ethers.Contract): Promise<boolean> {
  const pool = getPool()

  const raw = await contract.getPlan(planId).catch(() => null)
  if (!raw) return false
  // ethers v6 tuple → [planId, agentId, creator, price, period, active, payToken, trialDays]
  const [, agentId, creator, price, rawPeriod, active, payToken, trialDays] = raw as [
    bigint, bigint, string, bigint, string, boolean, string, bigint,
  ]
  // Normalize legacy non-standard period strings ('monthly' etc.) to the
  // contract-valid enum so DB consumers always see day/week/month/year.
  const PERIOD_NORMALIZE: Record<string, string> = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }
  const period = PERIOD_NORMALIZE[rawPeriod] ?? rawPeriod

  await pool.query(
    `INSERT INTO subscription_plans (plan_id, agent_id, creator, price, period, pay_token, trial_days, active, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
     ON CONFLICT (plan_id) DO UPDATE SET
       agent_id = EXCLUDED.agent_id,
       creator = EXCLUDED.creator,
       price = EXCLUDED.price,
       period = EXCLUDED.period,
       pay_token = EXCLUDED.pay_token,
       trial_days = EXCLUDED.trial_days,
       active = EXCLUDED.active,
       updated_at = NOW()`,
    [planId, Number(agentId), creator, price.toString(), period, payToken, Number(trialDays), active]
  )
  return true
}

/** Backfill the subscription_plans table from PlanCreated history (runs once on boot). */
export async function syncPlanHistory(): Promise<number> {
  const provider = new ethers.JsonRpcProvider(config.rpcUrlOxaChain)
  const contract = new ethers.Contract(config.subscriptionManagerOxaChain, SUBSCRIPTION_ABI, provider)

  const fromBlock = config.plansSyncFromBlock
  const filter = contract.filters.PlanCreated()
  const logs = (await contract.queryFilter(filter, fromBlock).catch(() => [])) as readonly ethers.EventLog[]
  if (logs.length === 0) return 0

  const results = await Promise.allSettled(
    logs.map((log) => fetchAndUpsertPlan(Number(log.args.planId), contract))
  )
  const ok = results.filter(r => r.status === 'fulfilled' && r.value).length
  console.log(`[agent-indexer] Plan history sync: ${ok}/${logs.length} plans (from block ${fromBlock})`)
  return ok
}

/** Watch SubscriptionManager PlanCreated events → keep the plans table fresh. */
export function startPlanSyncWatcher(): void {
  const provider = new ethers.JsonRpcProvider(config.rpcUrlOxaChain)
  const contract = new ethers.Contract(config.subscriptionManagerOxaChain, SUBSCRIPTION_ABI, provider)

  contract.on('PlanCreated', (planId: bigint | number) => {
    fetchAndUpsertPlan(Number(planId), contract).then(ok => {
      if (!ok) console.warn(`[agent-indexer] plan sync returned nothing for #${planId}`)
    }).catch(err =>
      console.error(`[agent-indexer] plan sync failed for #${planId}:`, err.message)
    )
  })

  console.log('[agent-indexer] Plan sync watcher started')
}

// ── Subscriptions sync (SubscriptionManager) ────────────────────────────────
// The v2 contract has no "list subscriptions by agent" view, so the per-agent
// stats endpoint (GET /agents/:id/stats) cannot enumerate chain subscriptions
// directly. We maintain the chain_subscriptions table from Subscribed /
// SubscriptionCancelled / SubscriptionExpired events (same pattern as plans).

/** Fetch one subscription from chain and upsert it into chain_subscriptions. */
async function fetchAndUpsertSubscription(subscriptionId: number, contract: ethers.Contract): Promise<boolean> {
  const pool = getPool()

  const raw = await contract.getSubscriptionDetail(subscriptionId).catch(() => null)
  if (!raw) return false
  const [sid, subscriber, agentId, status, startedAt, expiresAt, period, payToken, amountPaid, , , fundsReleased] = raw as [
    bigint, string, bigint, bigint, bigint, bigint, string, string, bigint, boolean, bigint, boolean,
  ]

  await pool.query(
    `INSERT INTO chain_subscriptions (subscription_id, agent_id, subscriber, status, started_at, expires_at, period, pay_token, amount_wei, funds_released, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
     ON CONFLICT (subscription_id) DO UPDATE SET
       agent_id = EXCLUDED.agent_id,
       subscriber = EXCLUDED.subscriber,
       status = EXCLUDED.status,
       started_at = EXCLUDED.started_at,
       expires_at = EXCLUDED.expires_at,
       period = EXCLUDED.period,
       pay_token = EXCLUDED.pay_token,
       amount_wei = EXCLUDED.amount_wei,
       funds_released = EXCLUDED.funds_released,
       updated_at = NOW()`,
    [subscriptionId, Number(agentId), subscriber, Number(status), Number(startedAt), Number(expiresAt), period, payToken, amountPaid.toString(), fundsReleased]
  )
  return true
}

/** Backfill chain_subscriptions from Subscribed history (runs once on boot). */
export async function syncSubscriptionHistory(): Promise<number> {
  const provider = new ethers.JsonRpcProvider(config.rpcUrlOxaChain)
  const contract = new ethers.Contract(config.subscriptionManagerOxaChain, SUBSCRIPTION_DETAIL_ABI, provider)

  const fromBlock = config.subscriptionsSyncFromBlock
  const filter = contract.filters.Subscribed()
  const logs = (await contract.queryFilter(filter, fromBlock).catch(() => [])) as readonly ethers.EventLog[]
  if (logs.length === 0) return 0

  const results = await Promise.allSettled(
    logs.map((log) => fetchAndUpsertSubscription(Number(log.args.subscriptionId), contract))
  )
  const ok = results.filter(r => r.status === 'fulfilled' && r.value).length
  console.log(`[agent-indexer] Subscription history sync: ${ok}/${logs.length} (from block ${fromBlock})`)
  return ok
}

/** Watch SubscriptionManager lifecycle events → keep chain_subscriptions fresh. */
export function startSubscriptionSyncWatcher(): void {
  const provider = new ethers.JsonRpcProvider(config.rpcUrlOxaChain)
  const contract = new ethers.Contract(config.subscriptionManagerOxaChain, SUBSCRIPTION_DETAIL_ABI, provider)

  // Fresh subscribe → full detail read (reflects current status at read time).
  contract.on('Subscribed', (subscriptionId: bigint | number) => {
    fetchAndUpsertSubscription(Number(subscriptionId), contract).then(ok => {
      if (!ok) console.warn(`[agent-indexer] subscription sync returned nothing for #${subscriptionId}`)
    }).catch(err =>
      console.error(`[agent-indexer] subscription sync failed for #${subscriptionId}:`, err.message)
    )
  })

  // Status transitions are cheap SQL updates — no chain read needed.
  const setStatus = (subscriptionId: bigint | number, status: number) => {
    getPool().query(
      `UPDATE chain_subscriptions SET status = $1, updated_at = NOW() WHERE subscription_id = $2`,
      [status, Number(subscriptionId)]
    ).catch(err =>
      console.error(`[agent-indexer] subscription status update failed for #${subscriptionId}:`, err.message)
    )
  }
  contract.on('SubscriptionCancelled', (subscriptionId: bigint | number) => setStatus(subscriptionId, 3))
  contract.on('SubscriptionExpired', (subscriptionId: bigint | number) => setStatus(subscriptionId, 2))

  console.log('[agent-indexer] Subscription sync watcher started')
}
