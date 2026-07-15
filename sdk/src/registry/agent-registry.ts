// ---------------------------------------------------------------------------
// @agentx/sdk — Agent Registry
// ---------------------------------------------------------------------------
// Wraps IdentityRegistry contract interactions (on-chain agent CRUD).
//
// Design:
//   - Takes a viem PublicClient + WalletClient (chain-agnostic).
//   - No wagmi dependency — works with any wallet provider that implements
//     the WalletClient interface.
//   - Methods match the existing ERC8004 IdentityRegistry ABI.
// ---------------------------------------------------------------------------

import { encodeAbiParameters, parseAbiParameters, stringToHex, hexToString } from 'viem'
import type { PublicClient, WalletClient, Address, Hash } from 'viem'
import type { OnChainAgentMetadata } from '../core/types'

// ── Minimal ABI Fragments ──────────────────────────────────────────────────

const IDENTITY_REGISTRY_ABI = {
  // Register
  register: {
    inputs: [] as const,
    name: 'register' as const,
    outputs: [{ name: 'agentId', type: 'uint256' }] as const,
    stateMutability: 'payable' as const,
    type: 'function' as const,
  },
  registerWithTokenURI: {
    inputs: [{ name: 'tokenURI', type: 'string' }] as const,
    name: 'register' as const,
    outputs: [{ name: 'agentId', type: 'uint256' }] as const,
    stateMutability: 'payable' as const,
    type: 'function' as const,
  },
  registerWithMetadata: {
    inputs: [
      { name: 'tokenURI', type: 'string' },
      {
        name: 'metadata',
        type: 'tuple[]',
        components: [
          { name: 'key', type: 'string' },
          { name: 'value', type: 'bytes' },
        ],
      },
    ] as const,
    name: 'registerWithMetadata' as const,
    outputs: [{ name: 'agentId', type: 'uint256' }] as const,
    stateMutability: 'payable' as const,
    type: 'function' as const,
  },
  // Queries
  getAgentsByOwner: {
    inputs: [{ name: 'owner', type: 'address' }] as const,
    name: 'getAgentsByOwner' as const,
    outputs: [{ name: '', type: 'uint256[]' }] as const,
    stateMutability: 'view' as const,
    type: 'function' as const,
  },
  getCurrentAgentId: {
    inputs: [] as const,
    name: 'getCurrentAgentId' as const,
    outputs: [{ name: '', type: 'uint256' }] as const,
    stateMutability: 'view' as const,
    type: 'function' as const,
  },
  agentExists: {
    inputs: [{ name: 'agentId', type: 'uint256' }] as const,
    name: 'agentExists' as const,
    outputs: [{ name: '', type: 'bool' }] as const,
    stateMutability: 'view' as const,
    type: 'function' as const,
  },
  tokenURI: {
    inputs: [{ name: 'tokenId', type: 'uint256' }] as const,
    name: 'tokenURI' as const,
    outputs: [{ name: '', type: 'string' }] as const,
    stateMutability: 'view' as const,
    type: 'function' as const,
  },
  getAgentMetadata: {
    inputs: [{ name: 'agentId', type: 'uint256' }] as const,
    name: 'getAgentMetadata' as const,
    outputs: [{ name: '', type: 'tuple[]', components: [{ name: 'key', type: 'string' }, { name: 'value', type: 'bytes' }] }] as const,
    stateMutability: 'view' as const,
    type: 'function' as const,
  },
} as const

// ── Registry Config ────────────────────────────────────────────────────────

export interface AgentRegistryConfig {
  /** IdentityRegistry contract address */
  contractAddress: Address
  /** viem PublicClient for read calls */
  publicClient: PublicClient
  /** viem WalletClient for write calls */
  walletClient: WalletClient
}

// ── Agent Registry ─────────────────────────────────────────────────────────

export class AgentRegistry {
  private address: Address
  private publicClient: PublicClient
  private walletClient: WalletClient

  constructor(config: AgentRegistryConfig) {
    this.address = config.contractAddress
    this.publicClient = config.publicClient
    this.walletClient = config.walletClient
  }

  // ── Write: Register Agent ───────────────────────────────────────────────

