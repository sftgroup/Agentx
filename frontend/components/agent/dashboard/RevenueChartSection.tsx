// components/agent/dashboard/RevenueChartSection.tsx
// 收益图表区（趋势 + 饼图）
'use client'

import { BarChart3, PieChart } from 'lucide-react'
import {
  LineChart, Line, PieChart as RechartsPieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import type { ChartData, RevenueSourceData } from './hooks/useRevenueDisplay'

interface RevenueChartSectionProps {
  revenueTrendData: ChartData[]
  revenueSourceData: RevenueSourceData[]
  formatCurrency: (amount: number, currency?: string) => string
}

function CustomTooltip({ active, payload, label, formatCurrency: fc }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
        <p className="font-medium text-gray-900">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: {fc(entry.value)}
          </p>
        ))}
      </div>
    )
  }
  return null
}

export function RevenueChartSection({ revenueTrendData, revenueSourceData, formatCurrency }: RevenueChartSectionProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 收益趋势 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">收益趋势</h3>
        {revenueTrendData.length > 0 ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueTrendData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} tickFormatter={(value) => `${value.toFixed(4)} ETH`} />
                <Tooltip content={<CustomTooltip formatCurrency={formatCurrency} />} />
                <Legend />
                <Line type="monotone" dataKey="totalRevenue" stroke="#10B981" strokeWidth={2} dot={{ fill: '#10B981', strokeWidth: 2, r: 4 }} activeDot={{ r: 6, stroke: '#10B981', strokeWidth: 2 }} name="总收益" />
                <Line type="monotone" dataKey="paymentRevenue" stroke="#3B82F6" strokeWidth={2} strokeDasharray="5 5" dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4 }} activeDot={{ r: 6, stroke: '#3B82F6', strokeWidth: 2 }} name="支付收益" />
                <Line type="monotone" dataKey="subscriptionRevenue" stroke="#8B5CF6" strokeWidth={2} strokeDasharray="5 5" dot={{ fill: '#8B5CF6', strokeWidth: 2, r: 4 }} activeDot={{ r: 6, stroke: '#8B5CF6', strokeWidth: 2 }} name="订阅收益" />
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

      {/* 收入来源 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">收入来源</h3>
        {revenueSourceData.length > 0 ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPieChart>
                <Pie data={revenueSourceData} cx="50%" cy="50%" labelLine={false}
                  label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(1)}%`}
                  outerRadius={80} fill="#8884d8" dataKey="value">
                  {revenueSourceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => [formatCurrency(Number(value)), 'Revenue']} />
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
  )
}
