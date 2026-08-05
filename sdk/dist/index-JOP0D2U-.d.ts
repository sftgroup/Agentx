import { A as AgentLoopConfig, a as AgentLoopResult, T as ToolCallRecord, c as LLMProvider, L as LLMMessage, O as OpenAIToolDef } from './types-CVLuao33.js';
import { R as RunnableSkill, b as AgentRunner } from './agent-runner-DFUWHCzi.js';
import { TraceConfig, TraceEvent } from './traces/index.js';
import { Address, PublicClient, WalletClient, Hash } from 'viem';
import { c as A2AAgentCard, e as A2ATask, l as AgentSubscription } from './types-CCl4P8IB.js';
import { IPFSUploader } from './ipfs/index.js';
import { EventEmitter } from 'events';

declare class AgentLoop {
    private config;
    private executor;
    private tools;
    private systemPrompt;
    private aborted;
    private abortController;
    private sessionId;
    private readonly compactor;
    private readonly factExtractor;
    private readonly tracer;
    constructor(config: AgentLoopConfig);
    abort(): void;
    run(userMessage: string, history?: {
        role: 'user' | 'assistant';
        content: string;
    }[]): Promise<AgentLoopResult>;
    private recallMemory;
    private storeMemory;
    private runIteration;
}

interface ExecuteOptions {
    skills: RunnableSkill[];
    timeoutMs?: number;
}
declare class ToolExecutor {
    private skills;
    private timeoutMs;
    constructor(opts: ExecuteOptions);
    executeSingle(name: string, args: Record<string, unknown>): Promise<ToolCallRecord>;
    executeBatch(calls: {
        callId: string;
        name: string;
        arguments: Record<string, unknown>;
    }[]): Promise<ToolCallRecord[]>;
    hasTool(name: string): boolean;
    getToolNames(): string[];
    private normalizeResult;
}

declare class ContextCompactor {
    private readonly llmProvider;
    private readonly compactModel;
    constructor(llmProvider: LLMProvider, compactModel?: string);
    /** Rough token estimation: 1 token ≈ 4 characters */
    estimateTokens(messages: LLMMessage[]): number;
    /**
     * Compact messages: keep system prompt + last 2 turns, summarize the rest.
     * Returns original array if not enough messages or compaction fails.
     */
    compact(messages: LLMMessage[]): Promise<LLMMessage[]>;
}

declare class FactExtractor {
    private readonly llmProvider;
    private readonly factModel;
    constructor(llmProvider: LLMProvider, factModel?: string);
    /** Extract simple facts from the conversation for memory storage */
    extract(userMessage: string, assistantResponse: string): Promise<string[]>;
}

declare class LoopTraceEmitter {
    private readonly config;
    constructor(config?: TraceConfig);
    emit(event: Omit<TraceEvent, 'timestamp'>): void;
}

declare function buildTools(skills: RunnableSkill[]): OpenAIToolDef[];
declare function buildSystemPrompt(prompt: string, skills: RunnableSkill[]): string;

interface A2AConfig {
    contractAddress: Address;
    publicClient: PublicClient;
    walletClient: WalletClient;
}
declare class A2AProtocol {
    private address;
    private publicClient;
    private walletClient;
    constructor(config: A2AConfig);
    private get account();
    createAgentCard(agentId: number, card: {
        name: string;
        description: string;
        version: string;
        capabilities: string[];
        supportedTasks: string[];
        commProtocol?: string;
        authMethod?: string;
        cardURI?: string;
    }): Promise<{
        cardId: number;
        txHash: Hash;
    }>;
    getAgentCard(agentId: number): Promise<A2AAgentCard | null>;
    createTask(agentId: number, taskType: string, input: Record<string, unknown>): Promise<{
        taskId: number;
        txHash: Hash;
    }>;
    completeTask(taskId: number, output: unknown, status?: number): Promise<Hash>;
    getTask(taskId: number): Promise<A2ATask | null>;
    getUserTasks(user: Address): Promise<number[]>;
    getAgentTasks(agentId: number): Promise<A2ATask[]>;
    getAddress(): Promise<Address>;
    private _parseUintFromLog;
}

