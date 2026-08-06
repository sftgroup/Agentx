// ---------------------------------------------------------------------------
// @agentx/sdk — Subscription Manager v2
// ---------------------------------------------------------------------------
// Wraps SubscriptionManager v2 contract (escrow, platform fee, multi-currency).
// Uses viem PublicClient / WalletClient (chain-agnostic).
// ---------------------------------------------------------------------------

import { decodeEventLog, parseAbiItem, toEventHash } from 'viem'
import type { PublicClient, WalletClient, Account, Address, Hash, Hex } from 'viem'
import type { AgentSubscription } from '../core/types'

export const ZERO_ADDRESS: Address = '0x0000000000000000000000000000000000000000'

// ── Event ABI (for receipt parsing) ────────────────────────────────────────

const PLAN_CREATED_EVENT = parseAbiItem(
  'event PlanCreated(uint256 indexed planId, uint256 indexed agentId, uint256 price, string period, address payToken, uint256 trialDays)'
)
const SUBSCRIBED_EVENT = parseAbiItem(
  'event Subscribed(uint256 indexed subscriptionId, address indexed subscriber, uint256 indexed agentId, uint256 expiresAt)'
)
const PLAN_CREATED_TOPIC = toEventHash(PLAN_CREATED_EVENT)
const SUBSCRIBED_TOPIC = toEventHash(SUBSCRIBED_EVENT)

// ── ABI Fragments (v2) ─────────────────────────────────────────────────────

const SUBSCRIPTION_ABI_V2 = {
  // Admin
  platformFeeBps: {
    inputs: [] as const, name: 'platformFeeBps' as const,
    outputs: [{ name: '', type: 'uint256' }] as const,
    stateMutability: 'view' as const, type: 'function' as const,
  },
  tokenWhitelist: {
    inputs: [{ name: 'token', type: 'address' }] as const,
    name: 'tokenWhitelist' as const,
    outputs: [{ name: '', type: 'bool' }] as const,
    stateMutability: 'view' as const, type: 'function' as const,
  },
  // Plans
  createPlan: {
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'price', type: 'uint256' },
      { name: 'period', type: 'string' },
      { name: 'payToken', type: 'address' },
      { name: 'trialDays', type: 'uint256' },
    ] as const,
    name: 'createPlan' as const,
    outputs: [{ name: 'planId', type: 'uint256' }] as const,
    stateMutability: 'nonpayable' as const, type: 'function' as const,
  },
  getPlan: {
    inputs: [{ name: 'planId', type: 'uint256' }] as const,
    name: 'getPlan' as const,
    // Contract returns `SubscriptionPlan memory` (struct → dynamic tuple encoding).
    outputs: [{
      type: 'tuple' as const,
      components: [
        { name: 'planId', type: 'uint256' } as const,
        { name: 'agentId', type: 'uint256' } as const,
        { name: 'creator', type: 'address' } as const,
        { name: 'price', type: 'uint256' } as const,
        { name: 'period', type: 'string' } as const,
        { name: 'active', type: 'bool' } as const,
        { name: 'payToken', type: 'address' } as const,
        { name: 'trialDays', type: 'uint256' } as const,
      ],
    }] as const,
    stateMutability: 'view' as const, type: 'function' as const,
  },
  // Subscribe
  subscribe: {
    inputs: [{ name: 'planId', type: 'uint256' }] as const,
    name: 'subscribe' as const,
    outputs: [{ name: 'subscriptionId', type: 'uint256' }] as const,
    stateMutability: 'payable' as const, type: 'function' as const,
  },
  // Trial / Release
  releaseFunds: {
    inputs: [{ name: 'subscriptionId', type: 'uint256' }] as const,
    name: 'releaseFunds' as const,
    outputs: [] as const,
    stateMutability: 'nonpayable' as const, type: 'function' as const,
  },
  cancelSubscription: {
    inputs: [{ name: 'subscriptionId', type: 'uint256' }] as const,
    name: 'cancelSubscription' as const,
    outputs: [] as const,
    stateMutability: 'nonpayable' as const, type: 'function' as const,
  },
  // Queries
  getSubscription: {
    inputs: [
      { name: 'subscriber', type: 'address' },
      { name: 'agentId', type: 'uint256' },
    ] as const,
    name: 'getSubscription' as const,
    outputs: [
      { name: 'subscriptionId', type: 'uint256' },
      { name: 'subscriber', type: 'address' },
      { name: 'agentId', type: 'uint256' },
      { name: 'status', type: 'uint8' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'expiresAt', type: 'uint256' },
      { name: 'period', type: 'string' },
    ] as const,
    stateMutability: 'view' as const, type: 'function' as const,
  },
  hasActiveSubscription: {
    inputs: [
      { name: 'subscriber', type: 'address' },
      { name: 'agentId', type: 'uint256' },
    ] as const,
    name: 'hasActiveSubscription' as const,
    outputs: [{ name: '', type: 'bool' }] as const,
    stateMutability: 'view' as const, type: 'function' as const,
  },
  getUserSubscriptions: {
    inputs: [{ name: 'user', type: 'address' }] as const,
    name: 'getUserSubscriptions' as const,
    outputs: [{ name: '', type: 'uint256[]' }] as const,
    stateMutability: 'view' as const, type: 'function' as const,
  },
  getSubscriptionDetail: {
    inputs: [{ name: 'subscriptionId', type: 'uint256' }] as const,
    name: 'getSubscriptionDetail' as const,
    outputs: [
      { name: 'subscriptionId', type: 'uint256' },
      { name: 'subscriber', type: 'address' },
      { name: 'agentId', type: 'uint256' },
      { name: 'status', type: 'uint8' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'expiresAt', type: 'uint256' },
      { name: 'period', type: 'string' },
      { name: 'payToken', type: 'address' },
      { name: 'amountPaid', type: 'uint256' },
      { name: 'trialActive', type: 'bool' },
      { name: 'trialEndsAt', type: 'uint256' },
      { name: 'fundsReleased', type: 'bool' },
    ] as const,
    stateMutability: 'view' as const, type: 'function' as const,
  },
} as const

