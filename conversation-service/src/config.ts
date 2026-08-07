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

  // Platform fallback LLM (non-BYOK tasks) — OpenAI-compatible provider,
  // e.g. DeepSeek via LLM_ENDPOINT=https://api.deepseek.com/v1 + LLM_MODEL=deepseek-chat
  llmEndpoint: process.env.LLM_ENDPOINT || '',
  llmModel: process.env.LLM_MODEL || 'gpt-4o',

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

  // Multi-agent orchestration layering (2026-08-07):
  //   off-chain (default) — real-time conversational delegation inside the
  //     conversation service: zero cost, no on-chain writes, nested agent runs.
  //   on-chain (opt-in)   — A2A protocol task via the Gateway: audit trail,
  //     settlement & reputation. Used when the user explicitly requests it.
  // Shared token must match the Gateway's ORCHESTRATE_TOKEN.
  orchestrateToken: process.env.ORCHESTRATE_TOKEN || '',
  // Default rail when the delegating agent does not specify mode.
  orchestrateDefaultMode: process.env.ORCHESTRATE_DEFAULT_MODE || 'offchain',
  // Maximum nested delegation depth for off-chain orchestration.
  orchestrateMaxDepth: parseInt(process.env.ORCHESTRATE_MAX_DEPTH || '4', 10),

  // Blockchain RPC (for fetching agent data)
  rpcUrl: process.env.RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
  rpcUrlOxaChain: process.env.RPC_URL_OXACHAIN || 'https://rpc-oxa.0xainet.top',

  // Contract addresses
  identityRegistry: process.env.IDENTITY_REGISTRY || '',
  identityRegistryOxaChain: process.env.IDENTITY_REGISTRY_OXACHAIN || '',

  // AgentRunner context cache
  contextCacheTtlSec: parseInt(process.env.CONTEXT_CACHE_TTL_SEC || '300', 10),

  // Task management (parallel runs within a session)
  taskMaxConcurrent: parseInt(process.env.TASK_MAX_CONCURRENT || '4', 10),
  taskTimeoutMs: parseInt(process.env.TASK_TIMEOUT_MS || String(15 * 60 * 1000), 10),
}
