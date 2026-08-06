// components/agent/dashboard/ConfigFormModal.tsx
// R7 拆分：配置创建/编辑弹窗（纯展示组件）
'use client'

import { ArrowLeft, CheckCircle, Info, Save } from 'lucide-react'
import { ConfigDataType, type ConfigEntry } from '../hooks/useConfiguration'
import { CONFIG_EXAMPLES, DATA_TYPES, type ConfigFormData, type ValidationResult } from './configuration-utils'

interface ConfigFormModalProps {
  editingConfig: ConfigEntry | null
  formData: ConfigFormData
  setFormData: React.Dispatch<React.SetStateAction<ConfigFormData>>
  validation: ValidationResult
  showExamples: boolean
  setShowExamples: React.Dispatch<React.SetStateAction<boolean>>
  transactionHash: `0x${string}` | undefined
  isConfirming: boolean
  isConfirmed: boolean
  isFormLoading: boolean
  isFormDisabled: boolean
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
  onApplyExample: (example: typeof CONFIG_EXAMPLES[0]) => void
}

export function ConfigFormModal({
  editingConfig,
  formData,
  setFormData,
  validation,
  showExamples,
  setShowExamples,
  transactionHash,
  isConfirming,
  isConfirmed,
  isFormLoading,
  isFormDisabled,
  onSubmit,
  onCancel,
  onApplyExample
}: ConfigFormModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={onCancel}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              disabled={isFormLoading}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-semibold text-gray-900">
              {editingConfig ? '编辑配置' : '添加配置'}
            </h3>
          </div>

          {/* 配置提示和示例 */}
          {!editingConfig && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-blue-800 mb-2 flex items-center gap-1">
                    <Info className="w-4 h-4" />
                    配置提示
                  </h4>
                  <div className="text-sm text-blue-700 space-y-1">
                    <p>• 配置键应为有意义的英文名称，如 <code className="bg-blue-100 px-1 rounded">api_key</code></p>
                    <p>• 配置值需符合所选数据类型的要求</p>
                    <p>• 使用描述字段说明配置的用途</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowExamples(!showExamples)}
                  className="text-sm text-blue-600 hover:text-blue-800 ml-4 whitespace-nowrap transition-colors"
                >
                  {showExamples ? '隐藏示例' : '查看示例'}
                </button>
              </div>

              {/* 配置示例 */}
              {showExamples && (
                <div className="mt-3 pt-3 border-t border-blue-200">
                  <h5 className="text-xs font-medium text-blue-800 mb-2">常用配置示例：</h5>
                  <div className="grid grid-cols-1 gap-2 text-xs">
                    {CONFIG_EXAMPLES.map((example, index) => (
                      <button
                        key={index}
                        onClick={() => onApplyExample(example)}
                        className="text-left p-2 bg-white rounded border border-blue-100 hover:bg-blue-100 transition-colors"
                      >
                        <div className="font-medium text-blue-800">{example.key}</div>
                        <div className="text-blue-600">{example.description}</div>
                        <div className="text-blue-500 font-mono mt-1">{example.example}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                配置键 *
              </label>
              <input
                type="text"
                value={formData.configKey}
                onChange={(e) => setFormData(prev => ({ ...prev, configKey: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="例如：api_key、max_requests"
                required
                disabled={isFormLoading || !!editingConfig}
              />
              {editingConfig ? (
                <p className="text-xs text-gray-500 mt-2">配置键创建后不可修改</p>
              ) : (
                <p className="text-xs text-gray-500 mt-2">使用英文单词，以下划线分隔，如：api_key, max_retries</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                配置值 *
              </label>
              <textarea
                value={formData.configValue}
                onChange={(e) => setFormData(prev => ({ ...prev, configValue: e.target.value }))}
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors font-mono text-sm"
                placeholder="输入配置值"
                required
                disabled={isFormLoading}
              />
              {!validation.isValid ? (
                <p className="text-xs text-red-600 mt-2">{validation.message}</p>
              ) : (
                <p className="text-xs text-gray-500 mt-2">
                  {formData.dataType === ConfigDataType.Array && '请输入有效的 JSON 数组，例如：["item1", "item2"]'}
                  {formData.dataType === ConfigDataType.Object && '请输入有效的 JSON 对象，例如：{"key": "value"}'}
                  {formData.dataType === ConfigDataType.Boolean && '请输入 true 或 false'}
                  {formData.dataType === ConfigDataType.Number && '请输入数字，例如：12345'}
                  {formData.dataType === ConfigDataType.String && '请输入字符串'}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  数据类型 *
                </label>
                <select
                  value={formData.dataType}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    dataType: e.target.value as ConfigDataType
                  }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  disabled={isFormLoading}
                >
                  {DATA_TYPES.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-2">选择适合的数据类型</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                描述
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={2}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="描述此配置的用途"
                disabled={isFormLoading}
              />
              <p className="text-xs text-gray-500 mt-2">简要说明这个配置的作用</p>
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
                    <Save className="w-5 h-5" />
                    {editingConfig ? '更新配置' : '添加配置'}
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
