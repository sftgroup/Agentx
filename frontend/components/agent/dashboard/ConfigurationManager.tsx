// components/agent/dashboard/ConfigurationManager.tsx
// R7 拆分：主组件（状态 + handlers），展示部分拆至 ConfigEntryCard / ConfigFormModal，
// 纯逻辑拆至 configuration-utils
'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import {
  Settings,
  Plus,
  CheckCircle,
  XCircle,
  RefreshCw
} from 'lucide-react'
import { useConfiguration, ConfigDataType, type ConfigEntry } from '../hooks/useConfiguration'
import { useOnChainAgentRegistry as useAgentRegistry } from '../hooks/useAgentRegistry'
import { validateForm, type ConfigFormData, type ValidationResult } from './configuration-utils'
import { ConfigEntryCard } from './ConfigEntryCard'
import { ConfigFormModal } from './ConfigFormModal'

export function ConfigurationManager() {
  const { address, isConnected } = useAccount()
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingConfig, setEditingConfig] = useState<ConfigEntry | null>(null)
  const [formData, setFormData] = useState<ConfigFormData>({
    configKey: '',
    configValue: '',
    dataType: ConfigDataType.String,
    description: ''
  })
  const [validation, setValidation] = useState<ValidationResult>({ isValid: true, message: '' })
  const [showExamples, setShowExamples] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [showValue, setShowValue] = useState<Record<string, boolean>>({})

  const {
    setConfig,
    removeConfig,
    getAgentConfigs,
    getConfigKeys,
    configExists,
    agentConfigs,
    configKeys,
    configCount,
    validateConfigValue,
    getSupportedDataTypes,
    isSettingConfig,
    isRemovingConfig,
    isConfirming,
    isConfirmed,
    error,
    transactionHash,
    refetchData,
    resetState
  } = useConfiguration()

  const { userAgents, refetchAgents } = useAgentRegistry()

  useEffect(() => {
    if (selectedAgentId) {
      loadConfigs(selectedAgentId)
    }
  }, [selectedAgentId])

  useEffect(() => {
    if (isConfirmed && selectedAgentId) {
      loadConfigs(selectedAgentId)
      handleFormClose()
    }
  }, [isConfirmed, selectedAgentId])

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage('')
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [successMessage])

  useEffect(() => {
    if (formData.configKey && formData.configValue) {
      setValidation(validateForm(formData, validateConfigValue))
    } else {
      setValidation({ isValid: true, message: '' })
    }
  }, [formData.configKey, formData.configValue, formData.dataType])

  const loadConfigs = async (agentId: number) => {
    try {
      await Promise.all([
        getAgentConfigs(agentId),
        getConfigKeys(agentId)
      ])
    } catch (error) {
      console.error('Failed to load configs:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedAgentId) {
      alert('请选择Agent')
      return
    }

    if (!isConnected || !address) {
      alert('请先连接钱包')
      return
    }

    const validationResult = validateForm(formData, validateConfigValue)
    if (!validationResult.isValid) {
      setValidation(validationResult)
      return
    }

    try {
      if (!editingConfig) {
        const exists = await configExists(selectedAgentId, formData.configKey)
        if (exists) {
          setValidation({
            isValid: false,
            message: `配置键 "${formData.configKey}" 已存在`
          })
          return
        }
      }

      await setConfig(
        selectedAgentId,
        formData.configKey,
        formData.configValue,
        formData.dataType,
        formData.description
      )

    } catch (error) {
      console.error('Failed to save config:', error)
    }
  }

  const handleEdit = (config: ConfigEntry) => {
    setEditingConfig(config)
    setFormData({
      configKey: config.configKey,
      configValue: config.configValue,
      dataType: config.dataType,
      description: config.description
    })
    setShowForm(true)
    setValidation({ isValid: true, message: '' })
  }

  const handleDelete = async (config: ConfigEntry) => {
    if (!window.confirm(`确定要删除配置 "${config.configKey}" 吗？`)) {
      return
    }

    if (!selectedAgentId) {
      alert('请选择Agent')
      return
    }

    try {
      await removeConfig(Number(config.agentId), config.configKey)
    } catch (error) {
      console.error('Failed to delete config:', error)
    }
  }

  const handleFormClose = () => {
    setShowForm(false)
    setEditingConfig(null)
    setFormData({
      configKey: '',
      configValue: '',
      dataType: ConfigDataType.String,
      description: ''
    })
    setValidation({ isValid: true, message: '' })
    resetState()
  }

  const applyExample = (example: { key: string; value: string; type: ConfigDataType; description: string; example: string }) => {
    setFormData({
      configKey: example.key,
      configValue: example.example,
      dataType: example.type,
      description: example.description
    })
    setShowExamples(false)
  }

  const toggleValueVisibility = (configKey: string) => {
    setShowValue(prev => ({
      ...prev,
      [configKey]: !prev[configKey]
    }))
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setSuccessMessage('已复制到剪贴板')
    }).catch(() => {
      alert('复制失败，请手动复制')
    })
  }

  const isFormLoading = isSettingConfig || isConfirming
  const isFormDisabled = isFormLoading || !validation.isValid

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">配置管理</h2>
          <p className="text-gray-600 mt-1">管理您的Agent配置参数</p>
        </div>

        <div className="flex items-center gap-3">
          {transactionHash && (
            <div className="flex items-center gap-2 text-sm">
              {isConfirming ? (
                <div className="flex items-center gap-2 text-blue-600">
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
                  交易确认中...
                </div>
              ) : isConfirmed ? (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="w-4 h-4" />
                  交易已确认
                </div>
              ) : null}
            </div>
          )}

          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 transition-colors font-medium"
            disabled={!selectedAgentId || !isConnected}
          >
            <Plus className="w-4 h-4" />
            添加配置
          </button>
        </div>
      </div>

      {/* 连接状态提示 */}
      {!isConnected && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
          <div className="flex items-center gap-2 text-yellow-800">
            <XCircle className="w-4 h-4" />
            <span>请先连接钱包以管理配置</span>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
          <div className="flex items-center gap-2 text-green-800">
            <CheckCircle className="w-5 h-5" />
            <span>{successMessage}</span>
          </div>
        </div>
      )}

      {/* Agent选择 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          选择Agent
        </label>
        <select
          value={selectedAgentId || ''}
          onChange={(e) => setSelectedAgentId(e.target.value ? Number(e.target.value) : null)}
          className="w-full max-w-md px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
          disabled={!isConnected}
        >
          <option value="">请选择Agent</option>
          {userAgents.map((agentId) => (
            <option key={agentId} value={agentId}>
              Agent #{agentId}
            </option>
          ))}
        </select>
      </div>

      {/* 配置列表 */}
      {selectedAgentId && isConnected && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">配置列表</h3>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">
                {configCount} 个配置
              </div>
              <button
                onClick={() => selectedAgentId && loadConfigs(selectedAgentId)}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-2 transition-colors"
                disabled={isSettingConfig || isRemovingConfig}
              >
                <RefreshCw className="w-4 h-4" />
                刷新
              </button>
            </div>
          </div>

          {agentConfigs.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
              <Settings className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-2">暂无配置</p>
              <p className="text-sm text-gray-500 mb-4">为您的Agent添加配置参数</p>
              <button
                onClick={() => setShowForm(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                添加配置
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {agentConfigs.map((config) => (
                <ConfigEntryCard
                  key={`${config.agentId}-${config.configKey}`}
                  config={config}
                  showValue={!!showValue[config.configKey]}
                  isBusy={isSettingConfig || isRemovingConfig}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onToggleVisibility={toggleValueVisibility}
                  onCopy={copyToClipboard}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 配置表单弹窗 */}
      {showForm && (
        <ConfigFormModal
          editingConfig={editingConfig}
          formData={formData}
          setFormData={setFormData}
          validation={validation}
          showExamples={showExamples}
          setShowExamples={setShowExamples}
          transactionHash={transactionHash}
          isConfirming={isConfirming}
          isConfirmed={isConfirmed}
          isFormLoading={isFormLoading}
          isFormDisabled={isFormDisabled}
          onSubmit={handleSubmit}
          onCancel={handleFormClose}
          onApplyExample={applyExample}
        />
      )}

      {/* 错误显示 */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-center gap-2 text-red-700">
            <XCircle className="w-4 h-4" />
            <span>操作失败: {error.message}</span>
          </div>
        </div>
      )}
    </div>
  )
}
