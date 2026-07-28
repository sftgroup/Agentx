// components/agent/dashboard/RevenueDisplay.tsx
// 收益管理 — 协调器组件，逻辑见 hooks/useRevenueDisplay.ts
'use client'

import { RefreshCw, Download, XCircle, Eye, DollarSign, CreditCard, FileText, Users } from 'lucide-react'
import { useRevenueDisplay } from './hooks/useRevenueDisplay'
import { RevenueStatsSection } from './RevenueStatsSection'
import { RevenuePaymentTable } from './RevenuePaymentTable'
import { RevenueChartSection } from './RevenueChartSection'

export function RevenueDisplay() {
  const ctx = useRevenueDisplay()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">收益管理</h2>
          <p className="text-gray-600 mt-1">查看和管理您的Agent收益数据</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={ctx.loadRevenueData}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50 transition-colors"
            disabled={ctx.isLoading || !ctx.isConnected}>
            <RefreshCw className={`w-4 h-4 ${ctx.isLoading ? 'animate-spin' : ''}`} />
            {ctx.isLoading ? '加载中...' : '刷新'}
          </button>
          <select value={ctx.selectedTimeRange}
            onChange={(e) => ctx.setSelectedTimeRange(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition-colors"
            disabled={!ctx.isConnected || ctx.isLoading}>
            {ctx.timeRanges.map(range => (
              <option key={range.value} value={range.value}>{range.label}</option>
            ))}
          </select>
          <button onClick={ctx.exportToCSV}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50 transition-colors"
            disabled={(ctx.filteredPayments.length === 0 && ctx.filteredSubscriptions.length === 0) || !ctx.isConnected || ctx.isLoading}>
            <Download className="w-4 h-4" />导出CSV
          </button>
        </div>
      </div>

      {/* 连接提示 */}
      {!ctx.isConnected && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
          <div className="flex items-center gap-2 text-yellow-800">
            <XCircle className="w-4 h-4" /><span>请先连接钱包以查看收益数据</span>
          </div>
        </div>
      )}

      {/* 空数据提示 */}
      {ctx.isConnected && ctx.allPayments.length === 0 && ctx.userSubscriptions.length === 0 && !ctx.isLoading && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <div className="flex items-center gap-2 text-blue-800">
            <Eye className="w-4 h-4" /><span>暂无收益数据，请确保您的Agent有支付记录或订阅</span>
          </div>
          <div className="mt-2 text-sm text-blue-600">
            <p>• 检查您的Agent是否已注册</p>
            <p>• 确认有用户向您的Agent支付费用</p>
            <p>• 查看订阅管理设置订阅计划</p>
          </div>
        </div>
      )}

      {/* 错误显示 */}
      {(ctx.paymentError || ctx.subscriptionError) && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-center gap-2 text-red-700">
            <XCircle className="w-4 h-4" />
            <span>数据加载失败: {(ctx.paymentError || ctx.subscriptionError)?.message}</span>
          </div>
        </div>
      )}

      {/* 概览总卡片 */}
      {ctx.isConnected && (ctx.allPayments.length > 0 || ctx.userSubscriptions.length > 0 || ctx.statsData.totalEarnings > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center">
              <DollarSign className="w-8 h-8 text-green-600 mr-4" />
              <div>
                <p className="text-sm font-medium text-green-600">总收益</p>
                <p className="text-2xl font-bold text-green-900">{ctx.formatCurrency(ctx.statsData.totalEarnings)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center">
              <CreditCard className="w-8 h-8 text-blue-600 mr-4" />
              <div>
                <p className="text-sm font-medium text-blue-600">支付收益</p>
                <p className="text-2xl font-bold text-blue-900">{ctx.formatCurrency(ctx.statsData.paymentRevenue)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center">
              <FileText className="w-8 h-8 text-purple-600 mr-4" />
              <div>
                <p className="text-sm font-medium text-purple-600">订阅收益</p>
                <p className="text-2xl font-bold text-purple-900">{ctx.formatCurrency(ctx.statsData.subscriptionRevenue)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center">
              <Users className="w-8 h-8 text-orange-600 mr-4" />
              <div>
                <p className="text-sm font-medium text-orange-600">活跃订阅</p>
                <p className="text-2xl font-bold text-orange-900">{ctx.statsData.activeSubscriptions}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 视图切换 */}
      <div className="flex border-b border-gray-200">
        {(['overview', 'details', 'analytics'] as const).map(view => (
          <button key={view}
            onClick={() => ctx.setSelectedView(view)}
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${ctx.selectedView === view ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            disabled={!ctx.isConnected}>
            {{ overview: '概览', details: '详细记录', analytics: '分析' }[view]}
          </button>
        ))}
      </div>

      {ctx.isLoading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <span className="ml-3 text-gray-600">加载收益数据中...</span>
        </div>
      ) : (
        <>
          {ctx.selectedView === 'overview' && (
            <RevenueStatsSection
              statsData={ctx.statsData} topAgents={ctx.topAgents}
              tokenEarnings={ctx.tokenEarnings}
              totalGrowth={ctx.totalGrowth} monthlyGrowth={ctx.monthlyGrowth}
              weeklyGrowth={ctx.weeklyGrowth} dailyGrowth={ctx.dailyGrowth}
              formatCurrency={ctx.formatCurrency}
              filteredPaymentsCount={ctx.filteredPayments.length}
              filteredSubscriptionsCount={ctx.filteredSubscriptions.length}
            />
          )}
          {ctx.selectedView === 'details' && (
            <RevenuePaymentTable
              filteredPayments={ctx.filteredPayments}
              filteredSubscriptions={ctx.filteredSubscriptions}
              formatCurrency={ctx.formatCurrency} formatDate={ctx.formatDate}
              getTokenSymbol={ctx.getTokenSymbol}
              getPaymentStatusDisplay={ctx.getPaymentStatusDisplay}
              getSubscriptionStatusDisplay={ctx.getSubscriptionStatusDisplay}
            />
          )}
          {ctx.selectedView === 'analytics' && (
            <div className="space-y-6">
              <RevenueChartSection
                revenueTrendData={ctx.revenueTrendData}
                revenueSourceData={ctx.revenueSourceData}
                formatCurrency={ctx.formatCurrency}
              />
              {/* 关键指标 */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">关键指标</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-2xl font-bold text-gray-900">
                      {ctx.statsData.completedPayments > 0 ? (ctx.statsData.paymentRevenue / ctx.statsData.completedPayments).toFixed(4) : '0'}
                    </p>
                    <p className="text-sm text-gray-600">平均支付额 (ETH)</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-2xl font-bold text-gray-900">
                      {ctx.filteredPayments.length > 0 ? ((ctx.statsData.completedPayments / ctx.filteredPayments.length) * 100).toFixed(0) : '0'}%
                    </p>
                    <p className="text-sm text-gray-600">支付成功率</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-2xl font-bold text-gray-900">{ctx.filteredPayments.length + ctx.filteredSubscriptions.length}</p>
                    <p className="text-sm text-gray-600">总交易数</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-2xl font-bold text-gray-900">{ctx.topAgents.length}</p>
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
