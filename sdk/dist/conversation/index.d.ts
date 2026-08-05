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
}
interface ConversationSSEEvent {
    type: 'text' | 'tool_call' | 'tool_result' | 'thinking' | 'done' | 'error' | 'clarification';
    content?: string;
    /** Clarification question when the service decides the request needs disambiguation */
    question?: string;
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    toolResult?: unknown;
    /** Attached to tool_result when tool execution failed */
    error?: string;
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
declare class ConversationClient {
    private readonly config;
    private readonly baseUrl;
    constructor(config: ConversationClientConfig);
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
}

export { type ConversationChatParams, type ConversationChatResult, ConversationClient, type ConversationClientConfig, type ConversationSSEEvent, type ConversationSkillDef };
