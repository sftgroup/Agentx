// components/agent/dashboard/SubscriptionManager.tsx
'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import {
  CreditCard,
  Plus,
  Edit,
  Users,
  TrendingUp,
  DollarSign,
  CheckCircle,
  XCircle,
  RefreshCw,
  AlertCircle,
  PauseCircle,
  Play
} from 'lucide-react'
import {
  useSubscription,
  type SubscriptionPlan,
  BillingPeriod
} from '../hooks/useSubscription'
import { useAgentRegistry } from '../hooks/useAgentRegistry'

interface PlanFormData {
  name: string
  description: string
  price: number
  billingPeriod: BillingPeriod
  token: string
  maxUsage: number
}

interface ValidationResult {
  isValid: boolean
  message: string
}

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

  const billingPeriods = [
    { value: BillingPeriod.Daily, label: '每日', days: 1 },
    { value: BillingPeriod.Weekly, label: '每周', days: 7 },
    { value: BillingPeriod.Monthly, label: '每月', days: 30 },
    { value: BillingPeriod.Quarterly, label: '每季度', days: 90 },
    { value: BillingPeriod.Yearly, label: '每年', days: 365 }
  ]

  const tokens = [
    { value: '0x0000000000000000000000000000000000000000', label: 'ETH', decimals: 18 },
    { value: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', label: 'USDC', decimals: 6 },
    { value: '0x6B175474E89094C44Da98b954EedeAC495271d0F', label: 'DAI', decimals: 18 }
  ]

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

  const validateForm = (): ValidationResult => {
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

  useEffect(() => {
    if (formData.name && formData.description && formData.price > 0 && formData.maxUsage > 0) {
      setValidation(validateForm())
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

    const validationResult = validateForm()
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

    const tokenConfig = tokens.find(t => t.value === plan.token)
    const decimals = tokenConfig?.decimals || 18
    const priceInToken = Number(plan.price) / Math.pow(10, decimals)

    setFormData({
      name: plan.name,
      description: plan.description,
      price: priceInToken,
      billingPeriod: plan.billingPeriod,
      token: plan.token,
      maxUsage: Number(plan.maxUsage)
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
        plan.name,
        plan.description,
        Number(plan.price),
        plan.billingPeriod,
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
        plan.name,
        plan.description,
        Number(plan.price),
        plan.billingPeriod,
        1000 // 重新启用时设置合理的最大使用量
      )
    } catch (error) {
      console.error('Failed to activate plan:', error)
    }
  }

  const formatPrice = (price: bigint, tokenAddress: string) => {
    const tokenConfig = tokens.find(t => t.value === tokenAddress)
    const decimals = tokenConfig?.decimals || 18
    const formattedPrice = Number(price) / Math.pow(10, decimals)
    const symbol = tokenConfig?.label || 'ETH'
    return `${formattedPrice.toFixed(4)} ${symbol}`
  }

  const getBillingPeriodLabel = (billingPeriod: BillingPeriod) => {
    const period = billingPeriods.find(p => p.value === billingPeriod)
    return period ? period.label : `${billingPeriod}天`
  }

  const getTokenSymbol = (tokenAddress: string) => {
    const token = tokens.find(t => t.value === tokenAddress)
    return token ? token.label : 'Unknown'
  }

  const formatTimestamp = (timestamp: bigint) => {
    return new Date(Number(timestamp) * 1000).toLocaleDateString('zh-CN')
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
              {agentPlans.map((plan) => {
                // 修复：通过最大使用量判断计划是否停用
                const isPlanDeactivated = Number(plan.maxUsage) === 0

                return (
                  <div
                    key={plan.planId.toString()}
                    className={`bg-white rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow ${
                      isPlanDeactivated
                        ? 'border-gray-300 bg-gray-50 opacity-75'
                        : 'border-gray-200'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className={`text-lg font-semibold ${
                          isPlanDeactivated ? 'text-gray-500' : 'text-gray-900'
                        }`}>
                          {plan.name}
                          {isPlanDeactivated && (
                            <span className="ml-2 text-xs text-gray-500">(已停用)</span>
                          )}
                        </h4>
                        <p className={`text-sm mt-1 ${
                          isPlanDeactivated ? 'text-gray-400' : 'text-gray-600'
                        }`}>
                          {plan.description}
                        </p>
                      </div>
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        isPlanDeactivated
                          ? 'bg-gray-100 text-gray-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {isPlanDeactivated ? '已停用' : '活跃'}
                      </span>
                    </div>

                    <div className={`space-y-3 mb-4 ${
                      isPlanDeactivated ? 'text-gray-500' : ''
                    }`}>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">价格</span>
                        <span className="font-semibold">
                          {formatPrice(plan.price, plan.token)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">计费周期</span>
                        <span className="text-sm">
                          {getBillingPeriodLabel(plan.billingPeriod)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">最大使用量</span>
                        <span className="text-sm">
                          {isPlanDeactivated ? '0' : Number(plan.maxUsage).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">代币</span>
                        <span className="text-sm">
                          {getTokenSymbol(plan.token)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">创建时间</span>
                        <span className="text-xs text-gray-500">
                          {formatTimestamp(plan.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* 修复：统一按钮大小和样式，支持停用和启用 */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditPlan(plan)}
                        className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                        disabled={isUpdatingPlan}
                      >
                        <Edit className="w-4 h-4" />
                        {isUpdatingPlan ? '更新中...' : '编辑'}
                      </button>

                      {isPlanDeactivated ? (
                        <button
                          onClick={() => handleActivatePlan(plan)}
                          className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                          disabled={isUpdatingPlan}
                          title="启用此计划"
                        >
                          <Play className="w-4 h-4" />
                          {isUpdatingPlan ? '启用中...' : '启用'}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleDeactivatePlan(plan)}
                          className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                          disabled={isUpdatingPlan}
                          title="停用此计划"
                        >
                          <PauseCircle className="w-4 h-4" />
                          {isUpdatingPlan ? '停用中...' : '停用'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {showPlanForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {editingPlan ? '编辑订阅计划' : '创建订阅计划'}
              </h3>

              <form onSubmit={handleSubmitPlan} className="space-y-4">
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

                  {!editingPlan && (
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
                        {tokens.map(token => (
                          <option key={token.value} value={token.value}>
                            {token.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
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
                      {billingPeriods.map(period => (
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
                    onClick={handleCancelPlan}
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
                        {editingPlan ? '更新计划' : '创建计划'}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
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


