import { E as EncryptedPayload, f as AgentPayload, P as PackResult, l as AgentSubscription, a as A2ATask } from './types-DF0FqVs3.mjs';
import { a as A2AProtocol } from './a2a-C-e_zBDz.mjs';
import { Address, PublicClient, WalletClient, Hash } from 'viem';
import { a as IPFSUploader } from './ipfs-uploader-DsdnggAB.mjs';
import { EventEmitter } from 'events';

interface IPFSFetcherConfig {
    /** Primary IPFS gateway (default: ipfs.io) */
    gateway?: string;
    /** Fallback gateways in order of preference */
    fallbackGateways?: string[];
    /** Request timeout in ms (default: 10_000) */
    timeoutMs?: number;
    /** Max cached entries (LRU-like eviction, default: 200) */
    maxCache?: number;
}
declare class IPFSFetcher {
    private gateway;
    private fallbackGateways;
    private timeoutMs;
    private cache;
    private maxCache;
    private pending;
    private failed;
    constructor(config?: IPFSFetcherConfig);
    /** Fetch JSON from a single IPFS CID. */
    fetchJSON<T = unknown>(cid: string): Promise<T>;
    /** Fetch encrypted agent payload (validates algorithm). */
    fetchEncryptedPayload(cid: string): Promise<EncryptedPayload>;
    /** Batch fetch multiple CIDs with concurrency control. */
    fetchBatch<T = unknown>(cids: string[], concurrency?: number): Promise<Map<string, T>>;
    /** Check if a string looks like a valid IPFS CID. */
    isValidCID(cid: string): boolean;
    /** Clear cache (optionally for a specific CID). */
    clearCache(cid?: string): void;
    /** Number of cached entries. */
    get cacheSize(): number;
    private _doFetch;
    private _fetchFrom;
    private _cacheSet;
}
/** Singleton-friendly default instance. */
declare const defaultIPFSFetcher: IPFSFetcher;

/** Minimal on-chain reader interface — implement with viem. */
interface OnChainReader {
    /** Read tokenURI from IdentityRegistry by tokenId. */
    getTokenURI(agentId: number): Promise<string>;
    /** Get agent metadata attributes (returned as key-value pairs). */
    getAttributes(agentId: number): Promise<Record<string, string>>;
    /** Check if `address` has an active subscription for `agentId`. */
    hasActiveSubscription(address: string, agentId: number): Promise<boolean>;
}
/** Minimal wallet signer interface — implement with wagmi/viem. */
interface WalletSigner {
    /** Sign a message (for authentication to MCP servers). */
    signMessage(message: string): Promise<string>;
    /** Get the current wallet address. */
    getAddress(): Promise<string>;
    /** Get the wallet's ECDSA private key (required for ECIES decryption). */
    getPrivateKey?(): Promise<string>;
}
interface AgentRunnerConfig {
    /** On-chain data reader (injected from viem/wagmi). */
    reader: OnChainReader;
    /** Wallet signer (injected from wagmi). */
    wallet: WalletSigner;
    /** IPFS fetcher instance (creates default if omitted). */
    ipfsFetcher?: IPFSFetcher;
    /** IPFS gateway list (overrides IPFSFetcher defaults). */
    ipfsGateways?: string[];
}
interface AgentRunContext {
    /** Agent NFT token ID */
    agentId: number;
    /** System prompt — inject into LLM conversation */
    prompt: string;
    /** All skills with execution metadata */
    skills: RunnableSkill[];
    /** MCP connection info */
    mcp: {
        type: string;
        url?: string;
        toolFilter?: string[];
    };
    /** Subscription expiry timestamp (0 = unknown) */
    subscriptionExpiry: number;
}
interface RunnableSkill {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    /** Execution mode */
    mode: 'open' | 'mcp' | 'a2a';
    /** If mode='a2a', the on-chain Agent ID being delegated to */
    a2aTargetAgentId?: number;
    /**
     * Execute this skill with the given input.
     * - Open: runs locally (caller provides implementation)
     * - MCP: POSTs to the publisher's MCP server
     * - A2A: loads target Agent context (prompt+skills) via AgentRunner
     */
    execute(input: Record<string, unknown>): Promise<unknown>;
}
/**
 * Standard return type for A2A skill execution.
 * The calling LLM receives the sub-Agent's prompt and skills
 * and can inject them into the conversation.
 */
