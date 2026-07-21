import { Address, PublicClient, WalletClient, Hash } from 'viem';
import { A as A2AAgentCard, a as A2ATask } from './types-DF0FqVs3.mjs';

interface A2AConfig {
    contractAddress: Address;
    publicClient: PublicClient;
    walletClient: WalletClient;
}
declare class A2AProtocol {
    private address;
    private publicClient;
    private walletClient;
    constructor(config: A2AConfig);
    private get account();
    createAgentCard(agentId: number, card: {
        name: string;
        description: string;
        version: string;
        capabilities: string[];
        supportedTasks: string[];
        commProtocol?: string;
        authMethod?: string;
        cardURI?: string;
    }): Promise<{
        cardId: number;
        txHash: Hash;
    }>;
    getAgentCard(agentId: number): Promise<A2AAgentCard | null>;
    createTask(agentId: number, taskType: string, input: Record<string, unknown>): Promise<{
        taskId: number;
        txHash: Hash;
    }>;
    completeTask(taskId: number, output: unknown, status?: number): Promise<Hash>;
    getTask(taskId: number): Promise<A2ATask | null>;
    getUserTasks(user: Address): Promise<number[]>;
    getAgentTasks(agentId: number): Promise<A2ATask[]>;
    getAddress(): Promise<Address>;
    private _parseUintFromLog;
}

export { type A2AConfig as A, A2AProtocol as a };
