// components/agent/dashboard/EndpointManager.tsx
// R7 拆分：主组件（状态 + handlers），展示部分拆至 EndpointCard / EndpointFormModal，
// 纯逻辑拆至 endpoint-utils / endpoint-status
'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import {
  Globe,
  Plus,
  CheckCircle,
  RefreshCw,
  XCircle
} from 'lucide-react'
import { useMultiEndpoint, type Endpoint } from '../hooks/useMultiEndpoint'
import { useOnChainAgentRegistry as useAgentRegistry } from '../hooks/useAgentRegistry'
import { checkEndpointStatus } from './endpoint-status'
import {
  validateForm,
  type EndpointFormData,
  type EndpointTestResult,
  type ValidationResult
} from './endpoint-utils'
import { EndpointCard } from './EndpointCard'
import { EndpointFormModal } from './EndpointFormModal'

export function EndpointManager() {
  const { address, isConnected } = useAccount()
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingEndpoint, setEditingEndpoint] = useState<Endpoint | null>(null)
  const [testingEndpoint, setTestingEndpoint] = useState<number | null>(null)
  const [testResults, setTestResults] = useState<Record<number, EndpointTestResult>>({})
  const [formData, setFormData] = useState<EndpointFormData>({
    name: '',
    endpointType: 'API',
    protocol: 'HTTP',
    url: '',
    description: ''
  })
  const [validation, setValidation] = useState<ValidationResult>({ isValid: true, message: '' })
  const [endpointStatuses, setEndpointStatuses] = useState<Record<number, string>>({})

  const {
    createEndpoint,
    updateEndpoint,
    deactivateEndpoint,
    addProtocolSupport,
    getAgentEndpoints,
    getActiveAgentEndpoints,
    getSupportedProtocols,
    getProtocolConfig,
    getAgentEndpointStats,
    agentEndpoints,
    activeAgentEndpoints,
    supportedProtocols,
    endpointStats,
    isCreatingEndpoint,
    isUpdatingEndpoint,
    isDeactivatingEndpoint,
    isAddingProtocolSupport,
    isConfirming,
    isConfirmed,
    error,
    transactionHash,
    refetchData,
    resetState
  } = useMultiEndpoint()

  const { userAgents, refetchAgents } = useAgentRegistry()

  useEffect(() => {
    if (selectedAgentId) {
      loadEndpoints(selectedAgentId)
    }
  }, [selectedAgentId])

  useEffect(() => {
    if (isConfirmed && selectedAgentId) {
      loadEndpoints(selectedAgentId)
      resetState()

      if (showForm) {
        setShowForm(false)
        setEditingEndpoint(null)
        setFormData({
          name: '',
          endpointType: 'API',
          protocol: 'HTTP',
          url: '',
          description: ''
        })
      }
    }
  }, [isConfirmed, selectedAgentId, resetState, showForm])

  useEffect(() => {
    if (agentEndpoints && agentEndpoints.length > 0) {
      updateEndpointStatuses()
    }
  }, [agentEndpoints])

  const updateEndpointStatuses = async () => {
    const newStatuses: Record<number, string> = {}

    for (const endpoint of agentEndpoints) {
      const endpointId = Number(endpoint.endpointId)

      if (!endpoint.isActive) {
        newStatuses[endpointId] = '未激活'
        continue
      }

      const testResult = testResults[endpointId]
      if (testResult) {
        newStatuses[endpointId] = testResult.success ? '运行正常' : '连接失败'
        continue
      }

      try {
        const status = await checkEndpointStatus(endpoint)
        newStatuses[endpointId] = status
      } catch (error) {
        console.error(`Failed to check endpoint ${endpointId} status:`, error)
        newStatuses[endpointId] = '未知状态'
      }
    }

    setEndpointStatuses(newStatuses)
  }

  useEffect(() => {
    if (formData.name && formData.url) {
      setValidation(validateForm(formData))
    } else {
      setValidation({ isValid: true, message: '' })
    }
  }, [formData.name, formData.url, formData.endpointType, formData.protocol])

  const loadEndpoints = async (agentId: number) => {
    try {
      await Promise.all([
        getAgentEndpoints(agentId),
        getAgentEndpointStats(agentId)
      ])
    } catch (error) {
      console.error('Failed to load endpoints:', error)
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

    const validationResult = validateForm(formData)
    if (!validationResult.isValid) {
      setValidation(validationResult)
      return
    }

    try {
      if (editingEndpoint) {
        await updateEndpoint(
          Number(editingEndpoint.endpointId),
          formData.name,
          formData.endpointType,
          formData.protocol,
          formData.url,
          formData.description
        )
      } else {
        await createEndpoint(
          selectedAgentId,
          formData.name,
          formData.endpointType,
          formData.protocol,
          formData.url,
          formData.description
        )
      }

    } catch (error) {
      console.error('Failed to save endpoint:', error)
    }
  }

  const handleEdit = (endpoint: Endpoint) => {
    setEditingEndpoint(endpoint)
    setFormData({
      name: endpoint.name,
      endpointType: endpoint.endpointType,
      protocol: endpoint.protocol,
      url: endpoint.url,
      description: endpoint.description
    })
    setShowForm(true)
    setValidation({ isValid: true, message: '' })
  }

  const handleDelete = async (endpoint: Endpoint) => {
    if (!window.confirm(`确定要删除端点 "${endpoint.name}" 吗？`)) {
      return
    }

    if (!selectedAgentId) {
      alert('请选择Agent')
      return
    }

    try {
      await deactivateEndpoint(Number(endpoint.endpointId))
    } catch (error) {
      console.error('Failed to delete endpoint:', error)
    }
  }

  const handleToggleStatus = async (endpoint: Endpoint) => {
    if (!endpoint.isActive) {
      alert('端点已停用，目前不支持重新激活功能')
      return
    }

    try {
      await deactivateEndpoint(Number(endpoint.endpointId))
    } catch (error) {
      console.error('Failed to deactivate endpoint:', error)
    }
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingEndpoint(null)
    setFormData({
      name: '',
      endpointType: 'API',
      protocol: 'HTTP',
      url: '',
      description: ''
    })
    setValidation({ isValid: true, message: '' })
    resetState()
  }

  const testEndpoint = async (endpoint: Endpoint) => {
    setTestingEndpoint(Number(endpoint.endpointId))

    try {
      const startTime = Date.now()
      const response = await fetch(endpoint.url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'AI-Agent-Endpoint-Manager/1.0'
        },
        signal: AbortSignal.timeout(10000)
      })
      const responseTime = Date.now() - startTime

      const result: EndpointTestResult = {
        success: response.ok,
        responseTime,
        statusCode: response.status
      }

      if (!response.ok) {
        result.error = `HTTP ${response.status}: ${response.statusText}`
      }

      setTestResults(prev => ({
        ...prev,
        [Number(endpoint.endpointId)]: result
      }))

      setEndpointStatuses(prev => ({
        ...prev,
        [Number(endpoint.endpointId)]: result.success ? '运行正常' : '连接失败'
      }))
    } catch (error: any) {
      const result: EndpointTestResult = {
        success: false,
        error: error?.name === 'AbortError' ? '请求超时' : error?.message || '测试失败'
      }

      setTestResults(prev => ({
        ...prev,
        [Number(endpoint.endpointId)]: result
      }))

      setEndpointStatuses(prev => ({
        ...prev,
        [Number(endpoint.endpointId)]: '连接失败'
      }))
    } finally {
      setTestingEndpoint(null)
    }
  }

  const getEndpointStatusColor = (endpoint: Endpoint) => {
    if (!endpoint.isActive) return 'bg-gray-100 text-gray-800'

    const status = endpointStatuses[Number(endpoint.endpointId)]

    switch (status) {
      case '运行正常':
        return 'bg-green-100 text-green-800'
      case '连接失败':
      case '请求超时':
      case '连接超时':
      case '检查失败':
        return 'bg-red-100 text-red-800'
      case '未测试':
        return 'bg-blue-100 text-blue-800'
      case 'HTTP 404':
      case 'HTTP 500':
        return 'bg-orange-100 text-orange-800'
      default:
        return 'bg-yellow-100 text-yellow-800'
    }
  }

  const getEndpointStatusText = (endpoint: Endpoint) => {
    if (!endpoint.isActive) return '未激活'

    const status = endpointStatuses[Number(endpoint.endpointId)]
    return status || '检查中...'
  }

  const isFormLoading = isCreatingEndpoint || isUpdatingEndpoint || isConfirming
  const isFormDisabled = isFormLoading || !validation.isValid

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">端点管理</h2>
          <p className="text-gray-600 mt-1">管理您的Agent服务端点</p>
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
            创建端点
          </button>
        </div>
      </div>

      {/* 连接状态提示 */}
      {!isConnected && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
          <div className="flex items-center gap-2 text-yellow-800">
            <XCircle className="w-4 h-4" />
            <span>请先连接钱包以管理端点</span>
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

      {/* 端点统计 */}
      {selectedAgentId && isConnected && endpointStats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="text-2xl font-bold text-gray-900">{endpointStats.totalEndpoints.toString()}</div>
            <div className="text-sm text-gray-600">总端点</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="text-2xl font-bold text-green-600">{endpointStats.activeEndpoints.toString()}</div>
            <div className="text-sm text-gray-600">活跃端点</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="text-2xl font-bold text-blue-600">{endpointStats.httpEndpoints.toString()}</div>
            <div className="text-sm text-gray-600">HTTP端点</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="text-2xl font-bold text-purple-600">{endpointStats.websocketEndpoints.toString()}</div>
            <div className="text-sm text-gray-600">WebSocket</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="text-2xl font-bold text-orange-600">{endpointStats.grpcEndpoints.toString()}</div>
            <div className="text-sm text-gray-600">gRPC端点</div>
          </div>
        </div>
      )}

      {/* 端点列表 */}
      {selectedAgentId && isConnected && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">端点列表</h3>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">
                {agentEndpoints.length} 个端点
              </div>
              <button
                onClick={() => selectedAgentId && loadEndpoints(selectedAgentId)}
                className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50 transition-colors"
                disabled={isCreatingEndpoint || isUpdatingEndpoint || isDeactivatingEndpoint}
              >
                <RefreshCw className="w-4 h-4" />
                刷新
              </button>
            </div>
          </div>

          {agentEndpoints.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
              <Globe className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-2">暂无端点配置</p>
              <p className="text-sm text-gray-500 mb-4">创建您的第一个服务端点</p>
              <button
                onClick={() => setShowForm(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                创建端点
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {agentEndpoints.map((endpoint) => {
                const testResult = testResults[Number(endpoint.endpointId)]
                const currentStatus = endpointStatuses[Number(endpoint.endpointId)]

                return (
                  <EndpointCard
                    key={endpoint.endpointId.toString()}
                    endpoint={endpoint}
                    testResult={testResult}
                    statusText={getEndpointStatusText(endpoint)}
                    statusColor={getEndpointStatusColor(endpoint)}
                    currentStatus={currentStatus}
                    isTesting={testingEndpoint === Number(endpoint.endpointId)}
                    isDeactivating={isDeactivatingEndpoint}
                    isUpdating={isUpdatingEndpoint}
                    onTest={testEndpoint}
                    onToggleStatus={handleToggleStatus}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* 端点表单弹窗 */}
      {showForm && (
        <EndpointFormModal
          editingEndpoint={editingEndpoint}
          formData={formData}
          setFormData={setFormData}
          validation={validation}
          transactionHash={transactionHash}
          isConfirming={isConfirming}
          isConfirmed={isConfirmed}
          isFormLoading={isFormLoading}
          isFormDisabled={isFormDisabled}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
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
