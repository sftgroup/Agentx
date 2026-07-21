import { M as McpConnection, b as AgentReview, c as AgentReputation } from './types-DF0FqVs3.mjs';
export { A as A2AAgentCard, d as A2ASkillExecution, a as A2ATask, e as A2ATaskStatus, f as AgentPayload, g as AgentPricing, h as AgentPrivatePayload, i as AgentPublicPayload, j as AgentSearchQuery, k as AgentSearchResult, l as AgentSubscription, m as AgentXConfig, n as AgentXContracts, o as AgentXError, p as AgentXErrorCode, E as EncryptedPayload, J as JSONSchema, q as JSONSchemaProperty, r as McpTransport, O as OnChainAgentMetadata, P as PackResult, s as PricingType, R as RegisteredAgent, S as SkillDef, t as SkillExecutionMode, u as SkillExecutionRemote, v as SubscriptionRequired, w as SubscriptionStatus, U as UnpackResult } from './types-DF0FqVs3.mjs';
export { PublishAgentConfig, PublishAgentResult, aesDecrypt, aesEncrypt, decryptPayload, eciesDecrypt, eciesEncrypt, encryptPayload, generateAesKey, generateKeyPair, getPublicKey, packAgentForPublish, publishAgent, randomBytes, unpackAgent } from './core/index.mjs';
import { L as LLMProvider, C as ChatRequest, a as ChatStreamEvent, A as AgentRunContext } from './index-DyPUkupt.mjs';
export { b as A2ADaemon, c as A2ADaemonConfig, d as A2ASkillResult, e as A2ATaskResult, f as AgentLoop, g as AgentLoopConfig, h as AgentLoopResult, i as AgentRegistry, j as AgentRegistryConfig, k as AgentRunner, l as AgentRunnerConfig, I as IPFSFetcher, m as IPFSFetcherConfig, n as LLMMessage, o as LLMToolCall, p as LoopRunContext, O as OnChainReader, q as OpenAIToolDef, P as PlanDetail, r as PlatformToolContext, s as PlatformToolDef, R as RunnableSkill, S as SubscriptionConfig, t as SubscriptionDetail, u as SubscriptionManager, T as ToolCallRecord, v as ToolCallResult, w as ToolCallStart, x as ToolExecutor, W as WalletSigner, y as buildPlatformTools, z as buildSystemPrompt, B as buildTools, D as cidFromURI, E as defaultIPFSFetcher, F as executePlatformTool, G as getAllPlatformToolNames, H as guardSubscription, J as wrapPlatformToolsAsSkills } from './index-DyPUkupt.mjs';
export { A2A_VERSION } from './a2a/index.mjs';
import { Address, PublicClient, WalletClient, Hash } from 'viem';
export { I as IPFSUploadResult, a as IPFSUploader, b as IPFSUploaderConfig, d as defaultIPFSUploader } from './ipfs-uploader-DsdnggAB.mjs';
export { A as A2AConfig, a as A2AProtocol } from './a2a-C-e_zBDz.mjs';
export { bytesToHex, hexToBytes } from '@noble/ciphers/utils.js';
import 'events';

interface OpenAIProviderConfig {
    apiKey: string;
    endpoint?: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
}
interface GatewayProviderConfig {
    gatewayUrl: string;
    accessToken: string;
    model?: string;
    keySource?: 'platform' | 'tenant_owned';
    tenantKeyId?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
}
interface ProviderFactoryConfig {
    type: 'openai' | 'gateway' | 'direct';
    gatewayUrl?: string;
    accessToken?: string;
    apiKey?: string;
    endpoint?: string;
    model?: string;
    keySource?: 'platform' | 'tenant_owned';
    tenantKeyId?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
}

