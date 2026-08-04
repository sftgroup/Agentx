// ---------------------------------------------------------------------------
// AgentX Gateway — Agent Indexer (reads chain → stores in PostgreSQL)
// ---------------------------------------------------------------------------
// Syncs agent metadata from IdentityRegistry (ERC-721) into the agents table.
// Handles: IPFS CIDs, base64 data URIs, and malformed tokenURIs.
// Also exposes syncAgentId() for event-driven incremental sync.
// ---------------------------------------------------------------------------

import { ethers } from 'ethers'
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

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// Parse base64 data URI tokenURI → JSON metadata object
// Exported for reuse by the MCP server (single source of truth for tokenURI parsing).
export function parseTokenURIToJSON(tokenURI: string): Record<string, unknown> | null {
  if (!tokenURI) return null
  if (tokenURI.startsWith('ipfs://')) return null

  const match = tokenURI.match(/^data:application\/json;base64,(.+)$/i)
  if (!match) return null

  // Clean up malformed base64: trim everything after the last "==" padding
  let b64 = match[1]
  const lastDoubleEq = b64.lastIndexOf('==')
  if (lastDoubleEq > 0 && lastDoubleEq < b64.length - 2) {
    b64 = b64.substring(0, lastDoubleEq + 2)
  }

  try {
    const decoded = Buffer.from(b64, 'base64').toString('utf-8')
    // Try JSON parse first
    try {
      return JSON.parse(decoded)
    } catch {
      // Unterminated JSON (contract bug): append missing closing quotes/braces
      let fixed = decoded
      // Count unclosed quotes
      const quoteCount = (fixed.match(/"/g) || []).length
      if (quoteCount % 2 !== 0) fixed += '"'
      // Count unclosed braces
      const openBraces = (fixed.match(/\{/g) || []).length
      const closeBraces = (fixed.match(/\}/g) || []).length
      for (let i = closeBraces; i < openBraces; i++) fixed += '}'
      try { return JSON.parse(fixed) } catch { /* ok */ }
    }
    // Regex fallback
    const nameM = decoded.match(/"name"\s*:\s*"([^"]*)/)
    if (nameM) return { name: nameM[1] }
    return null
  } catch { return null }
}

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

  const parsed = parseTokenURIToJSON(tokenURI)
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
  const [, agentId, creator, price, period, active, payToken, trialDays] = raw as [
    bigint, bigint, string, bigint, string, boolean, string, bigint,
  ]

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
