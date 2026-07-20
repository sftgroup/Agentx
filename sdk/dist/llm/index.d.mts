import { c as LLMProvider, C as ChatRequest, b as ChatStreamEvent } from '../types-C3FgyPBh.mjs';
import '../agent-runner-BTiZ6St-.mjs';
import '../types-CCl4P8IB.mjs';

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

export { GatewayProvider, type GatewayProviderConfig, OpenAIProvider, type OpenAIProviderConfig, type ProviderFactoryConfig, createLLMProvider };