declare class OpenAIProvider implements LLMProvider {
    private config;
    constructor(config: OpenAIProviderConfig);
    chatStream(request: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatStreamEvent>;
}

declare class GatewayProvider implements LLMProvider {
    private config;
    constructor(config: GatewayProviderConfig);
    chatStream(request: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatStreamEvent>;
}

declare function createLLMProvider(config: ProviderFactoryConfig): LLMProvider;

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

declare const SUBSCRIPTION_VERSION = "0.2.0";

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

interface ChainConfig {
    chainId: number;
    contracts: {
        identityRegistry: Address;
        subscriptionManager: Address;
        a2aProtocolRegistry: Address;
        reputationRegistry: Address;
        configurationRegistry: Address;
        multiEndpointRegistry: Address;
    };
    ipfsGateways: string[];
    rpcUrl?: string;
}
declare const KNOWN_CHAINS: Record<number, ChainConfig>;
interface ConfigRegistryOpts {
    contractAddress: Address;
    publicClient: PublicClient;
    walletClient: WalletClient;
}
declare class ConfigurationRegistry {
    private address;
    private publicClient;
    private walletClient;
    constructor(opts: ConfigRegistryOpts);
    private get account();
    set(key: string, value: string): Promise<Hash>;
    get(key: string): Promise<string>;
    getAll(): Promise<Record<string, string>>;
}

declare const CONFIG_VERSION = "0.1.0";

/**
 * MultiEndpointRegistry SDK
 * OxaChain L1 + Sepolia — multi-endpoint management for AI Agents
 */

interface EndpointRecord {
    endpointId: bigint;
    agentId: bigint;
    name: string;
    endpointType: string;
    protocol: string;
    url: string;
    description: string;
    isActive: boolean;
    createdAt: bigint;
    updatedAt: bigint;
    createdBy: Address;
}
interface MultiEndpointConfig {
    address: Address;
}
declare class MultiEndpointClient {
    private address;
    private publicClient;
    constructor(config: MultiEndpointConfig, publicClient?: PublicClient);
    setPublicClient(client: PublicClient): void;
    getActiveEndpoints(agentId: bigint): Promise<EndpointRecord[]>;
    getAllEndpoints(agentId: bigint): Promise<EndpointRecord[]>;
    getEndpoint(endpointId: bigint): Promise<EndpointRecord>;
    getStats(agentId: bigint): Promise<[bigint, bigint, bigint, bigint, bigint]>;
    /** Pick best active endpoint for the agent — prefer HTTP, take first active */
    pickBestEndpoint(agentId: bigint): Promise<EndpointRecord | null>;
    /** Pick any active endpoint URL — for MCP connector */
    getBestMCPUrl(agentId: bigint): Promise<string | null>;
}

/**
 * ConfigurationRegistry SDK
 * On-chain key-value config store for AI Agents
 */

interface ConfigEntry {
    agentId: bigint;
    key: string;
    value: string;
    dataType: string;
    updatedAt: bigint;
    updatedBy: Address;
}
interface ConfigurationConfig {
    address: Address;
}
declare class ConfigurationClient {
    private address;
    private publicClient;
    constructor(config: ConfigurationConfig, publicClient?: PublicClient);
    setPublicClient(client: PublicClient): void;
    get(agentId: bigint, key: string): Promise<ConfigEntry | null>;
    getAll(agentId: bigint): Promise<ConfigEntry[]>;
    getKeys(agentId: bigint): Promise<string[]>;
    getCount(agentId: bigint): Promise<bigint>;
    exists(agentId: bigint, key: string): Promise<boolean>;
}

interface UseAgentRunnerConfig {
    agentId: number;
    chainConfig?: ChainConfig;
    ipfsGateways?: string[];
}
interface UseAgentRunnerResult {
    ctx: AgentRunContext | null;
    isLoading: boolean;
    error: Error | null;
    /** Re-trigger the load (e.g. after connecting wallet or subscribing) */
    refetch: () => void;
}
declare function useAgentRunner(config: UseAgentRunnerConfig): UseAgentRunnerResult;

export { AgentReputation, AgentReview, AgentRunContext, AgentX402, type AgentX402Config, CONFIG_VERSION, type ChainConfig, ChatRequest, ChatStreamEvent, type ConfigEntry, type ConfigRegistryOpts, ConfigurationClient, type ConfigurationConfig, ConfigurationRegistry, type EndpointRecord, GatewayProvider, type GatewayProviderConfig, KNOWN_CHAINS, LLMProvider, type MCPCallResult, MCPConnector, type MCPConnectorConfig, type MCPTool, MCP_VERSION, McpConnection, MultiEndpointClient, type MultiEndpointConfig, OpenAIProvider, type OpenAIProviderConfig, type ProviderFactoryConfig, REGISTRY_VERSION, REPUTATION_VERSION, type ReputationConfig, ReputationRegistry, SUBSCRIPTION_VERSION, type UseAgentRunnerConfig, type UseAgentRunnerResult, createLLMProvider, useAgentRunner };
