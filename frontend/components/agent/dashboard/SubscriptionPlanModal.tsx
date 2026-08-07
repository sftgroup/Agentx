// components/agent/dashboard/SubscriptionPlanModal.tsx
// R7 拆分：订阅计划创建弹窗（纯展示组件）
'use client'

import { CheckCircle, Plus } from 'lucide-react'
import { BillingPeriod } from '../hooks/useSubscription'
import {
  BILLING_PERIODS,
  TOKENS,
  type PlanFormData,
  type ValidationResult
} from './subscription-utils'

interface SubscriptionPlanModalProps {
  formData: PlanFormData
  setFormData: React.Dispatch<React.SetStateAction<PlanFormData>>
  validation: ValidationResult
  transactionHash: `0x${string}` | undefined
  isConfirming: boolean
  isConfirmed: boolean
  isFormLoading: boolean
  isFormDisabled: boolean
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
}

export function SubscriptionPlanModal({
  formData,
  setFormData,
  validation,
  transactionHash,
  isConfirming,
  isConfirmed,
  isFormLoading,
  isFormDisabled,
  onSubmit,
  onCancel
}: SubscriptionPlanModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            创建订阅计划
          </h3>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                计划名称 *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="例如：基础套餐、专业套餐"
                required
                disabled={isFormLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                描述 *
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="描述此计划包含的功能和服务"
                required
                disabled={isFormLoading}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  价格 (ETH) *
                </label>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={formData.price}
                  onChange={(e) => setFormData(prev => ({ ...prev, price: parseFloat(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0.00"
                  required
                  disabled={isFormLoading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  代币 *
                </label>
                <select
                  value={formData.token}
                  onChange={(e) => setFormData(prev => ({ ...prev, token: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={isFormLoading}
                >
                  {TOKENS.map(token => (
                    <option key={token.value} value={token.value}>
                      {token.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  计费周期 *
                </label>
                <select
                  value={formData.billingPeriod}
                  onChange={(e) => setFormData(prev => ({ ...prev, billingPeriod: parseInt(e.target.value) as BillingPeriod }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={isFormLoading}
                >
                  {BILLING_PERIODS.map(period => (
                    <option key={period.value} value={period.value}>
                      {period.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  最大使用量 *
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.maxUsage}
                  onChange={(e) => setFormData(prev => ({ ...prev, maxUsage: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="1000"
                  required
                  disabled={isFormLoading}
                />
              </div>
            </div>

            {!validation.isValid && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{validation.message}</p>
              </div>
            )}

            {transactionHash && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-blue-700">
                  {isConfirming ? (
                    <>
                      <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
                      <span>交易确认中...</span>
                    </>
                  ) : isConfirmed ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      <span>交易已确认</span>
                    </>
                  ) : null}
                </div>
                {transactionHash && (
                  <p className="text-xs text-blue-600 mt-1 font-mono break-all">
                    Tx: {transactionHash}
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                disabled={isFormLoading}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isFormDisabled}
                className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isFormLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {isConfirming ? '确认中...' : '保存中...'}
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    创建计划
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