// ── ERC20 ABI (approve) ────────────────────────────────────────────────────

const ERC20_ABI = {
  approve: {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ] as const,
    name: 'approve' as const,
    outputs: [{ name: '', type: 'bool' }] as const,
    stateMutability: 'nonpayable' as const, type: 'function' as const,
  },
  allowance: {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ] as const,
    name: 'allowance' as const,
    outputs: [{ name: '', type: 'uint256' }] as const,
    stateMutability: 'view' as const, type: 'function' as const,
  },
} as const

// ── Types ──────────────────────────────────────────────────────────────────

export interface SubscriptionConfig {
  contractAddress: Address
  publicClient: PublicClient
  walletClient: WalletClient
}

export interface PlanDetail {
  planId: number
  agentId: number
  creator: Address
  price: bigint
  period: string
  active: boolean
  payToken: Address        // address(0) = ETH
  trialDays: number
}

export interface SubscriptionDetail {
  subscriptionId: number
  subscriber: Address
  agentId: number
  status: number            // 0=Inactive, 1=Active, 2=Expired, 3=Cancelled
  startedAt: number
  expiresAt: number
  period: string
  payToken: Address
  amountPaid: bigint
  trialActive: boolean
  trialEndsAt: number
  fundsReleased: boolean
}

// On-chain `SubscriptionStatus` enum (contracts/src/SubscriptionManager.sol):
//   0=Inactive, 1=Active, 2=Expired, 3=Cancelled
// Mapped to the typed SubscriptionStatus string; Inactive is surfaced as
// 'pending' (SubscriptionStatus has no 'inactive' member).
const SUBSCRIPTION_STATUS_NAMES: Record<number, AgentSubscription['status']> = {
  0: 'pending',
  1: 'active',
  2: 'expired',
  3: 'cancelled',
}

// ── Period ─────────────────────────────────────────────────────────────────
// On-chain `_periodToSeconds` only recognizes day/week/month/year; any other
// string silently falls back to 30 days. Typed here so consumers cannot pass
// e.g. 'monthly'/'yearly' and get a wrong expiry (silently falling back to 30 days).

export const SUBSCRIPTION_PERIODS = ['day', 'week', 'month', 'year'] as const
export type SubscriptionPeriod = (typeof SUBSCRIPTION_PERIODS)[number]

