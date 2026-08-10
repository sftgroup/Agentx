import { M as McpConnection, a as AgentReview, b as AgentReputation } from './types-DJHPGJSX.js';
export { c as A2AAgentCard, d as A2ASkillExecution, e as A2ATask, f as A2ATaskStatus, g as AGENT_CATEGORIES, h as AgentCategory, A as AgentPayload, i as AgentPricing, j as AgentPrivatePayload, k as AgentPublicPayload, l as AgentSearchQuery, m as AgentSearchResult, n as AgentSubscription, o as AgentXConfig, p as AgentXContracts, q as AgentXError, r as AgentXErrorCode, E as EncryptedPayload, J as JSONSchema, s as JSONSchemaProperty, t as McpTransport, O as OnChainAgentMetadata, P as PackResult, u as PricingType, R as RegisteredAgent, S as SkillDef, v as SkillExecutionMode, w as SkillExecutionRemote, x as SubscriptionRequired, y as SubscriptionStatus, U as UnpackResult } from './types-DJHPGJSX.js';
export { PublishAgentConfig, PublishAgentResult, aesDecrypt, aesEncrypt, decryptPayload, decryptWithKey, eciesDecrypt, eciesEncrypt, encryptPayload, encryptWithKey, generateAesKey, generateKeyPair, getPublicKey, packAgentForPublish, publishAgent, randomBytes, unpackAgent } from './core/index.js';
import { Hash, Address, PublicClient, WalletClient } from 'viem';
export { a as A2ASkillResult, A as AgentRunContext, b as AgentRunner, c as AgentRunnerConfig, I as IPFSFetcher, d as IPFSFetcherConfig, O as OnChainReader, R as RunnableSkill, W as WalletSigner, e as defaultIPFSFetcher } from './agent-runner-BUO0BF7i.js';
import { S as SubscriptionManager } from './index-BTPBJqUt.js';
export { A as A2AConfig, a as A2ADaemon, b as A2ADaemonConfig, c as A2AProtocol, d as A2ATaskResult, e as AgentLoop, f as AgentRegistry, g as AgentRegistryConfig, h as AgentSummary, i as AgentSummaryMetadata, C as ContextCompactor, j as CreatePlanParams, k as CreatePlanResult, F as FactExtractor, G as GetAllAgentsOptions, L as LoopTraceEmitter, P as PlanDetail, l as PlatformToolContext, m as PlatformToolDef, n as SUBSCRIPTION_PERIODS, o as StructuredAgentMetadata, p as SubscribeResult, q as SubscriptionConfig, r as SubscriptionDetail, s as SubscriptionPeriod, T as ToolExecutor, Z as ZERO_ADDRESS, t as buildPlatformTools, u as buildSystemPrompt, v as buildTools, w as cidFromURI, x as executePlatformTool, y as getAllPlatformToolNames, z as guardSubscription, B as parseTokenURIJSON, D as wrapPlatformToolsAsSkills } from './index-BTPBJqUt.js';
export { A as AgentLoopConfig, a as AgentLoopResult, C as ChatRequest, b as ChatStreamEvent, L as LLMMessage, c as LLMProvider, d as LLMToolCall, e as LoopRunContext, O as OpenAIToolDef, T as ToolCallRecord, f as ToolCallResult, g as ToolCallStart } from './types-DoR5SjPD.js';
export { GatewayProvider, GatewayProviderConfig, OpenAIProvider, OpenAIProviderConfig, ProviderFactoryConfig, createLLMProvider } from './llm/index.js';
export { EndpointRecord, MultiEndpointClient, MultiEndpointConfig } from './endpoint/index.js';
export { ConfigEntry, ConfigurationClient, ConfigurationConfig } from './configuration/index.js';
export { IPFSUploadResult, IPFSUploader, IPFSUploaderConfig, defaultIPFSUploader } from './ipfs/index.js';
export { MemoryConfig, MemoryFact, MemoryProvider } from './memory/index.js';
export { HttpTraceEmitter, NoopTraceEmitter, TraceConfig, TraceEmitter, TraceEvent } from './traces/index.js';
export { BrowserAction, BrowserActionResult, executeBrowserAction, extractAccessibleDOM, sleep } from './skills/index.js';
export { ConversationChatParams, ConversationChatResult, ConversationClient, ConversationClientConfig, ConversationCreateSessionParams, ConversationCreateTaskParams, ConversationSSEEvent, ConversationSkillDef, ConversationTask, ConversationTaskError, ConversationTaskStatus, OnChainApprovalRequest } from './conversation/index.js';
import { ClientOptions, ChainKey as ChainKey$1 } from '@0xinfrax/payments';
export { ClientOptions, MPPClient, PaymentsClient, X402Client } from '@0xinfrax/payments';
export { C as ChainConfig, a as ConfigRegistryOpts, b as ConfigurationRegistry, K as KNOWN_CHAINS } from './config-BFeSR_GK.js';
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

