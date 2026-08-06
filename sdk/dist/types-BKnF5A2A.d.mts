import { R as RunnableSkill } from './agent-runner-BF6qaWKG.mjs';
import { MemoryConfig } from './memory/index.mjs';
import { TraceConfig } from './traces/index.mjs';

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
    /** Default model the provider is configured with — used when the loop has no explicit model */
    model?: string;
    chatStream(request: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatStreamEvent>;
}
interface AgentLoopConfig {
    ctx: LoopRunContext;
    llmProvider: LLMProvider;
    maxIterations?: number;
    timeoutMs?: number;
    /** Memory configuration — enables cross-session memory (default: disabled) */
    memory?: MemoryConfig;
    /** Maximum total tokens for messages array — triggers compaction when exceeded */
    contextBudget?: number;
    /** Trace configuration — enables structured observability (default: disabled) */
    trace?: TraceConfig;
    /** LLM model for context compaction summaries (default: gpt-4o-mini) */
    compactModel?: string;
    /** LLM model for fact extraction (default: gpt-4o-mini) */
    factExtractionModel?: string;
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
    /** Wallet address of the current subscriber — used by Memory recall/store */
    subscriberAddress?: string;
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

export type { AgentLoopConfig as A, ChatRequest as C, LLMMessage as L, OpenAIToolDef as O, ToolCallRecord as T, AgentLoopResult as a, ChatStreamEvent as b, LLMProvider as c, LLMToolCall as d, LoopRunContext as e, ToolCallResult as f, ToolCallStart as g };
