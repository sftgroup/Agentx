// ---------------------------------------------------------------------------
// @agentx/sdk — On-chain Event Listener
// ---------------------------------------------------------------------------
// Lightweight contract event subscription (Transfer / AgentRegistered on the
// IdentityRegistry, PlanCreated / Subscribed on the SubscriptionManager).
// Uses viem `watchContractEvent` in poll mode (works over any transport).
// Replaces 2-minute polling loops with near-real-time event-driven sync.
// ---------------------------------------------------------------------------

import { parseAbiItem } from 'viem'
import type { Address, Hash, PublicClient } from 'viem'

// ── Event ABIs ─────────────────────────────────────────────────────────────

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'
)
const AGENT_REGISTERED_EVENT = parseAbiItem(
  'event AgentRegistered(uint256 indexed agentId, address indexed creator, string tokenURI)'
)
const PLAN_CREATED_EVENT = parseAbiItem(
  'event PlanCreated(uint256 indexed planId, uint256 indexed agentId, uint256 price, string period, address payToken, uint256 trialDays)'
)
const SUBSCRIBED_EVENT = parseAbiItem(
  'event Subscribed(uint256 indexed subscriptionId, address indexed subscriber, uint256 indexed agentId, uint256 expiresAt)'
)

const EVENT_ABI = {
  Transfer: TRANSFER_EVENT,
  AgentRegistered: AGENT_REGISTERED_EVENT,
  PlanCreated: PLAN_CREATED_EVENT,
  Subscribed: SUBSCRIBED_EVENT,
} as const

// ── Types ──────────────────────────────────────────────────────────────────

export type AgentXEventType = 'Transfer' | 'AgentRegistered' | 'PlanCreated' | 'Subscribed'

export interface AgentXChainEvent {
  type: AgentXEventType
  args: Record<string, unknown>
  txHash: Hash
}

export interface EventListenerOptions {
  /** IdentityRegistry address (emits Transfer / AgentRegistered). */
  identityRegistryAddress?: Address
  /** SubscriptionManager address (emits PlanCreated / Subscribed). */
  subscriptionManagerAddress?: Address
  events: AgentXEventType[]
  onEvent: (event: AgentXChainEvent) => void
  /** Start listening from this block (default: latest). */
  fromBlock?: number
  /** Polling interval in ms (default: 4000). */
  pollingInterval?: number
}

// Which events each contract can emit.
const CONTRACT_EVENTS: Record<'identityRegistryAddress' | 'subscriptionManagerAddress', readonly AgentXEventType[]> = {
  identityRegistryAddress: ['Transfer', 'AgentRegistered'],
  subscriptionManagerAddress: ['PlanCreated', 'Subscribed'],
}

// ── Listener ───────────────────────────────────────────────────────────────

/**
 * Subscribe to AgentX contract events and receive a normalized callback.
 *
 * @returns A function that unsubscribes from all watched events.
 */
export function subscribeToEvents(
  publicClient: PublicClient,
  options: EventListenerOptions
): Promise<() => void> {
  const unwatchAll: (() => void)[] = []

  const contracts = [
    { address: options.identityRegistryAddress, events: CONTRACT_EVENTS.identityRegistryAddress },
    { address: options.subscriptionManagerAddress, events: CONTRACT_EVENTS.subscriptionManagerAddress },
  ]

  for (const { address, events } of contracts) {
    if (!address) continue
    for (const eventName of events) {
      if (!options.events.includes(eventName)) continue
      unwatchAll.push(
        publicClient.watchContractEvent({
          address,
          abi: [EVENT_ABI[eventName]],
          eventName,
          fromBlock: options.fromBlock !== undefined ? BigInt(options.fromBlock) : undefined,
          pollingInterval: options.pollingInterval,
          onLogs: (logs) => {
            for (const log of logs) {
              options.onEvent({
                type: eventName,
                args: log.args as Record<string, unknown>,
                txHash: log.transactionHash,
              })
            }
          },
        })
      )
    }
  }

  return Promise.resolve(() => {
    for (const unwatch of unwatchAll) unwatch()
  })
}
