// ---------------------------------------------------------------------------
// agentx-protocol — AgentX402: Auto-Subscription Gate
// ---------------------------------------------------------------------------
// Standardized error handling for wallet/X402 integration.
//
// AgentX does NOT implement X402 or wallet logic.
// Instead, it provides a clean subscription guard with structured
// error metadata so external payment layers can react.
//
// Flow:
//   App/Agent → AgentRunner.useAgent(id)
//     → NOT_SUBSCRIBED error + { agentId }
//     → X402 + AgentX402.requireSubscription() checks plans
//     → Wallet/X402 layer: user/Agent approves + subscribes
//     → App/Agent retries AgentRunner.useAgent(id)
//     → ✅ success
// ---------------------------------------------------------------------------

import type { PublicClient, WalletClient, Address } from 'viem'
import { AgentXError, AgentXErrorCode } from '../core/types'
import type { SubscriptionRequired } from '../core/types'

// ── ABI Fragments (v3 compatible) ──────────────────────────────────────────

const getPlanAbi = {
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
  stateMutability: 'view' as const,
  type: 'function' as const,
}

const subscribeAbi = {
  inputs: [{ name: 'planId', type: 'uint256' }] as const,
  name: 'subscribe' as const,
  outputs: [{ name: 'subscriptionId', type: 'uint256' }] as const,
  stateMutability: 'payable' as const,
  type: 'function' as const,
}

const hasActiveSubAbi = {
  inputs: [
    { name: 'subscriber', type: 'address' },
    { name: 'agentId', type: 'uint256' },
  ] as const,
  name: 'hasActiveSubscription' as const,
  outputs: [{ name: '', type: 'bool' }] as const,
  stateMutability: 'view' as const,
  type: 'function' as const,
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface AgentX402Config {
  subscriptionManagerAddress: Address
  publicClient: PublicClient
  walletClient: WalletClient
}

// ── AgentX402 ──────────────────────────────────────────────────────────────

export class AgentX402 {
  constructor(private config: AgentX402Config) {}

  /**
   * Require active subscription — or throw with auto-pay info.
   *
   * Usage:
   *   await x402.requireSubscription(agentId, address, { planIds: [1,2,3] })
   *
   * On success, returns silently.
   * On failure, throws AgentXError with paymentInfo populated
   * so the caller can auto-pay via wallet/X402.
   */
  async requireSubscription(
    agentId: number,
    address: Address,
    opts?: { planIds?: number[] },
  ): Promise<void> {
    const { publicClient, subscriptionManagerAddress } = this.config

    const isActive = (await publicClient.readContract({
      address: subscriptionManagerAddress,
      abi: [hasActiveSubAbi],
      functionName: 'hasActiveSubscription',
      args: [address, BigInt(agentId)],
    })) as boolean

    if (isActive) return // ✅ already subscribed

    // ── Build payment info for X402 layer ──
    const plans: NonNullable<SubscriptionRequired['plans']> = []

    if (opts?.planIds && opts.planIds.length > 0) {
      for (const planId of opts.planIds) {
        try {
          const plan = (await publicClient.readContract({
            address: subscriptionManagerAddress,
            abi: [getPlanAbi],
            functionName: 'getPlan',
            args: [BigInt(planId)],
          })) as unknown as unknown[]

          const planAgentId = Number(plan[1])
          const planActive = plan[5] as boolean

          if (planActive && planAgentId === agentId) {
            plans.push({
              planId: Number(plan[0]),
              price: plan[3] as bigint,
              period: plan[4] as string,
              payToken: plan[6] as string,
              trialDays: Number(plan[7]),
            })
          }
        } catch {
          // skip invalid plan IDs silently
        }
      }
    }

    const err = new AgentXError(
      AgentXErrorCode.NOT_SUBSCRIBED,
      `No active subscription for Agent #${agentId}. Use error.paymentInfo for auto-subscribe via X402/wallet.`,
    )
    ;(err as AgentXError & { paymentInfo: SubscriptionRequired }).paymentInfo = {
      agentId,
      plans: plans.length > 0 ? plans : undefined,
    }
    throw err
  }

  /**
   * Subscribe to a plan + wait for receipt.
   * Returns subscriptionId from the Subscribed event.
   *
   * NOTE: For ERC20 plans, the caller must approve token spending
   * BEFORE calling this method. Use X402 SDK or wagmi's useWriteContract
   * for the approve step.
   */
  async subscribeAndWait(
    planId: number,
    price: bigint,
    payToken: Address,
  ): Promise<number> {
    const { publicClient, walletClient, subscriptionManagerAddress } = this.config
    const isETH = payToken === '0x0000000000000000000000000000000000000000'

    const { request } = await publicClient.simulateContract({
      address: subscriptionManagerAddress,
      abi: [subscribeAbi],
      functionName: 'subscribe',
      args: [BigInt(planId)],
      account: walletClient.account?.address as Address,
      value: isETH ? price : 0n,
    })

    const hash = await walletClient.writeContract(request)
    const receipt = await publicClient.waitForTransactionReceipt({ hash })

    // Parse subscriptionId from Subscribed event (topic[1])
    // event Subscribed(uint256 indexed subscriptionId, ...)
    const subIdHex = receipt.logs[0]?.topics?.[1]
    if (!subIdHex || subIdHex === '0x') {
      throw new Error('Failed to parse subscriptionId from Subscribed event')
    }
    return Number(BigInt(subIdHex))
  }
}
