// ---------------------------------------------------------------------------
// AgentX Gateway — Unified subscription access (chain OR fiat/x402)
// ---------------------------------------------------------------------------
// Subscription gateways sit on three rails:
//   1. on-chain  — SubscriptionManager (native / ERC20, escrow)
//   2. fiat      — Stripe billing mirrored into fiat_subscriptions (provider='stripe')
//   3. x402      — period payment verified into fiat_subscriptions (provider='x402')
// This helper is the single access check used by gateways (chain API, MCP tools).
// It delegates to the generic @0xinfrax/payments engine — the AgentX-backed
// PaymentStore implements the "off-chain first, then on-chain" policy.
// ---------------------------------------------------------------------------

import type { ChainKey } from '@0xinfrax/payments'
import { paymentsService } from './payments'
import { log } from './chain-data-reader'

/**
 * Whether a wallet currently has subscription access to an agent.
 * Delegates to the generic engine's resolveAccess (off-chain fiat/x402
 * records first, then the on-chain contract), via the AgentX payment store.
 */
export async function hasSubscriptionAccess(
  subscriber: string,
  agentId: number,
  chain: ChainKey = 'oxachain',
): Promise<boolean> {
  try {
    return await paymentsService.resolveAccess(subscriber, agentId, { chain })
  } catch (err) {
    log.warn(`hasSubscriptionAccess failed: ${(err as Error).message}`)
    return false
  }
}
