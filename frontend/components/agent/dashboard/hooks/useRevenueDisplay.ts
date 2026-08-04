// components/agent/dashboard/hooks/useRevenueDisplay.ts
// RevenueDisplay 状态管理与业务逻辑
'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAccount } from 'wagmi'
import {
  usePaymentGateway, type Payment, PaymentStatus
} from '../../hooks/usePaymentGateway'
import { useSubscription, type Subscription, SubscriptionStatus } from '../../hooks/useSubscription'
import { useOnChainAgentRegistry as useAgentRegistry } from '../../hooks/useAgentRegistry'

// Re-export 接口，供同目录组件引用
export type { Payment } from '../../hooks/usePaymentGateway'
export type { Subscription } from '../../hooks/useSubscription'

export interface TimeRange {
  label: string
  value: string
  days: number
}

export interface RevenueStats {
  totalEarnings: number
  monthlyEarnings: number
  weeklyEarnings: number
  dailyEarnings: number
  pendingPayments: number
  completedPayments: number
  failedPayments: number
  subscriptionRevenue: number
  paymentRevenue: number
  activeSubscriptions: number
  totalSubscriptions: number
}

export interface TopAgent {
  agentId: number
  name: string
  earnings: number
  paymentCount: number
  subscriptionCount: number
  totalRevenue: number
}

export interface TokenEarnings {
  token: string
  symbol: string
  earnings: number
  percentage: number
}

export interface ChartData {
  date: string
  paymentRevenue: number
  subscriptionRevenue: number
  totalRevenue: number
}

export interface RevenueSourceData {
  name: string
  value: number
  color: string
  [key: string]: string | number
}

interface GrowthResult {
  value: number
  type: 'positive' | 'negative' | 'neutral'
}

const TIME_RANGES: TimeRange[] = [
  { label: '今天', value: 'today', days: 1 },
  { label: '本周', value: 'week', days: 7 },
  { label: '本月', value: 'month', days: 30 },
  { label: '今年', value: 'year', days: 365 },
  { label: '全部', value: 'all', days: 0 }
]

// ---- Utility functions ----
export function formatCurrency(amount: number, currency: string = 'ETH'): string {
  return `${amount.toFixed(4)} ${currency}`
}