interface A2ASkillResult {
    /** On-chain Agent ID that was delegated to */
    agentId: number;
    /** Sub-Agent's decrypted system prompt */
    prompt: string;
    /** Sub-Agent's skills (name + description + schema only, no execute) */
    skills: {
        name: string;
        description: string;
        inputSchema: Record<string, unknown>;
    }[];
    /** The original input passed by the caller */
    callerInput: Record<string, unknown>;
}
declare class AgentRunner {
    private reader;
    private wallet;
    private ipfs;
    constructor(config: AgentRunnerConfig);
    /**
     * Load and decrypt an Agent, returning a run context ready to inject
     * into any LLM conversation.
     *
     * Steps:
     *   1. Verify on-chain subscription (frontend check)
     *   2. Fetch metadata → get encryptedPayloadCid + eciesEncryptedKey
     *   3. IPFS fetch encrypted payload
     *   4. ECIES decrypt AES key (using wallet private key)
     *   5. AES-256-GCM decrypt payload → { prompt, skills, mcp }
     *   6. Build RunnableSkill wrappers (Open: local stub, Closed: MCP remote)
     */
    useAgent(agentId: number): Promise<AgentRunContext>;
    /**
     * Pack an AgentPayload for publishing (encryption only, no IPFS upload).
     * Caller is responsible for IPFS upload and on-chain registration.
     */
    packForPublish(payload: AgentPayload, publicKey: string): PackResult;
    /** Wrap a SkillDef into a RunnableSkill with execute(). */
    private _wrapSkill;
    /** Call a tool on the publisher's MCP server (Closed skill). */
    private _executeMCPTool;
    /**
     * Execute an A2A skill — delegate to another AgentX Agent.
     *
     * Standard Interface:
     *   Input:  { task, ...taskSpecificParams }
     *   Output: { agentId, prompt, skills[] }
     *
     * The caller (LLM) receives the sub-Agent's prompt + skill list.
     * The LLM then decides how to use the sub-Agent — typically by
     * injecting the sub-Agent's system prompt and calling its skills.
     */
    private _executeA2ASkill;
    private _getPrivateKey;
}

