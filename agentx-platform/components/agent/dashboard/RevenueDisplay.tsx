// components/agent/dashboard/RevenueDisplay.tsx
'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import {
  DollarSign,
  TrendingUp,
  Calendar,
  Download,
  BarChart3,
  PieChart,
  Wallet,
  CheckCircle,
  XCircle,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  Users,
  CreditCard,
  FileText,
  Eye
} from 'lucide-react'
import {
  usePaymentGateway,
  type Payment,
  PaymentStatus
} from '../hooks/usePaymentGateway'
import { useSubscription, type Subscription, SubscriptionStatus } from '../hooks/useSubscription'
import { useAgentRegistry } from '../hooks/useAgentRegistry'

// 导入图表库
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'

interface TimeRange {
  label: string
  value: string
  days: number
}

interface RevenueStats {
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

interface TopAgent {
  agentId: number
  name: string
  earnings: number
  paymentCount: number
  subscriptionCount: number
  totalRevenue: number
}

interface TokenEarnings {
  token: string
  symbol: string
  earnings: number
  percentage: number
}

interface ChartData {
  date: string
  paymentRevenue: number
  subscriptionRevenue: number
  totalRevenue: number
}

// 修复：使用正确的类型定义，与Recharts Pie组件兼容
interface RevenueSourceData {
  name: string
  value: number
  color: string
  [key: string]: string | number // 添加索引签名以兼容Recharts
}

export function RevenueDisplay() {
  const { address, isConnected } = useAccount()
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>('all')
  const [selectedView, setSelectedView] = useState<'overview' | 'details' | 'analytics'>('overview')
  const [isLoading, setIsLoading] = useState(false)
  const [allPayments, setAllPayments] = useState<Payment[]>([])
  const [previousPeriodEarnings, setPreviousPeriodEarnings] = useState<{
    total: number
    monthly: number
    weekly: number
    daily: number
  }>({
    total: 0,
    monthly: 0,
    weekly: 0,
    daily: 0
  })

  // 使用与AgentDashboard完全相同的数据源
  const {
    agentPayments,
    agentEarnings,
    getAgentPayments,
    getClientPayments,
    clientPayments,
    error: paymentError,
    refetchData: refetchPaymentData
  } = usePaymentGateway()

  const {
    userSubscriptions,
    error: subscriptionError,
    refetchData: refetchSubscriptionData
  } = useSubscription()

  const { userAgents } = useAgentRegistry()

  const timeRanges: TimeRange[] = [
    { label: '今天', value: 'today', days: 1 },
    { label: '本周', value: 'week', days: 7 },
    { label: '本月', value: 'month', days: 30 },
    { label: '今年', value: 'year', days: 365 },
    { label: '全部', value: 'all', days: 0 }
  ]

  // 修复：与AgentDashboard完全相同的收益计算方式
  const calculateTotalRevenue = (): number => {
    // 支付收益 - 直接从agentEarnings获取（需要除以1e18）
    const paymentRevenue = Number(agentEarnings) / 1e18
    
    // 订阅收益 - 从userSubscriptions计算所有订阅的总支付金额
    const subscriptionRevenue = userSubscriptions
      .reduce((sum: number, sub: any) => {
        const totalPaid = Number(sub.totalPaid || 0) / 1e18
        return sum + totalPaid
      }, 0)

    const totalRevenue = paymentRevenue + subscriptionRevenue
    console.log('💰 收益计算详情:', {
      paymentRevenue,
      subscriptionRevenue,
      totalRevenue,
      agentEarnings: agentEarnings,
      agentEarningsRaw: Number(agentEarnings),
      userSubscriptionsCount: userSubscriptions.length,
      totalPaidFromSubscriptions: userSubscriptions.reduce((sum: number, sub: any) => sum + Number(sub.totalPaid || 0) / 1e18, 0)
    })
    return totalRevenue
  }

  // 修复：计算活跃订阅数量
  const calculateActiveSubscriptions = (): number => {
    const now = Math.floor(Date.now() / 1000)
    return userSubscriptions.filter((sub: any) => {
      const isActive = sub.status === 0 // Active status
      const nextBillingDate = Number(sub.nextBillingDate || 0)
      return isActive && nextBillingDate > now
    }).length
  }

  // 修复：计算增长率的工具函数
  const calculateGrowth = (current: number, previous: number): { value: number; type: 'positive' | 'negative' | 'neutral' } => {
    if (previous === 0) {
      return { value: 0, type: 'neutral' }
    }

    const growth = ((current - previous) / previous) * 100
    return {
      value: Math.abs(growth),
      type: growth > 0 ? 'positive' : growth < 0 ? 'negative' : 'neutral'
    }
  }

  useEffect(() => {
    if (address && isConnected) {
      loadRevenueData()
    }
  }, [address, selectedTimeRange, isConnected, userAgents])

  // 修复：重新设计数据加载逻辑
  const loadRevenueData = async () => {
    if (!address || !isConnected) {
      console.log('❌ 未连接钱包，跳过数据加载')
      return
    }

    console.log('🔄 开始加载收益数据...')
    setIsLoading(true)
    
    try {
      // 保存之前的收益数据用于增长计算
      const currentStats = calculateStats()
      setPreviousPeriodEarnings({
        total: currentStats.totalEarnings,
        monthly: currentStats.monthlyEarnings,
        weekly: currentStats.weeklyEarnings,
        daily: currentStats.dailyEarnings
      })

      // 修复：优先使用clientPayments作为主要数据源
      console.log('📊 当前数据状态:', {
        userAgents: userAgents,
        agentPayments: agentPayments?.length || 0,
        clientPayments: clientPayments?.length || 0,
        agentEarnings: agentEarnings,
        userSubscriptions: userSubscriptions?.length || 0,
        totalRevenue: calculateTotalRevenue(),
        totalSubscriptionsRevenue: userSubscriptions.reduce((sum: number, sub: any) => sum + Number(sub.totalPaid || 0) / 1e18, 0)
      })

      let payments: Payment[] = []

      // 方法1：使用现有的clientPayments（这是最可靠的数据源）
      if (clientPayments && clientPayments.length > 0) {
        console.log('✅ 使用clientPayments数据:', clientPayments.length)
        payments = clientPayments
      } 
      // 方法2：使用现有的agentPayments
      else if (agentPayments && agentPayments.length > 0) {
        console.log('✅ 使用agentPayments数据:', agentPayments.length)
        payments = agentPayments
      }
      // 方法3：动态获取客户支付记录
      else {
        console.log('🔄 尝试动态获取客户支付记录...')
        try {
          const clientPaymentsData = await getClientPayments()
          if (clientPaymentsData && clientPaymentsData.length > 0) {
            console.log('✅ 动态获取到客户支付记录:', clientPaymentsData.length)
            payments = clientPaymentsData
          } else {
            console.log('⚠️ 动态获取客户支付记录为空')
          }
        } catch (error) {
          console.error('❌ 动态获取客户支付记录失败:', error)
        }
      }

      console.log('📦 最终支付记录:', payments.length)
      setAllPayments(payments)

      // 强制刷新数据
      await Promise.all([
        refetchPaymentData(),
        refetchSubscriptionData()
      ])

      console.log('✅ 收益数据加载完成')
    } catch (error) {
      console.error('❌ 加载收益数据失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // 修复：重新设计统计计算逻辑，包含订阅数据
  const calculateStats = (): RevenueStats => {
    const now = Math.floor(Date.now() / 1000)
    const oneDayAgo = now - 86400
    const oneWeekAgo = now - 604800
    const oneMonthAgo = now - 2592000

    const filteredPayments = filterPaymentsByTimeRange(allPayments, selectedTimeRange)
    const filteredSubscriptions = filterSubscriptionsByTimeRange(userSubscriptions, selectedTimeRange)

    // 修复：使用与AgentDashboard完全相同的收益计算方式
    const totalRevenue = calculateTotalRevenue()
    const paymentRevenue = Number(agentEarnings) / 1e18
    const subscriptionRevenue = totalRevenue - paymentRevenue
    
    // 修复：按时间段计算支付收益（从支付记录中计算）
    const completedPayments = filteredPayments.filter(p => p.status === PaymentStatus.Completed)
    const dailyEarnings = completedPayments
      .filter(p => Number(p.createdAt) > oneDayAgo)
      .reduce((sum, p) => sum + Number(p.amount) / 1e18, 0)

    const weeklyEarnings = completedPayments
      .filter(p => Number(p.createdAt) > oneWeekAgo)
      .reduce((sum, p) => sum + Number(p.amount) / 1e18, 0)

    const monthlyEarnings = completedPayments
      .filter(p => Number(p.createdAt) > oneMonthAgo)
      .reduce((sum, p) => sum + Number(p.amount) / 1e18, 0)

    const pendingPayments = filteredPayments.filter(p => p.status === PaymentStatus.Pending).length
    const completedPaymentsCount = completedPayments.length
    const failedPayments = filteredPayments.filter(p => 
      p.status === PaymentStatus.Refunded || 
      p.status === PaymentStatus.Cancelled || 
      p.status === PaymentStatus.Disputed
    ).length

    const activeSubscriptionsCount = calculateActiveSubscriptions()
    const totalSubscriptionsCount = userSubscriptions.length

    console.log('📈 统计计算完成:', {
      totalEarnings: totalRevenue,
      paymentRevenue,
      subscriptionRevenue,
      completedPayments: completedPaymentsCount,
      activeSubscriptions: activeSubscriptionsCount,
      totalSubscriptions: totalSubscriptionsCount,
      dailyEarnings,
      weeklyEarnings,
      monthlyEarnings,
      filteredPaymentsCount: filteredPayments.length,
      allPaymentsCount: allPayments.length,
      userSubscriptionsCount: userSubscriptions.length,
      filteredSubscriptionsCount: filteredSubscriptions.length
    })

    return {
      totalEarnings: totalRevenue,
      monthlyEarnings,
      weeklyEarnings,
      dailyEarnings,
      pendingPayments,
      completedPayments: completedPaymentsCount,
      failedPayments,
      subscriptionRevenue,
      paymentRevenue,
      activeSubscriptions: activeSubscriptionsCount,
      totalSubscriptions: totalSubscriptionsCount
    }
  }

  // 修复：计算热门Agent - 基于支付记录和订阅记录
  const calculateTopAgents = (): TopAgent[] => {
    const agentRevenueMap = new Map<number, {
      paymentEarnings: number
      paymentCount: number
      subscriptionCount: number
      subscriptionEarnings: number
    }>()

    // 处理支付收益
    allPayments
      .filter(p => p.status === PaymentStatus.Completed)
      .forEach(payment => {
        const agentId = Number(payment.agentId)
        const amount = Number(payment.amount) / 1e18
        
        const current = agentRevenueMap.get(agentId) || {
          paymentEarnings: 0,
          paymentCount: 0,
          subscriptionCount: 0,
          subscriptionEarnings: 0
        }
        agentRevenueMap.set(agentId, {
          ...current,
          paymentEarnings: current.paymentEarnings + amount,
          paymentCount: current.paymentCount + 1
        })
      })

    // 处理订阅收益
    userSubscriptions.forEach(subscription => {
      const agentId = Number(subscription.agentId)
      const amount = Number(subscription.totalPaid || 0) / 1e18
      
      const current = agentRevenueMap.get(agentId) || {
        paymentEarnings: 0,
        paymentCount: 0,
        subscriptionCount: 0,
        subscriptionEarnings: 0
      }
      agentRevenueMap.set(agentId, {
        ...current,
        subscriptionEarnings: current.subscriptionEarnings + amount,
        subscriptionCount: current.subscriptionCount + 1
      })
    })

    const result = Array.from(agentRevenueMap.entries())
      .map(([agentId, data]) => ({
        agentId,
        name: `Agent #${agentId}`,
        earnings: data.paymentEarnings,
        paymentCount: data.paymentCount,
        subscriptionCount: data.subscriptionCount,
        totalRevenue: data.paymentEarnings + data.subscriptionEarnings
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 5)

    console.log('🏆 热门Agent计算结果:', result)
    return result
  }

  // 修复：计算代币收益分布 - 基于支付记录和订阅记录
  const calculateTokenEarnings = (): TokenEarnings[] => {
    const tokenEarningsMap = new Map<string, number>()

    // 处理支付收益
    allPayments
      .filter(p => p.status === PaymentStatus.Completed)
      .forEach(payment => {
        const token = payment.token
        const amount = Number(payment.amount) / 1e18
        const current = tokenEarningsMap.get(token) || 0
        tokenEarningsMap.set(token, current + amount)
      })

    // 处理订阅收益 - 假设订阅使用ETH
    const subscriptionEarnings = userSubscriptions.reduce((sum: number, sub: any) => {
      return sum + Number(sub.totalPaid || 0) / 1e18
    }, 0)

    if (subscriptionEarnings > 0) {
      const ethToken = '0x0000000000000000000000000000000000000000'
      const current = tokenEarningsMap.get(ethToken) || 0
      tokenEarningsMap.set(ethToken, current + subscriptionEarnings)
    }

    const totalTokenEarnings = Array.from(tokenEarningsMap.values()).reduce((sum, amount) => sum + amount, 0)
    
    const result = Array.from(tokenEarningsMap.entries()).map(([token, earnings]) => ({
      token,
      symbol: getTokenSymbol(token),
      earnings,
      percentage: totalTokenEarnings > 0 ? (earnings / totalTokenEarnings) * 100 : 0
    }))

    console.log('💎 代币收益分布计算结果:', result)
    return result
  }

  // 新增：计算收益趋势数据（包含订阅收入）
  const calculateRevenueTrendData = (): ChartData[] => {
    const payments = allPayments.filter(p => p.status === PaymentStatus.Completed)
    const subscriptions = userSubscriptions
    
    // 根据选择的时间范围确定数据分组
    const now = Math.floor(Date.now() / 1000)
    let daysToShow = 30 // 默认显示30天
    
    switch (selectedTimeRange) {
      case 'today':
        daysToShow = 1
        break
      case 'week':
        daysToShow = 7
        break
      case 'month':
        daysToShow = 30
        break
      case 'year':
        daysToShow = 365
        break
      default:
        daysToShow = Math.min(30, Math.max(7, payments.length + subscriptions.length)) // 动态调整
    }

    const data: ChartData[] = []
    
    for (let i = daysToShow - 1; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const dateStr = date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
      
      const dayStart = Math.floor(date.setHours(0, 0, 0, 0) / 1000)
      const dayEnd = dayStart + 86400

      // 计算当天的支付收入
      const dayPaymentRevenue = payments
        .filter(p => {
          const paymentTime = Number(p.createdAt)
          return paymentTime >= dayStart && paymentTime < dayEnd
        })
        .reduce((sum, p) => sum + Number(p.amount) / 1e18, 0)

      // 计算当天的订阅收入（按创建日期）
      const daySubscriptionRevenue = subscriptions
        .filter(s => {
          const subscriptionTime = Number(s.createdAt)
          return subscriptionTime >= dayStart && subscriptionTime < dayEnd
        })
        .reduce((sum, s) => sum + Number(s.totalPaid || 0) / 1e18, 0)

      data.push({
        date: dateStr,
        paymentRevenue: dayPaymentRevenue,
        subscriptionRevenue: daySubscriptionRevenue,
        totalRevenue: dayPaymentRevenue + daySubscriptionRevenue
      })
    }

    console.log('📊 收益趋势数据:', data)
    return data
  }

  // 新增：计算收入来源数据（包含订阅收入）
  const calculateRevenueSourceData = (): RevenueSourceData[] => {
    const statsData = calculateStats()
    
    const data = [
      {
        name: '支付收入',
        value: statsData.paymentRevenue,
        color: '#3B82F6' // blue-500
      },
      {
        name: '订阅收入',
        value: statsData.subscriptionRevenue,
        color: '#8B5CF6' // purple-500
      }
    ].filter(item => item.value > 0)

    console.log('📊 收入来源数据:', data)
    return data
  }

  const filterPaymentsByTimeRange = (payments: Payment[], timeRange: string): Payment[] => {
    if (!payments || payments.length === 0) {
      return []
    }

    const now = Math.floor(Date.now() / 1000)
    
    switch (timeRange) {
      case 'today':
        return payments.filter(p => Number(p.createdAt) > now - 86400)
      case 'week':
        return payments.filter(p => Number(p.createdAt) > now - 604800)
      case 'month':
        return payments.filter(p => Number(p.createdAt) > now - 2592000)
      case 'year':
        return payments.filter(p => Number(p.createdAt) > now - 31536000)
      default:
        return payments
    }
  }

  const filterSubscriptionsByTimeRange = (subscriptions: Subscription[], timeRange: string): Subscription[] => {
    if (!subscriptions || subscriptions.length === 0) {
      return []
    }

    const now = Math.floor(Date.now() / 1000)
    
    switch (timeRange) {
      case 'today':
        return subscriptions.filter(s => Number(s.createdAt) > now - 86400)
      case 'week':
        return subscriptions.filter(s => Number(s.createdAt) > now - 604800)
      case 'month':
        return subscriptions.filter(s => Number(s.createdAt) > now - 2592000)
      case 'year':
        return subscriptions.filter(s => Number(s.createdAt) > now - 31536000)
      default:
        return subscriptions
    }
  }

  const getPaymentStatusDisplay = (status: PaymentStatus): { text: string; color: string } => {
    const statusMap: Record<PaymentStatus, { text: string; color: string }> = {
      [PaymentStatus.Pending]: { text: '待处理', color: 'bg-yellow-100 text-yellow-800' },
      [PaymentStatus.Completed]: { text: '已完成', color: 'bg-green-100 text-green-800' },
      [PaymentStatus.Refunded]: { text: '已退款', color: 'bg-red-100 text-red-800' },
      [PaymentStatus.Disputed]: { text: '争议中', color: 'bg-orange-100 text-orange-800' },
      [PaymentStatus.Cancelled]: { text: '已取消', color: 'bg-gray-100 text-gray-800' }
    }
    return statusMap[status] || { text: '未知', color: 'bg-gray-100 text-gray-800' }
  }

  const getSubscriptionStatusDisplay = (status: number): { text: string; color: string } => {
    const statusMap: Record<number, { text: string; color: string }> = {
      [SubscriptionStatus.Active]: { text: '活跃', color: 'bg-green-100 text-green-800' },
      [SubscriptionStatus.Cancelled]: { text: '已取消', color: 'bg-red-100 text-red-800' },
      [SubscriptionStatus.Expired]: { text: '已过期', color: 'bg-gray-100 text-gray-800' },
      [SubscriptionStatus.PaymentFailed]: { text: '支付失败', color: 'bg-orange-100 text-orange-800' }
    }
    return statusMap[status] || { text: '未知', color: 'bg-gray-100 text-gray-800' }
  }

  const getTokenSymbol = (tokenAddress: string): string => {
    const tokenMap: Record<string, string> = {
      '0x0000000000000000000000000000000000000000': 'ETH',
      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': 'USDC',
      '0x6B175474E89094C44Da98b954EedeAC495271d0F': 'DAI'
    }
    return tokenMap[tokenAddress] || tokenAddress.slice(0, 8) + '...'
  }

  const formatCurrency = (amount: number, currency: string = 'ETH') => {
    return `${amount.toFixed(4)} ${currency}`
  }

  const formatDate = (timestamp: bigint) => {
    return new Date(Number(timestamp) * 1000).toLocaleDateString('zh-CN')
  }

  const formatSubscriptionDate = (timestamp: bigint) => {
    return new Date(Number(timestamp) * 1000).toLocaleDateString('zh-CN')
  }

  // 新增：自定义Tooltip组件
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium text-gray-900">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {formatCurrency(entry.value)}
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  const exportToCSV = () => {
    const filteredPayments = filterPaymentsByTimeRange(allPayments, selectedTimeRange)
    const filteredSubscriptions = filterSubscriptionsByTimeRange(userSubscriptions, selectedTimeRange)
    
    const headers = ['类型', 'ID', 'Agent ID', '金额', '代币', '状态', '时间', '客户/订阅者', '描述']
    const paymentData = filteredPayments.map(payment => [
      '支付',
      payment.paymentId.toString(),
      payment.agentId.toString(),
      (Number(payment.amount) / 1e18).toString(),
      payment.token,
      getPaymentStatusDisplay(payment.status).text,
      formatDate(payment.createdAt),
      payment.client.slice(0, 8) + '...',
      payment.serviceDescription
    ])

    const subscriptionData = filteredSubscriptions.map(subscription => [
      '订阅',
      subscription.subscriptionId.toString(),
      subscription.agentId.toString(),
      (Number(subscription.totalPaid || 0) / 1e18).toString(),
      'ETH', // 假设订阅使用ETH
      getSubscriptionStatusDisplay(subscription.status).text,
      formatSubscriptionDate(subscription.createdAt),
      subscription.subscriber.slice(0, 8) + '...',
      `订阅 #${subscription.subscriptionId}`
    ])

    const data = [...paymentData, ...subscriptionData]

    const csvContent = [
      headers.join(','),
      ...data.map(row => row.join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `revenue-export-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const statsData = calculateStats()
  const topAgents = calculateTopAgents()
  const tokenEarnings = calculateTokenEarnings()
  const filteredPayments = filterPaymentsByTimeRange(allPayments, selectedTimeRange)
  const filteredSubscriptions = filterSubscriptionsByTimeRange(userSubscriptions, selectedTimeRange)
  
  // 计算图表数据
  const revenueTrendData = calculateRevenueTrendData()
  const revenueSourceData = calculateRevenueSourceData()

  const totalGrowth = calculateGrowth(statsData.totalEarnings, previousPeriodEarnings.total)
  const monthlyGrowth = calculateGrowth(statsData.monthlyEarnings, previousPeriodEarnings.monthly)
  const weeklyGrowth = calculateGrowth(statsData.weeklyEarnings, previousPeriodEarnings.weekly)
  const dailyGrowth = calculateGrowth(statsData.dailyEarnings, previousPeriodEarnings.daily)

  const stats = [
    {
      name: '总收益',
      value: formatCurrency(statsData.totalEarnings),
      growth: totalGrowth,
      icon: DollarSign,
      description: '累计总收益'
    },
    {
      name: '本月收益',
      value: formatCurrency(statsData.monthlyEarnings),
      growth: monthlyGrowth,
      icon: Calendar,
      description: '本月累计收益'
    },
    {
      name: '本周收益',
      value: formatCurrency(statsData.weeklyEarnings),
      growth: weeklyGrowth,
      icon: TrendingUp,
      description: '本周累计收益'
    },
    {
      name: '今日收益',
      value: formatCurrency(statsData.dailyEarnings),
      growth: dailyGrowth,
      icon: Wallet,
      description: '今日累计收益'
    }
  ]

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">收益管理</h2>
          <p className="text-gray-600 mt-1">查看和管理您的Agent收益数据</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadRevenueData}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50 transition-colors"
            disabled={isLoading || !isConnected}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? '加载中...' : '刷新'}
          </button>
          
          <select
            value={selectedTimeRange}
            onChange={(e) => setSelectedTimeRange(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition-colors"
            disabled={!isConnected || isLoading}
          >
            {timeRanges.map(range => (
              <option key={range.value} value={range.value}>
                {range.label}
              </option>
            ))}
          </select>
          
          <button
            onClick={exportToCSV}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50 transition-colors"
            disabled={(filteredPayments.length === 0 && filteredSubscriptions.length === 0) || !isConnected || isLoading}
          >
            <Download className="w-4 h-4" />
            导出CSV
          </button>
        </div>
      </div>

      {/* 连接状态提示 */}
      {!isConnected && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
          <div className="flex items-center gap-2 text-yellow-800">
            <XCircle className="w-4 h-4" />
            <span>请先连接钱包以查看收益数据</span>
          </div>
        </div>
      )}

      {/* 数据状态提示 */}
      {isConnected && allPayments.length === 0 && userSubscriptions.length === 0 && !isLoading && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <div className="flex items-center gap-2 text-blue-800">
            <Eye className="w-4 h-4" />
            <span>暂无收益数据，请确保您的Agent有支付记录或订阅</span>
          </div>
          <div className="mt-2 text-sm text-blue-600">
            <p>• 检查您的Agent是否已注册</p>
            <p>• 确认有用户向您的Agent支付费用</p>
            <p>• 查看订阅管理设置订阅计划</p>
          </div>
        </div>
      )}

      {/* 错误显示 */}
      {(paymentError || subscriptionError) && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-center gap-2 text-red-700">
            <XCircle className="w-4 h-4" />
            <span>数据加载失败: {(paymentError || subscriptionError)?.message}</span>
          </div>
        </div>
      )}

      {/* 数据概览卡片 */}
      {isConnected && (allPayments.length > 0 || userSubscriptions.length > 0 || statsData.totalEarnings > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center">
              <DollarSign className="w-8 h-8 text-green-600 mr-4" />
              <div>
                <p className="text-sm font-medium text-green-600">总收益</p>
                <p className="text-2xl font-bold text-green-900">{formatCurrency(statsData.totalEarnings)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center">
              <CreditCard className="w-8 h-8 text-blue-600 mr-4" />
              <div>
                <p className="text-sm font-medium text-blue-600">支付收益</p>
                <p className="text-2xl font-bold text-blue-900">{formatCurrency(statsData.paymentRevenue)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center">
              <FileText className="w-8 h-8 text-purple-600 mr-4" />
              <div>
                <p className="text-sm font-medium text-purple-600">订阅收益</p>
                <p className="text-2xl font-bold text-purple-900">{formatCurrency(statsData.subscriptionRevenue)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center">
              <Users className="w-8 h-8 text-orange-600 mr-4" />
              <div>
                <p className="text-sm font-medium text-orange-600">活跃订阅</p>
                <p className="text-2xl font-bold text-orange-900">{statsData.activeSubscriptions}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 视图切换 */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setSelectedView('overview')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            selectedView === 'overview'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          disabled={!isConnected}
        >
          概览
        </button>
        <button
          onClick={() => setSelectedView('details')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            selectedView === 'details'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          disabled={!isConnected}
        >
          详细记录
        </button>
        <button
          onClick={() => setSelectedView('analytics')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            selectedView === 'analytics'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          disabled={!isConnected}
        >
          分析
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">加载收益数据中...</span>
        </div>
      ) : (
        <>
          {/* 概览视图 */}
          {selectedView === 'overview' && (
            <div className="space-y-6">
              {/* 统计卡片 */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map((stat) => {
                  const Icon = stat.icon
                  return (
                    <div key={stat.name} className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-all duration-300">
                      <div className="flex items-start space-x-4">
                        <div className="bg-blue-50 rounded-xl p-3">
                          <Icon className="w-6 h-6 text-blue-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                          <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                          <p className="text-xs text-gray-500 mt-1">{stat.description}</p>
                          {stat.growth.value > 0 && (
                            <div className={`flex items-center gap-1 mt-2 text-sm ${
                              stat.growth.type === 'positive' ? 'text-green-600' : 
                              stat.growth.type === 'negative' ? 'text-red-600' : 'text-gray-600'
                            }`}>
                              {stat.growth.type === 'positive' ? (
                                <ArrowUp className="w-3 h-3" />
                              ) : stat.growth.type === 'negative' ? (
                                <ArrowDown className="w-3 h-3" />
                              ) : null}
                              {stat.growth.type === 'positive' ? '+' : stat.growth.type === 'negative' ? '-' : ''}
                              {stat.growth.value.toFixed(1)}%
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 收益分布 */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <PieChart className="w-5 h-5" />
                    收益分布
                  </h3>
                  <div className="space-y-4">
                    {tokenEarnings.map((token) => (
                      <div key={token.token} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                          <span className="font-medium text-gray-900">{token.symbol}</span>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-gray-900">
                            {formatCurrency(token.earnings, token.symbol)}
                          </p>
                          <p className="text-sm text-gray-500">{token.percentage.toFixed(1)}%</p>
                        </div>
                      </div>
                    ))}
                    {tokenEarnings.length === 0 && (
                      <p className="text-gray-500 text-center py-4">暂无收益数据</p>
                    )}
                  </div>
                </div>

                {/* 热门Agent */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    热门Agent
                  </h3>
                  <div className="space-y-4">
                    {topAgents.map((agent) => (
                      <div key={agent.agentId} className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-900">{agent.name}</p>
                          <p className="text-sm text-gray-500">
                            {agent.paymentCount} 笔支付 • {agent.subscriptionCount} 个订阅
                          </p>
                        </div>
                        <p className="font-semibold text-green-600">
                          {formatCurrency(agent.totalRevenue)}
                        </p>
                      </div>
                    ))}
                    {topAgents.length === 0 && (
                      <p className="text-gray-500 text-center py-4">暂无收益数据</p>
                    )}
                  </div>
                </div>
              </div>

              {/* 支付状态统计 */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">支付状态</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-6 bg-green-50 rounded-xl border border-green-200">
                    <p className="text-2xl font-bold text-green-600">{statsData.completedPayments}</p>
                    <p className="text-sm text-green-800">已完成</p>
                  </div>
                  <div className="text-center p-6 bg-yellow-50 rounded-xl border border-yellow-200">
                    <p className="text-2xl font-bold text-yellow-600">{statsData.pendingPayments}</p>
                    <p className="text-sm text-yellow-800">待处理</p>
                  </div>
                  <div className="text-center p-6 bg-red-50 rounded-xl border border-red-200">
                    <p className="text-2xl font-bold text-red-600">{statsData.failedPayments}</p>
                    <p className="text-sm text-red-800">失败</p>
                  </div>
                </div>
              </div>

              {/* 订阅状态统计 */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">订阅状态</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="text-center p-6 bg-green-50 rounded-xl border border-green-200">
                    <p className="text-2xl font-bold text-green-600">{statsData.activeSubscriptions}</p>
                    <p className="text-sm text-green-800">活跃订阅</p>
                  </div>
                  <div className="text-center p-6 bg-blue-50 rounded-xl border border-blue-200">
                    <p className="text-2xl font-bold text-blue-600">{statsData.totalSubscriptions}</p>
                    <p className="text-sm text-blue-800">总订阅数</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 详细记录视图 */}
          {selectedView === 'details' && (
            <div className="space-y-6">
              {/* 支付记录 */}
              <div className="bg-white rounded-xl border border-gray-200">
                <div className="p-6 border-b border-gray-200">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-gray-900">支付记录</h3>
                    <p className="text-sm text-gray-600">
                      {filteredPayments.length} 条记录
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          支付ID
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Agent
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          金额
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          状态
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          时间
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          客户
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredPayments.map((payment) => {
                        const statusInfo = getPaymentStatusDisplay(payment.status)
                        return (
                          <tr key={payment.paymentId.toString()}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              #{payment.paymentId.toString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              Agent #{payment.agentId.toString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {formatCurrency(Number(payment.amount) / 1e18, getTokenSymbol(payment.token))}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusInfo.color}`}>
                                {statusInfo.text}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {formatDate(payment.createdAt)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {payment.client.slice(0, 8)}...{payment.client.slice(-6)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {filteredPayments.length === 0 && (
                  <div className="text-center py-12">
                    <CreditCard className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">暂无支付记录</p>
                  </div>
                )}
              </div>

              {/* 订阅记录 */}
              <div className="bg-white rounded-xl border border-gray-200">
                <div className="p-6 border-b border-gray-200">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-gray-900">订阅记录</h3>
                    <p className="text-sm text-gray-600">
                      {filteredSubscriptions.length} 条记录
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          订阅ID
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Agent
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          总支付
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          状态
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          开始时间
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          下次续费
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredSubscriptions.map((subscription) => {
                        const statusInfo = getSubscriptionStatusDisplay(subscription.status)
                        return (
                          <tr key={subscription.subscriptionId.toString()}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              #{subscription.subscriptionId.toString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              Agent #{subscription.agentId.toString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {formatCurrency(Number(subscription.totalPaid || 0) / 1e18)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusInfo.color}`}>
                                {statusInfo.text}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {formatSubscriptionDate(subscription.startDate)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {formatSubscriptionDate(subscription.nextBillingDate)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {filteredSubscriptions.length === 0 && (
                  <div className="text-center py-12">
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">暂无订阅记录</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 分析视图 */}
          {selectedView === 'analytics' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 收益趋势图表 */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">收益趋势</h3>
                  {revenueTrendData.length > 0 ? (
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={revenueTrendData}>
                          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                          <XAxis 
                            dataKey="date" 
                            tick={{ fontSize: 12 }}
                            tickLine={false}
                          />
                          <YAxis 
                            tick={{ fontSize: 12 }}
                            tickLine={false}
                            tickFormatter={(value) => `${value.toFixed(4)} ETH`}
                          />
                          <Tooltip content={<CustomTooltip />} />
                          <Legend />
                          <Line 
                            type="monotone" 
                            dataKey="totalRevenue" 
                            stroke="#10B981" 
                            strokeWidth={2}
                            dot={{ fill: '#10B981', strokeWidth: 2, r: 4 }}
                            activeDot={{ r: 6, stroke: '#10B981', strokeWidth: 2 }}
                            name="总收益"
                          />
                          <Line 
                            type="monotone" 
                            dataKey="paymentRevenue" 
                            stroke="#3B82F6" 
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4 }}
                            activeDot={{ r: 6, stroke: '#3B82F6', strokeWidth: 2 }}
                            name="支付收益"
                          />
                          <Line 
                            type="monotone" 
                            dataKey="subscriptionRevenue" 
                            stroke="#8B5CF6" 
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            dot={{ fill: '#8B5CF6', strokeWidth: 2, r: 4 }}
                            activeDot={{ r: 6, stroke: '#8B5CF6', strokeWidth: 2 }}
                            name="订阅收益"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-64 flex items-center justify-center bg-gray-50 rounded-xl">
                      <div className="text-center">
                        <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-600">暂无收益数据</p>
                        <p className="text-sm text-gray-500">请确保您的Agent有支付记录或订阅</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* 收入来源图表 */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">收入来源</h3>
                  {revenueSourceData.length > 0 ? (
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsPieChart>
                          <Pie
                            data={revenueSourceData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            // 修复：处理percent可能为undefined的情况
                            label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(1)}%`}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {revenueSourceData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip 
                            formatter={(value: any) => [formatCurrency(Number(value)), 'Revenue']}
                          />
                          <Legend />
                        </RechartsPieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-64 flex items-center justify-center bg-gray-50 rounded-xl">
                      <div className="text-center">
                        <PieChart className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-600">暂无收入数据</p>
                        <p className="text-sm text-gray-500">请确保您的Agent有支付记录或订阅</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">关键指标</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-2xl font-bold text-gray-900">
                      {statsData.completedPayments > 0
                        ? (statsData.paymentRevenue / statsData.completedPayments).toFixed(4)
                        : '0'
                      }
                    </p>
                    <p className="text-sm text-gray-600">平均支付额 (ETH)</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-2xl font-bold text-gray-900">
                      {filteredPayments.length > 0
                        ? ((statsData.completedPayments / filteredPayments.length) * 100).toFixed(0)
                        : '0'
                      }%
                    </p>
                    <p className="text-sm text-gray-600">支付成功率</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-2xl font-bold text-gray-900">
                      {filteredPayments.length + filteredSubscriptions.length}
                    </p>
                    <p className="text-sm text-gray-600">总交易数</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-2xl font-bold text-gray-900">
                      {topAgents.length}
                    </p>
                    <p className="text-sm text-gray-600">活跃Agent</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
