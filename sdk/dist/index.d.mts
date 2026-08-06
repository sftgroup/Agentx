import { M as McpConnection, a as AgentReview, b as AgentReputation } from './types-CCl4P8IB.mjs';
export { c as A2AAgentCard, d as A2ASkillExecution, e as A2ATask, f as A2ATaskStatus, A as AgentPayload, g as AgentPricing, h as AgentPrivatePayload, i as AgentPublicPayload, j as AgentSearchQuery, k as AgentSearchResult, l as AgentSubscription, m as AgentXConfig, n as AgentXContracts, o as AgentXError, p as AgentXErrorCode, E as EncryptedPayload, J as JSONSchema, q as JSONSchemaProperty, r as McpTransport, O as OnChainAgentMetadata, P as PackResult, s as PricingType, R as RegisteredAgent, S as SkillDef, t as SkillExecutionMode, u as SkillExecutionRemote, v as SubscriptionRequired, w as SubscriptionStatus, U as UnpackResult } from './types-CCl4P8IB.mjs';
export { PublishAgentConfig, PublishAgentResult, aesDecrypt, aesEncrypt, decryptPayload, decryptWithKey, eciesDecrypt, eciesEncrypt, encryptPayload, encryptWithKey, generateAesKey, generateKeyPair, getPublicKey, packAgentForPublish, publishAgent, randomBytes, unpackAgent } from './core/index.mjs';
import { Hash, Address, PublicClient, WalletClient } from 'viem';
export { a as A2ASkillResult, A as AgentRunContext, b as AgentRunner, c as AgentRunnerConfig, I as IPFSFetcher, d as IPFSFetcherConfig, O as OnChainReader, R as RunnableSkill, W as WalletSigner, e as defaultIPFSFetcher } from './agent-runner-BF6qaWKG.mjs';
export { A as A2AConfig, a as A2ADaemon, b as A2ADaemonConfig, c as A2AProtocol, d as A2ATaskResult, e as AgentLoop, f as AgentRegistry, g as AgentRegistryConfig, h as AgentSummary, i as AgentSummaryMetadata, C as ContextCompactor, j as CreatePlanParams, k as CreatePlanResult, F as FactExtractor, G as GetAllAgentsOptions, L as LoopTraceEmitter, P as PlanDetail, l as PlatformToolContext, m as PlatformToolDef, S as SUBSCRIPTION_PERIODS, n as StructuredAgentMetadata, o as SubscribeResult, p as SubscriptionConfig, q as SubscriptionDetail, r as SubscriptionManager, s as SubscriptionPeriod, T as ToolExecutor, Z as ZERO_ADDRESS, t as buildPlatformTools, u as buildSystemPrompt, v as buildTools, w as cidFromURI, x as executePlatformTool, y as getAllPlatformToolNames, z as guardSubscription, B as parseTokenURIJSON, D as wrapPlatformToolsAsSkills } from './index-B3nAhQrZ.mjs';
export { A as AgentLoopConfig, a as AgentLoopResult, C as ChatRequest, b as ChatStreamEvent, L as LLMMessage, c as LLMProvider, d as LLMToolCall, e as LoopRunContext, O as OpenAIToolDef, T as ToolCallRecord, f as ToolCallResult, g as ToolCallStart } from './types-BKnF5A2A.mjs';
export { GatewayProvider, GatewayProviderConfig, OpenAIProvider, OpenAIProviderConfig, ProviderFactoryConfig, createLLMProvider } from './llm/index.mjs';
export { EndpointRecord, MultiEndpointClient, MultiEndpointConfig } from './endpoint/index.mjs';
export { ConfigEntry, ConfigurationClient, ConfigurationConfig } from './configuration/index.mjs';
export { IPFSUploadResult, IPFSUploader, IPFSUploaderConfig, defaultIPFSUploader } from './ipfs/index.mjs';
export { MemoryConfig, MemoryFact, MemoryProvider } from './memory/index.mjs';
export { HttpTraceEmitter, NoopTraceEmitter, TraceConfig, TraceEmitter, TraceEvent } from './traces/index.mjs';
export { BrowserAction, BrowserActionResult, executeBrowserAction, extractAccessibleDOM } from './skills/index.mjs';
export { ConversationChatParams, ConversationChatResult, ConversationClient, ConversationClientConfig, ConversationCreateSessionParams, ConversationCreateTaskParams, ConversationSSEEvent, ConversationSkillDef, ConversationTask, ConversationTaskError, ConversationTaskStatus } from './conversation/index.mjs';
export { C as ChainConfig, a as ConfigRegistryOpts, b as ConfigurationRegistry, K as KNOWN_CHAINS } from './config-BFeSR_GK.mjs';
export { bytesToHex, hexToBytes } from '@noble/ciphers/utils.js';
import 'events';

