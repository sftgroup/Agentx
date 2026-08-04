// ---------------------------------------------------------------------------
// AgentX Gateway — Chain Data Reader (SDK-based)
// ---------------------------------------------------------------------------
// Independent, reusable on-chain read utility for the Gateway. Wraps the
// @agentxv2/sdk `AgentRegistry` / `SubscriptionManager` / `subscribeToEvents`
// primitives (the same logic validated end-to-end against production in
// examples/sdk-chain-read.ts) behind a dual-chain (Sepolia + OxaChain L1)
// read-only service. Also re-exports the underlying viem public client so
// callers can do arbitrary contract reads when needed.
//
// Design notes:
//   - Read-only: all write operations require a caller-owned wallet client.
//     The SDK classes require a WalletClient at construction; we pass a
//     well-known placeholder account that is never used for signing.
//   - Lazily caches clients/contracts per chain (single instance exported).
//   - Tolerant tokenURI parsing comes from the SDK (v0.8.1+), matching the
//     agent-indexer behaviour (malformed base64 / unterminated JSON repaired).
// ---------------------------------------------------------------------------

import { createPublicClient, createWalletClient, http } from 'viem'
import type { Address, PublicClient, WalletClient } from 'viem'
import { AgentRegistry, SubscriptionManager, subscribeToEvents } from '@agentxv2/sdk'
import type { AgentSummary, AgentXChainEvent, AgentXEventType, PlanDetail } from '@agentxv2/sdk'
import { config } from '../config'

export type ChainKey = 'sepolia' | 'oxachain'

interface ChainInfo {
  rpcUrl: string
  chainId: number
  identityRegistry: Address
  subscriptionManager: Address
}

const CHAINS: Record<ChainKey, ChainInfo> = {
  sepolia: {
    rpcUrl: config.rpcUrl,
    chainId: config.chainId,
    identityRegistry: config.identityRegistry as Address,
    subscriptionManager: config.subscriptionManager as Address,
  },
  oxachain: {
    rpcUrl: config.rpcUrlOxaChain,
    chainId: config.chainIdOxaChain,
    identityRegistry: config.identityRegistryOxaChain as Address,
    subscriptionManager: config.subscriptionManagerOxaChain as Address,
  },
}

// SDK classes require a WalletClient at construction but we never sign —
// construct one without an account (read-only). ChainDataReader is strictly
// read-only; all writes must be done by a caller-owned wallet client.

export interface ListAgentsOptions {
  fromId?: number
  toId?: number
  activeOnly?: boolean
  capabilities?: string[]
  batchSize?: number
}

export class ChainDataReader {
  private clients: Partial<Record<ChainKey, PublicClient>> = {}
  private registries: Partial<Record<ChainKey, AgentRegistry>> = {}
  private subscriptions: Partial<Record<ChainKey, SubscriptionManager>> = {}

  /** Resolve chain config; throws on unknown chain. */
  private resolve(chain: ChainKey): ChainInfo {
    const info = CHAINS[chain]
    if (!info) throw new Error(`Unknown chain: "${chain}". Must be "sepolia" or "oxachain".`)
    return info
  }

  /** Cached viem public client for a chain. */
  getPublicClient(chain: ChainKey): PublicClient {
    const key = this.resolve(chain)
    if (!this.clients[chain]) {
      this.clients[chain] = createPublicClient({ transport: http(key.rpcUrl) }) as unknown as PublicClient
    }
    return this.clients[chain]!
  }

  // SDK requires a WalletClient at construction; we never sign, so the client
  // is created without an account. Casts: viem's factory functions return a
  // wider type than the SDK's (account=undefined) PublicClient/WalletClient.
  private makeReadonlyWallet(rpcUrl: string): WalletClient {
    return createWalletClient({ transport: http(rpcUrl) }) as unknown as WalletClient
  }

  /** Current block number of a chain. */
  async getBlockNumber(chain: ChainKey): Promise<number> {
    return Number(await this.getPublicClient(chain).getBlockNumber())
  }

  private getRegistry(chain: ChainKey): AgentRegistry {
    if (!this.registries[chain]) {
      const info = this.resolve(chain)
      this.registries[chain] = new AgentRegistry({
        contractAddress: info.identityRegistry,
        publicClient: this.getPublicClient(chain),
        walletClient: createWalletClient({ transport: http(info.rpcUrl) }),
      })
    }
    return this.registries[chain]!
  }

  private getSubscription(chain: ChainKey): SubscriptionManager {
    if (!this.subscriptions[chain]) {
      const info = this.resolve(chain)
      this.subscriptions[chain] = new SubscriptionManager({
        contractAddress: info.subscriptionManager,
        publicClient: this.getPublicClient(chain),
        walletClient: this.makeReadonlyWallet(info.rpcUrl),
      })
    }
    return this.subscriptions[chain]!
  }

  // ── IdentityRegistry reads ──────────────────────────────────────────────

  /** Total number of registered agents (monotonic max agent ID). */
  async totalAgents(chain: ChainKey): Promise<number> {
    return this.getRegistry(chain).totalAgents()
  }

  /**
   * Batch-read agents in a contiguous ID range with optional filters
   * (equivalent to SDK `getAllAgents`; tolerant of malformed tokenURIs).
   */
  async listAgents(chain: ChainKey, options: ListAgentsOptions = {}): Promise<AgentSummary[]> {
    return this.getRegistry(chain).getAllAgents(options)
  }

  /** Structured metadata for one agent (on-chain attrs + tokenURI JSON). */
  async getAgentMetadata(chain: ChainKey, agentId: number) {
    return this.getRegistry(chain).getAgentMetadata(agentId)
  }

  /** Check if an agent ID exists on-chain. */
  async agentExists(chain: ChainKey, agentId: number): Promise<boolean> {
    return this.getRegistry(chain).agentExists(agentId)
  }

  /** All agent IDs owned by an address. */
  async getAgentsByOwner(chain: ChainKey, owner: Address): Promise<number[]> {
    return this.getRegistry(chain).getAgentsByOwner(owner)
  }

  // ── SubscriptionManager reads ───────────────────────────────────────────

  /** Full plan details; `price` is a bigint (convert to string for JSON). */
  async getPlan(chain: ChainKey, planId: number): Promise<PlanDetail> {
    return this.getSubscription(chain).getPlan(planId)
  }

  /** Whether a wallet has an active subscription for an agent. */
  async hasActiveSubscription(chain: ChainKey, subscriber: Address, agentId: number): Promise<boolean> {
    return this.getSubscription(chain).hasActiveSubscription(subscriber, agentId)
  }

  /** Platform fee in basis points. */
  async platformFeeBps(chain: ChainKey): Promise<number> {
    return this.getSubscription(chain).getPlatformFeeBps()
  }

  // ── Event stream ────────────────────────────────────────────────────────

  /**
   * Watch on-chain events (Transfer / AgentRegistered on IdentityRegistry,
   * PlanCreated / Subscribed on SubscriptionManager). Returns an unsubscribe fn.
   */
  async watchEvents(
    chain: ChainKey,
    events: AgentXEventType[],
    onEvent: (event: AgentXChainEvent) => void,
    fromBlock?: number
  ): Promise<() => void> {
    const info = this.resolve(chain)
    return subscribeToEvents(this.getPublicClient(chain), {
      identityRegistryAddress: info.identityRegistry,
      subscriptionManagerAddress: info.subscriptionManager,
      events,
      onEvent,
      fromBlock,
    })
  }
}

/** Singleton instance shared across Gateway routes/services. */
export const chainDataReader = new ChainDataReader()
