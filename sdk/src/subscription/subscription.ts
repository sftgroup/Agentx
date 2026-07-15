// ---------------------------------------------------------------------------
// @agentx/sdk — Subscription Manager v2
// ---------------------------------------------------------------------------
// Wraps SubscriptionManager v2 contract (escrow, platform fee, multi-currency).
// Uses viem PublicClient / WalletClient (chain-agnostic).
// ---------------------------------------------------------------------------

import type { PublicClient, WalletClient, Address, Hash } from 'viem'
import type { AgentSubscription } from '../core/types'

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
    outputs: [
      { name: 'planId', type: 'uint256' },
      { name: 'agentId', type: 'uint256' },
      { name: 'creator', type: 'address' },
      { name: 'price', type: 'uint256' },
      { name: 'period', type: 'string' },
      { name: 'active', type: 'bool' },
      { name: 'payToken', type: 'address' },
      { name: 'trialDays', type: 'uint256' },
    ] as const,
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
    const [pid, aid, creator, price, period, active, payToken, trialDays] =
      result as [bigint, bigint, string, bigint, string, boolean, string, bigint]
    return {
      planId: Number(pid), agentId: Number(aid),
      creator: creator as Address, price, period, active,
      payToken: payToken as Address, trialDays: Number(trialDays),
    }
  }

  // ── Subscribe ────────────────────────────────────────────────────────────

  /**
   * Subscribe to a plan.
   * For ETH plans: pass valueWei = plan.price.
   * For ERC20 plans: auto-detects from plan.payToken, calls approve + subscribe.
   *                    User must have approved this contract for plan.price tokens.
   */
  async subscribe(
    planId: number,
    opts?: { valueWei?: bigint; approveTokenFirst?: boolean }
  ): Promise<{ subscriptionId: number; txHash: Hash }> {
    const [account] = await this.walletClient.getAddresses()
    if (!account) throw new Error('Wallet not connected')

    const plan = await this.getPlan(planId)
    if (!plan.active) throw new Error('Plan not active')

    if (plan.payToken === '0x0000000000000000000000000000000000000000') {
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
      const hash = await this.walletClient.writeContract(request)
      return { subscriptionId: 0, txHash: hash }
    } else {
      // ── ERC20 ──
      // Optionally approve first
      if (opts?.approveTokenFirst !== false) {
        const allowance = await this.publicClient.readContract({
          address: plan.payToken,
          abi: [ERC20_ABI.allowance],
          functionName: 'allowance',
          args: [account, this.address],
        })
        if ((allowance as bigint) < plan.price) {
          const { request: approveReq } = await this.publicClient.simulateContract({
            account,
            address: plan.payToken,
            abi: [ERC20_ABI.approve],
            functionName: 'approve',
            args: [this.address, plan.price],
          })
          await this.walletClient.writeContract(approveReq)
        }
      }

      const { request } = await this.publicClient.simulateContract({
        account,
        address: this.address,
        abi: [SUBSCRIPTION_ABI_V2.subscribe],
        functionName: 'subscribe',
        args: [BigInt(planId)],
      })
      const hash = await this.walletClient.writeContract(request)
      return { subscriptionId: 0, txHash: hash }
    }
  }

  /** Release escrowed funds to creator after trial window ends. */
  async releaseFunds(subscriptionId: number): Promise<Hash> {
    const [account] = await this.walletClient.getAddresses()
    if (!account) throw new Error('Wallet not connected')

    const { request } = await this.publicClient.simulateContract({
      account,
      address: this.address,
      abi: [SUBSCRIPTION_ABI_V2.releaseFunds],
      functionName: 'releaseFunds',
      args: [BigInt(subscriptionId)],
    })
    return this.walletClient.writeContract(request)
  }

  /** Cancel subscription (trial refund if within window). */
  async cancel(subscriptionId: number): Promise<Hash> {
    const [account] = await this.walletClient.getAddresses()
    if (!account) throw new Error('Wallet not connected')

    const { request } = await this.publicClient.simulateContract({
      account,
      address: this.address,
      abi: [SUBSCRIPTION_ABI_V2.cancelSubscription],
      functionName: 'cancelSubscription',
      args: [BigInt(subscriptionId)],
    })
    return this.walletClient.writeContract(request)
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
      status: ['active', 'expired', 'cancelled', 'pending'][status] as AgentSubscription['status'],
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
