import { a as AgentRunContext } from './agent-runner-BTiZ6St-.mjs';
import { Address, PublicClient, WalletClient, Hash } from 'viem';

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

export { type ChainConfig as C, KNOWN_CHAINS as K, type UseAgentRunnerConfig as U, type ConfigRegistryOpts as a, ConfigurationRegistry as b, type UseAgentRunnerResult as c, useAgentRunner as u };
