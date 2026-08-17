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

// R19.7 companion (2026-08-16): B-end balance pre-check before pay-per-call
// delegation — GET /api/v1/billing/balance (tenant / end-user wallet).
export { BillingClient } from './billing'
export type { BillingClientConfig, BalanceResult } from './billing'

// t9 (2026-08-17): agent 自主钱包（InfraX MPC）管理客户端 — 绑定/解锁/查询。
// A2A 委派自动代付由 gateway agent-payer 服务端完成。
export { AgentWalletConfig } from './agent-wallet'
export type {
  AgentWalletConfigOptions,
  AgentWalletInfo,
  BindAgentWalletInput,
  AuthorizePaymentSessionInput,
  AuthorizePaymentSessionResult,
  AgentWalletStatus,
} from './agent-wallet'

export const PAYMENT_VERSION = '0.1.3'
