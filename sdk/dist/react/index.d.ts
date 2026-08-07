import { A as AgentRunContext } from '../agent-runner-BUO0BF7i.js';
export { O as OnChainReader, R as RunnableSkill, W as WalletSigner } from '../agent-runner-BUO0BF7i.js';
import { C as ChainConfig } from '../config-BFeSR_GK.js';
import '../types-DJHPGJSX.js';
import 'viem';

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

export { AgentRunContext, type UseAgentRunnerConfig, type UseAgentRunnerResult, useAgentRunner };