type AgentXEventType = 'Transfer' | 'AgentRegistered' | 'PlanCreated' | 'Subscribed';
interface AgentXChainEvent {
    type: AgentXEventType;
    args: Record<string, unknown>;
    txHash: Hash;
}
interface EventListenerOptions {
    /** IdentityRegistry address (emits Transfer / AgentRegistered). */
    identityRegistryAddress?: Address;
    /** SubscriptionManager address (emits PlanCreated / Subscribed). */
    subscriptionManagerAddress?: Address;
    events: AgentXEventType[];
    onEvent: (event: AgentXChainEvent) => void;
    /** Start listening from this block (default: latest). */
    fromBlock?: number;
    /** Polling interval in ms (default: 4000). */
    pollingInterval?: number;
}
/**
 * Subscribe to AgentX contract events and receive a normalized callback.
 *
 * @returns A function that unsubscribes from all watched events.
 */
declare function subscribeToEvents(publicClient: PublicClient, options: EventListenerOptions): Promise<() => void>;

declare const REGISTRY_VERSION = "0.1.0";

interface AgentX402Config {
    subscriptionManagerAddress: Address;
    publicClient: PublicClient;
    walletClient: WalletClient;
}
declare class AgentX402 {
    private config;
    constructor(config: AgentX402Config);
    /**
     * Require active subscription — or throw with auto-pay info.
     *
     * Usage:
     *   await x402.requireSubscription(agentId, address, { planIds: [1,2,3] })
     *
     * On success, returns silently.
     * On failure, throws AgentXError with paymentInfo populated
     * so the caller can auto-pay via wallet/X402.
     */
    requireSubscription(agentId: number, address: Address, opts?: {
        planIds?: number[];
    }): Promise<void>;
    /**
     * Subscribe to a plan + wait for receipt.
     * Returns subscriptionId from the Subscribed event.
     *
     * NOTE: For ERC20 plans, the caller must approve token spending
     * BEFORE calling this method. Use X402 SDK or wagmi's useWriteContract
     * for the approve step.
     */
    subscribeAndWait(planId: number, price: bigint, payToken: Address): Promise<number>;
}

declare const SUBSCRIPTION_VERSION = "0.3.0";

declare const A2A_VERSION = "0.1.0";

interface MCPTool {
    name: string;
    description?: string;
    inputSchema: Record<string, unknown>;
}
interface MCPCallResult {
    content: {
        type: string;
        text?: string;
        data?: string;
    }[];
    isError?: boolean;
}
interface MCPConnectorConfig {
    /** MCP server base URL */
    url: string;
    /** Transport type */
    transport?: 'http' | 'sse';
    /** Auth header value (e.g. "Bearer xxx") */
    authHeader?: string;
    /** Request timeout in ms (default: 30_000) */
    timeoutMs?: number;
    /** Optional: subscriber address for subscription-gated MCP servers */
    subscriberAddress?: string;
    /** Optional: wallet signature for authentication */
    signature?: string;
    timestamp?: number;
}
declare class MCPConnector {
    private config;
    constructor(config: MCPConnectorConfig);
    /** Create from an Agent's McpConnection. */
    static fromAgent(mcp: McpConnection, opts?: Partial<MCPConnectorConfig>): MCPConnector;
    /** List available tools from the MCP server. */
    listTools(): Promise<MCPTool[]>;
    /** Call a tool on the MCP server. */
    callTool(name: string, args?: Record<string, unknown>): Promise<MCPCallResult>;
    listResources(): Promise<unknown[]>;
    readResource(uri: string): Promise<unknown>;
    private _request;
}

declare const MCP_VERSION = "0.1.0";

interface ReputationConfig {
    contractAddress: Address;
    publicClient: PublicClient;
    walletClient: WalletClient;
}
declare class ReputationRegistry {
    private address;
    private publicClient;
    private walletClient;
    constructor(config: ReputationConfig);
    private get account();
    /** Submit a rating (1-5) with optional comment. */
    rate(agentId: number, rating: number, comment?: string): Promise<Hash>;
    /** Get average rating and total count. */
    getRating(agentId: number): Promise<{
        averageRating: number;
        totalRatings: number;
    }>;
    /** Get all reviews for an agent. */
    getReviews(agentId: number): Promise<AgentReview[]>;
    /** Get full reputation summary. */
    getReputation(agentId: number): Promise<AgentReputation>;
}

declare const REPUTATION_VERSION = "0.1.0";

declare const CONFIG_VERSION = "0.1.0";

export { A2A_VERSION, AgentReputation, AgentReview, AgentX402, type AgentX402Config, type AgentXChainEvent, type AgentXEventType, CONFIG_VERSION, type EventListenerOptions, type MCPCallResult, MCPConnector, type MCPConnectorConfig, type MCPTool, MCP_VERSION, McpConnection, REGISTRY_VERSION, REPUTATION_VERSION, type ReputationConfig, ReputationRegistry, SUBSCRIPTION_VERSION, subscribeToEvents };
