import { E as EncryptedPayload, A as AgentPayload, P as PackResult } from './types-CCl4P8IB.mjs';

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

export { type A2ASkillResult as A, IPFSFetcher as I, type OnChainReader as O, type RunnableSkill as R, type WalletSigner as W, type AgentRunContext as a, AgentRunner as b, type AgentRunnerConfig as c, type IPFSFetcherConfig as d, defaultIPFSFetcher as e };
