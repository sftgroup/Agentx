interface JSONSchema {
    type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'integer' | 'null';
    properties?: Record<string, JSONSchemaProperty>;
    required?: string[];
    description?: string;
    items?: JSONSchema;
    enum?: (string | number | boolean | null)[];
}
interface JSONSchemaProperty {
    type?: JSONSchema['type'] | JSONSchema['type'][];
    description?: string;
    properties?: Record<string, JSONSchemaProperty>;
    required?: string[];
    items?: JSONSchema;
    enum?: (string | number | boolean | null)[];
    format?: string;
    default?: unknown;
}
/**
 * A single skill module that an Agent exposes.
 * `inputSchema` and `outputSchema` follow MCP Tool JSON Schema conventions.
 */
interface SkillDef {
    /** Unique skill name (e.g. "solidity_audit") */
    name: string;
    /** Human-readable description shown in the marketplace */
    description: string;
    /** Semantic version of this skill */
    version: string;
    /** JSON Schema for the tool's input parameters */
    inputSchema: JSONSchema;
    /** JSON Schema for the tool's output return value */
    outputSchema?: JSONSchema;
    /**
     * Execution mode.
     * - undefined / "open": Source is in the encrypted payload, runs locally.
     * - { type: "mcp", toolName: "..." }: Source lives on the publisher's
     *     MCP server.  Subscriber only gets Schema + remote execution endpoint.
     *     MCP server verifies on-chain subscription on every call.
     * - { type: "a2a", targetAgentId: 42 }: Delegates to another AgentX Agent.
     *     The caller's AgentRunner loads + decrypts the target Agent, injects
     *     its prompt into the LLM context, and exposes its skills as callable
     *     tools.  This is the core Agent Composition primitive.
     */
    execution?: SkillExecutionRemote | A2ASkillExecution;
}
/** Where the skill code actually runs. */
type SkillExecutionMode = 'open' | 'mcp' | 'a2a';
interface SkillExecutionRemote {
    type: 'mcp';
    /** MCP tool name on the publisher's server (e.g. "run_strategy_abc123") */
    toolName: string;
    /** Optional: explicit MCP endpoint override */
    endpoint?: string;
}
/**
 * A2A Skill Execution — delegate to another AgentX Agent.
 *
 * Example: A "trading" Agent has a skill:
 *   execution: { type: "a2a", targetAgentId: 42 }
 * → When LLM calls this skill, AgentRunner loads Agent #42,
 *   decrypts its prompt+skills, and the sub-Agent runs in the
 *   same LLM conversation with its own system prompt.
 */
interface A2ASkillExecution {
    type: 'a2a';
    /** On-chain Agent ID to delegate to */
    targetAgentId: number;
    /** Optional: restrict which of the target Agent's skills are exposed */
    skillFilter?: string[];
    /** Optional: custom system prompt override for the sub-Agent */
    promptOverride?: string;
}
type McpTransport = 'http' | 'sse' | 'stdio';
interface McpConnection {
    /** Transport type */
    type: McpTransport;
    /** MCP server URL (required for http/sse) */
    url?: string;
    /** Optional: limit which tools the Agent exposes to users */
    toolFilter?: string[];
    /** Optional: MCP server authentication header / key */
    authHeader?: string;
}
type PricingType = 'subscription' | 'pay_per_use' | 'free';
interface AgentPricing {
    type: PricingType;
    /** Amount in native unit (e.g. "0.01" for 0.01 ETH) */
    amount: string;
    /** ERC20 token address, or empty for native currency */
    currency: string;
    /** Billing period for subscriptions (e.g. "month", "year", "day") */
    period?: string;
}
/**
 * The complete Agent definition.
 *
 * - Fields above "--- private payload ---" are public (IPFS publicPayloadCid).
 * - Fields below are encrypted with AES-256-GCM and stored at encryptedPayloadCid.
 */
