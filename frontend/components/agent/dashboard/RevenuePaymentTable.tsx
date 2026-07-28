// components/agent/dashboard/RevenuePaymentTable.tsx
// 支付记录 + 订阅记录表格
'use client'

import { CreditCard, FileText } from 'lucide-react'
import type { Payment, Subscription } from './hooks/useRevenueDisplay'

interface RevenuePaymentTableProps {
  filteredPayments: Payment[]
  filteredSubscriptions: Subscription[]
  formatCurrency: (amount: number, currency?: string) => string
  formatDate: (timestamp: bigint) => string
  getTokenSymbol: (address: string) => string
  getPaymentStatusDisplay: (status: number) => { text: string; color: string }
  getSubscriptionStatusDisplay: (status: number) => { text: string; color: string }
}

export function RevenuePaymentTable({
  filteredPayments, filteredSubscriptions, formatCurrency, formatDate,
  getTokenSymbol, getPaymentStatusDisplay, getSubscriptionStatusDisplay,
}: RevenuePaymentTableProps) {
  return (
    <div className="space-y-6">
      {/* 支付记录 */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">支付记录</h3>
            <p className="text-sm text-gray-600">{filteredPayments.length} 条记录</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          {filteredPayments.length > 0 ? (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">支付ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agent</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">金额</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">时间</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">客户</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPayments.map((payment) => {
                  const statusInfo = getPaymentStatusDisplay(payment.status)
                  return (
                    <tr key={payment.paymentId.toString()}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">#{payment.paymentId.toString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">Agent #{payment.agentId.toString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(Number(payment.amount) / 1e18, getTokenSymbol(payment.token))}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusInfo.color}`}>{statusInfo.text}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(payment.createdAt)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {payment.client.slice(0, 8)}...{payment.client.slice(-6)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12">
              <CreditCard className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">暂无支付记录</p>
            </div>
          )}
        </div>
      </div>

      {/* 订阅记录 */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">订阅记录</h3>
            <p className="text-sm text-gray-600">{filteredSubscriptions.length} 条记录</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          {filteredSubscriptions.length > 0 ? (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">订阅ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agent</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">总支付</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">开始时间</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">下次续费</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredSubscriptions.map((subscription) => {
                  const statusInfo = getSubscriptionStatusDisplay(subscription.status)
                  return (
                    <tr key={subscription.subscriptionId.toString()}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">#{subscription.subscriptionId.toString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">Agent #{subscription.agentId.toString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(Number(subscription.totalPaid || 0) / 1e18)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusInfo.color}`}>{statusInfo.text}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(subscription.startDate)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(subscription.nextBillingDate)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">暂无订阅记录</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