export function useRevenueDisplay() {
  const { address, isConnected } = useAccount()
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>('all')
  const [selectedView, setSelectedView] = useState<'overview' | 'details' | 'analytics'>('overview')
  const [isLoading, setIsLoading] = useState(false)
  const [allPayments, setAllPayments] = useState<Payment[]>([])
  const [previousPeriodEarnings, setPreviousPeriodEarnings] = useState({
    total: 0, monthly: 0, weekly: 0, daily: 0
  })

  const {
    agentPayments, agentEarnings, getClientPayments, clientPayments,
    error: paymentError, refetchData: refetchPaymentData
  } = usePaymentGateway()

  const {
    userSubscriptions, error: subscriptionError, refetchData: refetchSubscriptionData
  } = useSubscription()

  const { userAgents } = useAgentRegistry()

  // ---- Utility functions ----
  const formatDate = useCallback((timestamp: bigint) => {
    return new Date(Number(timestamp) * 1000).toLocaleDateString('zh-CN')
  }, [])

  const getTokenSymbol = useCallback((tokenAddress: string): string => {
    const tokenMap: Record<string, string> = {
      '0x0000000000000000000000000000000000000000': 'ETH',
      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': 'USDC',
      '0x6B175474E89094C44Da98b954EedeAC495271d0F': 'DAI'
    }
    return tokenMap[tokenAddress] || tokenAddress.slice(0, 8) + '...'
  }, [])

  const getPaymentStatusDisplay = useCallback((status: PaymentStatus): { text: string; color: string } => {
    const map: Record<PaymentStatus, { text: string; color: string }> = {
      [PaymentStatus.Pending]: { text: '待处理', color: 'bg-yellow-100 text-yellow-800' },
      [PaymentStatus.Completed]: { text: '已完成', color: 'bg-green-100 text-green-800' },
      [PaymentStatus.Refunded]: { text: '已退款', color: 'bg-red-100 text-red-800' },
      [PaymentStatus.Disputed]: { text: '争议中', color: 'bg-orange-100 text-orange-800' },
      [PaymentStatus.Cancelled]: { text: '已取消', color: 'bg-gray-100 text-gray-800' }
    }
    return map[status] || { text: '未知', color: 'bg-gray-100 text-gray-800' }
  }, [])

  const getSubscriptionStatusDisplay = useCallback((status: number): { text: string; color: string } => {
    const map: Record<number, { text: string; color: string }> = {
      [SubscriptionStatus.Active]: { text: '活跃', color: 'bg-green-100 text-green-800' },
      [SubscriptionStatus.Cancelled]: { text: '已取消', color: 'bg-red-100 text-red-800' },
      [SubscriptionStatus.Expired]: { text: '已过期', color: 'bg-gray-100 text-gray-800' },
      [SubscriptionStatus.PaymentFailed]: { text: '支付失败', color: 'bg-orange-100 text-orange-800' }
    }
    return map[status] || { text: '未知', color: 'bg-gray-100 text-gray-800' }
  }, [])

  // ---- Filter functions ----
  const filterPaymentsByTimeRange = useCallback((payments: Payment[], timeRange: string): Payment[] => {
    if (!payments || payments.length === 0) return []
    const now = Math.floor(Date.now() / 1000)
    switch (timeRange) {
      case 'today': return payments.filter(p => Number(p.createdAt) > now - 86400)
      case 'week': return payments.filter(p => Number(p.createdAt) > now - 604800)
      case 'month': return payments.filter(p => Number(p.createdAt) > now - 2592000)
      case 'year': return payments.filter(p => Number(p.createdAt) > now - 31536000)
      default: return payments
    }
  }, [])

  const filterSubscriptionsByTimeRange = useCallback((subscriptions: Subscription[], timeRange: string): Subscription[] => {
    if (!subscriptions || subscriptions.length === 0) return []
    const now = Math.floor(Date.now() / 1000)
    switch (timeRange) {
      case 'today': return subscriptions.filter(s => Number(s.createdAt) > now - 86400)
      case 'week': return subscriptions.filter(s => Number(s.createdAt) > now - 604800)
      case 'month': return subscriptions.filter(s => Number(s.createdAt) > now - 2592000)
      case 'year': return subscriptions.filter(s => Number(s.createdAt) > now - 31536000)
      default: return subscriptions
    }
  }, [])

  // ---- Calculations ----
  const calculateTotalRevenue = useCallback((): number => {
    const paymentRevenue = Number(agentEarnings) / 1e18
    const subscriptionRevenue = userSubscriptions.reduce((sum: number, sub: any) =>
      sum + Number(sub.totalPaid || 0) / 1e18, 0)
    return paymentRevenue + subscriptionRevenue
  }, [agentEarnings, userSubscriptions])

  const calculateActiveSubscriptions = useCallback((): number => {
    const now = Math.floor(Date.now() / 1000)
    return userSubscriptions.filter((sub: any) => {
      const isActive = sub.status === 0
      const nextBillingDate = Number(sub.nextBillingDate || 0)
      return isActive && nextBillingDate > now
    }).length
  }, [userSubscriptions])

  const calculateGrowth = useCallback((current: number, previous: number): GrowthResult => {
    if (previous === 0) return { value: 0, type: 'neutral' }
    const growth = ((current - previous) / previous) * 100
    return {
      value: Math.abs(growth),
      type: growth > 0 ? 'positive' : growth < 0 ? 'negative' : 'neutral'
    }
  }, [])

  const calculateStats = useCallback((): RevenueStats => {
    const now = Math.floor(Date.now() / 1000)
    const oneDayAgo = now - 86400
    const oneWeekAgo = now - 604800
    const oneMonthAgo = now - 2592000

    const filteredPayments = filterPaymentsByTimeRange(allPayments, selectedTimeRange)
    const totalRevenue = calculateTotalRevenue()
    const paymentRevenue = Number(agentEarnings) / 1e18
    const subscriptionRevenue = totalRevenue - paymentRevenue

    const completedPayments = filteredPayments.filter(p => p.status === PaymentStatus.Completed)
    const dailyEarnings = completedPayments.filter(p => Number(p.createdAt) > oneDayAgo).reduce((sum, p) => sum + Number(p.amount) / 1e18, 0)
    const weeklyEarnings = completedPayments.filter(p => Number(p.createdAt) > oneWeekAgo).reduce((sum, p) => sum + Number(p.amount) / 1e18, 0)
    const monthlyEarnings = completedPayments.filter(p => Number(p.createdAt) > oneMonthAgo).reduce((sum, p) => sum + Number(p.amount) / 1e18, 0)
    const pendingPayments = filteredPayments.filter(p => p.status === PaymentStatus.Pending).length
    const completedPaymentsCount = completedPayments.length
    const failedPayments = filteredPayments.filter(p =>
      p.status === PaymentStatus.Refunded || p.status === PaymentStatus.Cancelled || p.status === PaymentStatus.Disputed
    ).length
    const activeSubscriptionsCount = calculateActiveSubscriptions()

    return {
      totalEarnings: totalRevenue, monthlyEarnings, weeklyEarnings, dailyEarnings,
      pendingPayments, completedPayments: completedPaymentsCount, failedPayments,
      subscriptionRevenue, paymentRevenue,
      activeSubscriptions: activeSubscriptionsCount, totalSubscriptions: userSubscriptions.length
    }
  }, [allPayments, selectedTimeRange, filterPaymentsByTimeRange, calculateTotalRevenue, agentEarnings, userSubscriptions, calculateActiveSubscriptions])

  const calculateTopAgents = useCallback((): TopAgent[] => {
    const agentRevenueMap = new Map<number, { paymentEarnings: number; paymentCount: number; subscriptionCount: number; subscriptionEarnings: number }>()

    allPayments.filter(p => p.status === PaymentStatus.Completed).forEach(payment => {
      const agentId = Number(payment.agentId)
      const amount = Number(payment.amount) / 1e18
      const current = agentRevenueMap.get(agentId) || { paymentEarnings: 0, paymentCount: 0, subscriptionCount: 0, subscriptionEarnings: 0 }
      agentRevenueMap.set(agentId, { ...current, paymentEarnings: current.paymentEarnings + amount, paymentCount: current.paymentCount + 1 })
    })

    userSubscriptions.forEach(subscription => {
      const agentId = Number(subscription.agentId)
      const amount = Number(subscription.totalPaid || 0) / 1e18
      const current = agentRevenueMap.get(agentId) || { paymentEarnings: 0, paymentCount: 0, subscriptionCount: 0, subscriptionEarnings: 0 }
      agentRevenueMap.set(agentId, { ...current, subscriptionEarnings: current.subscriptionEarnings + amount, subscriptionCount: current.subscriptionCount + 1 })
    })

    return Array.from(agentRevenueMap.entries())
      .map(([agentId, data]) => ({
        agentId, name: `Agent #${agentId}`,
        earnings: data.paymentEarnings, paymentCount: data.paymentCount,
        subscriptionCount: data.subscriptionCount, totalRevenue: data.paymentEarnings + data.subscriptionEarnings
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 5)
  }, [allPayments, userSubscriptions])

  const calculateTokenEarnings = useCallback((): TokenEarnings[] => {
    const tokenEarningsMap = new Map<string, number>()

    allPayments.filter(p => p.status === PaymentStatus.Completed).forEach(payment => {
      const amount = Number(payment.amount) / 1e18
      tokenEarningsMap.set(payment.token, (tokenEarningsMap.get(payment.token) || 0) + amount)
    })

    const subscriptionEarnings = userSubscriptions.reduce((sum: number, sub: any) => sum + Number(sub.totalPaid || 0) / 1e18, 0)
    if (subscriptionEarnings > 0) {
      const ethToken = '0x0000000000000000000000000000000000000000'
      tokenEarningsMap.set(ethToken, (tokenEarningsMap.get(ethToken) || 0) + subscriptionEarnings)
    }

    const totalTokenEarnings = Array.from(tokenEarningsMap.values()).reduce((sum, amount) => sum + amount, 0)
    return Array.from(tokenEarningsMap.entries()).map(([token, earnings]) => ({
      token, symbol: getTokenSymbol(token), earnings,
      percentage: totalTokenEarnings > 0 ? (earnings / totalTokenEarnings) * 100 : 0
    }))
  }, [allPayments, userSubscriptions, getTokenSymbol])

  const calculateRevenueTrendData = useCallback((): ChartData[] => {
    const payments = allPayments.filter(p => p.status === PaymentStatus.Completed)
    const subs = userSubscriptions
    const now = Math.floor(Date.now() / 1000)
    let daysToShow = 30
    switch (selectedTimeRange) {
      case 'today': daysToShow = 1; break
      case 'week': daysToShow = 7; break
      case 'month': daysToShow = 30; break
      case 'year': daysToShow = 365; break
    }

    const data: ChartData[] = []
    for (let i = daysToShow - 1; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const dateStr = date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
      const dayStart = Math.floor(date.setHours(0, 0, 0, 0) / 1000)
      const dayEnd = dayStart + 86400

      const dayPaymentRevenue = payments.filter(p => { const t = Number(p.createdAt); return t >= dayStart && t < dayEnd }).reduce((sum, p) => sum + Number(p.amount) / 1e18, 0)
      const daySubscriptionRevenue = subs.filter(s => { const t = Number(s.createdAt); return t >= dayStart && t < dayEnd }).reduce((sum, s) => sum + Number(s.totalPaid || 0) / 1e18, 0)
      data.push({ date: dateStr, paymentRevenue: dayPaymentRevenue, subscriptionRevenue: daySubscriptionRevenue, totalRevenue: dayPaymentRevenue + daySubscriptionRevenue })
    }
    return data
  }, [allPayments, userSubscriptions, selectedTimeRange])

  const calculateRevenueSourceData = useCallback((): RevenueSourceData[] => {
    const statsData = calculateStats()
    return [
      { name: '支付收入', value: statsData.paymentRevenue, color: '#3B82F6' },
      { name: '订阅收入', value: statsData.subscriptionRevenue, color: '#8B5CF6' }
    ].filter(item => item.value > 0)
  }, [calculateStats])

  // ---- CSV Export ----
  const exportToCSV = useCallback(() => {
    const filteredPayments = filterPaymentsByTimeRange(allPayments, selectedTimeRange)
    const filteredSubscriptions = filterSubscriptionsByTimeRange(userSubscriptions, selectedTimeRange)

    const headers = ['类型', 'ID', 'Agent ID', '金额', '代币', '状态', '时间', '客户/订阅者', '描述']
    const paymentData = filteredPayments.map(payment => [
      '支付', payment.paymentId.toString(), payment.agentId.toString(),
      (Number(payment.amount) / 1e18).toString(), payment.token,
      getPaymentStatusDisplay(payment.status).text, formatDate(payment.createdAt),
      payment.client.slice(0, 8) + '...', payment.serviceDescription
    ])
    const subscriptionData = filteredSubscriptions.map(subscription => [
      '订阅', subscription.subscriptionId.toString(), subscription.agentId.toString(),
      (Number(subscription.totalPaid || 0) / 1e18).toString(), 'ETH',
      getSubscriptionStatusDisplay(subscription.status).text, formatDate(BigInt(subscription.createdAt)),
      subscription.subscriber.slice(0, 8) + '...', `订阅 #${subscription.subscriptionId}`
    ])

    const csvContent = [headers.join(','), ...[...paymentData, ...subscriptionData].map(row => row.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `revenue-export-${Date.now()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }, [allPayments, userSubscriptions, selectedTimeRange, filterPaymentsByTimeRange, filterSubscriptionsByTimeRange, getPaymentStatusDisplay, getSubscriptionStatusDisplay, formatDate])

  // ---- Data loading ----
  const loadRevenueData = useCallback(async () => {
    if (!address || !isConnected) return
    setIsLoading(true)
    try {
      const currentStats = calculateStats()
      setPreviousPeriodEarnings({
        total: currentStats.totalEarnings, monthly: currentStats.monthlyEarnings,
        weekly: currentStats.weeklyEarnings, daily: currentStats.dailyEarnings
      })

      let payments: Payment[] = []
      if (clientPayments && clientPayments.length > 0) {
        payments = clientPayments
      } else if (agentPayments && agentPayments.length > 0) {
        payments = agentPayments
      } else {
        try {
          const clientPaymentsData = await getClientPayments()
          if (clientPaymentsData && clientPaymentsData.length > 0) payments = clientPaymentsData
        } catch { /* ignore */ }
      }
      setAllPayments(payments)
      await Promise.all([refetchPaymentData(), refetchSubscriptionData()])
    } catch (err) {
      console.error('❌ 加载收益数据失败:', err)
    } finally {
      setIsLoading(false)
    }
  }, [address, isConnected, calculateStats, clientPayments, agentPayments, getClientPayments, refetchPaymentData, refetchSubscriptionData])

  useEffect(() => {
    if (address && isConnected) { loadRevenueData() }
  }, [address, selectedTimeRange, isConnected, userAgents, loadRevenueData])

  // ---- Derived data ----
  const statsData = useMemo(() => calculateStats(), [calculateStats])
  const topAgents = useMemo(() => calculateTopAgents(), [calculateTopAgents])
  const tokenEarnings = useMemo(() => calculateTokenEarnings(), [calculateTokenEarnings])
  const revenueTrendData = useMemo(() => calculateRevenueTrendData(), [calculateRevenueTrendData])
  const revenueSourceData = useMemo(() => calculateRevenueSourceData(), [calculateRevenueSourceData])

  const filteredPayments = useMemo(() => filterPaymentsByTimeRange(allPayments, selectedTimeRange), [allPayments, selectedTimeRange, filterPaymentsByTimeRange])
  const filteredSubscriptions = useMemo(() => filterSubscriptionsByTimeRange(userSubscriptions, selectedTimeRange), [userSubscriptions, selectedTimeRange, filterSubscriptionsByTimeRange])

  const totalGrowth = useMemo(() => calculateGrowth(statsData.totalEarnings, previousPeriodEarnings.total), [statsData.totalEarnings, previousPeriodEarnings.total, calculateGrowth])
  const monthlyGrowth = useMemo(() => calculateGrowth(statsData.monthlyEarnings, previousPeriodEarnings.monthly), [statsData.monthlyEarnings, previousPeriodEarnings.monthly, calculateGrowth])
  const weeklyGrowth = useMemo(() => calculateGrowth(statsData.weeklyEarnings, previousPeriodEarnings.weekly), [statsData.weeklyEarnings, previousPeriodEarnings.weekly, calculateGrowth])
  const dailyGrowth = useMemo(() => calculateGrowth(statsData.dailyEarnings, previousPeriodEarnings.daily), [statsData.dailyEarnings, previousPeriodEarnings.daily, calculateGrowth])

  return {
    // State
    selectedTimeRange, selectedView, isLoading, allPayments, userSubscriptions,
    isConnected, paymentError, subscriptionError, userAgents,
    // Setters
    setSelectedTimeRange, setSelectedView,
    // Data
    statsData, topAgents, tokenEarnings, revenueTrendData, revenueSourceData,
    filteredPayments, filteredSubscriptions,
    totalGrowth, monthlyGrowth, weeklyGrowth, dailyGrowth,
    // Actions
    loadRevenueData, exportToCSV,
    // Utilities
    formatCurrency, formatDate, getTokenSymbol, getPaymentStatusDisplay, getSubscriptionStatusDisplay,
    // Constants
    timeRanges: TIME_RANGES,
  }
}
