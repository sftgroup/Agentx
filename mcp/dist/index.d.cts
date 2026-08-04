/** Chain selector accepted by every AgentX MCP tool. */
type McpChain = 'sepolia' | 'oxachain';
/** A tool schema as returned by `tools/list`. */
interface McpToolSchema {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties?: Record<string, unknown>;
        required?: string[];
    };
}
/** Standard MCP server info from `initialize`. */
interface McpServerInfo {
    name?: string;
    version?: string;
    [key: string]: unknown;
}
interface AgentMetadata {
    name: string;
    description: string;
    capabilities: string[];
    skills: string[];
    isActive: boolean;
}
interface AgentSummary {
    agentId: number;
    owner: string;
    tokenURI: string;
    metadata: AgentMetadata;
    createdAt: number;
}
interface ListAgentsResult {
    agents: AgentSummary[];
    total: number;
    range: {
        fromId: number;
        toId: number;
    };
    chain: string;
    chainId: number;
}
interface AgentMetadataResult {
    agentId: number;
    owner?: string;
    tokenURI?: string;
    metadata?: AgentMetadata;
    createdAt?: number;
    exists: boolean;
    chain: string;
    chainId: number;
}
interface TotalAgentsResult {
    total: number;
    chain: string;
    chainId: number;
}
interface AgentExistsResult {
    agentId: number;
    exists: boolean;
    chain: string;
    chainId: number;
}
interface OwnerAgentsResult {
    agentIds: number[];
    owner: string;
    chain: string;
    chainId: number;
}
interface PlanResult {
    planId: number;
    agentId: number;
    creator: string;
    price: string;
    period: string;
    active: boolean;
    payToken: string;
    trialDays: number;
    chain: string;
    chainId: number;
}
interface CheckSubscriptionResult {
    active: boolean;
    subscriber: string;
    agentId: number;
    chain: string;
    chainId: number;
}
interface SubscriptionDetailResult {
    subscriptionId: number;
    subscriber: string;
    agentId: number;
    status: string;
    startedAt: number;
    expiresAt: number;
    period: string;
    payToken: string;
    amountPaid: string;
    trialActive: boolean;
    trialEndsAt: number;
    fundsReleased: boolean;
    chain: string;
    chainId: number;
}
interface MySubscriptionsResult {
    subscriptionIds: string[];
    user: string;
    chain: string;
    chainId: number;
}
interface FeeResult {
    platformFeeBps: number;
    chain: string;
    chainId: number;
}
/** WRITE tools don't sign — they return a descriptor for the wallet client to submit. */
interface WriteOpResult {
    _writeOp: boolean;
    message: string;
    contract: string;
    chain: string;
    chainId: number;
    args?: Record<string, unknown>;
}
interface GatewayHealthResult {
    status: string;
    services?: Record<string, unknown>;
    time?: string;
    [key: string]: unknown;
}
interface TenantResult {
    tenant: string;
    [key: string]: unknown;
}

interface McpClientConfig {
    /** AgentX Gateway base URL, e.g. http://43.159.60.46:3090 */
    gatewayUrl: string;
    /** Chain used by default when a tool call omits `chain`. Aligns with the server default ('sepolia'). */
    defaultChain?: McpChain;
    /** Extra headers (e.g. `X-Api-Key` for tenant-gated tools). */
    headers?: Record<string, string>;
    /** Per-request timeout in ms (default 30_000). */
    timeoutMs?: number;
}
/**
 * Typed MCP client for the AgentX Gateway MCP server.
 *
 * Connects to `<gatewayUrl>/mcp` over standard MCP JSON-RPC 2.0 and exposes
 * the 32 AgentX tools — with typed convenience methods for the IdentityRegistry
 * and SubscriptionManager groups. All WRITE tools return a `WriteOpResult`
 * descriptor; the actual transaction must be signed/submitted with a wallet.
 */
