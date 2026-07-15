// ---------------------------------------------------------------------------
// @agentx/sdk — Reputation
// ---------------------------------------------------------------------------
// Wraps ReputationRegistry contract for agent ratings and reviews.
// ---------------------------------------------------------------------------

import type { PublicClient, WalletClient, Address, Hash } from 'viem'
import type { AgentReputation, AgentReview } from '../core/types'

const REPUTATION_ABI = {
  rateAgent: {
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'rating', type: 'uint8' },
      { name: 'comment', type: 'string' },
    ] as const,
    name: 'rateAgent' as const,
    outputs: [] as const,
    stateMutability: 'nonpayable' as const,
    type: 'function' as const,
  },
  getRating: {
    inputs: [{ name: 'agentId', type: 'uint256' }] as const,
    name: 'getRating' as const,
    outputs: [
      { name: 'averageRating', type: 'uint256' },
      { name: 'totalRatings', type: 'uint256' },
    ] as const,
    stateMutability: 'view' as const,
    type: 'function' as const,
  },
  getReviews: {
    inputs: [{ name: 'agentId', type: 'uint256' }] as const,
    name: 'getReviews' as const,
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'reviewer', type: 'address' },
          { name: 'rating', type: 'uint8' },
          { name: 'comment', type: 'string' },
          { name: 'timestamp', type: 'uint256' },
        ],
      },
    ] as const,
    stateMutability: 'view' as const,
    type: 'function' as const,
  },
} as const

export interface ReputationConfig {
  contractAddress: Address
  publicClient: PublicClient
  walletClient: WalletClient
}

export class ReputationRegistry {
  private address: Address
  private publicClient: PublicClient
  private walletClient: WalletClient

  constructor(config: ReputationConfig) {
    this.address = config.contractAddress
    this.publicClient = config.publicClient
    this.walletClient = config.walletClient
  }

  private get account(): Promise<Address> {
    return this.walletClient.getAddresses().then(a => {
      if (!a[0]) throw new Error('Wallet not connected')
      return a[0]
    })
  }

  /** Submit a rating (1-5) with optional comment. */
  async rate(agentId: number, rating: number, comment = ''): Promise<Hash> {
    if (rating < 1 || rating > 5) throw new Error('Rating must be 1-5')
    const acct = await this.account
    const { request } = await this.publicClient.simulateContract({
      account: acct,
      address: this.address,
      abi: [REPUTATION_ABI.rateAgent],
      functionName: 'rateAgent',
      args: [BigInt(agentId), rating, comment],
    })
    return this.walletClient.writeContract(request)
  }

  /** Get average rating and total count. */
  async getRating(agentId: number): Promise<{ averageRating: number; totalRatings: number }> {
    const r = await this.publicClient.readContract({
      address: this.address,
      abi: [REPUTATION_ABI.getRating],
      functionName: 'getRating',
      args: [BigInt(agentId)],
    })
    const [avg, total] = r as [bigint, bigint]
    return { averageRating: Number(avg), totalRatings: Number(total) }
  }

  /** Get all reviews for an agent. */
  async getReviews(agentId: number): Promise<AgentReview[]> {
    const r = await this.publicClient.readContract({
      address: this.address,
      abi: [REPUTATION_ABI.getReviews],
      functionName: 'getReviews',
      args: [BigInt(agentId)],
    })
    return (r as { reviewer: string; rating: number; comment: string; timestamp: bigint }[])
      .map(x => ({
        reviewer: x.reviewer as Address,
        rating: x.rating,
        comment: x.comment,
        timestamp: Number(x.timestamp),
      }))
  }

  /** Get full reputation summary. */
  async getReputation(agentId: number): Promise<AgentReputation> {
    const [rating, reviews] = await Promise.all([
      this.getRating(agentId),
      this.getReviews(agentId),
    ])
    return { agentId, ...rating, reviews }
  }
}
