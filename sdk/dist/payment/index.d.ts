import { Address, Hash, WalletClient } from 'viem';
import { S as SubscriptionManager } from '../subscription-BTd2yVL9.js';
import '../types-CFiEdhV5.js';

type SubscriptionPaymentMethod = 'chain' | 'fiat' | 'x402';
type SubscriptionPeriod = 'day' | 'week' | 'month' | 'year';
type ChainKey = 'oxachain' | 'sepolia';
interface SubscriptionPaymentsConfig {
    /** AgentX Gateway base URL (required for fiat / x402 rails). */
    gatewayUrl?: string;
    /** Optional gateway bearer token. */
    accessToken?: string;
    /** Chain rail — required for `method: 'chain'` and for automatic x402 payment. */
    subscriptionManager?: SubscriptionManager;
    /** Wallet used to automatically fund an x402 payment (if txHash is not supplied). */
    walletClient?: WalletClient;
    /** Which chain to verify x402 payments on (default: oxachain). */
    chain?: ChainKey;
}
interface PaySubscriptionInput {
    planId: number;
    agentId: number;
    method: SubscriptionPaymentMethod;
    /** Buyer wallet. Required for fiat / x402; chain resolves from the wallet client. */
    subscriber?: Address;
    /** Chain rail: native value override (defaults to the plan price). */
    valueWei?: bigint;
    /** Chain rail: approve the ERC20 token before subscribing. */
    approveTokenFirst?: boolean;
    /** Fiat rail: amount in minor units (cents). Optional — the Gateway
     *  auto-prices from the on-chain plan when planId is sent without it
     *  (see /api/v1/fiat/checkout). */
    amountCents?: number;
    /** Fiat rail: currency code (default 'usd'). */
    currency?: string;
    /** Fiat rail: redirect targets after Stripe checkout. */
    successUrl?: string;
    cancelUrl?: string;
    /** x402 rail: already-sent on-chain payment tx. When omitted and a wallet
     *  client is configured, the payment is sent automatically. */
    txHash?: string;
    /** Billing period (default 'month'). */
    period?: SubscriptionPeriod;
}
type PaySubscriptionResult = {
    method: 'chain';
    subscriptionId: number;
    txHash: Hash;
} | {
    method: 'fiat';
    sessionUrl: string;
    sessionId: string;
    redirect: true;
} | {
    method: 'x402';
    subscriptionId: number;
    txHash: string;
    creditedWei?: string;
};
/** x402 protocol discovery returned by the Gateway. */
interface X402Info {
    enabled: boolean;
    priceWei: string;
    payTo: string;
    network: string;
    chain: ChainKey;
}
declare class SubscriptionPayments {
    private config;
    constructor(config: SubscriptionPaymentsConfig);
    /** Pay for (or renew) a subscription using the chosen rail. */
    pay(input: PaySubscriptionInput): Promise<PaySubscriptionResult>;
    /**
     * Unified access check across all rails (chain OR fiat/x402) via the Gateway
     * `/api/v1/chain/check-subscription` endpoint (which already merges them).
     */
    hasAccess(agentId: number, subscriber: Address): Promise<boolean>;
    /** x402 protocol discovery (price / pay-to wallet / network). */
    fetchX402Info(): Promise<X402Info>;
    private _payChain;
    private _payFiat;
    private _payX402;
    /** Send the on-chain native transfer to the platform wallet (x402 rail). */
    private _autoFundX402;
    private _fetchJson;
}

declare const PAYMENT_VERSION = "0.1.0";

export { PAYMENT_VERSION, type PaySubscriptionInput, type PaySubscriptionResult, type SubscriptionPaymentMethod, SubscriptionPayments, type SubscriptionPaymentsConfig, type X402Info };