export interface CreatePlanParams {
  agentId: number
  /** Price in wei (native token) or token units for ERC20 plans. */
  price: bigint
  /** Must be one of: day | week | month | year (contract-valid enum). */
  period: SubscriptionPeriod
  /** ERC20 pay token; default zero address = native token. */
  payToken?: Address
  /** Trial days (0–30). Default 0 = no trial. */
  trialDays?: number
}

export interface CreatePlanResult {
  planId: number
  txHash: Hash
}

export interface SubscribeResult {
  subscriptionId: number
  txHash: Hash
  subscriber: Address
  agentId: number
  /** Unix timestamp (seconds) when the subscription expires. */
  expiresAt: number
}

// ── Subscription Manager ───────────────────────────────────────────────────

export class SubscriptionManager {
  private address: Address
  private publicClient: PublicClient
  private walletClient: WalletClient

  constructor(config: SubscriptionConfig) {
    this.address = config.contractAddress
    this.publicClient = config.publicClient
    this.walletClient = config.walletClient
  }

  /**
   * Resolve the caller account for write operations.
   *
   * Prefers `walletClient.account` (a full viem Account object with signing
   * capability) over `getAddresses()[0]` (a bare address string). Passing a
   * bare string as `account` makes viem route `writeContract` through
   * `eth_sendTransaction` (node-managed accounts only), which fails for local
   * signers; the full object enables local signing via `eth_sendRawTransaction`.
   * In browser wallets (e.g. MetaMask) `client.account` is a json-rpc account
   * and the provider signs, so both paths keep working.
   */
  private async _resolveAccount(): Promise<Account | Address> {
    const clientAccount = this.walletClient.account as Account | undefined
    if (clientAccount) return clientAccount
    const [address] = await this.walletClient.getAddresses()
    if (!address) throw new Error('Wallet not connected')
    return address
  }

  // ── Config Read ──────────────────────────────────────────────────────────

