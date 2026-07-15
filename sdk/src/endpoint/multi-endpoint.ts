/**
 * MultiEndpointRegistry SDK
 * OxaChain L1 + Sepolia — multi-endpoint management for AI Agents
 */
import { type PublicClient, type WalletClient, type Address, type Hash, type Chain } from 'viem'

export interface EndpointRecord {
  endpointId: bigint
  agentId: bigint
  name: string
  endpointType: string
  protocol: string
  url: string
  description: string
  isActive: boolean
  createdAt: bigint
  updatedAt: bigint
  createdBy: Address
}

export interface MultiEndpointConfig {
  address: Address
}

const ABI = [
  {
    name: 'getActiveAgentEndpoints',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{
      type: 'tuple[]',
      components: [
        { name: 'endpointId', type: 'uint256' },
        { name: 'agentId', type: 'uint256' },
        { name: 'name', type: 'string' },
        { name: 'endpointType', type: 'string' },
        { name: 'protocol', type: 'string' },
        { name: 'url', type: 'string' },
        { name: 'description', type: 'string' },
        { name: 'isActive', type: 'bool' },
        { name: 'createdAt', type: 'uint256' },
        { name: 'updatedAt', type: 'uint256' },
        { name: 'createdBy', type: 'address' },
      ]
    }],
  },
  {
    name: 'getAgentEndpoints',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{
      type: 'tuple[]',
      components: [
        { name: 'endpointId', type: 'uint256' },
        { name: 'agentId', type: 'uint256' },
        { name: 'name', type: 'string' },
        { name: 'endpointType', type: 'string' },
        { name: 'protocol', type: 'string' },
        { name: 'url', type: 'string' },
        { name: 'description', type: 'string' },
        { name: 'isActive', type: 'bool' },
        { name: 'createdAt', type: 'uint256' },
        { name: 'updatedAt', type: 'uint256' },
        { name: 'createdBy', type: 'address' },
      ]
    }],
  },
  {
    name: 'createEndpoint',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'name', type: 'string' },
      { name: 'endpointType', type: 'string' },
      { name: 'protocol', type: 'string' },
      { name: 'url', type: 'string' },
      { name: 'description', type: 'string' },
    ],
    outputs: [{ name: 'endpointId', type: 'uint256' }],
  },
  {
    name: 'getEndpoint',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'endpointId', type: 'uint256' }],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'endpointId', type: 'uint256' },
        { name: 'agentId', type: 'uint256' },
        { name: 'name', type: 'string' },
        { name: 'endpointType', type: 'string' },
        { name: 'protocol', type: 'string' },
        { name: 'url', type: 'string' },
        { name: 'description', type: 'string' },
        { name: 'isActive', type: 'bool' },
        { name: 'createdAt', type: 'uint256' },
        { name: 'updatedAt', type: 'uint256' },
        { name: 'createdBy', type: 'address' },
      ]
    }],
  },
  {
    name: 'getSupportedProtocols',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string[]' }],
  },
  {
    name: 'getAgentEndpointStats',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [
      { name: 'totalEndpoints', type: 'uint256' },
      { name: 'activeEndpoints', type: 'uint256' },
      { name: 'httpEndpoints', type: 'uint256' },
      { name: 'websocketEndpoints', type: 'uint256' },
      { name: 'grpcEndpoints', type: 'uint256' },
    ],
  },
] as const

export class MultiEndpointClient {
  private address: Address
  private publicClient: PublicClient | null

  constructor(config: MultiEndpointConfig, publicClient?: PublicClient) {
    this.address = config.address
    this.publicClient = publicClient ?? null
  }

  setPublicClient(client: PublicClient) {
    this.publicClient = client
  }

  async getActiveEndpoints(agentId: bigint): Promise<EndpointRecord[]> {
    if (!this.publicClient) throw new Error('publicClient not set')
    return (await this.publicClient.readContract({
      address: this.address,
      abi: ABI,
      functionName: 'getActiveAgentEndpoints',
      args: [agentId],
    })) as EndpointRecord[]
  }

  async getAllEndpoints(agentId: bigint): Promise<EndpointRecord[]> {
    if (!this.publicClient) throw new Error('publicClient not set')
    return (await this.publicClient.readContract({
      address: this.address,
      abi: ABI,
      functionName: 'getAgentEndpoints',
      args: [agentId],
    })) as EndpointRecord[]
  }

  async getEndpoint(endpointId: bigint): Promise<EndpointRecord> {
    if (!this.publicClient) throw new Error('publicClient not set')
    return (await this.publicClient.readContract({
      address: this.address,
      abi: ABI,
      functionName: 'getEndpoint',
      args: [endpointId],
    })) as EndpointRecord
  }

  async getStats(agentId: bigint) {
    if (!this.publicClient) throw new Error('publicClient not set')
    return (await this.publicClient.readContract({
      address: this.address,
      abi: ABI,
      functionName: 'getAgentEndpointStats',
      args: [agentId],
    })) as [bigint, bigint, bigint, bigint, bigint]
  }

  /** Pick best active endpoint for the agent — prefer HTTP, take first active */
  async pickBestEndpoint(agentId: bigint): Promise<EndpointRecord | null> {
    const endpoints = await this.getActiveEndpoints(agentId)
    if (endpoints.length === 0) return null
    // prefer HTTP endpoints
    const http = endpoints.find(e => e.protocol === 'HTTP')
    return http ?? endpoints[0] ?? null
  }

  /** Pick any active endpoint URL — for MCP connector */
  async getBestMCPUrl(agentId: bigint): Promise<string | null> {
    const best = await this.pickBestEndpoint(agentId)
    return best?.url ?? null
  }
}
