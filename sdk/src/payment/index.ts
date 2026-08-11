// @agentx/sdk — Payment module (three-rail subscription payments + generic clients)
export { SubscriptionPayments } from './payments'
export type {
  SubscriptionPaymentMethod,
  SubscriptionPaymentsConfig,
  PaySubscriptionInput,
  PaySubscriptionResult,
  X402Info,
} from './payments'

// R19.3 (D11): platform subscription-tier purchases (tenant plans) share the
// same unified payments endpoint; the business binding is `purpose='tenant-plan'`.
export { TenantPlanPayments } from './tenant-plan'
export type {
  TenantPlanPaymentMethod,
  TenantPlanPaymentsConfig,
  BuyTenantPlanInput,
  BuyTenantPlanResult,
} from './tenant-plan'

// v0.9.3: the generic engine (@0xinfrax/payments) adds MPP payment channels,
// stablecoin (EIP-3009 / Permit2), period authorization and a2a-pay. AgentX
// re-exports the protocol-level clients so integrators can drive those rails
// directly; the business semantics stay in `@0xinfrax/payments` metadata.
//
// R17.5: @0xinfrax/payments@0.1.2 removed the a2a and period rails from the
// generic engine, so AgentX self-hosted both (services/payments-a2a-period.ts).
// R17.6: @0xinfrax/payments@0.1.3 restored both rails inside the engine. The
// gateway now delegates to the module rails while keeping the HTTP contract
// identical, so A2AClient / PeriodClient keep their public signatures and
// B-side callers see zero change.
export { MPPClient, X402Client, PaymentsClient } from '@0xinfrax/payments'
export { A2AClient } from './a2a-client'
export { PeriodClient } from './period-client'
export type { ClientOptions } from '@0xinfrax/payments'

export const PAYMENT_VERSION = '0.1.3'
