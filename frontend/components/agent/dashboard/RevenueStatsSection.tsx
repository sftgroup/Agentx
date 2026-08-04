// components/agent/dashboard/RevenueStatsSection.tsx
// 收益统计区（概览卡片 + 分布 + 热门Agent + 支付/订阅状态 + 关键指标）
'use client'

import {
  DollarSign, TrendingUp, Calendar, Wallet, ArrowUp, ArrowDown,
  PieChart, Users
} from 'lucide-react'
import type { RevenueStats, TopAgent, TokenEarnings } from './hooks/useRevenueDisplay'
import { formatCurrency } from './hooks/useRevenueDisplay'

interface GrowthResult {
  value: number
  type: 'positive' | 'negative' | 'neutral'
}

interface RevenueStatsSectionProps {
  statsData: RevenueStats
  topAgents: TopAgent[]
  tokenEarnings: TokenEarnings[]
  totalGrowth: GrowthResult
  monthlyGrowth: GrowthResult
  weeklyGrowth: GrowthResult
  dailyGrowth: GrowthResult
  formatCurrency: (amount: number, currency?: string) => string
  filteredPaymentsCount: number
  filteredSubscriptionsCount: number
}

const statsConfig = (data: RevenueStats, fmt: typeof formatCurrency, daily: GrowthResult, weekly: GrowthResult, monthly: GrowthResult, total: GrowthResult) => [
  { name: '总收益', value: fmt(data.totalEarnings), growth: total, icon: DollarSign, description: '累计总收益' },
  { name: '本月收益', value: fmt(data.monthlyEarnings), growth: monthly, icon: Calendar, description: '本月累计收益' },
  { name: '本周收益', value: fmt(data.weeklyEarnings), growth: weekly, icon: TrendingUp, description: '本周累计收益' },
  { name: '今日收益', value: fmt(data.dailyEarnings), growth: daily, icon: Wallet, description: '今日累计收益' },
]

function GrowthBadge({ growth }: { growth: GrowthResult }) {
  if (growth.value === 0) return null
  return (
    <div className={`flex items-center gap-1 mt-2 text-sm ${growth.type === 'positive' ? 'text-green-600' : growth.type === 'negative' ? 'text-red-600' : 'text-gray-600'}`}>
      {growth.type === 'positive' ? <ArrowUp className="w-3 h-3" /> : growth.type === 'negative' ? <ArrowDown className="w-3 h-3" /> : null}
      {growth.type === 'positive' ? '+' : growth.type === 'negative' ? '-' : ''}{growth.value.toFixed(1)}%
    </div>
  )
}

export function RevenueStatsSection({
  statsData, topAgents, tokenEarnings, totalGrowth, monthlyGrowth, weeklyGrowth, dailyGrowth,
  formatCurrency: fmt, filteredPaymentsCount, filteredSubscriptionsCount,
}: RevenueStatsSectionProps) {
  const stats = statsConfig(statsData, fmt, dailyGrowth, weeklyGrowth, monthlyGrowth, totalGrowth)

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.name} className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-all duration-300">
              <div className="flex items-start space-x-4">
                <div className="bg-blue-50 rounded-xl p-3"><Icon className="w-6 h-6 text-blue-600" /></div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                  <p className="text-xs text-gray-500 mt-1">{stat.description}</p>
                  <GrowthBadge growth={stat.growth} />
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
            <PieChart className="w-5 h-5" />收益分布
          </h3>
          <div className="space-y-4">
            {tokenEarnings.map((token) => (
              <div key={token.token} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="font-medium text-gray-900">{token.symbol}</span>
                </div>
                <div className="text-right">
                  <p className="font-medium text-gray-900">{fmt(token.earnings, token.symbol)}</p>
                  <p className="text-sm text-gray-500">{token.percentage.toFixed(1)}%</p>
                </div>
              </div>
            ))}
            {tokenEarnings.length === 0 && <p className="text-gray-500 text-center py-4">暂无收益数据</p>}
          </div>
        </div>

        {/* 热门Agent */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />热门Agent
          </h3>
          <div className="space-y-4">
            {topAgents.map((agent) => (
              <div key={agent.agentId} className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{agent.name}</p>
                  <p className="text-sm text-gray-500">{agent.paymentCount} 笔支付 · {agent.subscriptionCount} 个订阅</p>
                </div>
                <p className="font-semibold text-green-600">{fmt(agent.totalRevenue)}</p>
              </div>
            ))}
            {topAgents.length === 0 && <p className="text-gray-500 text-center py-4">暂无收益数据</p>}
          </div>
        </div>
      </div>

      {/* 支付状态 */}
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

      {/* 订阅状态 */}
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

      {/* 关键指标 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">关键指标</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-2xl font-bold text-gray-900">
              {statsData.completedPayments > 0 ? (statsData.paymentRevenue / statsData.completedPayments).toFixed(4) : '0'}
            </p>
            <p className="text-sm text-gray-600">平均支付额 (ETH)</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-2xl font-bold text-gray-900">
              {filteredPaymentsCount > 0 ? ((statsData.completedPayments / filteredPaymentsCount) * 100).toFixed(0) : '0'}%
            </p>
            <p className="text-sm text-gray-600">支付成功率</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-2xl font-bold text-gray-900">{filteredPaymentsCount + filteredSubscriptionsCount}</p>
            <p className="text-sm text-gray-600">总交易数</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-2xl font-bold text-gray-900">{topAgents.length}</p>
            <p className="text-sm text-gray-600">活跃Agent</p>
          </div>
        </div>
      </div>
    </div>
  )
}
