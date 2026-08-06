// components/agent/dashboard/SubscriptionPlanCard.tsx
// R7 拆分：单个订阅计划卡片（展示 + 操作，纯展示组件）
'use client'

import { Edit, PauseCircle, Play } from 'lucide-react'
import { type SubscriptionPlan, BillingPeriod } from '../hooks/useSubscription'
import {
  formatPrice,
  getBillingPeriodLabel,
  getTokenSymbol,
  formatTimestamp,
  isPlanDeactivated
} from './subscription-utils'

interface SubscriptionPlanCardProps {
  plan: SubscriptionPlan
  isUpdating: boolean
  onEdit: (plan: SubscriptionPlan) => void
  onActivate: (plan: SubscriptionPlan) => void
  onDeactivate: (plan: SubscriptionPlan) => void
}

export function SubscriptionPlanCard({
  plan,
  isUpdating,
  onEdit,
  onActivate,
  onDeactivate
}: SubscriptionPlanCardProps) {
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

      <div className={`space-y-3 mb-4 ${
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
            {getBillingPeriodLabel(plan.billingPeriod ?? BillingPeriod.Monthly)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">最大使用量</span>
          <span className="text-sm">
            {planDeactivated ? '0' : Number(plan.maxUsage).toLocaleString()}
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

      {/* 修复：统一按钮大小和样式，支持停用和启用 */}
      <div className="flex gap-2">
        <button
          onClick={() => onEdit(plan)}
          className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
          disabled={isUpdating}
        >
          <Edit className="w-4 h-4" />
          {isUpdating ? '更新中...' : '编辑'}
        </button>

        {planDeactivated ? (
          <button
            onClick={() => onActivate(plan)}
            className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
            disabled={isUpdating}
            title="启用此计划"
          >
            <Play className="w-4 h-4" />
            {isUpdating ? '启用中...' : '启用'}
          </button>
        ) : (
          <button
            onClick={() => onDeactivate(plan)}
            className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
            disabled={isUpdating}
            title="停用此计划"
          >
            <PauseCircle className="w-4 h-4" />
            {isUpdating ? '停用中...' : '停用'}
          </button>
        )}
      </div>
    </div>
  )
}
