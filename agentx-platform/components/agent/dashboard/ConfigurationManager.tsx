// components/agent/dashboard/ConfigurationManager.tsx
'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { 
  Settings, 
  Plus, 
  Edit, 
  Trash2, 
  Save, 
  CheckCircle, 
  XCircle, 
  Info, 
  X,
  ArrowLeft,
  Copy,
  Eye,
  EyeOff,
  RefreshCw
} from 'lucide-react'
import { useConfiguration, ConfigDataType, type ConfigEntry } from '../hooks/useConfiguration'
import { useAgentRegistry } from '../hooks/useAgentRegistry'

interface ConfigFormData {
  configKey: string
  configValue: string
  dataType: ConfigDataType
  description: string
}

interface ValidationResult {
  isValid: boolean
  message: string
}

const CONFIG_EXAMPLES = [
  {
    key: 'api_key',
    value: 'your_api_key_here',
    type: ConfigDataType.String,
    description: 'API访问密钥',
    example: 'sk-1234567890abcdef'
  },
  {
    key: 'service_endpoint',
    value: 'https://api.example.com/v1',
    type: ConfigDataType.String,
    description: '服务端点地址',
    example: 'https://api.openai.com/v1'
  },
  {
    key: 'timeout_ms',
    value: '5000',
    type: ConfigDataType.Number,
    description: '请求超时时间（毫秒）',
    example: '30000'
  },
  {
    key: 'max_retries',
    value: '3',
    type: ConfigDataType.Number,
    description: '最大重试次数',
    example: '5'
  },
  {
    key: 'debug_mode',
    value: 'false',
    type: ConfigDataType.Boolean,
    description: '调试模式开关',
    example: 'true'
  },
  {
    key: 'allowed_domains',
    value: '["example.com", "api.com"]',
    type: ConfigDataType.Array,
    description: '允许访问的域名列表',
    example: '["openai.com", "github.com"]'
  },
  {
    key: 'request_headers',
    value: '{"Content-Type": "application/json"}',
    type: ConfigDataType.Object,
    description: '请求头配置',
    example: '{"Authorization": "Bearer token", "User-Agent": "MyApp/1.0"}'
  }
]

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

  const dataTypes = [
    { value: ConfigDataType.String, label: '字符串' },
    { value: ConfigDataType.Number, label: '数字' },
    { value: ConfigDataType.Boolean, label: '布尔值' },
    { value: ConfigDataType.Array, label: '数组' },
    { value: ConfigDataType.Object, label: '对象' }
  ]

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

  const validateForm = (): ValidationResult => {
    if (!formData.configKey.trim()) {
      return { isValid: false, message: '配置键不能为空' }
    }

    if (!formData.configValue.trim()) {
      return { isValid: false, message: '配置值不能为空' }
    }

    if (!validateConfigValue(formData.configValue, formData.dataType)) {
      switch (formData.dataType) {
        case ConfigDataType.Number:
          return { isValid: false, message: '配置值必须为有效数字' }
        case ConfigDataType.Boolean:
          return { isValid: false, message: '配置值必须为 true 或 false' }
        case ConfigDataType.Array:
          return { isValid: false, message: '配置值必须为有效的 JSON 数组' }
        case ConfigDataType.Object:
          return { isValid: false, message: '配置值必须为有效的 JSON 对象' }
        default:
          return { isValid: false, message: '配置值格式不正确' }
      }
    }

    return { isValid: true, message: '' }
  }

  useEffect(() => {
    if (formData.configKey && formData.configValue) {
      setValidation(validateForm())
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

    const validationResult = validateForm()
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

      if (editingConfig) {
        await setConfig(
          selectedAgentId,
          formData.configKey,
          formData.configValue,
          formData.dataType,
          formData.description
        )
      } else {
        await setConfig(
          selectedAgentId,
          formData.configKey,
          formData.configValue,
          formData.dataType,
          formData.description
        )
      }

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
      alert('请先选择Agent')
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

  const applyExample = (example: typeof CONFIG_EXAMPLES[0]) => {
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

  const getDataTypeLabel = (dataType: ConfigDataType) => {
    const type = dataTypes.find(t => t.value === dataType)
    return type ? type.label : dataType
  }

  const formatConfigValue = (value: string, dataType: ConfigDataType) => {
    try {
      switch (dataType) {
        case ConfigDataType.Array:
        case ConfigDataType.Object:
          return JSON.stringify(JSON.parse(value), null, 2)
        case ConfigDataType.Boolean:
          return value === 'true' ? '是' : '否'
        case ConfigDataType.Number:
          return Number(value).toLocaleString()
        default:
          return value
      }
    } catch {
      return value
    }
  }

  const getConfigValuePreview = (value: string, dataType: ConfigDataType, configKey: string) => {
    const isSensitive = configKey.toLowerCase().includes('key') || 
                       configKey.toLowerCase().includes('secret') || 
                       configKey.toLowerCase().includes('password') ||
                       configKey.toLowerCase().includes('token')

    if (isSensitive && !showValue[configKey]) {
      return '••••••••'
    }

    try {
      switch (dataType) {
        case ConfigDataType.Array:
          const arr = JSON.parse(value)
          return `数组 [${arr.length} 项]`
        case ConfigDataType.Object:
          const obj = JSON.parse(value)
          return `对象 {${Object.keys(obj).length} 属性}`
        case ConfigDataType.Boolean:
          return value === 'true' ? '是' : '否'
        case ConfigDataType.Number:
          return Number(value).toLocaleString()
        default:
          return value.length > 50 ? `${value.substring(0, 50)}...` : value
      }
    } catch {
      return value
    }
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
              {agentConfigs.map((config) => {
                const isSensitive = config.configKey.toLowerCase().includes('key') || 
                                   config.configKey.toLowerCase().includes('secret') || 
                                   config.configKey.toLowerCase().includes('password') ||
                                   config.configKey.toLowerCase().includes('token')

                return (
                  <div
                    key={`${config.agentId}-${config.configKey}`}
                    className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-all duration-300"
                  >
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
                              {getConfigValuePreview(config.configValue, config.dataType, config.configKey)}
                            </div>
                            <div className="flex items-center gap-2 ml-4">
                              {isSensitive && (
                                <button
                                  onClick={() => toggleValueVisibility(config.configKey)}
                                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                                  title={showValue[config.configKey] ? '隐藏值' : '显示值'}
                                >
                                  {showValue[config.configKey] ? (
                                    <EyeOff className="w-4 h-4" />
                                  ) : (
                                    <Eye className="w-4 h-4" />
                                  )}
                                </button>
                              )}
                              <button
                                onClick={() => copyToClipboard(config.configValue)}
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
                          onClick={() => handleEdit(config)}
                          className="p-2 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50"
                          title="编辑配置"
                          disabled={isSettingConfig || isRemovingConfig}
                        >
                          <Edit className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleDelete(config)}
                          className="p-2 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                          title="删除配置"
                          disabled={isSettingConfig || isRemovingConfig}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* 配置表单弹窗 */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <button
                  onClick={handleFormClose}
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
                            onClick={() => applyExample(example)}
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

              <form onSubmit={handleSubmit} className="space-y-6">
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
                      {dataTypes.map(type => (
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
                    onClick={handleFormClose}
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


