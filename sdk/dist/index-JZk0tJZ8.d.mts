import { A as AgentLoopConfig, a as AgentLoopResult, T as ToolCallRecord, O as OpenAIToolDef } from './types-C3FgyPBh.mjs';
import { R as RunnableSkill, b as AgentRunner } from './agent-runner-BTiZ6St-.mjs';
import { Address, PublicClient, WalletClient, Hash } from 'viem';
import { c as A2AAgentCard, e as A2ATask, l as AgentSubscription } from './types-CCl4P8IB.mjs';
import { IPFSUploader } from './ipfs/index.mjs';
import { EventEmitter } from 'events';

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

export { type A2AConfig as A, type PlanDetail as P, type SubscriptionConfig as S, ToolExecutor as T, A2ADaemon as a, type A2ADaemonConfig as b, A2AProtocol as c, type A2ATaskResult as d, AgentLoop as e, AgentRegistry as f, type AgentRegistryConfig as g, type PlatformToolContext as h, type PlatformToolDef as i, type SubscriptionDetail as j, SubscriptionManager as k, buildPlatformTools as l, buildSystemPrompt as m, buildTools as n, cidFromURI as o, executePlatformTool as p, getAllPlatformToolNames as q, guardSubscription as r, wrapPlatformToolsAsSkills as w };
