interface ConversationClientConfig {
    /** Gateway base URL, e.g. http://43.159.60.46:3090 */
    gatewayUrl: string;
    /** Tenant API Key (agentx_...) issued after registration (alternative to accessToken) */
    apiKey?: string;
    /** Gateway JWT access token from wallet-signed login (alternative to apiKey) */
    accessToken?: string;
    /** End-user ID for memory isolation within the tenant (optional) */
    endUserId?: string;
    /** LLM API Key override — uses the caller's key instead of the tenant's (optional) */
    llmApiKey?: string;
    /** LLM endpoint override for the caller's key, e.g. DeepSeek https://api.deepseek.com/v1 (optional) */
    llmEndpoint?: string;
    /** LLM model override for the caller's key, e.g. deepseek-chat (optional; default gpt-4o) */
    llmModel?: string;
    /** Abort timeout in ms for a single stream (default 120s) */
    timeoutMs?: number;
}
interface ConversationSkillDef {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    execution?: {
        type: 'mcp' | 'http' | 'a2a';
        endpoint?: string;
        toolName?: string;
        targetAgentId?: number;
        skillFilter?: string[];
        promptOverride?: string;
    };
}
interface ConversationChatParams {
    /** AgentX agent id (omit when using inline prompt/skills mode) */
    agentId?: number;
    message: string;
    /** Full conversation history — caller is responsible for per-end-user isolation */
    history?: {
        role: 'user' | 'assistant';
        content: string;
    }[];
    enableMemory?: boolean;
    contextBudget?: number;
    /** Inline mode: caller-supplied system prompt, bypasses Gateway agent lookup */
    prompt?: string;
    /** Inline mode: caller-supplied tools (MCP/HTTP), injected into the run */
    skills?: ConversationSkillDef[];
    /** BYOK: id of a stored tenant-owned API key (resolved server-side by the Gateway) */
    tenantKeyId?: string;
}
/**
 * On-chain rail (2026-08-08): the user's own wallet must create the A2A task —
 * they pay the gas and become the on-chain client. Emitted by the Conversation
 * Service when a run requests an auditable / settled delegation.
 */
interface OnChainApprovalRequest {
    targetAgentId: number;
    taskType: string;
    inputData: string;
}
interface ConversationSSEEvent {
    type: 'text' | 'tool_call' | 'tool_result' | 'thinking' | 'done' | 'error' | 'clarification' | 'onchain_approval_required';
    content?: string;
    /** Clarification question when the service decides the request needs disambiguation */
    question?: string;
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    toolResult?: unknown;
    /** Attached to tool_result when tool execution failed */
    error?: string;
    /** On-chain rail: the agent requested an A2A delegation the user must approve in their wallet */
    approval?: OnChainApprovalRequest;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    iterations?: number;
}
interface ConversationChatResult {
    text: string;
    toolCalls: {
        name: string;
        arguments: Record<string, unknown>;
        result?: unknown;
    }[];
    /** When set, the service asked the user to clarify instead of running the run */
    clarification?: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    iterations?: number;
}
type ConversationTaskStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';
interface ConversationTask {
    id: string;
    sessionId: string;
    tenant: string;
    agentId?: number | null;
    endUserId?: string | null;
    message: string;
    status: ConversationTaskStatus;
    enableMemory: boolean;
    history?: unknown;
    prompt?: string | null;
    skills?: unknown;
    result?: string | null;
    error?: string | null;
    usage?: unknown;
    iterations?: number | null;
    createdAt: string;
    startedAt?: string | null;
    finishedAt?: string | null;
}
interface ConversationCreateTaskParams {
    sessionId: string;
    /** AgentX agent id (omit when using inline prompt/skills mode) */
    agentId?: number;
    message: string;
    enableMemory?: boolean;
    /** Full conversation history (optional) */
    history?: {
        role: 'user' | 'assistant';
        content: string;
    }[];
    /** Inline mode: caller-supplied system prompt */
    prompt?: string;
    /** Inline mode: caller-supplied tools */
    skills?: ConversationSkillDef[];
    /** BYOK: id of a stored tenant-owned API key */
    tenantKeyId?: string;
}
interface ConversationCreateSessionParams {
    sessionId?: string;
    agentId?: number;
    endUserId?: string;
    title?: string;
}
/**
 * Thrown by task APIs when the platform rejects the request.
 * `code === 'PARALLEL_TASKS_DISABLED'` (HTTP 403) means the integrator/tenant
 * is configured to disallow multi-task / sub-agent (P9).
 */
declare class ConversationTaskError extends Error {
    readonly status: number;
    readonly code?: string;
    constructor(status: number, message: string, code?: string);
}
declare class ConversationClient {
    private readonly config;
    private readonly baseUrl;
    constructor(config: ConversationClientConfig);
    /** Common auth/tenant headers for all Gateway API calls. */
    private _headers;
    /**
     * Stream an agent conversation (SSE). Yields parsed events.
     * @param opts.signal external AbortSignal — aborts the stream (e.g. user "stop")
     */
    stream(params: ConversationChatParams, opts?: {
        signal?: AbortSignal;
    }): AsyncGenerator<ConversationSSEEvent>;
    /**
     * Run a conversation and collect the full result.
     */
    chat(params: ConversationChatParams): Promise<ConversationChatResult>;
    /**
     * Query the integrator's capability flags (P9). When `parallelTasks` is false,
     * `createTask` will be rejected with HTTP 403 `PARALLEL_TASKS_DISABLED` —
     * callers should degrade to single-turn `chat()` in that case.
     */
    getCapabilities(): Promise<{
        parallelTasks: boolean;
        parallelTasksOverride: boolean | null;
    }>;
    /**
     * Create a session (dialog container that owns many tasks). Idempotent.
     */
    createSession(params: ConversationCreateSessionParams): Promise<{
        id: string;
        tenant: string;
        agentId?: number | null;
        endUserId?: string | null;
        title?: string | null;
    }>;
    /**
     * Create a task — returns immediately with the task row (`status: queued`);
     * execution happens in the background. Throws `ConversationTaskError` with
     * `code === 'PARALLEL_TASKS_DISABLED'` (HTTP 403) when the tenant/plan is
     * configured to disallow multi-task / sub-agent.
     */
    createTask(params: ConversationCreateTaskParams): Promise<ConversationTask>;
    /** Fetch a single task by id. */
    getTask(taskId: string): Promise<ConversationTask>;
    /** List tasks of a session. */
    listTasks(sessionId: string): Promise<ConversationTask[]>;
    /** Cancel a task (queued → cancelled directly, running → aborted). */
    cancelTask(taskId: string): Promise<ConversationTask>;
}

export { type ConversationChatParams, type ConversationChatResult, ConversationClient, type ConversationClientConfig, type ConversationCreateSessionParams, type ConversationCreateTaskParams, type ConversationSSEEvent, type ConversationSkillDef, type ConversationTask, ConversationTaskError, type ConversationTaskStatus, type OnChainApprovalRequest };