declare const ZERO_ADDRESS: Address;
interface SubscriptionConfig {
    contractAddress: Address;
    publicClient: PublicClient;
    walletClient: WalletClient;
}
interface PlanDetail {
    planId: number;
    agentId: number;
    creator: Address;
    price: bigint;
    period: string;
    active: boolean;
    payToken: Address;
    trialDays: number;
}
interface SubscriptionDetail {
    subscriptionId: number;
    subscriber: Address;
    agentId: number;
    status: number;
    startedAt: number;
    expiresAt: number;
    period: string;
    payToken: Address;
    amountPaid: bigint;
    trialActive: boolean;
    trialEndsAt: number;
    fundsReleased: boolean;
}
declare const SUBSCRIPTION_PERIODS: readonly ["day", "week", "month", "year"];
type SubscriptionPeriod = (typeof SUBSCRIPTION_PERIODS)[number];
interface CreatePlanParams {
    agentId: number;
    /** Price in wei (native token) or token units for ERC20 plans. */
    price: bigint;
    /** Must be one of: day | week | month | year (contract-valid enum). */
    period: SubscriptionPeriod;
    /** ERC20 pay token; default zero address = native token. */
    payToken?: Address;
    /** Trial days (0–30). Default 0 = no trial. */
    trialDays?: number;
}
interface CreatePlanResult {
    planId: number;
    txHash: Hash;
}
interface SubscribeResult {
    subscriptionId: number;
    txHash: Hash;
    subscriber: Address;
    agentId: number;
    /** Unix timestamp (seconds) when the subscription expires. */
    expiresAt: number;
}
declare class SubscriptionManager {
    private address;
    private publicClient;
    private walletClient;
    constructor(config: SubscriptionConfig);
    /**
     * Resolve the caller account for write operations.
     *
     * Prefers `walletClient.account` (a full viem Account object with signing
     * capability) over `getAddresses()[0]` (a bare address string). Passing a
     * bare string as `account` makes viem route `writeContract` through
     * `eth_sendTransaction` (node-managed accounts only), which fails for local
     * signers; the full object enables local signing via `eth_sendRawTransaction`.
     * In browser wallets (e.g. MetaMask) `client.account` is a json-rpc account
     * and the provider signs, so both paths keep working.
     */
    private _resolveAccount;
    /** Get current platform fee in basis points (e.g. 250 = 2.5%). */
    getPlatformFeeBps(): Promise<number>;
    /** Check if a token is whitelisted for payments. */
    isTokenWhitelisted(token: Address): Promise<boolean>;
    /** Get full plan details with v2 fields. */
    getPlan(planId: number): Promise<PlanDetail>;
    /**
     * Create a subscription plan for an agent.
     *
     * @param params.period  Must be 'day' | 'week' | 'month' | 'year' — the only
     *                       values the contract maps to real durations. Anything
     *                       else silently becomes 30 days on-chain.
     * @returns              { planId, txHash } (planId parsed from PlanCreated event)
     */
    createPlan(params: CreatePlanParams): Promise<CreatePlanResult>;
    /**
     * Subscribe to a plan.
     * For ETH plans: pass valueWei = plan.price.
     * For ERC20 plans: auto-detects from plan.payToken, calls approve + subscribe.
     *                    User must have approved this contract for plan.price tokens.
     *
     * @returns SubscribeResult — subscriptionId/expiresAt/subscriber parsed from
     *          the Subscribed event (no longer hardcoded to 0).
     */
    subscribe(planId: number, opts?: {
        valueWei?: bigint;
        approveTokenFirst?: boolean;
    }): Promise<SubscribeResult>;
    /**
     * One-step createPlan + subscribe (two transactions).
     * Saves the caller one round of plan lookup when the plan does not exist yet.
     */
    createPlanAndSubscribe(params: CreatePlanParams): Promise<CreatePlanResult & SubscribeResult>;
    /** Release escrowed funds to creator after trial window ends. */
    releaseFunds(subscriptionId: number): Promise<Hash>;
    /** Cancel subscription (trial refund if within window). */
    cancel(subscriptionId: number): Promise<Hash>;
    hasActiveSubscription(subscriber: Address, agentId: number): Promise<boolean>;
    getSubscription(subscriber: Address, agentId: number): Promise<AgentSubscription | null>;
    /** Get full subscription detail with v2 fields (trial, payToken, fundsReleased). */
    getSubscriptionDetail(subscriptionId: number): Promise<SubscriptionDetail>;
    getUserSubscriptions(user: Address): Promise<number[]>;
    private _findEventLog;
    /** Parse planId from the PlanCreated event in a transaction receipt. */
    private _parsePlanIdFromReceipt;
    /** Parse subscriptionId/subscriber/agentId/expiresAt from the Subscribed event. */
    private _parseSubscribedFromReceipt;
}
declare function guardSubscription(manager: SubscriptionManager, user: Address, agentId: number): Promise<AgentSubscription>;