declare class McpClient {
    private readonly url;
    private readonly defaultChain;
    private readonly headers;
    private readonly timeoutMs;
    private requestId;
    private serverInfo?;
    constructor(config: McpClientConfig);
    /** Perform a raw JSON-RPC request. */
    private rpc;
    /** Parse a tool call result (JSON inside `content[0].text`), tolerant of non-JSON text. */
    private static parseToolResult;
    /** `initialize` MCP handshake (cached). */
    initialize(): Promise<McpServerInfo>;
    /** `tools/list` — all tools registered on the server. */
    listTools(): Promise<McpToolSchema[]>;
    /** `tools/call` — invoke any tool and return the parsed result. */
    callTool<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T>;
    /** `agentx_identity_list_all` — batch query with filters (same as SDK `getAllAgents`). */
    listAgents(opts?: {
        chain?: McpChain;
        fromId?: number;
        toId?: number;
        activeOnly?: boolean;
        capabilities?: string;
    }): Promise<ListAgentsResult>;
    /** `agentx_identity_metadata` — structured metadata for one agent. */
    getAgentMetadata(agentId: number, chain?: McpChain): Promise<AgentMetadataResult>;
    /** `agentx_identity_total_count` — total registered agents. */
    totalAgents(chain?: McpChain): Promise<TotalAgentsResult>;
    /** `agentx_identity_exists` — on-chain existence check. */
    agentExists(agentId: number, chain?: McpChain): Promise<AgentExistsResult>;
    /** `agentx_identity_list` — agent IDs owned by a wallet. */
    agentsOfOwner(ownerAddress: string, chain?: McpChain): Promise<OwnerAgentsResult>;
    /** `agentx_subscription_plans` — single plan details (price is a decimal wei string). */
    getPlan(planId: number, chain?: McpChain): Promise<PlanResult>;
    /** `agentx_subscription_create_plan` — WRITE descriptor (sign & submit with a wallet). */
    createPlan(args: {
        agentId: number;
        price: string;
        period: 'day' | 'week' | 'month' | 'year';
        payToken?: string;
        trialDays?: number;
        chain?: McpChain;
    }): Promise<WriteOpResult>;
    /** `agentx_subscription_check` — active subscription for (wallet, agent). */
    checkSubscription(subscriberAddress: string, agentId: number, chain?: McpChain): Promise<CheckSubscriptionResult>;
    /** `agentx_subscription_detail` — full subscription detail. */
    subscriptionDetail(subscriptionId: number, chain?: McpChain): Promise<SubscriptionDetailResult>;
    /** `agentx_subscription_my_list` — all subscription IDs of a wallet. */
    mySubscriptions(userAddress: string, chain?: McpChain): Promise<MySubscriptionsResult>;
    /** `agentx_subscription_subscribe` — WRITE descriptor. */
    subscribe(planId: number, opts?: {
        valueWei?: string;
        chain?: McpChain;
    }): Promise<WriteOpResult>;
    /** `agentx_subscription_cancel` — WRITE descriptor. */
    cancelSubscription(subscriptionId: number, chain?: McpChain): Promise<WriteOpResult>;
    /** `agentx_subscription_release` — WRITE descriptor (release escrowed funds). */
    releaseFunds(subscriptionId: number, chain?: McpChain): Promise<WriteOpResult>;
    /** `agentx_subscription_fee` — current platform fee in basis points. */
    platformFee(chain?: McpChain): Promise<FeeResult>;
    /** `agentx_gateway_health` — gateway health + indexer status. */
    gatewayHealth(): Promise<GatewayHealthResult>;
    /** `agentx_gateway_tenant` — current tenant info (needs `X-Api-Key` header). */
    gatewayTenant(): Promise<TenantResult>;
}

export { type AgentExistsResult, type AgentMetadata, type AgentMetadataResult, type AgentSummary, type CheckSubscriptionResult, type FeeResult, type GatewayHealthResult, type ListAgentsResult, type McpChain, McpClient, type McpClientConfig, type McpServerInfo, type McpToolSchema, type MySubscriptionsResult, type OwnerAgentsResult, type PlanResult, type SubscriptionDetailResult, type TenantResult, type TotalAgentsResult, type WriteOpResult };
