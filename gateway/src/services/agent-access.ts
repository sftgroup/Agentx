// ---------------------------------------------------------------------------
// AgentX Gateway — Agent access control (chat & orchestration boundary)
// ---------------------------------------------------------------------------
// Unified "who may interact with an agent" check:
//   - the caller owns the agent (on-chain IdentityRegistry owner), OR
//   - the caller has subscription access (chain OR fiat/x402)
// Used by the conversation path (/agent/runs, sessions/tasks) and the
// multi-agent orchestrator (a2a-worker) so a user can only chat with — or
// have the main agent delegate to — agents they are entitled to use.
// ---------------------------------------------------------------------------

import type { ChainKey } from '@agentxv2/payments'
import { hasSubscriptionAccess } from './subscription-access'
import { chainDataReader, log } from './chain-data-reader'

// ── Short-TTL cache (avoid per-message on-chain round-trips) ───────────────
const ACCESS_TTL_MS = 30_000
const accessCache = new Map<string, { ok: boolean; ts: number }>()

function accessKey(subscriber: string, agentId: number, chain: ChainKey): string {
  return `${chain}:${subscriber.toLowerCase()}:${agentId}`
}

/**
 * Whether a caller may interact with an agent: they own it OR they have
 * subscription access (chain OR fiat/x402). Results are cached for 30s.
 */
export async function canAccessAgent(
  subscriber: string,
  agentId: number,
  chain: ChainKey = 'oxachain',
): Promise<boolean> {
  const sub = (subscriber || '').toLowerCase()
  if (!sub || sub === 'unknown') return false

  const key = accessKey(sub, agentId, chain)
  const cached = accessCache.get(key)
  if (cached && Date.now() - cached.ts < ACCESS_TTL_MS) return cached.ok

  let ok = false
  try {
    // 1. Owned by the caller (IdentityRegistry owner)
    const owned = await chainDataReader.getAgentsByOwner(chain, sub as `0x${string}`)
    if (owned.includes(agentId)) {
      ok = true
    } else {
      // 2. Subscribed (chain OR fiat/x402)
      ok = await hasSubscriptionAccess(sub, agentId, chain)
    }
  } catch (err) {
    log.warn(`canAccessAgent failed: ${(err as Error).message}`)
  }

  accessCache.set(key, { ok, ts: Date.now() })
  return ok
}

/**
 * Resolve the access subject for a request.
 * B-end (partner) callers may proxy an end-user's subscription by sending
 * `X-End-User-Id: 0x<wallet>` (or body `endUserId`) — the gateway then
 * authorizes by that wallet's ownership/subscription instead of the partner
 * tenant's own (non-chain) `partner-...` address. Falls back to the tenant's
 * wallet address when the caller is not a partner or no valid end-user address
 * is supplied. Memory isolation still keys off the end-user id as-is.
 */
export function resolveAccessSubject(
  walletAddress: string,
  kind: string | undefined,
  endUserId?: string,
): string {
  if (kind === 'partner' && endUserId && /^0x[0-9a-fA-F]{40}$/.test(endUserId)) {
    return endUserId.toLowerCase()
  }
  return walletAddress || 'unknown'
}

/**
 * Filter candidate agents down to those the caller may interact with
 * (owned or subscribed). Used by the orchestrator's `agentx_list_agents`
 * tool and the A2A page agent selector.
 */
export async function filterAccessibleAgents<T extends { id: number; owner?: string | null }>(
  subscriber: string,
  candidates: T[],
  chain: ChainKey = 'oxachain',
): Promise<T[]> {
  const sub = (subscriber || '').toLowerCase()
  if (!sub || sub === 'unknown') return []

  // Fast path: on-chain owned IDs in one read, then per-agent subscription checks
  let owned = new Set<number>()
  try {
    owned = new Set(await chainDataReader.getAgentsByOwner(chain, sub as `0x${string}`))
  } catch {
    // fall through to per-agent checks below
  }

  const out: T[] = []
  for (const a of candidates) {
    if (owned.has(a.id)) { out.push(a); continue }
    if (a.owner && a.owner.toLowerCase() === sub) { out.push(a); continue }
    if (await canAccessAgent(sub, a.id, chain)) out.push(a)
  }
  return out
}