  /**
   * Register a new Agent NFT on-chain.
   *
   * @param tokenURI    IPFS URI of the public metadata (ipfs://...)
   * @param metadata    Key-value metadata (encryptedPayloadCid, eciesEncryptedKey, etc.)
   * @param valueWei    Optional: native currency to send with registration
   * @returns           { agentId: number, txHash: Hash }
   */
  async register(
    tokenURI: string,
    metadata: { key: string; value: string }[],
    valueWei?: bigint
  ): Promise<{ agentId: number; txHash: Hash }> {
    const [account] = await this.walletClient.getAddresses()
    if (!account) throw new Error('Wallet not connected')

    const encodedMetadata = metadata.map(m => ({
      key: m.key,
      value: stringToHex(m.value),
    }))

    const { request } = await this.publicClient.simulateContract({
      account,
      address: this.address,
      abi: [IDENTITY_REGISTRY_ABI.registerWithMetadata],
      functionName: 'registerWithMetadata',
      args: [tokenURI, encodedMetadata],
      value: valueWei,
    })

    const hash = await this.walletClient.writeContract(request)
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash })

    // Parse agentId from Transfer event (ERC-721)
    const agentId = this._parseAgentIdFromReceipt(receipt)
    return { agentId, txHash: hash }
  }

  /**
   * Simple register — just a tokenURI, no extra metadata.
   */
  async registerSimple(tokenURI: string, valueWei?: bigint): Promise<{ agentId: number; txHash: Hash }> {
    const [account] = await this.walletClient.getAddresses()
    if (!account) throw new Error('Wallet not connected')

    const abi = tokenURI
      ? [IDENTITY_REGISTRY_ABI.registerWithTokenURI]
      : [IDENTITY_REGISTRY_ABI.register]

    const args = tokenURI ? [tokenURI] : []

    const { request } = await this.publicClient.simulateContract({
      account,
      address: this.address,
      abi: abi as any,
      functionName: 'register',
      args: args as any,
      value: valueWei,
    })

    const hash = await this.walletClient.writeContract(request)
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash })
    const agentId = this._parseAgentIdFromReceipt(receipt)
    return { agentId, txHash: hash }
  }

  // ── Read: Query ──────────────────────────────────────────────────────────

  /** Get all agent IDs owned by an address. */
  async getAgentsByOwner(owner: Address): Promise<number[]> {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: [IDENTITY_REGISTRY_ABI.getAgentsByOwner],
      functionName: 'getAgentsByOwner',
      args: [owner],
    })
    return (result as bigint[]).map(Number)
  }

  /** Get the current total agent count. */
  async getCurrentAgentId(): Promise<number> {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: [IDENTITY_REGISTRY_ABI.getCurrentAgentId],
      functionName: 'getCurrentAgentId',
    })
    return Number(result as bigint)
  }

  /** Check if an agent exists. */
  async agentExists(agentId: number): Promise<boolean> {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: [IDENTITY_REGISTRY_ABI.agentExists],
      functionName: 'agentExists',
      args: [BigInt(agentId)],
    })
    return result as boolean
  }

  /** Get the tokenURI for an agent. */
  async tokenURI(agentId: number): Promise<string> {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: [IDENTITY_REGISTRY_ABI.tokenURI],
      functionName: 'tokenURI',
      args: [BigInt(agentId)],
    })
    return result as string
  }

  /** Get all metadata attributes for an agent as key-value pairs. */
  async getAttributes(agentId: number): Promise<Record<string, string>> {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: [IDENTITY_REGISTRY_ABI.getAgentMetadata],
      functionName: 'getAgentMetadata',
      args: [BigInt(agentId)],
    })
    const attrs: Record<string, string> = {}
    for (const item of result as { key: string; value: string }[]) {
      attrs[item.key] = hexToString(item.value as `0x${string}`)
    }
    return attrs
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Extract tokenId from the Transfer event in the receipt. */
  private _parseAgentIdFromReceipt(receipt: { logs: { topics: string[]; data: string }[] }): number {
    for (const log of receipt.logs) {
      // ERC-721 Transfer event: keccak("Transfer(address,address,uint256)")
      const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
      if (log.topics[0] === transferTopic && log.topics.length >= 4) {
        return Number(BigInt(log.topics[3]!))
      }
    }
    throw new Error('Could not parse agentId from Transfer event in receipt')
  }
}

// ── Utility ─────────────────────────────────────────────────────────────────

/** Extract IPFS CID from an ipfs:// URI. */
export function cidFromURI(uri: string): string {
  return uri.replace(/^ipfs:\/\//, '')
}
