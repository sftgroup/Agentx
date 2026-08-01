// AgentX Conversation Service — Configuration
// All values from environment variables (no hardcoding)

import dotenv from 'dotenv'
dotenv.config()

export const config = {
  port: parseInt(process.env.PORT || '8100', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/agentx_conversation',
  internalAuthToken: process.env.INTERNAL_AUTH_TOKEN || 'change-me-in-production',

  openaiApiKey: process.env.OPENAI_API_KEY || '',

  // Embedding configuration (for pgvector memory)
  embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-ada-002',
  embeddingApiUrl: process.env.EMBEDDING_API_URL || 'https://api.openai.com/v1/embeddings',

  // Context compaction
  compactModel: process.env.COMPACT_MODEL || 'gpt-4o-mini',

  // Encryption key for tenant API keys at rest (64 hex chars = 32 bytes)
  masterEncryptionKey: process.env.MASTER_ENCRYPTION_KEY || '',

  // AgentX Gateway URL (fallback when no tenant/agent key)
  gatewayUrl: process.env.GATEWAY_URL || 'http://localhost:3090',

  // Blockchain RPC (for fetching agent data)
  rpcUrl: process.env.RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
  rpcUrlOxaChain: process.env.RPC_URL_OXACHAIN || 'https://rpc-oxa.0xainet.top',

  // Contract addresses
  identityRegistry: process.env.IDENTITY_REGISTRY || '',
  identityRegistryOxaChain: process.env.IDENTITY_REGISTRY_OXACHAIN || '',

  // AgentRunner context cache
  contextCacheTtlSec: parseInt(process.env.CONTEXT_CACHE_TTL_SEC || '300', 10),

  // Sandbox (Phase 6)
  sandboxDockerImage: process.env.SANDBOX_DOCKER_IMAGE || 'node:20-alpine',
  sandboxTimeoutSec: parseInt(process.env.SANDBOX_TIMEOUT_SEC || '30', 10),
  sandboxMaxMemoryMb: parseInt(process.env.SANDBOX_MAX_MEMORY_MB || '256', 10),
}
