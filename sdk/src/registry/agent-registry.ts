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
  totalAgents: {
    inputs: [] as const,
    name: 'totalAgents' as const,
    outputs: [{ name: '', type: 'uint256' }] as const,
    stateMutability: 'view' as const,
    type: 'function' as const,
  },
  getAgentOwner: {
    inputs: [{ name: 'agentId', type: 'uint256' }] as const,
    name: 'getAgentOwner' as const,
    outputs: [{ name: '', type: 'address' }] as const,
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

// ── Structured Metadata Types ───────────────────────────────────────────────

/** Public, human-readable subset of on-chain agent metadata. */
export interface AgentSummaryMetadata {
  name: string
  description: string
  capabilities: string[]
  skills: string[]
  /** Application category / use case (AGENT_CATEGORIES value; undefined = other). */
  category?: string
  /** Marketplace-visible availability; tokenURI JSON may override the default true. */
  isActive: boolean
}

/** Lightweight agent record returned by getAllAgents(). */
export interface AgentSummary {
  agentId: number
  owner: string
  tokenURI: string
  metadata: AgentSummaryMetadata
  /** Unix timestamp (seconds); 0 when the tokenURI metadata has no createdAt. */
  createdAt: number
}

export interface GetAllAgentsOptions {
  /** First agent ID to scan (default: 1). */
  fromId?: number
  /** Last agent ID to scan (default: totalAgents()). */
  toId?: number
  /** Only return agents whose metadata.isActive === true (default: false). */
  activeOnly?: boolean
  /** Only return agents whose capabilities include ALL of these (AND). */
  capabilities?: string[]
  /** RPC batching size (default: 10). */
  batchSize?: number
}

/** Full structured metadata for one agent (on-chain keys + tokenURI JSON). */
export interface StructuredAgentMetadata {
  name: string
  description: string
  encryptedPayloadCid: string
  eciesEncryptedKey: string
  publicPayloadCid: string
  capabilities: string[]
  skills: string[]
  /** Application category / use case (AGENT_CATEGORIES value; '' = other). */
  category?: string
  isActive: boolean
}

// ── tokenURI parsing helpers ────────────────────────────────────────────────

const ZERO_ADDRESS: Address = '0x0000000000000000000000000000000000000000'

/** Decode base64 in both Node and browser environments. */
function decodeBase64(b64: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(b64, 'base64').toString('utf-8')
  }
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/**
 * Parse base64 data-URI tokenURI → JSON metadata (null if not parseable).
 * Tolerant of contract bugs: trims trailing garbage after base64 padding,
 * repairs unterminated JSON (unclosed quotes/braces), and falls back to a
 * regex extraction of the name field.
 */
export function parseTokenURIJSON(tokenURI: string): Record<string, unknown> | null {
  if (!tokenURI || tokenURI.startsWith('ipfs://')) return null
  const match = tokenURI.match(/^data:application\/json;base64,(.+)$/i)
  if (!match) return null

  // Clean up malformed base64: trim everything after the last "==" padding.
  let b64 = match[1]!
  const lastDoubleEq = b64.lastIndexOf('==')
  if (lastDoubleEq > 0 && lastDoubleEq < b64.length - 2) {
    b64 = b64.substring(0, lastDoubleEq + 2)
  }

  try {
    const decoded = decodeBase64(b64)
    // Try strict JSON parse first.
    try {
      return JSON.parse(decoded)
    } catch {
      // Unterminated JSON (contract bug): append missing closing quotes/braces.
      let fixed = decoded
      const quoteCount = (fixed.match(/"/g) || []).length
      if (quoteCount % 2 !== 0) fixed += '"'
      const openBraces = (fixed.match(/\{/g) || []).length
      const closeBraces = (fixed.match(/\}/g) || []).length
      for (let i = closeBraces; i < openBraces; i++) fixed += '}'
      try { return JSON.parse(fixed) } catch { /* fall through */ }
    }
    // Regex fallback: extract the name field at least.
    const nameM = decoded.match(/"name"\s*:\s*"([^"]*)/)
    if (nameM) return { name: nameM[1] }
    return null
  } catch {
    return null
  }
}

/** Extract createdAt (unix seconds) from tokenURI JSON metadata. */
function parseCreatedAt(parsed: Record<string, unknown> | null): number {
  const v = parsed?.created_at ?? parsed?.createdAt
  if (typeof v === 'number') return Math.floor(v)
  if (typeof v === 'string') {
    const t = Date.parse(v)
    if (!Number.isNaN(t)) return Math.floor(t / 1000)
  }
  return 0
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

  /** Total number of registered agents (monotonic max agent ID). */
  async totalAgents(): Promise<number> {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: [IDENTITY_REGISTRY_ABI.totalAgents],
      functionName: 'totalAgents',
    })
    return Number(result as bigint)
  }

  /**
   * Structured metadata for one agent.
   * Combines on-chain attributes (encryptedPayloadCid / eciesEncryptedKey /
   * publicPayloadCid) with the tokenURI JSON (name/description/capabilities/skills).
   * `isActive` defaults to on-chain existence, overridable via tokenURI JSON.
   */
  async getAgentMetadata(agentId: number): Promise<StructuredAgentMetadata> {
    const attrs = await this.getAttributes(agentId)
    const parsed = parseTokenURIJSON(await this.tokenURI(agentId))

    const str = (v: unknown) => (typeof v === 'string' ? v : '')
    const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : [])
    const caps = arr(parsed?.capabilities)
    const skills = arr(parsed?.skills)

    return {
      name: str(parsed?.name) || str(attrs.name) || `Agent ${agentId}`,
      description: str(parsed?.description) || str(attrs.description),
      encryptedPayloadCid: str(attrs.encryptedPayloadCid),
      eciesEncryptedKey: str(attrs.eciesEncryptedKey),
      publicPayloadCid: str(attrs.publicPayloadCid),
      capabilities: caps.length ? caps : arr(attrs.capabilities),
      skills: skills.length ? skills : arr(attrs.skills),
      category: str(parsed?.category) || str(attrs.category) || undefined,
      isActive:
        typeof parsed?.isActive === 'boolean'
          ? parsed.isActive
          : typeof parsed?.is_active === 'boolean'
            ? parsed.is_active
            : await this.agentExists(agentId),
    }
  }

  /**
   * Batch-read all agents in a contiguous ID range with optional filters.
   * Replaces the manual binary-search + per-ID ownerOf loop used by chain-sync.
   */
  async getAllAgents(options: GetAllAgentsOptions = {}): Promise<AgentSummary[]> {
    const { fromId = 1, batchSize = 10, activeOnly = false, capabilities } = options
    const toId = options.toId ?? (await this.totalAgents())
    if (toId < fromId || toId <= 0) return []

    const agents: AgentSummary[] = []
    for (let start = fromId; start <= toId; start += batchSize) {
      const end = Math.min(start + batchSize - 1, toId)
      const ids: number[] = []
      for (let id = start; id <= end; id++) ids.push(id)

      const results = await Promise.all(
        ids.map(async (agentId) => {
          try {
            const [owner, tokenURI] = await Promise.all([
              this.publicClient.readContract({
                address: this.address,
                abi: [IDENTITY_REGISTRY_ABI.getAgentOwner],
                functionName: 'getAgentOwner',
                args: [BigInt(agentId)],
              }),
              this.tokenURI(agentId),
            ])
            if (!owner || owner === ZERO_ADDRESS || !tokenURI) return null

            const parsed = parseTokenURIJSON(tokenURI)
            const metadata: AgentSummaryMetadata = {
              name: (parsed?.name as string) || `Agent ${agentId}`,
              description: (parsed?.description as string) || '',
              capabilities: Array.isArray(parsed?.capabilities) ? parsed.capabilities.map(String) : [],
              skills: Array.isArray(parsed?.skills) ? parsed.skills.map(String) : [],
              category: typeof parsed?.category === 'string' && parsed.category ? parsed.category : undefined,
              isActive:
                typeof parsed?.isActive === 'boolean'
                  ? parsed.isActive
                  : typeof parsed?.is_active === 'boolean'
                    ? parsed.is_active
                    : true,
            }

            if (activeOnly && !metadata.isActive) return null
            if (capabilities?.length && !capabilities.every((c) => metadata.capabilities.includes(c))) return null

            return { agentId, owner: owner as string, tokenURI, metadata, createdAt: parseCreatedAt(parsed) }
          } catch {
            return null
          }
        })
      )

      for (const r of results) {
        if (r) agents.push(r)
      }
    }
    return agents
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