interface AgentRegistryConfig {
    /** IdentityRegistry contract address */
    contractAddress: Address;
    /** viem PublicClient for read calls */
    publicClient: PublicClient;
    /** viem WalletClient for write calls */
    walletClient: WalletClient;
}
/** Public, human-readable subset of on-chain agent metadata. */
interface AgentSummaryMetadata {
    name: string;
    description: string;
    capabilities: string[];
    skills: string[];
    /** Marketplace-visible availability; tokenURI JSON may override the default true. */
    isActive: boolean;
}
/** Lightweight agent record returned by getAllAgents(). */
interface AgentSummary {
    agentId: number;
    owner: string;
    tokenURI: string;
    metadata: AgentSummaryMetadata;
    /** Unix timestamp (seconds); 0 when the tokenURI metadata has no createdAt. */
    createdAt: number;
}
interface GetAllAgentsOptions {
    /** First agent ID to scan (default: 1). */
    fromId?: number;
    /** Last agent ID to scan (default: totalAgents()). */
    toId?: number;
    /** Only return agents whose metadata.isActive === true (default: false). */
    activeOnly?: boolean;
    /** Only return agents whose capabilities include ALL of these (AND). */
    capabilities?: string[];
    /** RPC batching size (default: 10). */
    batchSize?: number;
}
/** Full structured metadata for one agent (on-chain keys + tokenURI JSON). */
interface StructuredAgentMetadata {
    name: string;
    description: string;
    encryptedPayloadCid: string;
    eciesEncryptedKey: string;
    publicPayloadCid: string;
    capabilities: string[];
    skills: string[];
    isActive: boolean;
}
declare class AgentRegistry {
    private address;
    private publicClient;
    private walletClient;
    constructor(config: AgentRegistryConfig);
    /**
     * Register a new Agent NFT on-chain.
     *
     * @param tokenURI    IPFS URI of the public metadata (ipfs://...)
     * @param metadata    Key-value metadata (encryptedPayloadCid, eciesEncryptedKey, etc.)
     * @param valueWei    Optional: native currency to send with registration
     * @returns           { agentId: number, txHash: Hash }
     */
    register(tokenURI: string, metadata: {
        key: string;
        value: string;
    }[], valueWei?: bigint): Promise<{
        agentId: number;
        txHash: Hash;
    }>;
    /**
     * Simple register — just a tokenURI, no extra metadata.
     */
    registerSimple(tokenURI: string, valueWei?: bigint): Promise<{
        agentId: number;
        txHash: Hash;
    }>;
    /** Get all agent IDs owned by an address. */
    getAgentsByOwner(owner: Address): Promise<number[]>;
    /** Get the current total agent count. */
    getCurrentAgentId(): Promise<number>;
    /** Check if an agent exists. */
    agentExists(agentId: number): Promise<boolean>;
    /** Get the tokenURI for an agent. */
    tokenURI(agentId: number): Promise<string>;
    /** Get all metadata attributes for an agent as key-value pairs. */
    getAttributes(agentId: number): Promise<Record<string, string>>;
    /** Total number of registered agents (monotonic max agent ID). */
    totalAgents(): Promise<number>;
    /**
     * Structured metadata for one agent.
     * Combines on-chain attributes (encryptedPayloadCid / eciesEncryptedKey /
     * publicPayloadCid) with the tokenURI JSON (name/description/capabilities/skills).
     * `isActive` defaults to on-chain existence, overridable via tokenURI JSON.
     */
    getAgentMetadata(agentId: number): Promise<StructuredAgentMetadata>;
    /**
     * Batch-read all agents in a contiguous ID range with optional filters.
     * Replaces the manual binary-search + per-ID ownerOf loop used by chain-sync.
     */
    getAllAgents(options?: GetAllAgentsOptions): Promise<AgentSummary[]>;
    /** Extract tokenId from the Transfer event in the receipt. */
    private _parseAgentIdFromReceipt;
}
/** Extract IPFS CID from an ipfs:// URI. */
declare function cidFromURI(uri: string): string;

