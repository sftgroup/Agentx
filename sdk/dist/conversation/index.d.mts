interface ConversationClientConfig {
    /** Gateway base URL, e.g. http://43.159.60.46:3090 */
    gatewayUrl: string;
    /** Tenant API Key (agentx_...) issued after registration */
    apiKey: string;
    /** End-user ID for memory isolation within the tenant (optional) */
    endUserId?: string;
    /** LLM API Key override — uses the caller's key instead of the tenant's (optional) */
    llmApiKey?: string;
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
    type: 'text' | 'tool_call' | 'tool_result' | 'thinking' | 'done' | 'error';
    content?: string;
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    toolResult?: unknown;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    iterations?: number;
    error?: string;
}
interface ConversationChatResult {
    text: string;
    toolCalls: {
        name: string;
        arguments: Record<string, unknown>;
        result?: unknown;
    }[];
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
     */
    stream(params: ConversationChatParams): AsyncGenerator<ConversationSSEEvent>;
    /**
     * Run a conversation and collect the full result.
     */
    chat(params: ConversationChatParams): Promise<ConversationChatResult>;
}

export { type ConversationChatParams, type ConversationChatResult, ConversationClient, type ConversationClientConfig, type ConversationSSEEvent, type ConversationSkillDef };
