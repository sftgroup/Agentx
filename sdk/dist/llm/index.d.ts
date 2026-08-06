import { c as LLMProvider, C as ChatRequest, b as ChatStreamEvent } from '../types-WsZGWS2B.js';
import '../agent-runner-D5_NOMZR.js';
import '../types-CFiEdhV5.js';
import '../memory/index.js';
import '../traces/index.js';

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
    /** Model the provider is configured with (used by AgentLoop when no explicit ctx.model) */
    get model(): string | undefined;
    constructor(config: OpenAIProviderConfig);
    chatStream(request: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatStreamEvent>;
}

declare class GatewayProvider implements LLMProvider {
    private config;
    /** Model the provider is configured with (used by AgentLoop when no explicit ctx.model) */
    get model(): string | undefined;
    constructor(config: GatewayProviderConfig);
    chatStream(request: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatStreamEvent>;
}

declare function createLLMProvider(config: ProviderFactoryConfig): LLMProvider;

export { GatewayProvider, type GatewayProviderConfig, OpenAIProvider, type OpenAIProviderConfig, type ProviderFactoryConfig, createLLMProvider };
