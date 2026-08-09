// @agentx/sdk — Payment module (three-rail subscription payments + generic clients)
export { SubscriptionPayments } from './payments'
export type {
  SubscriptionPaymentMethod,
  SubscriptionPaymentsConfig,
  PaySubscriptionInput,
  PaySubscriptionResult,
  X402Info,
} from './payments'

// v0.9.3: the generic engine (@0xinfrax/payments) adds MPP payment channels,
// stablecoin (EIP-3009 / Permit2), period authorization and a2a-pay. AgentX
// re-exports the protocol-level clients so integrators can drive those rails
// directly; the business semantics stay in `@0xinfrax/payments` metadata.
export { MPPClient, A2AClient, PeriodClient, X402Client, PaymentsClient } from '@0xinfrax/payments'
export type { ClientOptions } from '@0xinfrax/payments'

export const PAYMENT_VERSION = '0.1.1'
