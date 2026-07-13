// ---------------------------------------------------------------------------
// @agentx/sdk — A2A Protocol
// ---------------------------------------------------------------------------
// Wraps A2AProtocolRegistry: Agent Cards, Skills, and Tasks.
// viem PublicClient / WalletClient based.
// ---------------------------------------------------------------------------

import { stringToHex, hexToString } from 'viem'
import type { PublicClient, WalletClient, Address, Hash } from 'viem'
import type { A2AAgentCard, A2ATask, A2ATaskStatus } from '../core/types'

// ── ABI Fragments ──────────────────────────────────────────────────────────

const A2A_ABI = {
  createAgentCard: {
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'name', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'capabilities', type: 'string[]' },
      { name: 'supportedTasks', type: 'string[]' },
      { name: 'communicationProtocol', type: 'string' },
      { name: 'authenticationMethod', type: 'string' },
      { name: 'cardURI', type: 'string' },
    ] as const,
    name: 'createAgentCard' as const,
    outputs: [{ name: 'cardId', type: 'uint256' }] as const,
    stateMutability: 'nonpayable' as const,
    type: 'function' as const,
  },
  getAgentCard: {
    inputs: [{ name: 'agentId', type: 'uint256' }] as const,
    name: 'getAgentCard' as const,
    outputs: [
      { name: 'cardId', type: 'uint256' },
      { name: 'agentId', type: 'uint256' },
      { name: 'name', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'capabilities', type: 'string[]' },
      { name: 'supportedTasks', type: 'string[]' },
      { name: 'communicationProtocol', type: 'string' },
      { name: 'authenticationMethod', type: 'string' },
      { name: 'cardURI', type: 'string' },
      { name: 'isActive', type: 'bool' },
    ] as const,
    stateMutability: 'view' as const,
    type: 'function' as const,
  },
  registerSkill: {
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'inputSchema', type: 'string' },
      { name: 'outputSchema', type: 'string' },
      { name: 'requiredCapabilities', type: 'string[]' },
      { name: 'complexity', type: 'uint256' },
    ] as const,
    name: 'registerSkill' as const,
    outputs: [{ name: 'skillId', type: 'uint256' }] as const,
    stateMutability: 'nonpayable' as const,
    type: 'function' as const,
  },
  addAgentSkill: {
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'skillId', type: 'uint256' },
      { name: 'skillEndpoint', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'price', type: 'uint256' },
      { name: 'priceToken', type: 'address' },
    ] as const,
    name: 'addAgentSkill' as const,
    outputs: [] as const,
    stateMutability: 'nonpayable' as const,
    type: 'function' as const,
  },
  createTask: {
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'taskType', type: 'string' },
      { name: 'inputData', type: 'string' },
    ] as const,
    name: 'createTask' as const,
    outputs: [{ name: 'taskId', type: 'uint256' }] as const,
    stateMutability: 'nonpayable' as const,
    type: 'function' as const,
  },
  completeTask: {
    inputs: [
      { name: 'taskId', type: 'uint256' },
      { name: 'outputData', type: 'string' },
    ] as const,
    name: 'completeTask' as const,
    outputs: [] as const,
    stateMutability: 'nonpayable' as const,
    type: 'function' as const,
  },
  getTask: {
    inputs: [{ name: 'taskId', type: 'uint256' }] as const,
    name: 'getTask' as const,
    outputs: [
      { name: 'taskId', type: 'uint256' },
      { name: 'agentId', type: 'uint256' },
      { name: 'taskType', type: 'string' },
      { name: 'inputData', type: 'string' },
      { name: 'outputData', type: 'string' },
      { name: 'status', type: 'uint256' },
      { name: 'clientAddress', type: 'address' },
      { name: 'createdAt', type: 'uint256' },
      { name: 'completedAt', type: 'uint256' },
    ] as const,
    stateMutability: 'view' as const,
    type: 'function' as const,
  },
  getUserTasks: {
    inputs: [{ name: 'user', type: 'address' }] as const,
    name: 'getUserTasks' as const,
    outputs: [{ name: '', type: 'uint256[]' }] as const,
    stateMutability: 'view' as const,
    type: 'function' as const,
  },
} as const

// ── Config ─────────────────────────────────────────────────────────────────

export interface A2AConfig {
  contractAddress: Address
  publicClient: PublicClient
  walletClient: WalletClient
}

// ── A2A Protocol ───────────────────────────────────────────────────────────

