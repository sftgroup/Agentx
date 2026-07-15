/**
 * ConfigurationRegistry SDK
 * On-chain key-value config store for AI Agents
 */
import { type PublicClient, type WalletClient, type Address, type Hash } from 'viem'

export interface ConfigEntry {
  agentId: bigint
  key: string
  value: string
  dataType: string
  updatedAt: bigint
  updatedBy: Address
}

export interface ConfigurationConfig {
  address: Address
}

const ABI = [
  {
    name: 'getConfig',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'configKey', type: 'string' },
    ],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'agentId', type: 'uint256' },
        { name: 'key', type: 'string' },
        { name: 'value', type: 'string' },
        { name: 'dataType', type: 'string' },
        { name: 'updatedAt', type: 'uint256' },
        { name: 'updatedBy', type: 'address' },
      ],
    }],
  },
  {
    name: 'getAgentConfigs',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{
      type: 'tuple[]',
      components: [
        { name: 'agentId', type: 'uint256' },
        { name: 'key', type: 'string' },
        { name: 'value', type: 'string' },
        { name: 'dataType', type: 'string' },
        { name: 'updatedAt', type: 'uint256' },
        { name: 'updatedBy', type: 'address' },
      ],
    }],
  },
  {
    name: 'getConfigKeys',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{ type: 'string[]' }],
  },
  {
    name: 'getConfigCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'configExists',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'configKey', type: 'string' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const

export class ConfigurationClient {
  private address: Address
  private publicClient: PublicClient | null

  constructor(config: ConfigurationConfig, publicClient?: PublicClient) {
    this.address = config.address
    this.publicClient = publicClient ?? null
  }

  setPublicClient(client: PublicClient) {
    this.publicClient = client
  }

  async get(agentId: bigint, key: string): Promise<ConfigEntry | null> {
    if (!this.publicClient) throw new Error('publicClient not set')
    try {
      return (await this.publicClient.readContract({
        address: this.address,
        abi: ABI,
        functionName: 'getConfig',
        args: [agentId, key],
      })) as ConfigEntry
    } catch {
      return null
    }
  }

  async getAll(agentId: bigint): Promise<ConfigEntry[]> {
    if (!this.publicClient) throw new Error('publicClient not set')
    return (await this.publicClient.readContract({
      address: this.address,
      abi: ABI,
      functionName: 'getAgentConfigs',
      args: [agentId],
    })) as ConfigEntry[]
  }

  async getKeys(agentId: bigint): Promise<string[]> {
    if (!this.publicClient) throw new Error('publicClient not set')
    return (await this.publicClient.readContract({
      address: this.address,
      abi: ABI,
      functionName: 'getConfigKeys',
      args: [agentId],
    })) as string[]
  }

  async getCount(agentId: bigint): Promise<bigint> {
    if (!this.publicClient) throw new Error('publicClient not set')
    return (await this.publicClient.readContract({
      address: this.address,
      abi: ABI,
      functionName: 'getConfigCount',
      args: [agentId],
    })) as bigint
  }

  async exists(agentId: bigint, key: string): Promise<boolean> {
    if (!this.publicClient) throw new Error('publicClient not set')
    return (await this.publicClient.readContract({
      address: this.address,
      abi: ABI,
      functionName: 'configExists',
      args: [agentId, key],
    })) as boolean
  }
}