interface PlatformToolDef {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}
interface PlatformToolContext {
    agentRunner: AgentRunner;
    a2a: A2AProtocol;
    subscriptionManager: SubscriptionManager;
    agentRegistry: AgentRegistry;
    reputationRegistry?: {
        rateAgent(agentId: number, rating: number, comment: string): Promise<unknown>;
        getRating(agentId: number): Promise<{
            averageRating: number;
            totalRatings: number;
        }>;
        getReviews(agentId: number): Promise<unknown[]>;
    };
    configurationRegistry?: {
        getConfig(agentId: number, key: string): Promise<{
            value: string;
            dataType: string;
        }>;
        getAgentConfigs(agentId: number): Promise<unknown[]>;
        setConfig(agentId: number, key: string, value: string, dataType: string): Promise<unknown>;
    };
    multiEndpointRegistry?: {
        getAgentEndpoints(agentId: number): Promise<unknown[]>;
        getActiveAgentEndpoints(agentId: number): Promise<unknown[]>;
        getBestMCPUrl(agentId: number): Promise<string>;
    };
    gatewayUrl?: string;
    gatewayToken?: string;
    userAddress: string;
    ipfsUploader?: IPFSUploader;
}
declare function buildPlatformTools(available?: ('identity' | 'subscription' | 'a2a' | 'reputation' | 'configuration' | 'endpoint' | 'gateway' | 'ipfs')[]): PlatformToolDef[];
declare function getAllPlatformToolNames(): string[];

declare function executePlatformTool(toolName: string, args: Record<string, unknown>, ctx: PlatformToolContext): Promise<unknown>;
/**
 * Merge platform tools into an AgentLoop's skill list.
 * When AgentLoop calls execute(toolName, args), the platform executor handles it.
 */
declare function wrapPlatformToolsAsSkills(ctx: PlatformToolContext, modules?: ('identity' | 'subscription' | 'a2a' | 'reputation' | 'configuration' | 'endpoint' | 'gateway' | 'ipfs')[]): RunnableSkill[];

interface A2ADaemonConfig {
    /** Your agent's numeric ID */
    agentId: number;
    /** Initialized A2AProtocol instance */
    a2a: A2AProtocol;
    /** Gateway URL for fetching pre-computed LLM results */
    gatewayUrl?: string;
    /** Poll interval in milliseconds (default: 15000) */
    pollIntervalMs?: number;
    /** If true, daemon will auto-complete tasks (call completeTask on-chain) */
    autoComplete?: boolean;
    /** Max tasks to process per poll (default: 3) */
    maxPerPoll?: number;
}
interface A2ATaskResult {
    task: A2ATask;
    /** LLM-generated output from Gateway (if available) */
    gatewayOutput?: string;
    /** If task was auto-completed on-chain */
    completed: boolean;
    /** Transaction hash if completed */
    txHash?: string;
    /** Error message if failed */
    error?: string;
}
declare class A2ADaemon extends EventEmitter {
    private config;
    private timer;
    private isRunning;
    private processedTasks;
    constructor(config: A2ADaemonConfig);
    start(): void;
    stop(): void;
    get status(): {
        running: boolean;
        agentId: number;
        processedCount: number;
    };
    private poll;
    /**
     * Get pending tasks assigned to this agent using getAgentTasks() from the contract.
     */
    private getPendingTasks;
    /**
     * Process a pending A2A task:
     *   1. Try Gateway API for pre-computed LLM result
     *   2. Call completeTask() on-chain with the owner's wallet
     */
    private processPendingTask;
}

export { type A2AConfig as A, wrapPlatformToolsAsSkills as B, ContextCompactor as C, FactExtractor as F, type GetAllAgentsOptions as G, LoopTraceEmitter as L, type PlanDetail as P, SUBSCRIPTION_PERIODS as S, ToolExecutor as T, ZERO_ADDRESS as Z, A2ADaemon as a, type A2ADaemonConfig as b, A2AProtocol as c, type A2ATaskResult as d, AgentLoop as e, AgentRegistry as f, type AgentRegistryConfig as g, type AgentSummary as h, type AgentSummaryMetadata as i, type CreatePlanParams as j, type CreatePlanResult as k, type PlatformToolContext as l, type PlatformToolDef as m, type StructuredAgentMetadata as n, type SubscribeResult as o, type SubscriptionConfig as p, type SubscriptionDetail as q, SubscriptionManager as r, type SubscriptionPeriod as s, buildPlatformTools as t, buildSystemPrompt as u, buildTools as v, cidFromURI as w, executePlatformTool as x, getAllPlatformToolNames as y, guardSubscription as z };
