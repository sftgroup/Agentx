interface MemoryProvider {
    /** Store a fact extracted from conversation. Called on session end. */
    store(params: {
        subscriberAddress: string;
        agentId: number;
        fact: string;
        metadata?: Record<string, string>;
    }): Promise<void>;
    /** Recall relevant facts for the current conversation. Called on session start. */
    recall(params: {
        subscriberAddress: string;
        agentId: number;
        query: string;
        limit?: number;
    }): Promise<MemoryFact[]>;
}
interface MemoryFact {
    fact: string;
    score: number;
    createdAt: string;
}
interface MemoryConfig {
    /** MemoryProvider implementation */
    provider: MemoryProvider;
    /** Enable/disable memory (default false) */
    enabled: boolean;
    /** Store facts on session end (default true) */
    storeOnSessionEnd?: boolean;
    /** Max facts to recall (default 5) */
    recallLimit?: number;
}

export type { MemoryConfig, MemoryFact, MemoryProvider };
