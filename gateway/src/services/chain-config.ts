// ---------------------------------------------------------------------------
// AgentX Gateway — Chain Registry (single source of truth)
// ---------------------------------------------------------------------------
// Dual-chain (Sepolia + OxaChain L1) RPC/chainId/contract-address map, sourced
// from config.ts. Consumed by the SDK-backed ChainDataReader and the MCP
// executor so the two stacks never drift on addresses.
// ---------------------------------------------------------------------------

import { config } from '../config'

export type ChainKey = 'sepolia' | 'oxachain'

export interface ChainInfo {
  rpcUrl: string
  chainId: number
  identityRegistry: string
  subscriptionManager: string
  a2aProtocol: string
  reputationRegistry: string
  configurationRegistry: string
  multiEndpoint: string
}

export const CHAINS: Record<ChainKey, ChainInfo> = {
  sepolia: {
    rpcUrl: config.rpcUrl,
    chainId: config.chainId,
    identityRegistry: config.identityRegistry,
    subscriptionManager: config.subscriptionManager,
    a2aProtocol: config.a2aProtocol,
    reputationRegistry: config.reputationRegistry,
    configurationRegistry: config.configurationRegistry,
    multiEndpoint: config.multiEndpoint,
  },
  oxachain: {
    rpcUrl: config.rpcUrlOxaChain,
    chainId: config.chainIdOxaChain,
    identityRegistry: config.identityRegistryOxaChain,
    subscriptionManager: config.subscriptionManagerOxaChain,
    a2aProtocol: config.a2aProtocolOxaChain,
    reputationRegistry: config.reputationRegistryOxaChain,
    configurationRegistry: config.configurationRegistryOxaChain,
    multiEndpoint: config.multiEndpointOxaChain,
  },
}
