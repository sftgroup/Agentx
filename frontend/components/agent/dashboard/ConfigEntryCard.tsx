// components/agent/dashboard/ConfigEntryCard.tsx
// R7 拆分：单个配置项卡片（展示 + 操作，纯展示组件）
'use client'

import { Edit, Trash2, Copy, Eye, EyeOff } from 'lucide-react'
import type { ConfigEntry } from '../hooks/useConfiguration'
import {
  getDataTypeLabel,
  formatConfigValue,
  getConfigValuePreview,
  isSensitiveConfigKey
} from './configuration-utils'

interface ConfigEntryCardProps {
  config: ConfigEntry
  showValue: boolean
  isBusy: boolean
  onEdit: (config: ConfigEntry) => void
  onDelete: (config: ConfigEntry) => void
  onToggleVisibility: (configKey: string) => void
  onCopy: (text: string) => void
}

export function ConfigEntryCard({
  config,
  showValue,
  isBusy,
  onEdit,
  onDelete,
  onToggleVisibility,
  onCopy
}: ConfigEntryCardProps) {
  const isSensitive = isSensitiveConfigKey(config.configKey)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-all duration-300">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h4 className="text-lg font-semibold text-gray-900">
              {config.configKey}
            </h4>
            <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
              {getDataTypeLabel(config.dataType)}
            </span>
            <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
              config.isActive
                ? 'bg-green-100 text-green-800'
                : 'bg-gray-100 text-gray-800'
            }`}>
              {config.isActive ? '活跃' : '未激活'}
            </span>
          </div>

          {config.description && (
            <p className="text-gray-600 mb-3">{config.description}</p>
          )}

          <div className="bg-gray-50 rounded-lg p-4 mb-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-800 font-mono flex-1">
                {getConfigValuePreview(config.configValue, config.dataType, config.configKey, showValue)}
              </div>
              <div className="flex items-center gap-2 ml-4">
                {isSensitive && (
                  <button
                    onClick={() => onToggleVisibility(config.configKey)}
                    className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                    title={showValue ? '隐藏值' : '显示值'}
                  >
                    {showValue ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                )}
                <button
                  onClick={() => onCopy(config.configValue)}
                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                  title="复制值"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* 完整值预览 */}
          <details className="text-sm">
            <summary className="cursor-pointer text-gray-500 hover:text-gray-700 transition-colors">
              查看完整值
            </summary>
            <pre className="mt-2 p-3 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-xs">
              {formatConfigValue(config.configValue, config.dataType)}
            </pre>
          </details>

          <div className="flex items-center gap-4 text-xs text-gray-400 mt-3">
            <span>创建于: {new Date(Number(config.createdAt) * 1000).toLocaleDateString('zh-CN')}</span>
            <span>更新于: {new Date(Number(config.updatedAt) * 1000).toLocaleDateString('zh-CN')}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={() => onEdit(config)}
            className="p-2 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50"
            title="编辑配置"
            disabled={isBusy}
          >
            <Edit className="w-4 h-4" />
          </button>

          <button
            onClick={() => onDelete(config)}
            className="p-2 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
            title="删除配置"
            disabled={isBusy}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