interface LLMMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    name?: string;
    tool_call_id?: string;
    tool_calls?: LLMToolCall[];
}
interface LLMToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}
interface OpenAIToolDef {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}
interface ChatRequest {
    model: string;
    messages: LLMMessage[];
    tools?: OpenAIToolDef[];
    temperature?: number;
    maxTokens?: number;
}
type ChatStreamEvent = {
    type: 'text_delta';
    content: string;
} | {
    type: 'tool_call_start';
    callId: string;
    name: string;
} | {
    type: 'tool_call_delta';
    callId: string;
    arguments: string;
} | {
    type: 'done';
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
} | {
    type: 'error';
    error: Error;
};
interface LLMProvider {
    chatStream(request: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatStreamEvent>;
}
interface AgentLoopConfig {
    ctx: LoopRunContext;
    llmProvider: LLMProvider;
    maxIterations?: number;
    timeoutMs?: number;
    onTextDelta?: (delta: string) => void;
    onToolCall?: (call: ToolCallStart) => void;
    onToolResult?: (result: ToolCallResult) => void;
    onThinking?: (message: string) => void;
    onComplete?: (result: AgentLoopResult) => void;
    onError?: (error: Error) => void;
}
interface LoopRunContext {
    agentId: number;
    prompt: string;
    skills: RunnableSkill[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
}
interface ToolCallStart {
    callId: string;
    name: string;
    arguments: Record<string, unknown>;
}
interface ToolCallResult {
    callId: string;
    name: string;
    result: unknown;
    error?: string;
    durationMs: number;
}
interface ToolCallRecord {
    callId: string;
    name: string;
    arguments: Record<string, unknown>;
    result: unknown;
    error?: string;
    durationMs: number;
}
interface AgentLoopResult {
    finalText: string;
    toolCalls: ToolCallRecord[];
    totalIterations: number;
    totalDuration: number;
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

declare class AgentLoop {
    private config;
    private executor;
    private tools;
    private systemPrompt;
    private aborted;
    private abortController;
    constructor(config: AgentLoopConfig);
    abort(): void;
    run(userMessage: string, history?: {
        role: 'user' | 'assistant';
        content: string;
    }[]): Promise<AgentLoopResult>;
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

declare function buildTools(skills: RunnableSkill[]): OpenAIToolDef[];
declare function buildSystemPrompt(prompt: string, skills: RunnableSkill[]): string;

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
declare class SubscriptionManager {
    private address;
    private publicClient;
    private walletClient;
    constructor(config: SubscriptionConfig);
    /** Get current platform fee in basis points (e.g. 250 = 2.5%). */
    getPlatformFeeBps(): Promise<number>;
    /** Check if a token is whitelisted for payments. */
    isTokenWhitelisted(token: Address): Promise<boolean>;
    /** Get full plan details with v2 fields. */
    getPlan(planId: number): Promise<PlanDetail>;
    /**
     * Subscribe to a plan.
     * For ETH plans: pass valueWei = plan.price.
     * For ERC20 plans: auto-detects from plan.payToken, calls approve + subscribe.
     *                    User must have approved this contract for plan.price tokens.
     */
    subscribe(planId: number, opts?: {
        valueWei?: bigint;
        approveTokenFirst?: boolean;
    }): Promise<{
        subscriptionId: number;
        txHash: Hash;
    }>;
    /** Release escrowed funds to creator after trial window ends. */
    releaseFunds(subscriptionId: number): Promise<Hash>;
    /** Cancel subscription (trial refund if within window). */
    cancel(subscriptionId: number): Promise<Hash>;
    hasActiveSubscription(subscriber: Address, agentId: number): Promise<boolean>;
    getSubscription(subscriber: Address, agentId: number): Promise<AgentSubscription | null>;
    /** Get full subscription detail with v2 fields (trial, payToken, fundsReleased). */
    getSubscriptionDetail(subscriptionId: number): Promise<SubscriptionDetail>;
    getUserSubscriptions(user: Address): Promise<number[]>;
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

export { type AgentRunContext as A, buildTools as B, type ChatRequest as C, cidFromURI as D, defaultIPFSFetcher as E, executePlatformTool as F, getAllPlatformToolNames as G, guardSubscription as H, IPFSFetcher as I, wrapPlatformToolsAsSkills as J, type LLMProvider as L, type OnChainReader as O, type PlanDetail as P, type RunnableSkill as R, type SubscriptionConfig as S, type ToolCallRecord as T, type WalletSigner as W, type ChatStreamEvent as a, A2ADaemon as b, type A2ADaemonConfig as c, type A2ASkillResult as d, type A2ATaskResult as e, AgentLoop as f, type AgentLoopConfig as g, type AgentLoopResult as h, AgentRegistry as i, type AgentRegistryConfig as j, AgentRunner as k, type AgentRunnerConfig as l, type IPFSFetcherConfig as m, type LLMMessage as n, type LLMToolCall as o, type LoopRunContext as p, type OpenAIToolDef as q, type PlatformToolContext as r, type PlatformToolDef as s, type SubscriptionDetail as t, SubscriptionManager as u, type ToolCallResult as v, type ToolCallStart as w, ToolExecutor as x, buildPlatformTools as y, buildSystemPrompt as z };
