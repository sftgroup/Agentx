// components/agent/dashboard/EndpointFormModal.tsx
// R7 拆分：端点创建/编辑弹窗（纯展示组件）
'use client'

import { ArrowLeft, CheckCircle, Plus } from 'lucide-react'
import type { Endpoint } from '../hooks/useMultiEndpoint'
import { ENDPOINT_TYPES, PROTOCOLS, type EndpointFormData, type ValidationResult } from './endpoint-utils'

interface EndpointFormModalProps {
  editingEndpoint: Endpoint | null
  formData: EndpointFormData
  setFormData: React.Dispatch<React.SetStateAction<EndpointFormData>>
  validation: ValidationResult
  transactionHash: `0x${string}` | undefined
  isConfirming: boolean
  isConfirmed: boolean
  isFormLoading: boolean
  isFormDisabled: boolean
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
}

export function EndpointFormModal({
  editingEndpoint,
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
}: EndpointFormModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={onCancel}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-semibold text-gray-900">
              {editingEndpoint ? '编辑端点' : '创建端点'}
            </h3>
          </div>

          <form onSubmit={onSubmit} className="space-y-6">
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  端点名称 *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="例如：主要API端点"
                  required
                  disabled={isFormLoading}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    端点类型 *
                  </label>
                  <select
                    value={formData.endpointType}
                    onChange={(e) => setFormData(prev => ({ ...prev, endpointType: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    disabled={isFormLoading}
                  >
                    {ENDPOINT_TYPES.map(type => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    协议 *
                  </label>
                  <select
                    value={formData.protocol}
                    onChange={(e) => setFormData(prev => ({ ...prev, protocol: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    disabled={isFormLoading}
                  >
                    {PROTOCOLS.map(protocol => (
                      <option key={protocol.value} value={protocol.value}>
                        {protocol.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  端点URL *
                </label>
                <input
                  type="url"
                  value={formData.url}
                  onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors font-mono text-sm"
                  placeholder="https://api.example.com/v1/endpoint"
                  required
                  disabled={isFormLoading}
                />
                {!validation.isValid && (
                  <p className="text-xs text-red-600 mt-2">{validation.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  描述
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="描述此端点的用途和功能"
                  disabled={isFormLoading}
                />
              </div>
            </div>

            {/* 交易状态显示 */}
            {transactionHash && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
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
                  <p className="text-xs text-blue-600 mt-2 font-mono break-all">
                    Tx: {transactionHash}
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-4 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={onCancel}
                className="px-6 py-3 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors font-medium"
                disabled={isFormLoading}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isFormDisabled}
                className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {isFormLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {isConfirming ? '确认中...' : '保存中...'}
                  </>
                ) : (
                  <>
                    <Plus className="w-5 h-5" />
                    {editingEndpoint ? '更新端点' : '创建端点'}
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