interface AgentPayload {
    name: string;
    description: string;
    image?: string;
    version: string;
    tags: string[];
    capabilities: string[];
    supportedTasks: string[];
    communicationProtocol: 'mcp' | 'a2a';
    authenticationMethod: 'ecdsa';
    pricing: AgentPricing;
    prompt: string;
    skills: SkillDef[];
    mcp: McpConnection;
}
/** Subset of AgentPayload that is publicly visible */
type AgentPublicPayload = Omit<AgentPayload, 'prompt' | 'skills' | 'mcp'>;
/** Fields that must be encrypted before IPFS upload */
type AgentPrivatePayload = Pick<AgentPayload, 'prompt' | 'skills' | 'mcp'>;
interface EncryptedPayload {
    encrypted: true;
    algorithm: 'AES-256-GCM';
    /** base64(iv + ciphertext + authTag) */
    data: string;
}
interface OnChainAgentMetadata {
    tokenURI: string;
    attributes: {
        name: string;
        description: string;
        /** CID of the AES-256-GCM encrypted payload on IPFS */
        encryptedPayloadCid: string;
        /** ECIES-encrypted AES key (secp256k1, hex string) */
        eciesEncryptedKey: string;
        /** CID of the public metadata on IPFS */
        publicPayloadCid: string;
        capabilities: string[];
        skills: string[];
        mcpEndpoint: string;
        version: string;
        tags: string[];
        pricingType: PricingType;
        pricingAmount: string;
    };
}
interface RegisteredAgent {
    /** ERC-721 token ID (= agentId) */
    agentId: number;
    /** Owner wallet address */
    owner: string;
    /** Creator wallet address */
    creator: string;
    /** Full on-chain metadata */
    metadata: OnChainAgentMetadata;
    /** Block number where agent was registered */
    registeredAt: number;
    /** IPFS CID of the full public payload (resolved from tokenURI) */
    publicPayloadCid: string;
}
interface AgentSearchQuery {
    keyword?: string;
    capabilities?: string[];
    tags?: string[];
    pricingType?: PricingType;
    maxPrice?: string;
    owner?: string;
    sortBy?: 'latest' | 'reputation' | 'price_asc' | 'price_desc';
    page?: number;
    pageSize?: number;
}
interface AgentSearchResult {
    agents: RegisteredAgent[];
    total: number;
    page: number;
    pageSize: number;
}
type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'pending';
interface AgentSubscription {
    subscriptionId: number;
    subscriber: string;
    agentId: number;
    status: SubscriptionStatus;
    startedAt: number;
    expiresAt: number;
    period: string;
}
type A2ATaskStatus = 'created' | 'accepted' | 'in_progress' | 'completed' | 'failed';
interface A2AAgentCard {
    agentId: number;
    name: string;
    capabilities: string[];
    supportedTasks: string[];
    /** MCP endpoint URL for direct agent-to-agent communication */
    endpoint: string;
    /** Public key for ECDSA authentication */
    publicKey: string;
}
interface A2ATask {
    taskId: number;
    /** Agent that created the task */
    creator: string;
    /** Target agent to execute the task */
    targetAgentId: number;
    /** Task type (must be in target's supportedTasks) */
    taskType: string;
    /** JSON input payload */
    input: string;
    status: A2ATaskStatus;
    result?: string;
    createdAt: number;
    completedAt?: number;
}
interface AgentReputation {
    agentId: number;
    averageRating: number;
    totalRatings: number;
    reviews: AgentReview[];
}
interface AgentReview {
    reviewer: string;
    rating: number;
    comment: string;
    timestamp: number;
}
interface AgentXConfig {
    /** Chain ID (e.g. 11155111 for Sepolia) */
    chainId: number;
    /** RPC endpoint override (uses viem's default if omitted) */
    rpcUrl?: string;
    /** Contract addresses for the current chain */
    contracts: AgentXContracts;
    /** IPFS gateway URLs (ordered by priority) */
    ipfsGateways: string[];
    /** Default IPFS pinning service */
    pinningService?: 'pinata';
    pinataJwt?: string;
}
interface AgentXContracts {
    identityRegistry: `0x${string}`;
    subscriptionManager: `0x${string}`;
    a2aProtocolRegistry: `0x${string}`;
    reputationRegistry: `0x${string}`;
    configurationRegistry: `0x${string}`;
}
interface PackResult {
    /** CID of AES-256-GCM encrypted payload on IPFS */
    encryptedCid: string;
    /** CID of public metadata on IPFS */
    publicCid: string;
    /** Raw AES key (hex) — DO NOT share or upload this */
    aesKeyHex: string;
    /** ECIES-encrypted AES key (hex), safe to store on-chain */
    eciesEncryptedKeyHex: string;
}
interface UnpackResult {
    /** Decrypted AgentPayload */
    agent: AgentPayload;
    /** CID where the encrypted payload was fetched from */
    encryptedCid: string;
    /** CID of the public metadata */
    publicCid: string;
}
declare enum AgentXErrorCode {
    NOT_SUBSCRIBED = "NOT_SUBSCRIBED",
    SUBSCRIPTION_EXPIRED = "SUBSCRIPTION_EXPIRED",
    DECRYPTION_FAILED = "DECRYPTION_FAILED",
    IPFS_FETCH_FAILED = "IPFS_FETCH_FAILED",
    AGENT_NOT_FOUND = "AGENT_NOT_FOUND",
    INVALID_SCHEMA = "INVALID_SCHEMA",
    TX_FAILED = "TX_FAILED",
    WALLET_NOT_CONNECTED = "WALLET_NOT_CONNECTED"
}
declare class AgentXError extends Error {
    code: AgentXErrorCode;
    /** If NOT_SUBSCRIBED, carry enough info for wallet/X402 auto-payment */
    paymentInfo?: SubscriptionRequired;
    constructor(code: AgentXErrorCode, message: string);
}
/**
 * Structured info for wallet/X402 auto-subscription.
 * Thrown by AgentRunner.useAgent() when the user/Agent has no
 * active subscription.
 */
interface SubscriptionRequired {
    agentId: number;
    /** Plan IDs available for this Agent (on-chain query) */
    plans?: {
        planId: number;
        price: bigint;
        period: string;
        payToken: string;
        trialDays: number;
    }[];
}

export { type AgentPayload as A, type EncryptedPayload as E, type JSONSchema as J, type McpConnection as M, type OnChainAgentMetadata as O, type PackResult as P, type RegisteredAgent as R, type SkillDef as S, type UnpackResult as U, type AgentReview as a, type AgentReputation as b, type A2AAgentCard as c, type A2ASkillExecution as d, type A2ATask as e, type A2ATaskStatus as f, type AgentPricing as g, type AgentPrivatePayload as h, type AgentPublicPayload as i, type AgentSearchQuery as j, type AgentSearchResult as k, type AgentSubscription as l, type AgentXConfig as m, type AgentXContracts as n, AgentXError as o, AgentXErrorCode as p, type JSONSchemaProperty as q, type McpTransport as r, type PricingType as s, type SkillExecutionMode as t, type SkillExecutionRemote as u, type SubscriptionRequired as v, type SubscriptionStatus as w };
