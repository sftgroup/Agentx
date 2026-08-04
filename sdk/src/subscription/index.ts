// @agentx/sdk — Subscription module v2
export { SubscriptionManager, guardSubscription, ZERO_ADDRESS, SUBSCRIPTION_PERIODS } from './subscription'
export type {
  SubscriptionConfig,
  PlanDetail,
  SubscriptionDetail,
  SubscriptionPeriod,
  CreatePlanParams,
  CreatePlanResult,
  SubscribeResult,
} from './subscription'
export { AgentX402 } from './agent-x402'
export type { AgentX402Config } from './agent-x402'
export const SUBSCRIPTION_VERSION = '0.3.0'
