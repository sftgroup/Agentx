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

export { type ChainConfig as C, KNOWN_CHAINS as K, type ConfigRegistryOpts as a, ConfigurationRegistry as b };
