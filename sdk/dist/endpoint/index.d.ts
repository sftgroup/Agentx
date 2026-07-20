import { Address, PublicClient } from 'viem';

/**
 * MultiEndpointRegistry SDK
 * OxaChain L1 + Sepolia — multi-endpoint management for AI Agents
 */

interface EndpointRecord {
    endpointId: bigint;
    agentId: bigint;
    name: string;
    endpointType: string;
    protocol: string;
    url: string;
    description: string;
    isActive: boolean;
    createdAt: bigint;
    updatedAt: bigint;
    createdBy: Address;
}
interface MultiEndpointConfig {
    address: Address;
}
declare class MultiEndpointClient {
    private address;
    private publicClient;
    constructor(config: MultiEndpointConfig, publicClient?: PublicClient);
    setPublicClient(client: PublicClient): void;
    getActiveEndpoints(agentId: bigint): Promise<EndpointRecord[]>;
    getAllEndpoints(agentId: bigint): Promise<EndpointRecord[]>;
    getEndpoint(endpointId: bigint): Promise<EndpointRecord>;
    getStats(agentId: bigint): Promise<[bigint, bigint, bigint, bigint, bigint]>;
    /** Pick best active endpoint for the agent — prefer HTTP, take first active */
    pickBestEndpoint(agentId: bigint): Promise<EndpointRecord | null>;
    /** Pick any active endpoint URL — for MCP connector */
    getBestMCPUrl(agentId: bigint): Promise<string | null>;
}

export { type EndpointRecord, MultiEndpointClient, type MultiEndpointConfig };
