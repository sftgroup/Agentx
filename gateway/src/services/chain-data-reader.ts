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
import type { AgentSummary, AgentXChainEvent, AgentXEventType, PlanDetail, SubscriptionDetail } from '@agentxv2/sdk'
import { CHAINS } from './chain-config'
import type { ChainInfo, ChainKey } from './chain-config'
import { ZERO_ADDRESS } from '../lib/constants'

export type { ChainKey }

/** Minimal ABI for raw viem reads the SDK does not wrap yet. */
const PLATFORM_FEES_ABI = [
  { name: 'platformFeesCollected', type: 'function', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const

// SDK classes require a WalletClient at construction but we never sign —
// construct one without an account (read-only). ChainDataReader is strictly
// read-only; all writes must be done by a caller-owned wallet client.

// ── Logger ─────────────────────────────────────────────────────────────────
// Gateway has no logger lib; console-based with a shared prefix so the chain
// read path is greppable in pm2 logs (`grep "chain-data"`).
export const log = {
  info: (msg: string, ...args: unknown[]) => console.log(`[chain-data] ${msg}`, ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(`[chain-data] ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`[chain-data] ${msg}`, ...args),
}

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
    if (!info) {
      log.warn(`resolve() rejected unknown chain "${chain}"`)
      throw new Error(`Unknown chain: "${chain}". Must be "sepolia" or "oxachain".`)
    }
    return info
  }

  /** Cached viem public client for a chain. */
  getPublicClient(chain: ChainKey): PublicClient {
    const key = this.resolve(chain)
    if (!this.clients[chain]) {
      this.clients[chain] = createPublicClient({ transport: http(key.rpcUrl) }) as unknown as PublicClient
      log.info(`public client created (chain=${chain}, rpc=${key.rpcUrl})`)
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
    const bn = Number(await this.getPublicClient(chain).getBlockNumber())
    log.info(`getBlockNumber(chain=${chain}) → ${bn}`)
    return bn
  }

  private getRegistry(chain: ChainKey): AgentRegistry {
    if (!this.registries[chain]) {
      const info = this.resolve(chain)
      this.registries[chain] = new AgentRegistry({
        contractAddress: info.identityRegistry as Address,
        publicClient: this.getPublicClient(chain),
        walletClient: createWalletClient({ transport: http(info.rpcUrl) }),
      })
      log.info(`AgentRegistry ready (chain=${chain}, address=${info.identityRegistry})`)
    }
    return this.registries[chain]!
  }

  private getSubscription(chain: ChainKey): SubscriptionManager {
    if (!this.subscriptions[chain]) {
      const info = this.resolve(chain)
      this.subscriptions[chain] = new SubscriptionManager({
        contractAddress: info.subscriptionManager as Address,
        publicClient: this.getPublicClient(chain),
        walletClient: this.makeReadonlyWallet(info.rpcUrl),
      })
      log.info(`SubscriptionManager ready (chain=${chain}, address=${info.subscriptionManager})`)
    }
    return this.subscriptions[chain]!
  }

  // ── IdentityRegistry reads ──────────────────────────────────────────────

  /** Total number of registered agents (monotonic max agent ID). */
  async totalAgents(chain: ChainKey): Promise<number> {
    const n = await this.getRegistry(chain).totalAgents()
    log.info(`totalAgents(chain=${chain}) → ${n}`)
    return n
  }

  /**
   * Batch-read agents in a contiguous ID range with optional filters
   * (equivalent to SDK `getAllAgents`; tolerant of malformed tokenURIs).
   */
  async listAgents(chain: ChainKey, options: ListAgentsOptions = {}): Promise<AgentSummary[]> {
    const t0 = Date.now()
    try {
      const agents = await this.getRegistry(chain).getAllAgents(options)
      log.info(
        `listAgents(chain=${chain}, ${JSON.stringify(options)}) → ${agents.length} agents in ${Date.now() - t0}ms`
      )
      return agents
    } catch (err) {
      log.error(`listAgents(chain=${chain}, ${JSON.stringify(options)}) failed: ${(err as Error).message}`)
      throw err
    }
  }

  /** Structured metadata for one agent (on-chain attrs + tokenURI JSON). */
  async getAgentMetadata(chain: ChainKey, agentId: number) {
    try {
      const meta = await this.getRegistry(chain).getAgentMetadata(agentId)
      log.info(`getAgentMetadata(chain=${chain}, agentId=${agentId}) → name="${meta.name}" isActive=${meta.isActive}`)
      return meta
    } catch (err) {
      log.error(`getAgentMetadata(chain=${chain}, agentId=${agentId}) failed: ${(err as Error).message}`)
      throw err
    }
  }

  /** Check if an agent ID exists on-chain. */
  async agentExists(chain: ChainKey, agentId: number): Promise<boolean> {
    const ok = await this.getRegistry(chain).agentExists(agentId)
    log.info(`agentExists(chain=${chain}, agentId=${agentId}) → ${ok}`)
    return ok
  }

  /** All agent IDs owned by an address. */
  async getAgentsByOwner(chain: ChainKey, owner: Address): Promise<number[]> {
    const ids = await this.getRegistry(chain).getAgentsByOwner(owner)
    log.info(`getAgentsByOwner(chain=${chain}, owner=${owner}) → ${ids.length} ids`)
    return ids
  }

  // ── SubscriptionManager reads ───────────────────────────────────────────

  /** Full plan details; `price` is a bigint (convert to string for JSON). */
  async getPlan(chain: ChainKey, planId: number): Promise<PlanDetail> {
    try {
      const plan = await this.getSubscription(chain).getPlan(planId)
      log.info(
        `getPlan(chain=${chain}, planId=${planId}) → agentId=${plan.agentId} price=${plan.price} period="${plan.period}" active=${plan.active}`
      )
      return plan
    } catch (err) {
      log.error(`getPlan(chain=${chain}, planId=${planId}) failed: ${(err as Error).message}`)
      throw err
    }
  }

  /** Whether a wallet has an active subscription for an agent. */
  async hasActiveSubscription(chain: ChainKey, subscriber: Address, agentId: number): Promise<boolean> {
    const active = await this.getSubscription(chain).hasActiveSubscription(subscriber, agentId)
    log.info(`hasActiveSubscription(chain=${chain}, subscriber=${subscriber}, agentId=${agentId}) → ${active}`)
    return active
  }

  /** Full subscription detail for one subscription ID. */
  async getSubscriptionDetail(chain: ChainKey, subscriptionId: number): Promise<SubscriptionDetail | null> {
    try {
      const d = await this.getSubscription(chain).getSubscriptionDetail(subscriptionId)
      log.info(`getSubscriptionDetail(chain=${chain}, subscriptionId=${subscriptionId}) → agentId=${d.agentId} status=${d.status}`)
      return d
    } catch (err) {
      log.error(`getSubscriptionDetail(chain=${chain}, subscriptionId=${subscriptionId}) failed: ${(err as Error).message}`)
      return null
    }
  }

  /** All subscription IDs owned by a wallet (v2: uint256[] of IDs). */
  async getUserSubscriptions(chain: ChainKey, user: Address): Promise<number[]> {
    const ids = await this.getSubscription(chain).getUserSubscriptions(user)
    log.info(`getUserSubscriptions(chain=${chain}, user=${user}) → ${ids.length} ids`)
    return ids
  }

  /** Platform fee in basis points. */
  async platformFeeBps(chain: ChainKey): Promise<number> {
    const fee = await this.getSubscription(chain).getPlatformFeeBps()
    log.info(`platformFeeBps(chain=${chain}) → ${fee}`)
    return fee
  }

  /**
   * Cumulative platform fees held by the protocol for a token
   * (address(0) = native ETH/OXA). Raw viem read — the SDK does not wrap
   * `platformFeesCollected` yet.
   */
  async platformFeesCollected(chain: ChainKey, token: Address = ZERO_ADDRESS): Promise<bigint> {
    const info = this.resolve(chain)
    const fees = await this.getPublicClient(chain).readContract({
      address: info.subscriptionManager as Address,
      abi: PLATFORM_FEES_ABI,
      functionName: 'platformFeesCollected',
      args: [token],
    })
    log.info(`platformFeesCollected(chain=${chain}, token=${token}) → ${fees}`)
    return fees
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
    log.info(`watchEvents started (chain=${chain}, events=${events.join(',')}${fromBlock !== undefined ? `, fromBlock=${fromBlock}` : ''})`)
    const unwatch = await subscribeToEvents(this.getPublicClient(chain), {
      identityRegistryAddress: info.identityRegistry as Address,
      subscriptionManagerAddress: info.subscriptionManager as Address,
      events,
      onEvent,
      fromBlock,
    })
    return () => {
      unwatch()
      log.info(`watchEvents stopped (chain=${chain}, events=${events.join(',')})`)
    }
  }
}

/** Singleton instance shared across Gateway routes/services. */
export const chainDataReader = new ChainDataReader()