export class A2AProtocol {
  private address: Address
  private publicClient: PublicClient
  private walletClient: WalletClient

  constructor(config: A2AConfig) {
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

  // ── Agent Card ──────────────────────────────────────────────────────────

  async createAgentCard(
    agentId: number,
    card: { name: string; description: string; version: string; capabilities: string[]; supportedTasks: string[]; commProtocol?: string; authMethod?: string; cardURI?: string }
  ): Promise<{ cardId: number; txHash: Hash }> {
    const acct = await this.account
    const { request } = await this.publicClient.simulateContract({
      account: acct,
      address: this.address,
      abi: [A2A_ABI.createAgentCard],
      functionName: 'createAgentCard',
      args: [
        BigInt(agentId), card.name, card.description, card.version,
        card.capabilities, card.supportedTasks,
        card.commProtocol ?? 'a2a', card.authMethod ?? 'ecdsa',
        card.cardURI ?? '',
      ],
    })
    const hash = await this.walletClient.writeContract(request)
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash })
    const cardId = this._parseUintFromLog(receipt, 'AgentCardCreated')
    return { cardId, txHash: hash }
  }

  async getAgentCard(agentId: number): Promise<A2AAgentCard | null> {
    const r = await this.publicClient.readContract({
      address: this.address,
      abi: [A2A_ABI.getAgentCard],
      functionName: 'getAgentCard',
      args: [BigInt(agentId)],
    })
    const [, aId, name, , , capabilities, supportedTasks, , , , isActive] = r as any
    if (!isActive) return null
    return {
      agentId: Number(aId),
      name: name as string,
      capabilities: capabilities as string[],
      supportedTasks: supportedTasks as string[],
      endpoint: '',
      publicKey: '',
    }
  }

  // ── Task ────────────────────────────────────────────────────────────────

  async createTask(agentId: number, taskType: string, input: Record<string, unknown>): Promise<{ taskId: number; txHash: Hash }> {
    const acct = await this.account
    const inputStr = JSON.stringify(input)
    const { request } = await this.publicClient.simulateContract({
      account: acct,
      address: this.address,
      abi: [A2A_ABI.createTask],
      functionName: 'createTask',
      args: [BigInt(agentId), taskType, inputStr],
    })
    const hash = await this.walletClient.writeContract(request)
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash })
    const taskId = this._parseUintFromLog(receipt, 'TaskCreated')
    return { taskId, txHash: hash }
  }

  async completeTask(taskId: number, output: unknown): Promise<Hash> {
    const acct = await this.account
    const outputStr = typeof output === 'string' ? output : JSON.stringify(output)
    const { request } = await this.publicClient.simulateContract({
      account: acct,
      address: this.address,
      abi: [A2A_ABI.completeTask],
      functionName: 'completeTask',
      args: [BigInt(taskId), outputStr],
    })
    return this.walletClient.writeContract(request)
  }

  async getTask(taskId: number): Promise<A2ATask | null> {
    const r = await this.publicClient.readContract({
      address: this.address,
      abi: [A2A_ABI.getTask],
      functionName: 'getTask',
      args: [BigInt(taskId)],
    })
    const [, aId, taskType, inputData, outputData, status, client, createdAt, completedAt] = r as any
    const statusMap: A2ATaskStatus[] = ['created', 'accepted', 'in_progress', 'completed', 'failed']
    return {
      taskId: taskId,
      creator: client as string,
      targetAgentId: Number(aId),
      taskType: taskType as string,
      input: inputData as string,
      status: statusMap[Number(status)] ?? 'created',
      result: outputData as string | undefined,
      createdAt: Number(createdAt),
      completedAt: completedAt as bigint > 0n ? Number(completedAt) : undefined,
    }
  }

  async getUserTasks(user: Address): Promise<number[]> {
    const r = await this.publicClient.readContract({
      address: this.address,
      abi: [A2A_ABI.getUserTasks],
      functionName: 'getUserTasks',
      args: [user],
    })
    return (r as bigint[]).map(Number)
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private _parseUintFromLog(receipt: { logs: { topics: string[]; data?: string }[] }, _eventName: string): number {
    for (const log of receipt.logs) {
      if (log.topics.length >= 2) {
        try { return Number(BigInt(log.topics[1]!)) } catch { /* */ }
      }
      if (log.data && log.data !== '0x') {
        try { return Number(BigInt(log.data)) } catch { /* */ }
      }
    }
    return 0
  }
}
