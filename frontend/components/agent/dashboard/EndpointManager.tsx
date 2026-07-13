// components/agent/dashboard/EndpointManager.tsx
'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import {
  Globe,
  Plus,
  Edit,
  Trash2,
  Play,
  StopCircle,
  TestTube,
  Shield,
  Zap,
  Server,
  CheckCircle,
  XCircle,
  RefreshCw,
  AlertTriangle,
  ArrowLeft
} from 'lucide-react'
import { useMultiEndpoint, type Endpoint, type ProtocolConfig, type EndpointStats } from '../hooks/useMultiEndpoint'
import { useAgentRegistry } from '../hooks/useAgentRegistry'

interface EndpointFormData {
  name: string
  endpointType: string
  protocol: string
  url: string
  description: string
}

interface EndpointTestResult {
  success: boolean
  responseTime?: number
  statusCode?: number
  error?: string
}

interface ValidationResult {
  isValid: boolean
  message: string
}

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

  const endpointTypes = [
    { value: 'API', label: 'API端点', icon: Server },
    { value: 'WebSocket', label: 'WebSocket', icon: Zap },
    { value: 'gRPC', label: 'gRPC', icon: Globe },
    { value: 'A2A', label: 'A2A协议', icon: Shield }
  ]

  const protocols = [
    { value: 'HTTP', label: 'HTTP' },
    { value: 'HTTPS', label: 'HTTPS' },
    { value: 'WebSocket', label: 'WebSocket' },
    { value: 'gRPC', label: 'gRPC' },
    { value: 'IPFS', label: 'IPFS' }
  ]

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

  const checkEndpointStatus = async (endpoint: Endpoint): Promise<string> => {
    if (!endpoint.isActive) {
      return '未激活'
    }

    try {
      switch (endpoint.protocol.toUpperCase()) {
        case 'HTTP':
        case 'HTTPS':
          return await checkHttpEndpoint(endpoint.url)
        case 'WEBSOCKET':
          return await checkWebSocketEndpoint(endpoint.url)
        case 'GRPC':
          return await checkGrpcEndpoint(endpoint.url)
        case 'IPFS':
          return await checkIpfsEndpoint(endpoint.url)
        default:
          return '未测试'
      }
    } catch (error) {
      console.error(`Endpoint ${endpoint.endpointId} status check failed:`, error)
      return '检查失败'
    }
  }

  const checkHttpEndpoint = async (url: string): Promise<string> => {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'AI-Agent-Endpoint-Manager/1.0'
        }
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        return '运行正常'
      } else {
        return `HTTP ${response.status}`
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return '请求超时'
      }
      return '连接失败'
    }
  }

  const checkWebSocketEndpoint = async (url: string): Promise<string> => {
    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(url)
        let resolved = false

        const timeoutId = setTimeout(() => {
          if (!resolved) {
            ws.close()
            resolve('连接超时')
          }
        }, 5000)

        ws.onopen = () => {
          resolved = true
          clearTimeout(timeoutId)
          ws.close()
          resolve('运行正常')
        }

        ws.onerror = () => {
          resolved = true
          clearTimeout(timeoutId)
          resolve('连接失败')
        }

        ws.onclose = () => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeoutId)
            resolve('连接关闭')
          }
        }
      } catch (error) {
        resolve('连接失败')
      }
    })
  }

  const checkGrpcEndpoint = async (url: string): Promise<string> => {
    return '未测试'
  }

  const checkIpfsEndpoint = async (url: string): Promise<string> => {
    try {
      const testUrl = url.replace(/\/ipfs\/[^/]+$/, '/ipfs/QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn')
      const response = await fetch(testUrl, { method: 'HEAD' })
      return response.ok ? '运行正常' : '连接失败'
    } catch (error) {
      return '连接失败'
    }
  }

  const validateForm = (): ValidationResult => {
    if (!formData.name.trim()) {
      return { isValid: false, message: '端点名称不能为空' }
    }

    if (!formData.endpointType.trim()) {
      return { isValid: false, message: '端点类型不能为空' }
    }

    if (!formData.protocol.trim()) {
      return { isValid: false, message: '协议不能为空' }
    }

    if (!formData.url.trim()) {
      return { isValid: false, message: 'URL不能为空' }
    }

    try {
      new URL(formData.url)
    } catch {
      return { isValid: false, message: '无效的URL格式' }
    }

    return { isValid: true, message: '' }
  }

  useEffect(() => {
    if (formData.name && formData.url) {
      setValidation(validateForm())
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

    const validationResult = validateForm()
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
      alert('请先选择Agent')
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

  const getEndpointTypeIcon = (type: string) => {
    const endpointType = endpointTypes.find(t => t.value === type)
    return endpointType ? endpointType.icon : Globe
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

  const formatTimestamp = (timestamp: bigint) => {
    return new Date(Number(timestamp) * 1000).toLocaleDateString('zh-CN')
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
                const EndpointTypeIcon = getEndpointTypeIcon(endpoint.endpointType)
                const testResult = testResults[Number(endpoint.endpointId)]
                const currentStatus = endpointStatuses[Number(endpoint.endpointId)]

                return (
                  <div
                    key={endpoint.endpointId.toString()}
                    className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-all duration-300"
                  >
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
                            <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getEndpointStatusColor(endpoint)}`}>
                              {getEndpointStatusText(endpoint)}
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
                          onClick={() => testEndpoint(endpoint)}
                          disabled={testingEndpoint === Number(endpoint.endpointId) || !endpoint.isActive}
                          className="p-2 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50"
                          title={endpoint.isActive ? "测试端点" : "端点未激活"}
                        >
                          <TestTube className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleToggleStatus(endpoint)}
                          className="p-2 text-gray-400 hover:text-green-600 transition-colors disabled:opacity-50"
                          title={endpoint.isActive ? '停用端点' : '端点已停用'}
                          disabled={isDeactivatingEndpoint}
                        >
                          {endpoint.isActive ? (
                            <StopCircle className="w-4 h-4" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </button>

                        <button
                          onClick={() => handleEdit(endpoint)}
                          className="p-2 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50"
                          title="编辑端点"
                          disabled={isUpdatingEndpoint}
                        >
                          <Edit className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleDelete(endpoint)}
                          className="p-2 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                          title="删除端点"
                          disabled={isDeactivatingEndpoint}
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
                    {testingEndpoint === Number(endpoint.endpointId) && (
                      <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="flex items-center gap-2 text-sm text-blue-700">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                          测试端点中...
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* 端点表单弹窗 */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <button
                  onClick={handleCancel}
                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h3 className="text-xl font-semibold text-gray-900">
                  {editingEndpoint ? '编辑端点' : '创建端点'}
                </h3>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
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
                        {endpointTypes.map(type => (
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
                        {protocols.map(protocol => (
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
                    onClick={handleCancel}
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

