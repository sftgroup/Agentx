// ---------------------------------------------------------------------------
// @agentx/sdk — useAgentRunner React Hook
// ---------------------------------------------------------------------------
// Wraps AgentRunner.useAgent() for React + wagmi integration.
//
//   const { ctx, isLoading, error } = useAgentRunner(agentId)
//   // ctx.prompt → inject into LLM
//   // ctx.skills → RunnableSkill[] with execute()
//   // ctx.mcp    → MCP connection info
// ---------------------------------------------------------------------------

'use client'

import { useState, useEffect, useRef } from 'react'
import { usePublicClient, useWalletClient } from 'wagmi'
import type { Address } from 'viem'

import { AgentRunner } from '../agent/agent-runner'
import type { AgentRunContext, OnChainReader } from '../agent/agent-runner'
import { IPFSFetcher } from '../registry/ipfs-fetcher'
import { KNOWN_CHAINS } from '../config/config'
import type { ChainConfig } from '../config/config'

// ── IdentityRegistry ABI (minimal — only what useAgent needs) ──────────────

const IDENTITY_REGISTRY_ABI = [
  // getAgentMetadata returns MetadataEntry[] with key+value strings
  {
    name: 'getAgentMetadata',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'key', type: 'string' },
          { name: 'value', type: 'bytes' },
        ],
      },
    ],
  },
] as const

// ── SubscriptionManager ABI (minimal) ─────────────────────────────────────

const SUBSCRIPTION_MANAGER_ABI = [
  {
    name: 'hasActiveSubscription',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'subscriber', type: 'address' },
      { name: 'agentId', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

// ── Hook Config ────────────────────────────────────────────────────────────

export interface UseAgentRunnerConfig {
  agentId: number
  chainConfig?: ChainConfig
  ipfsGateways?: string[]
}

export interface UseAgentRunnerResult {
  ctx: AgentRunContext | null
  isLoading: boolean
  error: Error | null
  /** Re-trigger the load (e.g. after connecting wallet or subscribing) */
  refetch: () => void
}

// ── OnChainReader Implementation (viem) ────────────────────────────────────

class ViemOnChainReader implements OnChainReader {
  constructor(
    private publicClient: ReturnType<typeof usePublicClient>,
    private chainConfig: ChainConfig
  ) {}

  async getTokenURI(_agentId: number): Promise<string> {
    // tokenURI is standard ERC-721 metadata — not needed for our flow
    // Metadata is fetched via getAgentMetadata
    return ''
  }

  async getAttributes(agentId: number): Promise<Record<string, string>> {
    if (!this.publicClient) throw new Error('Public client not available')

    const entries = (await this.publicClient.readContract({
      address: this.chainConfig.contracts.identityRegistry,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'getAgentMetadata',
      args: [BigInt(agentId)],
    })) as { key: string; value: string }[]

    const attrs: Record<string, string> = {}
    for (const entry of entries) {
      // value is bytes — convert to string
      const hexStr = entry.value
      if (hexStr && hexStr !== '0x') {
        attrs[entry.key] = hexToStringUTF8(hexStr)
      } else {
        attrs[entry.key] = ''
      }
    }
    return attrs
  }

  async hasActiveSubscription(address: string, agentId: number): Promise<boolean> {
    if (!this.publicClient) return false

    try {
      return (await this.publicClient.readContract({
        address: this.chainConfig.contracts.subscriptionManager,
        abi: SUBSCRIPTION_MANAGER_ABI,
        functionName: 'hasActiveSubscription',
        args: [address as Address, BigInt(agentId)],
      })) as boolean
    } catch {
      return false
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function hexToStringUTF8(hex: string): string {
  if (!hex.startsWith('0x')) return hex
  const hexClean = hex.slice(2)
  if (hexClean.length === 0) return ''
  try {
    const bytes = new Uint8Array(hexClean.length / 2)
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hexClean.substring(i * 2, i * 2 + 2), 16)
    }
    return new TextDecoder().decode(bytes)
  } catch {
    return hex
  }
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useAgentRunner(config: UseAgentRunnerConfig): UseAgentRunnerResult {
  const { agentId, chainConfig: chainConfigOverride, ipfsGateways } = config

  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const [ctx, setCtx] = useState<AgentRunContext | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [refetchKey, setRefetchKey] = useState(0)

  const runnerRef = useRef<AgentRunner | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!publicClient || !walletClient) {
      setError(new Error('Wallet not connected'))
      return
    }

    const chainConfig =
      chainConfigOverride ?? (publicClient.chain?.id ? KNOWN_CHAINS[publicClient.chain.id] : undefined)

    if (!chainConfig) {
      setError(new Error(`Chain ${publicClient.chain?.id} not supported`))
      return
    }

    // Create OnChainReader
    const reader = new ViemOnChainReader(publicClient, chainConfig)

    // WalletSigner from wagmi
    const signer = {
      async signMessage(message: string): Promise<string> {
        if (!walletClient.account) throw new Error('Wallet not connected')
        return walletClient.signMessage({ account: walletClient.account, message })
      },
      async getAddress(): Promise<string> {
        if (!walletClient.account) throw new Error('Wallet not connected')
        return walletClient.account.address
      },
      async getPrivateKey(): Promise<string> {
        // wagmi walletClient doesn't expose private key
        // ECIES decryption requires private key — must be injected from wallet provider
        throw new Error(
          'Private key not available via wagmi. ' +
          'Use window.ethereum.request({ method: "eth_private_key" }) or inject getPrivateKey via custom WalletSigner.'
        )
      },
    }

    // IPFS Fetcher
    const ipfsFetcher = new IPFSFetcher({
      fallbackGateways: ipfsGateways ?? chainConfig.ipfsGateways ?? [
        'gateway.pinata.cloud',
        'dweb.link',
        'cf-ipfs.com',
      ],
    })

    runnerRef.current = new AgentRunner({
      reader,
      wallet: signer,
      ipfsFetcher,
    })

    setIsLoading(true)
    setError(null)

    runnerRef.current
      .useAgent(agentId)
      .then(result => {
        if (mountedRef.current) {
          setCtx(result)
          setIsLoading(false)
        }
      })
      .catch(err => {
        if (mountedRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)))
          setIsLoading(false)
        }
      })

    return () => {
      mountedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, publicClient?.chain?.id, publicClient, walletClient, refetchKey])

  const refetch = () => setRefetchKey(k => k + 1)

  return { ctx, isLoading, error, refetch }
}
