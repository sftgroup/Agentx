// components/agent/hooks/subscription-types.ts
// R7 拆分：useSubscription 的类型、常量（供 hook 与外部消费方引用）
// Keeps v1 surface API stable for existing callers while aligning to v2 contracts.

export interface Subscription {
  subscriptionId: number; planId?: number; agentId: number
  subscriber: string; status: number; startDate?: number
  nextBillingDate?: number; endDate?: number
  startedAt?: number; expiresAt?: number; period?: string
  currentUsage?: number; totalPaid: bigint; createdAt: number
}
export interface SubscriptionPlan {
  planId: number; agentId: number; creator?: string
  name?: string; description?: string; price: bigint
  period?: string; active?: boolean; payToken?: string; trialDays?: number
  /** v1 dashboard-only fields (not on-chain for v2 plans) */
  token?: string; billingPeriod?: BillingPeriod; maxUsage?: number; createdAt?: number
}
export interface SubscriptionStats {
  totalSubscriptions: bigint; activeSubscriptions: bigint
  totalRevenue: bigint; monthlyRecurringRevenue: bigint
}
export interface SubscriptionDetailV2 {
  subscriptionId: number; subscriber: string; agentId: number
  status: number; startedAt: number; expiresAt: number; period: string
  payToken: string; amountPaid: bigint
  trialActive: boolean; trialEndsAt: number; fundsReleased: boolean
}
export enum SubscriptionStatus { Active=0,Cancelled=1,Expired=2,PaymentFailed=3 }
export enum BillingPeriod { Daily=0,Weekly=1,Monthly=2,Quarterly=3,Yearly=4 }

// On-chain `_periodToSeconds` only recognizes day/week/month/year. Quarterly is
// intentionally NOT mapped — silently mapping it would create a 30-day plan.
export const BILLING_PERIOD_TO_ONCHAIN: Record<BillingPeriod, string> = {
  [BillingPeriod.Daily]: 'day',
  [BillingPeriod.Weekly]: 'week',
  [BillingPeriod.Monthly]: 'month',
  [BillingPeriod.Yearly]: 'year',
  [BillingPeriod.Quarterly]: '', // rejected in createSubscriptionPlan
}

export interface UseSubscriptionReturn {
  createSubscriptionPlan: (agentId:number,name:string,desc:string,token:string,price:number,period:BillingPeriod,maxUsage:number) => Promise<`0x${string}`|undefined>
  getPlan: (planId:number) => Promise<SubscriptionPlan|null>
  getAgentPlans: (agentId:number) => Promise<SubscriptionPlan[]>
  getAgentSubscriptionStats: (agentId:number) => Promise<SubscriptionStats|null>
  subscribe: (planId:number,value?:bigint) => Promise<`0x${string}`|undefined>
  cancelSubscription: (subscriptionId:number) => Promise<`0x${string}`|undefined>
  getSubscription: (subscriptionId:number) => Promise<Subscription|null>
  getUserSubscriptions: () => Promise<Subscription[]>
  isSubscriptionActive: (subscriptionId:number) => Promise<boolean>
  /// v2 additions
  releaseFunds: (subscriptionId:number) => Promise<`0x${string}`|undefined>
  getSubscriptionDetail: (subscriptionId:number) => Promise<SubscriptionDetailV2|null>
  getPlatformFeeBps: () => Promise<number>
  isTokenWhitelisted: (token:`0x${string}`) => Promise<boolean>
  userSubscriptions: Subscription[]
  agentPlans: SubscriptionPlan[]
  subscriptionStats: SubscriptionStats|null
  isCreatingPlan: boolean; isSubscribing: boolean
  isCancellingSubscription: boolean
  isLoading: boolean; error: Error|null
  transactionHash: `0x${string}`|undefined
  isConfirming: boolean; isConfirmed: boolean
  refetchData: () => Promise<void>; resetState: () => void
}
