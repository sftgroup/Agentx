// components/agent/dashboard/subscription-utils.ts
// R7 拆分：SubscriptionManager 的类型、常量与纯函数（供主组件与子组件引用）
import { type SubscriptionPlan, BillingPeriod } from '../hooks/useSubscription'
import { ZERO_ADDRESS } from '../hooks/contract-address'

export interface PlanFormData {
  name: string
  description: string
  price: number
  billingPeriod: BillingPeriod
  token: string
  maxUsage: number
}

export interface ValidationResult {
  isValid: boolean
  message: string
}

export const BILLING_PERIODS = [
  { value: BillingPeriod.Daily, label: '每日', days: 1 },
  { value: BillingPeriod.Weekly, label: '每周', days: 7 },
  { value: BillingPeriod.Monthly, label: '每月', days: 30 },
  // Quarterly intentionally omitted — the on-chain contract only supports
  // day/week/month/year (see BILLING_PERIOD_TO_ONCHAIN).
  { value: BillingPeriod.Yearly, label: '每年', days: 365 }
]

export const TOKENS = [
  { value: ZERO_ADDRESS, label: 'ETH', decimals: 18 },
  { value: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', label: 'USDC', decimals: 6 },
  { value: '0x6B175474E89094C44Da98b954EedeAC495271d0F', label: 'DAI', decimals: 18 }
]

export const validateForm = (formData: PlanFormData): ValidationResult => {
  if (!formData.name.trim()) {
    return { isValid: false, message: '计划名称不能为空' }
  }

  if (!formData.description.trim()) {
    return { isValid: false, message: '计划描述不能为空' }
  }

  if (formData.price <= 0) {
    return { isValid: false, message: '价格必须大于0' }
  }

  if (formData.maxUsage <= 0) {
    return { isValid: false, message: '最大使用量必须大于0' }
  }

  return { isValid: true, message: '' }
}

export const formatPrice = (price: bigint, tokenAddress: string): string => {
  const tokenConfig = TOKENS.find(t => t.value === tokenAddress)
  const decimals = tokenConfig?.decimals || 18
  const formattedPrice = Number(price) / Math.pow(10, decimals)
  const symbol = tokenConfig?.label || 'ETH'
  return `${formattedPrice.toFixed(4)} ${symbol}`
}

export const getBillingPeriodLabel = (billingPeriod: BillingPeriod): string => {
  const period = BILLING_PERIODS.find(p => p.value === billingPeriod)
  return period ? period.label : `${billingPeriod}天`
}

// v2 plans carry the on-chain period string ('day'/'week'/'month'/'year');
// fall back to the v1 BillingPeriod label when it is absent.
const PERIOD_LABELS: Record<string, string> = { day: '每日', week: '每周', month: '每月', year: '每年' }
export const getPeriodLabel = (period?: string, fallback?: BillingPeriod): string => {
  if (period && PERIOD_LABELS[period]) return PERIOD_LABELS[period]
  return getBillingPeriodLabel(fallback ?? BillingPeriod.Monthly)
}

export const getTokenSymbol = (tokenAddress: string): string => {
  const token = TOKENS.find(t => t.value === tokenAddress)
  return token ? token.label : 'Unknown'
}

export const formatTimestamp = (timestamp: bigint): string => {
  return new Date(Number(timestamp) * 1000).toLocaleDateString('zh-CN')
}

// 停用状态以链上 plan.active 为准（v2 计划无 maxUsage 字段）
export const isPlanDeactivated = (plan: SubscriptionPlan): boolean => {
  return plan.active === false
}
