// components/agent/dashboard/EndpointCard.tsx
// R7 拆分：单个端点卡片（展示 + 操作，纯展示组件）
'use client'

import {
  Globe,
  Edit,
  Trash2,
  Play,
  StopCircle,
  TestTube,
  AlertTriangle,
  type LucideIcon
} from 'lucide-react'
import type { Endpoint } from '../hooks/useMultiEndpoint'
import { getEndpointTypeIcon, formatTimestamp, type EndpointTestResult } from './endpoint-utils'

interface EndpointCardProps {
  endpoint: Endpoint
  testResult?: EndpointTestResult
  statusText: string
  statusColor: string
  currentStatus?: string
  isTesting: boolean
  isDeactivating: boolean
  isUpdating: boolean
  onTest: (endpoint: Endpoint) => void
  onToggleStatus: (endpoint: Endpoint) => void
  onEdit: (endpoint: Endpoint) => void
  onDelete: (endpoint: Endpoint) => void
}

export function EndpointCard({
  endpoint,
  testResult,
  statusText,
  statusColor,
  currentStatus,
  isTesting,
  isDeactivating,
  isUpdating,
  onTest,
  onToggleStatus,
  onEdit,
  onDelete
}: EndpointCardProps) {
  const EndpointTypeIcon: LucideIcon = getEndpointTypeIcon(endpoint.endpointType)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-all duration-300">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="bg-blue-100 rounded-xl p-3">
            <EndpointTypeIcon className="w-6 h-6 text-blue-600" />
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h4 className="text-lg font-semibold text-gray-900">
                {endpoint.name}
              </h4>
              <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusColor}`}>
                {statusText}
              </span>
              {testResult?.responseTime && (
                <span className="text-xs text-gray-500">
                  {testResult.responseTime}ms
                </span>
              )}
            </div>

            <p className="text-gray-600 mb-2">{endpoint.description}</p>

            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <Globe className="w-4 h-4" />
                {endpoint.url}
              </span>
              <span>协议: {endpoint.protocol}</span>
              <span>类型: {endpoint.endpointType}</span>
            </div>

            <div className="flex items-center gap-4 text-xs text-gray-400 mt-2">
              <span>创建于: {formatTimestamp(endpoint.createdAt)}</span>
              <span>更新于: {formatTimestamp(endpoint.updatedAt)}</span>
              <span>创建者: {endpoint.createdBy.slice(0, 8)}...{endpoint.createdBy.slice(-6)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onTest(endpoint)}
            disabled={isTesting || !endpoint.isActive}
            className="p-2 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50"
            title={endpoint.isActive ? "测试端点" : "端点未激活"}
          >
            <TestTube className="w-4 h-4" />
          </button>

          <button
            onClick={() => onToggleStatus(endpoint)}
            className="p-2 text-gray-400 hover:text-green-600 transition-colors disabled:opacity-50"
            title={endpoint.isActive ? '停用端点' : '端点已停用'}
            disabled={isDeactivating}
          >
            {endpoint.isActive ? (
              <StopCircle className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </button>

          <button
            onClick={() => onEdit(endpoint)}
            className="p-2 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50"
            title="编辑端点"
            disabled={isUpdating}
          >
            <Edit className="w-4 h-4" />
          </button>

          <button
            onClick={() => onDelete(endpoint)}
            className="p-2 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
            title="删除端点"
            disabled={isDeactivating}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 状态详情 */}
      {currentStatus && currentStatus !== '运行正常' && currentStatus !== '未测试' && (
        <div className="mt-3 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
          <div className="flex items-center gap-2 text-sm text-yellow-700">
            <AlertTriangle className="w-4 h-4" />
            <span>状态详情: {currentStatus}</span>
          </div>
        </div>
      )}

      {/* 测试结果 */}
      {testResult && (
        <div className={`mt-3 p-3 rounded-lg text-sm ${
          testResult.success
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {testResult.success ? (
            <div className="flex items-center gap-2">
              <span>✅ 测试成功</span>
              {testResult.responseTime && (
                <span>响应时间: {testResult.responseTime}ms</span>
              )}
              {testResult.statusCode && (
                <span>状态码: {testResult.statusCode}</span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span>❌ 测试失败</span>
              {testResult.error && <span>{testResult.error}</span>}
            </div>
          )}
        </div>
      )}

      {/* 测试中状态 */}
      {isTesting && (
        <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center gap-2 text-sm text-blue-700">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            测试端点中...
          </div>
        </div>
      )}
    </div>
  )
}
