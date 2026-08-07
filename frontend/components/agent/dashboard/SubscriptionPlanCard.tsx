// components/agent/dashboard/SubscriptionPlanCard.tsx
// R7 拆分：单个订阅计划卡片（纯展示组件）
// v2 合约无 updatePlan/deactivatePlan 能力，故不提供编辑/停用操作按钮。
'use client'

import { type SubscriptionPlan, BillingPeriod } from '../hooks/useSubscription'
import {
  formatPrice,
  getPeriodLabel,
  getTokenSymbol,
  formatTimestamp,
  isPlanDeactivated
} from './subscription-utils'

interface SubscriptionPlanCardProps {
  plan: SubscriptionPlan
}

export function SubscriptionPlanCard({ plan }: SubscriptionPlanCardProps) {
  const planDeactivated = isPlanDeactivated(plan)

  return (
    <div
      className={`bg-white rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow ${
        planDeactivated
          ? 'border-gray-300 bg-gray-50 opacity-75'
          : 'border-gray-200'
      }`}
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <h4 className={`text-lg font-semibold ${
            planDeactivated ? 'text-gray-500' : 'text-gray-900'
          }`}>
            {plan.name}
            {planDeactivated && (
              <span className="ml-2 text-xs text-gray-500">(已停用)</span>
            )}
          </h4>
          <p className={`text-sm mt-1 ${
            planDeactivated ? 'text-gray-400' : 'text-gray-600'
          }`}>
            {plan.description}
          </p>
        </div>
        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
          planDeactivated
            ? 'bg-gray-100 text-gray-800'
            : 'bg-green-100 text-green-800'
        }`}>
          {planDeactivated ? '已停用' : '活跃'}
        </span>
      </div>

      <div className={`space-y-3 ${
        planDeactivated ? 'text-gray-500' : ''
      }`}>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">价格</span>
          <span className="font-semibold">
            {formatPrice(plan.price, plan.token ?? '0x0000000000000000000000000000000000000000')}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">计费周期</span>
          <span className="text-sm">
            {getPeriodLabel(plan.period, plan.billingPeriod ?? BillingPeriod.Monthly)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">代币</span>
          <span className="text-sm">
            {getTokenSymbol(plan.token ?? '0x0000000000000000000000000000000000000000')}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">创建时间</span>
          <span className="text-xs text-gray-500">
            {formatTimestamp(BigInt(plan.createdAt ?? 0))}
          </span>
        </div>
      </div>
    </div>
  )
}
