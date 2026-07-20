import { Address, PublicClient } from 'viem';

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

export { type ConfigEntry, ConfigurationClient, type ConfigurationConfig };
