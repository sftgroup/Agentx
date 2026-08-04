/** Chain selector accepted by every AgentX MCP tool. */
export type McpChain = 'sepolia' | 'oxachain'

/** A tool schema as returned by `tools/list`. */
export interface McpToolSchema {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties?: Record<string, unknown>
    required?: string[]
  }
}

/** Standard MCP server info from `initialize`. */
export interface McpServerInfo {
  name?: string
  version?: string
  [key: string]: unknown
}

// ── Agent summaries (agentx_identity_list_all) ─────────────────────────────

export interface AgentMetadata {
  name: string
  description: string
  capabilities: string[]
  skills: string[]
  isActive: boolean
}

export interface AgentSummary {
  agentId: number
  owner: string
  tokenURI: string
  metadata: AgentMetadata
  createdAt: number
}

export interface ListAgentsResult {
  agents: AgentSummary[]
  total: number
  range: { fromId: number; toId: number }
  chain: string
  chainId: number
}

export interface AgentMetadataResult {
  agentId: number
  owner?: string
  tokenURI?: string
  metadata?: AgentMetadata
  createdAt?: number
  exists: boolean
  chain: string
  chainId: number
}

export interface TotalAgentsResult {
  total: number
  chain: string
  chainId: number
}

export interface AgentExistsResult {
  agentId: number
  exists: boolean
  chain: string
  chainId: number
}

export interface OwnerAgentsResult {
  agentIds: number[]
  owner: string
  chain: string
  chainId: number
}

// ── Subscription (agentx_subscription_*) ────────────────────────────────────

export interface PlanResult {
  planId: number
  agentId: number
  creator: string
  price: string
  period: string
  active: boolean
  payToken: string
  trialDays: number
  chain: string
  chainId: number
}

export interface CheckSubscriptionResult {
  active: boolean
  subscriber: string
  agentId: number
  chain: string
  chainId: number
}

export interface SubscriptionDetailResult {
  subscriptionId: number
  subscriber: string
  agentId: number
  status: string
  startedAt: number
  expiresAt: number
  period: string
  payToken: string
  amountPaid: string
  trialActive: boolean
  trialEndsAt: number
  fundsReleased: boolean
  chain: string
  chainId: number
}

export interface MySubscriptionsResult {
  subscriptionIds: string[]
  user: string
  chain: string
  chainId: number
}

export interface FeeResult {
  platformFeeBps: number
  chain: string
  chainId: number
}

/** WRITE tools don't sign — they return a descriptor for the wallet client to submit. */
export interface WriteOpResult {
  _writeOp: boolean
  message: string
  contract: string
  chain: string
  chainId: number
  args?: Record<string, unknown>
}

// ── Generic ─────────────────────────────────────────────────────────────────

export interface GatewayHealthResult {
  status: string
  services?: Record<string, unknown>
  time?: string
  [key: string]: unknown
}

export interface TenantResult {
  tenant: string
  [key: string]: unknown
}
