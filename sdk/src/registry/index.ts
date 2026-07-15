// @agentx/sdk — Registry module
// Agent registration, query, and IPFS fetching.

export { AgentRegistry, cidFromURI } from './agent-registry'
export type { AgentRegistryConfig } from './agent-registry'

export { IPFSFetcher, defaultIPFSFetcher } from './ipfs-fetcher'
export type { IPFSFetcherConfig } from './ipfs-fetcher'

// Re-export types
export type {
  RegisteredAgent,
  AgentSearchQuery,
  AgentSearchResult,
  OnChainAgentMetadata,
} from '../core/types'

export const REGISTRY_VERSION = '0.1.0'
