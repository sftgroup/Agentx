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
//
// R17.5: @0xinfrax/payments@0.1.2 removed the a2a and period rails from the
// generic engine, so A2AClient / PeriodClient are now self-hosted local
// clients (same public contract — they talk to the AgentX gateway endpoints
// backed by services/payments-a2a-period.ts). MPP / x402 / unified clients
// still come from the engine.
export { MPPClient, X402Client, PaymentsClient } from '@0xinfrax/payments'
export { A2AClient } from './a2a-client'
export { PeriodClient } from './period-client'
export type { ClientOptions } from '@0xinfrax/payments'

export const PAYMENT_VERSION = '0.1.1'
