import { Address, PublicClient, WalletClient, Hash } from 'viem';
import { A as AgentSubscription } from './types-CFiEdhV5.mjs';

declare const ZERO_ADDRESS: Address;
interface SubscriptionConfig {
    contractAddress: Address;
    publicClient: PublicClient;
    walletClient: WalletClient;
}
interface PlanDetail {
    planId: number;
    agentId: number;
    creator: Address;
    price: bigint;
    period: string;
    active: boolean;
    payToken: Address;
    trialDays: number;
}
interface SubscriptionDetail {
    subscriptionId: number;
    subscriber: Address;
    agentId: number;
    status: number;
    startedAt: number;
    expiresAt: number;
    period: string;
    payToken: Address;
    amountPaid: bigint;
    trialActive: boolean;
    trialEndsAt: number;
    fundsReleased: boolean;
}
declare const SUBSCRIPTION_PERIODS: readonly ["day", "week", "month", "year"];
type SubscriptionPeriod = (typeof SUBSCRIPTION_PERIODS)[number];
interface CreatePlanParams {
    agentId: number;
    /** Price in wei (native token) or token units for ERC20 plans. */
    price: bigint;
    /** Must be one of: day | week | month | year (contract-valid enum). */
    period: SubscriptionPeriod;
    /** ERC20 pay token; default zero address = native token. */
    payToken?: Address;
    /** Trial days (0–30). Default 0 = no trial. */
    trialDays?: number;
}
interface CreatePlanResult {
    planId: number;
    txHash: Hash;
}
interface SubscribeResult {
    subscriptionId: number;
    txHash: Hash;
    subscriber: Address;
    agentId: number;
    /** Unix timestamp (seconds) when the subscription expires. */
    expiresAt: number;
}
declare class SubscriptionManager {
    private address;
    private publicClient;
    private walletClient;
    constructor(config: SubscriptionConfig);
    /**
     * Resolve the caller account for write operations.
     *
     * Prefers `walletClient.account` (a full viem Account object with signing
     * capability) over `getAddresses()[0]` (a bare address string). Passing a
     * bare string as `account` makes viem route `writeContract` through
     * `eth_sendTransaction` (node-managed accounts only), which fails for local
     * signers; the full object enables local signing via `eth_sendRawTransaction`.
     * In browser wallets (e.g. MetaMask) `client.account` is a json-rpc account
     * and the provider signs, so both paths keep working.
     */
    private _resolveAccount;
    /** Get current platform fee in basis points (e.g. 250 = 2.5%). */
    getPlatformFeeBps(): Promise<number>;
    /** Check if a token is whitelisted for payments. */
    isTokenWhitelisted(token: Address): Promise<boolean>;
    /** Get full plan details with v2 fields. */
    getPlan(planId: number): Promise<PlanDetail>;
    /**
     * Create a subscription plan for an agent.
     *
     * @param params.period  Must be 'day' | 'week' | 'month' | 'year' — the only
     *                       values the contract maps to real durations. Anything
     *                       else silently becomes 30 days on-chain.
     * @returns              { planId, txHash } (planId parsed from PlanCreated event)
     */
    createPlan(params: CreatePlanParams): Promise<CreatePlanResult>;
    /**
     * Subscribe to a plan.
     * For ETH plans: pass valueWei = plan.price.
     * For ERC20 plans: auto-detects from plan.payToken, calls approve + subscribe.
     *                    User must have approved this contract for plan.price tokens.
     *
     * @returns SubscribeResult — subscriptionId/expiresAt/subscriber parsed from
     *          the Subscribed event (no longer hardcoded to 0).
     */
    subscribe(planId: number, opts?: {
        valueWei?: bigint;
        approveTokenFirst?: boolean;
    }): Promise<SubscribeResult>;
    /**
     * One-step createPlan + subscribe (two transactions).
     * Saves the caller one round of plan lookup when the plan does not exist yet.
     */
    createPlanAndSubscribe(params: CreatePlanParams): Promise<CreatePlanResult & SubscribeResult>;
    /** Release escrowed funds to creator after trial window ends. */
    releaseFunds(subscriptionId: number): Promise<Hash>;
    /** Cancel subscription (trial refund if within window). */
    cancel(subscriptionId: number): Promise<Hash>;
    hasActiveSubscription(subscriber: Address, agentId: number): Promise<boolean>;
    getSubscription(subscriber: Address, agentId: number): Promise<AgentSubscription | null>;
    /** Get full subscription detail with v2 fields (trial, payToken, fundsReleased). */
    getSubscriptionDetail(subscriptionId: number): Promise<SubscriptionDetail>;
    getUserSubscriptions(user: Address): Promise<number[]>;
    private _findEventLog;
    /** Parse planId from the PlanCreated event in a transaction receipt. */
    private _parsePlanIdFromReceipt;
    /** Parse subscriptionId/subscriber/agentId/expiresAt from the Subscribed event. */
    private _parseSubscribedFromReceipt;
}
declare function guardSubscription(manager: SubscriptionManager, user: Address, agentId: number): Promise<AgentSubscription>;

export { type CreatePlanParams as C, type PlanDetail as P, SubscriptionManager as S, ZERO_ADDRESS as Z, type CreatePlanResult as a, SUBSCRIPTION_PERIODS as b, type SubscribeResult as c, type SubscriptionConfig as d, type SubscriptionDetail as e, type SubscriptionPeriod as f, guardSubscription as g };