  /** Get current platform fee in basis points (e.g. 250 = 2.5%). */
  async getPlatformFeeBps(): Promise<number> {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: [SUBSCRIPTION_ABI_V2.platformFeeBps],
      functionName: 'platformFeeBps',
    })
    return Number(result)
  }

  /** Check if a token is whitelisted for payments. */
  async isTokenWhitelisted(token: Address): Promise<boolean> {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: [SUBSCRIPTION_ABI_V2.tokenWhitelist],
      functionName: 'tokenWhitelist',
      args: [token],
    })
    return result as boolean
  }

  // ── Plans ────────────────────────────────────────────────────────────────

  /** Get full plan details with v2 fields. */
  async getPlan(planId: number): Promise<PlanDetail> {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: [SUBSCRIPTION_ABI_V2.getPlan],
      functionName: 'getPlan',
      args: [BigInt(planId)],
    })
    // Contract returns a struct — viem decodes it to a named object
    // (older viem versions returned a tuple; the object form is current).
    const r = result as unknown as {
      planId: bigint; agentId: bigint; creator: string; price: bigint;
      period: string; active: boolean; payToken: string; trialDays: bigint
    }
    return {
      planId: Number(r.planId), agentId: Number(r.agentId),
      creator: r.creator as Address, price: r.price, period: r.period, active: r.active,
      payToken: r.payToken as Address, trialDays: Number(r.trialDays),
    }
  }

  // ── Plans ────────────────────────────────────────────────────────────────

  /**
   * Create a subscription plan for an agent.
   *
   * @param params.period  Must be 'day' | 'week' | 'month' | 'year' — the only
   *                       values the contract maps to real durations. Anything
   *                       else silently becomes 30 days on-chain.
   * @returns              { planId, txHash } (planId parsed from PlanCreated event)
   */
  async createPlan(params: CreatePlanParams): Promise<CreatePlanResult> {
    const { agentId, price, period, payToken = ZERO_ADDRESS, trialDays = 0 } = params

    if (!SUBSCRIPTION_PERIODS.includes(period)) {
      throw new Error(
        `Invalid period "${period}". Must be one of: ${SUBSCRIPTION_PERIODS.join(', ')}`
      )
    }
    if (trialDays < 0 || trialDays > 30) {
      throw new Error('trialDays must be between 0 and 30')
    }

    const account = await this._resolveAccount()

    const { request } = await this.publicClient.simulateContract({
      account,
      address: this.address,
      abi: [SUBSCRIPTION_ABI_V2.createPlan],
      functionName: 'createPlan',
      args: [BigInt(agentId), price, period, payToken, BigInt(trialDays)],
    })
    const hash = await this.walletClient.writeContract({ ...request, account })
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash })

    return { planId: this._parsePlanIdFromReceipt(receipt), txHash: hash }
  }

  /**
   * Subscribe to a plan.
   * For ETH plans: pass valueWei = plan.price.
   * For ERC20 plans: auto-detects from plan.payToken, calls approve + subscribe.
   *                    User must have approved this contract for plan.price tokens.
   *
   * @returns SubscribeResult — subscriptionId/expiresAt/subscriber parsed from
   *          the Subscribed event (no longer hardcoded to 0).
   */
  async subscribe(
    planId: number,
    opts?: { valueWei?: bigint; approveTokenFirst?: boolean }
  ): Promise<SubscribeResult> {
    const account = await this._resolveAccount()

    const plan = await this.getPlan(planId)
    if (!plan.active) throw new Error('Plan not active')

    if (plan.payToken === ZERO_ADDRESS) {
      // ── ETH ──
      const value = opts?.valueWei ?? plan.price

      const { request } = await this.publicClient.simulateContract({
        account,
        address: this.address,
        abi: [SUBSCRIPTION_ABI_V2.subscribe],
        functionName: 'subscribe',
        args: [BigInt(planId)],
        value,
      })
      const hash = await this.walletClient.writeContract({ ...request, account })
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash })
      return { txHash: hash, ...this._parseSubscribedFromReceipt(receipt) }
    } else {
      // ── ERC20 ──
      const accountAddress = typeof account === 'string' ? account : account.address
      // Optionally approve first
      if (opts?.approveTokenFirst !== false) {
        const allowance = await this.publicClient.readContract({
          address: plan.payToken,
          abi: [ERC20_ABI.allowance],
          functionName: 'allowance',
          args: [accountAddress, this.address],
        })
        if ((allowance as bigint) < plan.price) {
          const { request: approveReq } = await this.publicClient.simulateContract({
            account,
            address: plan.payToken,
            abi: [ERC20_ABI.approve],
            functionName: 'approve',
            args: [this.address, plan.price],
          })
          await this.walletClient.writeContract({ ...approveReq, account })
        }
      }

      const { request } = await this.publicClient.simulateContract({
        account,
        address: this.address,
        abi: [SUBSCRIPTION_ABI_V2.subscribe],
        functionName: 'subscribe',
        args: [BigInt(planId)],
      })
      const hash = await this.walletClient.writeContract({ ...request, account })
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash })
      return { txHash: hash, ...this._parseSubscribedFromReceipt(receipt) }
    }
  }

  /**
   * One-step createPlan + subscribe (two transactions).
   * Saves the caller one round of plan lookup when the plan does not exist yet.
   */
  async createPlanAndSubscribe(params: CreatePlanParams): Promise<CreatePlanResult & SubscribeResult> {
    const { planId } = await this.createPlan(params)
    const subscribed = await this.subscribe(planId)
    return { planId, ...subscribed }
  }

  /** Release escrowed funds to creator after trial window ends. */
  async releaseFunds(subscriptionId: number): Promise<Hash> {
    const account = await this._resolveAccount()

    const { request } = await this.publicClient.simulateContract({
      account,
      address: this.address,
      abi: [SUBSCRIPTION_ABI_V2.releaseFunds],
      functionName: 'releaseFunds',
      args: [BigInt(subscriptionId)],
    })
    return this.walletClient.writeContract({ ...request, account })
  }

  /** Cancel subscription (trial refund if within window). */
  async cancel(subscriptionId: number): Promise<Hash> {
    const account = await this._resolveAccount()

    const { request } = await this.publicClient.simulateContract({
      account,
      address: this.address,
      abi: [SUBSCRIPTION_ABI_V2.cancelSubscription],
      functionName: 'cancelSubscription',
      args: [BigInt(subscriptionId)],
    })
    return this.walletClient.writeContract({ ...request, account })
  }

  // ── Read ─────────────────────────────────────────────────────────────────

  async hasActiveSubscription(subscriber: Address, agentId: number): Promise<boolean> {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: [SUBSCRIPTION_ABI_V2.hasActiveSubscription],
      functionName: 'hasActiveSubscription',
      args: [subscriber, BigInt(agentId)],
    })
    return result as boolean
  }

  async getSubscription(subscriber: Address, agentId: number): Promise<AgentSubscription | null> {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: [SUBSCRIPTION_ABI_V2.getSubscription],
      functionName: 'getSubscription',
      args: [subscriber, BigInt(agentId)],
    })
    const [subId, sub, aId, status, started, expires, period] =
      result as [bigint, string, bigint, number, bigint, bigint, string]
    if (Number(subId) === 0) return null
    return {
      subscriptionId: Number(subId),
      subscriber: sub as Address,
      agentId: Number(aId),
      status: SUBSCRIPTION_STATUS_NAMES[status] ?? 'pending',
      startedAt: Number(started),
      expiresAt: Number(expires),
      period,
    }
  }

  /** Get full subscription detail with v2 fields (trial, payToken, fundsReleased). */
  async getSubscriptionDetail(subscriptionId: number): Promise<SubscriptionDetail> {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: [SUBSCRIPTION_ABI_V2.getSubscriptionDetail],
      functionName: 'getSubscriptionDetail',
      args: [BigInt(subscriptionId)],
    })
    const [sid, sub, aId, status, started, expires, period, payToken,
           amountPaid, trialActive, trialEndsAt, fundsReleased] =
      result as [bigint, string, bigint, number, bigint, bigint, string, string,
                 bigint, boolean, bigint, boolean]
    return {
      subscriptionId: Number(sid), subscriber: sub as Address,
      agentId: Number(aId), status, startedAt: Number(started),
      expiresAt: Number(expires), period,
      payToken: payToken as Address, amountPaid,
      trialActive, trialEndsAt: Number(trialEndsAt), fundsReleased,
    }
  }

  async getUserSubscriptions(user: Address): Promise<number[]> {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: [SUBSCRIPTION_ABI_V2.getUserSubscriptions],
      functionName: 'getUserSubscriptions',
      args: [user],
    })
    return (result as bigint[]).map(Number)
  }

  // ── Receipt parsing (event-driven, no hardcoded IDs) ─────────────────────

  private _findEventLog(receipt: { logs: readonly unknown[] }, topic: Hex) {
    return receipt.logs.find((l) => (l as { topics?: readonly unknown[] }).topics?.[0] === topic)
  }

  /** Parse planId from the PlanCreated event in a transaction receipt. */
  private _parsePlanIdFromReceipt(receipt: { logs: readonly unknown[] }): number {
    const log = this._findEventLog(receipt, PLAN_CREATED_TOPIC)
    if (!log) {
      throw new Error('PlanCreated event not found in transaction receipt')
    }
    const decoded = decodeEventLog({
      abi: [PLAN_CREATED_EVENT],
      data: (log as { data: Hex }).data,
      topics: (log as { topics: [Hex, ...Hex[]] }).topics,
    })
    return Number(decoded.args.planId)
  }

  /** Parse subscriptionId/subscriber/agentId/expiresAt from the Subscribed event. */
  private _parseSubscribedFromReceipt(receipt: { logs: readonly unknown[] }): Omit<SubscribeResult, 'txHash'> {
    const log = this._findEventLog(receipt, SUBSCRIBED_TOPIC)
    if (!log) {
      throw new Error('Subscribed event not found in transaction receipt')
    }
    const decoded = decodeEventLog({
      abi: [SUBSCRIBED_EVENT],
      data: (log as { data: Hex }).data,
      topics: (log as { topics: [Hex, ...Hex[]] }).topics,
    })
    return {
      subscriptionId: Number(decoded.args.subscriptionId),
      subscriber: decoded.args.subscriber as Address,
      agentId: Number(decoded.args.agentId),
      expiresAt: Number(decoded.args.expiresAt),
    }
  }
}

// ── Subscription Guard ─────────────────────────────────────────────────────

export async function guardSubscription(
  manager: SubscriptionManager,
  user: Address,
  agentId: number
): Promise<AgentSubscription> {
  const active = await manager.hasActiveSubscription(user, agentId)
  if (!active) {
    throw new Error(
      `No active subscription for agent #${agentId}. ` +
      `Address ${user} must purchase a subscription first.`
    )
  }
  const sub = await manager.getSubscription(user, agentId)
  if (!sub) throw new Error(`Subscription not found for agent #${agentId}`)
  return sub
}
