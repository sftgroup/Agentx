// components/agent/dashboard/SubscriptionManager.tsx
// R7 拆分：主组件（状态 + handlers），展示部分拆至 SubscriptionPlanCard / SubscriptionPlanModal，
// 纯逻辑拆至 subscription-utils
'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import {
  CreditCard,
  Plus,
  Users,
  TrendingUp,
  DollarSign,
  CheckCircle,
  XCircle,
  RefreshCw,
  AlertCircle
} from 'lucide-react'
import {
  useSubscription,
  type SubscriptionPlan,
  BillingPeriod
} from '../hooks/useSubscription'
import { useOnChainAgentRegistry as useAgentRegistry } from '../hooks/useAgentRegistry'
import {
  validateForm,
  TOKENS,
  type PlanFormData,
  type ValidationResult
} from './subscription-utils'
import { SubscriptionPlanCard } from './SubscriptionPlanCard'
import { SubscriptionPlanModal } from './SubscriptionPlanModal'

export function SubscriptionManager() {
  const { address, isConnected } = useAccount()
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null)
  const [showPlanForm, setShowPlanForm] = useState(false)
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null)
  const [formData, setFormData] = useState<PlanFormData>({
    name: '',
    description: '',
    price: 0,
    billingPeriod: BillingPeriod.Monthly,
    token: '0x0000000000000000000000000000000000000000',
    maxUsage: 1000
  })
  const [validation, setValidation] = useState<ValidationResult>({ isValid: true, message: '' })

  const {
    createSubscriptionPlan,
    updateSubscriptionPlan,
    getAgentPlans,
    getAgentSubscriptionStats,
    agentPlans,
    subscriptionStats,
    isCreatingPlan,
    isUpdatingPlan,
    isConfirming,
    isConfirmed,
    error,
    transactionHash,
    refetchData,
    resetState
  } = useSubscription()

  const { userAgents } = useAgentRegistry()

  useEffect(() => {
    if (selectedAgentId) {
      loadData()
    }
  }, [selectedAgentId])

  useEffect(() => {
    if (isConfirmed && selectedAgentId) {
      loadData()
      resetState()

      if (showPlanForm) {
        setShowPlanForm(false)
        setEditingPlan(null)
        setFormData({
          name: '',
          description: '',
          price: 0,
          billingPeriod: BillingPeriod.Monthly,
          token: '0x0000000000000000000000000000000000000000',
          maxUsage: 1000
        })
      }
    }
  }, [isConfirmed, selectedAgentId, resetState, showPlanForm])

  useEffect(() => {
    if (formData.name && formData.description && formData.price > 0 && formData.maxUsage > 0) {
      setValidation(validateForm(formData))
    } else {
      setValidation({ isValid: true, message: '' })
    }
  }, [formData.name, formData.description, formData.price, formData.maxUsage])

  const loadData = async () => {
    try {
      if (selectedAgentId) {
        await getAgentPlans(selectedAgentId)
        await getAgentSubscriptionStats(selectedAgentId)
      }
    } catch (error) {
      console.error('Failed to load data:', error)
    }
  }

  const handleSubmitPlan = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedAgentId) {
      alert('请选择Agent')
      return
    }

    if (!isConnected || !address) {
      alert('请先连接钱包')
      return
    }

    const validationResult = validateForm(formData)
    if (!validationResult.isValid) {
      setValidation(validationResult)
      return
    }

    try {
      const priceInWei = BigInt(Math.floor(formData.price * 1e18))

      if (editingPlan) {
        await updateSubscriptionPlan(
          Number(editingPlan.planId),
          formData.name,
          formData.description,
          Number(priceInWei),
          formData.billingPeriod,
          formData.maxUsage
        )
      } else {
        await createSubscriptionPlan(
          selectedAgentId,
          formData.name,
          formData.description,
          formData.token,
          Number(priceInWei),
          formData.billingPeriod,
          formData.maxUsage
        )
      }

    } catch (error) {
      console.error('Failed to save plan:', error)
    }
  }

  const handleEditPlan = (plan: SubscriptionPlan) => {
    setEditingPlan(plan)

    const tokenConfig = TOKENS.find(t => t.value === plan.token)
    const decimals = tokenConfig?.decimals || 18
    const priceInToken = Number(plan.price) / Math.pow(10, decimals)

    setFormData({
      name: plan.name ?? '',
      description: plan.description ?? '',
      price: priceInToken,
      billingPeriod: plan.billingPeriod ?? BillingPeriod.Monthly,
      token: plan.token ?? '0x0000000000000000000000000000000000000000',
      maxUsage: plan.maxUsage ?? 1000
    })
    setShowPlanForm(true)
    setValidation({ isValid: true, message: '' })
  }

  const handleCancelPlan = () => {
    setShowPlanForm(false)
    setEditingPlan(null)
    setFormData({
      name: '',
      description: '',
      price: 0,
      billingPeriod: BillingPeriod.Monthly,
      token: '0x0000000000000000000000000000000000000000',
      maxUsage: 1000
    })
    setValidation({ isValid: true, message: '' })
    resetState()
  }

  // 修复：通过设置最大使用量为0来停用计划
  const handleDeactivatePlan = async (plan: SubscriptionPlan) => {
    if (!window.confirm(`确定要停用订阅计划 "${plan.name}" 吗？停用后用户将无法订阅此计划。`)) {
      return
    }

    if (!selectedAgentId) {
      alert('请先选择Agent')
      return
    }

    try {
      // 修复：通过更新计划将最大使用量设置为0来"停用"计划
      await updateSubscriptionPlan(
        Number(plan.planId),
        plan.name ?? '',
        plan.description ?? '',
        Number(plan.price),
        plan.billingPeriod ?? BillingPeriod.Monthly,
        0 // 设置最大使用量为0来停用计划
      )
    } catch (error) {
      console.error('Failed to deactivate plan:', error)
    }
  }

  // 修复：通过设置最大使用量为正数来启用计划
  const handleActivatePlan = async (plan: SubscriptionPlan) => {
    if (!window.confirm(`确定要启用订阅计划 "${plan.name}" 吗？启用后用户可以订阅此计划。`)) {
      return
    }

    if (!selectedAgentId) {
      alert('请先选择Agent')
      return
    }

    try {
      // 修复：通过更新计划重新启用，设置合理的最大使用量
      await updateSubscriptionPlan(
        Number(plan.planId),
        plan.name ?? '',
        plan.description ?? '',
        Number(plan.price),
        plan.billingPeriod ?? BillingPeriod.Monthly,
        1000 // 重新启用时设置合理的最大使用量
      )
    } catch (error) {
      console.error('Failed to activate plan:', error)
    }
  }

  // 计算统计数据
  const totalPlans = agentPlans.length
  const activePlans = agentPlans.filter(plan => Number(plan.maxUsage) > 0).length
  const deactivatedPlans = agentPlans.filter(plan => Number(plan.maxUsage) === 0).length
  const totalSubscriptions = subscriptionStats ? Number(subscriptionStats.totalSubscriptions) : 0
  const activeSubscriptions = subscriptionStats ? Number(subscriptionStats.activeSubscriptions) : 0
  const totalRevenue = subscriptionStats ? Number(subscriptionStats.totalRevenue) / 1e18 : 0

  const isFormLoading = isCreatingPlan || isUpdatingPlan || isConfirming
  const isFormDisabled = isFormLoading || !validation.isValid

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">订阅管理</h2>
          <p className="text-gray-600 mt-1">创建和管理Agent订阅计划</p>
        </div>

        <div className="flex items-center gap-3">
          {transactionHash && (
            <div className="flex items-center gap-2 text-sm">
              {isConfirming ? (
                <div className="flex items-center gap-2 text-blue-600">
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
                  交易确认中...
                </div>
              ) : isConfirmed ? (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="w-4 h-4" />
                  交易已确认
                </div>
              ) : null}
            </div>
          )}

          <button
            onClick={() => setShowPlanForm(true)}
            className="btn-primary flex items-center gap-2"
            disabled={!selectedAgentId || !isConnected}
          >
            <Plus className="w-4 h-4" />
            创建计划
          </button>
        </div>
      </div>

      {!isConnected && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center gap-2 text-yellow-800">
            <XCircle className="w-4 h-4" />
            <span>请先连接钱包以管理订阅</span>
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          选择Agent
        </label>
        <select
          value={selectedAgentId || ''}
          onChange={(e) => setSelectedAgentId(e.target.value ? Number(e.target.value) : null)}
          className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          disabled={!isConnected}
        >
          <option value="">请选择Agent</option>
          {userAgents.map((agentId) => (
            <option key={agentId} value={agentId}>
              Agent #{agentId}
            </option>
          ))}
        </select>
      </div>

      {selectedAgentId && isConnected && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <CreditCard className="w-8 h-8 text-blue-600 mr-3" />
                <div>
                  <p className="text-sm font-medium text-gray-600">总计划数</p>
                  <p className="text-2xl font-bold text-gray-900">{totalPlans}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <Users className="w-8 h-8 text-green-600 mr-3" />
                <div>
                  <p className="text-sm font-medium text-gray-600">活跃计划</p>
                  <p className="text-2xl font-bold text-gray-900">{activePlans}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <TrendingUp className="w-8 h-8 text-purple-600 mr-3" />
                <div>
                  <p className="text-sm font-medium text-gray-600">总订阅数</p>
                  <p className="text-2xl font-bold text-gray-900">{totalSubscriptions}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <DollarSign className="w-8 h-8 text-green-600 mr-3" />
                <div>
                  <p className="text-sm font-medium text-gray-600">总收益</p>
                  <p className="text-2xl font-bold text-gray-900">{totalRevenue.toFixed(4)} ETH</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">订阅计划列表</h3>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">
                {agentPlans.length} 个计划 ({activePlans} 活跃, {deactivatedPlans} 停用)
              </div>
              <button
                onClick={() => selectedAgentId && loadData()}
                className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
                disabled={isCreatingPlan || isUpdatingPlan}
              >
                <RefreshCw className="w-4 h-4" />
                刷新
              </button>
            </div>
          </div>

          {agentPlans.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <CreditCard className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-2">暂无订阅计划</p>
              <p className="text-sm text-gray-500 mb-4">为您的Agent创建订阅计划来开始盈利</p>
              <button
                onClick={() => setShowPlanForm(true)}
                className="btn-primary"
              >
                创建第一个计划
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {agentPlans.map((plan) => (
                <SubscriptionPlanCard
                  key={plan.planId.toString()}
                  plan={plan}
                  isUpdating={isUpdatingPlan}
                  onEdit={handleEditPlan}
                  onActivate={handleActivatePlan}
                  onDeactivate={handleDeactivatePlan}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {showPlanForm && (
        <SubscriptionPlanModal
          editingPlan={editingPlan}
          formData={formData}
          setFormData={setFormData}
          validation={validation}
          transactionHash={transactionHash}
          isConfirming={isConfirming}
          isConfirmed={isConfirmed}
          isFormLoading={isFormLoading}
          isFormDisabled={isFormDisabled}
          onSubmit={handleSubmitPlan}
          onCancel={handleCancelPlan}
        />
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle className="w-4 h-4" />
            <span>操作失败: {error.message}</span>
          </div>
        </div>
      )}
    </div>
  )
}