type SubscriptionPaymentMethod = 'chain' | 'fiat' | 'x402';
type SubscriptionPeriod = 'day' | 'week' | 'month' | 'year';
type ChainKey = 'oxachain' | 'sepolia';
interface SubscriptionPaymentsConfig {
    /** AgentX Gateway base URL (required for fiat / x402 rails). */
    gatewayUrl?: string;
    /** Optional gateway bearer token. */
    accessToken?: string;
    /** Chain rail — required for `method: 'chain'` and for automatic x402 payment. */
    subscriptionManager?: SubscriptionManager;
    /** Wallet used to automatically fund an x402 payment (if txHash is not supplied). */
    walletClient?: WalletClient;
    /** Which chain to verify x402 payments on (default: oxachain). */
    chain?: ChainKey;
}
interface PaySubscriptionInput {
    planId: number;
    agentId: number;
    method: SubscriptionPaymentMethod;
    /** Buyer wallet. Required for fiat / x402; chain resolves from the wallet client. */
    subscriber?: Address;
    /** Chain rail: native value override (defaults to the plan price). */
    valueWei?: bigint;
    /** Chain rail: approve the ERC20 token before subscribing. */
    approveTokenFirst?: boolean;
    /** Fiat rail: amount in minor units (cents). Optional — the Gateway
     *  auto-prices from the on-chain plan when planId is sent without it. */
    amountCents?: number;
    /** Fiat rail: currency code (default 'usd'). */
    currency?: string;
    /** Fiat rail: redirect targets after Stripe checkout. */
    successUrl?: string;
    cancelUrl?: string;
    /** x402 rail: already-sent on-chain payment tx. When omitted and a wallet
     *  client is configured, the payment is sent automatically. */
    txHash?: string;
    /** Billing period (default 'month'). */
    period?: SubscriptionPeriod;
}
type PaySubscriptionResult = {
    method: 'chain';
    subscriptionId: number;
    txHash: Hash;
} | {
    method: 'fiat';
    sessionUrl: string;
    sessionId: string;
    redirect: true;
} | {
    method: 'x402';
    subscriptionId: number;
    txHash: string;
    creditedWei?: string;
};
/** x402 protocol discovery returned by the unified endpoint. */
interface X402Info {
    enabled: boolean;
    priceWei: string;
    payTo: string;
    network: string;
    chain: ChainKey;
}
declare class SubscriptionPayments {
    private config;
    private client;
    constructor(config: SubscriptionPaymentsConfig);
    /** Pay for (or renew) a subscription using the chosen rail. */
    pay(input: PaySubscriptionInput): Promise<PaySubscriptionResult>;
    /**
     * Unified access check across all rails (chain OR fiat/x402) via the
     * unified /api/v1/payments/access endpoint.
     */
    hasAccess(agentId: number, subscriber: Address): Promise<boolean>;
    /** x402 protocol discovery (price / pay-to wallet / network). */
    fetchX402Info(): Promise<X402Info>;
    private _payChain;
    private _payFiat;
    private _payX402;
    /** Send the on-chain native transfer to the platform wallet (x402 rail). */
    private _autoFundX402;
    private _fetchJson;
}

/** a2a-pay client: paymentId two-phase (create → pay → settle). */
declare class A2AClient {
    private opts;
    constructor(opts: ClientOptions);
    /** Phase 1: create a payment intent. */
    create(input: {
        payer: string;
        amountWei: string;
        payee?: string;
        chain?: ChainKey$1;
        metadata?: Record<string, unknown>;
    }): Promise<{
        paymentId: string;
        amountWei: string;
        payee: string;
    }>;
    /** Phase 2: verify the payer's on-chain payment tx and credit it. */
    settle(input: {
        paymentId: string;
        txHash: string;
        chain?: ChainKey$1;
    }): Promise<{
        verified: boolean;
        paymentId: string;
        payer: string;
        creditedWei: string;
        balanceWei: string;
    }>;
}

/** Period-authorization client (P4): charge a period / read state. */
declare class PeriodClient {
    private opts;
    constructor(opts: ClientOptions);
    charge(authorizationId: string): Promise<{
        renewed: boolean;
        remainingWei: string;
    }>;
    authorization(authorizationId: string): Promise<{
        id: string;
        owner: string;
        remainingWei: string;
        periods: number;
        status: string;
    }>;
}

declare const PAYMENT_VERSION = "0.1.1";

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

export { A2AClient, A2A_VERSION, AgentReputation, AgentReview, AgentX402, type AgentX402Config, type AgentXChainEvent, type AgentXEventType, CONFIG_VERSION, type EventListenerOptions, type MCPCallResult, MCPConnector, type MCPConnectorConfig, type MCPTool, MCP_VERSION, McpConnection, PAYMENT_VERSION, type PaySubscriptionInput, type PaySubscriptionResult, PeriodClient, REGISTRY_VERSION, REPUTATION_VERSION, type ReputationConfig, ReputationRegistry, SUBSCRIPTION_VERSION, SubscriptionManager, type SubscriptionPaymentMethod, SubscriptionPayments, type SubscriptionPaymentsConfig, type X402Info, subscribeToEvents };
