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

  // Clarification interruption — pre-run gate that asks the user to disambiguate
  // ambiguous requests instead of running tools on guesswork
  clarificationEnabled: process.env.CLARIFICATION_ENABLED !== 'false',
  clarificationModel: process.env.CLARIFICATION_MODEL || 'gpt-4o-mini',

  // Memory: minimum confidence (0-1) for a fact to be stored
  memoryConfidenceThreshold: parseFloat(process.env.MEMORY_CONFIDENCE_THRESHOLD || '0.5'),

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
}
