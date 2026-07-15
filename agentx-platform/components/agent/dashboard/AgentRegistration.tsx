// components/agent/dashboard/AgentRegistration.tsx
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAccount } from 'wagmi'
import { 
  Plus, 
  Upload, 
  CheckCircle, 
  XCircle, 
  RefreshCw,
  Key,
  Server,
  Settings,
  User,
  FileText,
  Link,
  AlertCircle,
  Info,
  ArrowLeft
} from 'lucide-react'
import { useAgentRegistry } from '../hooks/useAgentRegistry'
import { useConfiguration } from '../hooks/useConfiguration'
import { useMultiEndpoint } from '../hooks/useMultiEndpoint'
import { useA2AProtocol } from '../hooks/useA2AProtocol'
import { uploadJSONToIPFS, uploadToIPFS, getIPFSUrl, testPinataConnection } from '@/lib/ipfs'

interface RegistrationForm {
  tokenURI: string
  metadata: Array<{ key: string; value: string }>
}

interface ValidationResult {
  isValid: boolean
  message: string
}

interface MetadataEntry {
  key: string
  value: string
}

interface AgentMetadata {
  agentId: number
  metadata: MetadataEntry[]
  existingMetadata: MetadataEntry[]
}

export function AgentRegistration() {
  const { address, isConnected } = useAccount()
  const [showRegistrationForm, setShowRegistrationForm] = useState(false)
  const [showMetadataForm, setShowMetadataForm] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null)
  const [registrationForm, setRegistrationForm] = useState<RegistrationForm>({
    tokenURI: '',
    metadata: []
  })
  const [currentMetadata, setCurrentMetadata] = useState<MetadataEntry>({ key: '', value: '' })
  const [agentMetadata, setAgentMetadata] = useState<AgentMetadata>({
    agentId: 0,
    metadata: [],
    existingMetadata: []
  })
  const [validation, setValidation] = useState<ValidationResult>({ isValid: true, message: '' })
  const [successMessage, setSuccessMessage] = useState<string>('')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [pinataStatus, setPinataStatus] = useState<{ checked: boolean; working: boolean; message: string }>({
    checked: false,
    working: false,
    message: '检查 Pinata 连接中...'
  })
  const [lastRefetchTime, setLastRefetchTime] = useState<number>(0)
  const [autoRefreshCount, setAutoRefreshCount] = useState<number>(0)
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false)

  const successMessageTimerRef = useRef<NodeJS.Timeout | null>(null)
  const validationMessageTimerRef = useRef<NodeJS.Timeout | null>(null)

  const {
    registerAgentWithMetadata,
    setMetadata,
    getMetadata,
    userAgents,
    currentAgentId,
    isRegistering,
    isConfirming,
    isConfirmed,
    isSettingMetadata,
    error,
    hash: transactionHash,
    resetState,
    refetchAgents,
    refetchCurrentAgentId
  } = useAgentRegistry()

  useEffect(() => {
    return () => {
      if (successMessageTimerRef.current) {
        clearTimeout(successMessageTimerRef.current)
        successMessageTimerRef.current = null
      }
      if (validationMessageTimerRef.current) {
        clearTimeout(validationMessageTimerRef.current)
        validationMessageTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const checkPinata = async () => {
      try {
        const result = await testPinataConnection()
        setPinataStatus({
          checked: true,
          working: result.success,
          message: result.message
        })
      } catch (error) {
        setPinataStatus({
          checked: true,
          working: false,
          message: `检查失败: ${error instanceof Error ? error.message : '未知错误'}`
        })
      }
    }

    if (showRegistrationForm) {
      checkPinata()
    }
  }, [showRegistrationForm])

  useEffect(() => {
    if (isConfirmed && transactionHash) {
      console.log('🎉 Agent 注册成功，启动多重自动刷新机制...')
      
      setSuccessMessage('Agent 注册成功！正在自动刷新数据...')
      setShowRegistrationForm(false)
      setRegistrationForm({
        tokenURI: '',
        metadata: []
      })
      setCurrentMetadata({ key: '', value: '' })

      if (successMessageTimerRef.current) {
        clearTimeout(successMessageTimerRef.current)
        successMessageTimerRef.current = null
      }

      const refreshIntervals = [1000, 3000, 5000]
      
      refreshIntervals.forEach((delay, index) => {
        setTimeout(() => {
          console.log(`🔄 第 ${index + 1} 次自动刷新...`)
          setAutoRefreshCount(prev => prev + 1)
          
          Promise.all([
            refetchAgents(),
            refetchCurrentAgentId()
          ]).then(() => {
            console.log(`✅ 第 ${index + 1} 次自动刷新完成`)
          }).catch(err => {
            console.error(`❌ 第 ${index + 1} 次自动刷新失败:`, err)
          })
        }, delay)
      })

      successMessageTimerRef.current = setTimeout(() => {
        setSuccessMessage('')
        resetState()
        successMessageTimerRef.current = null
      }, 3000)
    }
  }, [isConfirmed, transactionHash, resetState, refetchAgents, refetchCurrentAgentId])

  useEffect(() => {
    if (isConfirmed && transactionHash && showMetadataForm && !isSettingMetadata) {
      console.log('🎉 元数据更新成功，自动关闭弹框...')
      
      setSuccessMessage('元数据更新成功！正在刷新数据...')
      setShowMetadataForm(false)
      setSelectedAgentId(null)
      setAgentMetadata({
        agentId: 0,
        metadata: [],
        existingMetadata: []
      })
      setCurrentMetadata({ key: '', value: '' })
      
      const refreshIntervals = [1000, 3000]
      refreshIntervals.forEach((delay, index) => {
        setTimeout(() => {
          console.log(`🔄 第 ${index + 1} 次自动刷新元数据...`)
          if (selectedAgentId) {
            loadExistingMetadata(selectedAgentId)
          }
          refetchAgents()
        }, delay)
      })
      
      if (successMessageTimerRef.current) {
        clearTimeout(successMessageTimerRef.current)
        successMessageTimerRef.current = null
      }
      
      successMessageTimerRef.current = setTimeout(() => {
        setSuccessMessage('')
        resetState()
        successMessageTimerRef.current = null
      }, 3000)
    }
  }, [isConfirmed, transactionHash, showMetadataForm, isSettingMetadata, selectedAgentId, resetState, refetchAgents])

  useEffect(() => {
    if (autoRefreshCount > 0) {
      console.log(`🔄 自动刷新计数: ${autoRefreshCount}`)
    }
  }, [autoRefreshCount, userAgents.length, currentAgentId])

  useEffect(() => {
    if (error) {
      console.error('❌ Registration error:', error)
      setValidation({
        isValid: false,
        message: error.message || '注册失败，请重试'
      })
    }
  }, [error])

  const validateForm = (): ValidationResult => {
    if (!registrationForm.tokenURI.trim()) {
      return { isValid: false, message: 'Token URI 不能为空' }
    }

    if (registrationForm.metadata.length === 0) {
      return { isValid: false, message: '至少需要添加一条元数据' }
    }

    const hasName = registrationForm.metadata.some(meta => meta.key === 'name' && meta.value.trim())
    const hasDescription = registrationForm.metadata.some(meta => meta.key === 'description' && meta.value.trim())

    if (!hasName) {
      return { isValid: false, message: '必须包含名称 (name) 元数据' }
    }

    if (!hasDescription) {
      return { isValid: false, message: '必须包含描述 (description) 元数据' }
    }

    for (const meta of registrationForm.metadata) {
      if (!meta.key.trim() || !meta.value.trim()) {
        return { isValid: false, message: '元数据的键和值都不能为空' }
      }
    }

    return { isValid: true, message: '' }
  }

  useEffect(() => {
    const validationResult = validateForm()
    setValidation(validationResult)
  }, [registrationForm.tokenURI, registrationForm.metadata])

  const handleAddMetadata = () => {
    if (currentMetadata.key.trim() && currentMetadata.value.trim()) {
      setRegistrationForm(prev => ({
        ...prev,
        metadata: [...prev.metadata, { ...currentMetadata }]
      }))
      setCurrentMetadata({ key: '', value: '' })
    }
  }

  const handleRemoveMetadata = (index: number) => {
    setRegistrationForm(prev => ({
      ...prev,
      metadata: prev.metadata.filter((_, i) => i !== index)
    }))
  }

  const handleAddAgentMetadata = () => {
    if (currentMetadata.key.trim() && currentMetadata.value.trim()) {
      setAgentMetadata(prev => ({
        ...prev,
        metadata: [...prev.metadata, { ...currentMetadata }]
      }))
      setCurrentMetadata({ key: '', value: '' })
    }
  }

  const handleRemoveAgentMetadata = (index: number) => {
    setAgentMetadata(prev => ({
      ...prev,
      metadata: prev.metadata.filter((_, i) => i !== index)
    }))
  }

  const handleEditExistingMetadata = (index: number) => {
    const existingMeta = agentMetadata.existingMetadata[index]
    setCurrentMetadata({ key: existingMeta.key, value: existingMeta.value })
    setAgentMetadata(prev => ({
      ...prev,
      existingMetadata: prev.existingMetadata.filter((_, i) => i !== index),
      metadata: [...prev.metadata, existingMeta]
    }))
  }

  const handleRemoveExistingMetadata = (index: number) => {
    setAgentMetadata(prev => ({
      ...prev,
      existingMetadata: prev.existingMetadata.filter((_, i) => i !== index)
    }))
  }

  const handleManualRefresh = useCallback(async () => {
    const now = Date.now()
    if (now - lastRefetchTime < 3000) {
      console.log('⏰ 防重复调用：跳过手动刷新')
      return
    }
    
    console.log('🔄 执行手动刷新 Agent 列表和当前 Agent ID...')
    setLastRefetchTime(now)
    
    await Promise.all([
      refetchAgents(),
      refetchCurrentAgentId()
    ])
    
    console.log('✅ 手动刷新完成')
  }, [refetchAgents, refetchCurrentAgentId, lastRefetchTime, userAgents.length, currentAgentId])

  const handleFileUpload = async () => {
    if (isUploading) return

    try {
      setIsUploading(true)
      setUploadProgress(0)
      setValidation({ isValid: true, message: '' })

      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/jpeg,image/png,image/gif,image/webp'
      
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) return

        try {
          setUploadProgress(30)
          console.log('🔄 开始上传文件:', file.name)
          
          const cid = await uploadToIPFS(file)
          const ipfsUrl = getIPFSUrl(cid)
          
          setUploadProgress(100)
          setRegistrationForm(prev => ({ ...prev, tokenURI: ipfsUrl }))
          
          console.log('✅ 文件上传成功:', ipfsUrl)
          
          setValidation({
            isValid: true,
            message: `文件上传成功！IPFS CID: ${cid}`
          })
          
          if (validationMessageTimerRef.current) {
            clearTimeout(validationMessageTimerRef.current)
          }
          validationMessageTimerRef.current = setTimeout(() => {
            setValidation({ isValid: true, message: '' })
            validationMessageTimerRef.current = null
          }, 3000)
        } catch (error) {
          console.error('❌ 文件上传失败:', error)
          setValidation({
            isValid: false,
            message: `文件上传失败: ${error instanceof Error ? error.message : '未知错误'}`
          })
        } finally {
          setIsUploading(false)
          setUploadProgress(0)
        }
      }

      input.click()
    } catch (error) {
      console.error('❌ 上传处理错误:', error)
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  const handleMetadataUpload = async () => {
    if (isUploading || registrationForm.metadata.length === 0) return

    try {
      setIsUploading(true)
      setUploadProgress(0)
      setValidation({ isValid: true, message: '' })

      const metadataObject: Record<string, string> = {}
      registrationForm.metadata.forEach(meta => {
        metadataObject[meta.key] = meta.value
      })

      const agentMetadata = {
        name: `Agent Metadata - ${Date.now()}`,
        description: 'AI Agent Metadata',
        attributes: metadataObject,
        created: new Date().toISOString(),
        version: '1.0.0'
      }

      setUploadProgress(50)
      console.log('🔄 开始上传元数据:', agentMetadata)
      
      const cid = await uploadJSONToIPFS(agentMetadata)
      const ipfsUrl = getIPFSUrl(cid)
      
      setUploadProgress(100)
      setRegistrationForm(prev => ({ ...prev, tokenURI: ipfsUrl }))
      
      console.log('✅ 元数据上传成功:', ipfsUrl)
      
      setValidation({
        isValid: true,
        message: `元数据上传成功！IPFS CID: ${cid}`
      })
      
      if (validationMessageTimerRef.current) {
        clearTimeout(validationMessageTimerRef.current)
      }
      validationMessageTimerRef.current = setTimeout(() => {
        setValidation({ isValid: true, message: '' })
        validationMessageTimerRef.current = null
      }, 3000)
    } catch (error) {
      console.error('❌ 元数据上传失败:', error)
      setValidation({
        isValid: false,
        message: `元数据上传失败: ${error instanceof Error ? error.message : '未知错误'}`
      })
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!isConnected || !address) {
      setValidation({
        isValid: false,
        message: '请先连接钱包'
      })
      return
    }

    const validationResult = validateForm()
    if (!validationResult.isValid) {
      setValidation(validationResult)
      return
    }

    try {
      setValidation({ isValid: true, message: '' })
      console.log('🔄 开始提交注册表单...')
      
      await registerAgentWithMetadata(
        registrationForm.tokenURI,
        registrationForm.metadata
      )
      
      console.log('✅ 注册交易已提交，等待确认...')
      
    } catch (error) {
      console.error('❌ Registration failed:', error)
    }
  }

  const loadExistingMetadata = async (agentId: number) => {
    if (!agentId) return
    
    setIsLoadingMetadata(true)
    try {
      const commonKeys = ['name', 'description', 'version', 'tag', 'prompt', 'created_at', 'updated_at']
      const existingMetadata: MetadataEntry[] = []
      
      for (const key of commonKeys) {
        try {
          const value = await getMetadata(agentId, key)
          if (value && value.trim()) {
            existingMetadata.push({ key, value })
          }
        } catch (error) {
          console.log(`Metadata key "${key}" not found for agent ${agentId}`)
        }
      }
      
      setAgentMetadata(prev => ({
        ...prev,
        existingMetadata
      }))
    } catch (error) {
      console.error('Failed to load existing metadata:', error)
    } finally {
      setIsLoadingMetadata(false)
    }
  }

  const handleMetadataSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!isConnected || !address) {
      setValidation({
        isValid: false,
        message: '请先连接钱包'
      })
      return
    }

    if (!selectedAgentId) {
      setValidation({
        isValid: false,
        message: '请选择 Agent'
      })
      return
    }

    if (agentMetadata.metadata.length === 0 && agentMetadata.existingMetadata.length === 0) {
      setValidation({
        isValid: false,
        message: '没有需要保存的元数据'
      })
      return
    }

    try {
      setValidation({ isValid: true, message: '' })
      
      for (const meta of agentMetadata.metadata) {
        if (meta.key.trim() && meta.value.trim()) {
          await setMetadata(selectedAgentId, meta.key, meta.value)
        }
      }
      
    } catch (error) {
      console.error('Metadata update failed:', error)
    }
  }

  const handleCancel = () => {
    setShowRegistrationForm(false)
    setRegistrationForm({
      tokenURI: '',
      metadata: []
    })
    setCurrentMetadata({ key: '', value: '' })
    setValidation({ isValid: true, message: '' })
    resetState()
    setIsUploading(false)
    setUploadProgress(0)
    
    if (successMessageTimerRef.current) {
      clearTimeout(successMessageTimerRef.current)
      successMessageTimerRef.current = null
    }
    if (validationMessageTimerRef.current) {
      clearTimeout(validationMessageTimerRef.current)
      validationMessageTimerRef.current = null
    }
  }

  const handleMetadataCancel = () => {
    setShowMetadataForm(false)
    setSelectedAgentId(null)
    setAgentMetadata({
      agentId: 0,
      metadata: [],
      existingMetadata: []
    })
    setCurrentMetadata({ key: '', value: '' })
    setValidation({ isValid: true, message: '' })
    resetState()
  }

  const handleEditMetadata = async (agentId: number) => {
    try {
      console.log('🔄 打开元数据编辑表单，Agent ID:', agentId)
      setSelectedAgentId(agentId)
      setAgentMetadata({
        agentId,
        metadata: [],
        existingMetadata: []
      })
      setShowMetadataForm(true)
      setValidation({ isValid: true, message: '' })
      
      await loadExistingMetadata(agentId)
      console.log('✅ 元数据编辑表单已打开')
    } catch (error) {
      console.error('❌ 打开元数据编辑表单失败:', error)
      setValidation({
        isValid: false,
        message: `打开元数据编辑表单失败: ${error instanceof Error ? error.message : '未知错误'}`
      })
    }
  }

  const formatAgentId = (agentId: number) => {
    return `#${agentId}`
  }

  const isFormLoading = isRegistering || isConfirming || isUploading
  const isFormDisabled = isFormLoading || !validation.isValid

  const uniqueUserAgents = Array.from(new Set(userAgents))

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Agent 注册</h2>
          <p className="text-gray-600 mt-1">注册新的 Agent 来开始提供服务</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={handleManualRefresh}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50 transition-colors"
            disabled={!isConnected}
          >
            <RefreshCw className="w-4 h-4" />
            刷新列表
          </button>
          <button
            onClick={() => setShowRegistrationForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 transition-colors font-medium"
            disabled={!isConnected}
          >
            <Plus className="w-4 h-4" />
            注册新 Agent
          </button>
        </div>
      </div>

      {/* 连接状态提示 */}
      {!isConnected && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
          <div className="flex items-center gap-2 text-yellow-800">
            <Key className="w-4 h-4" />
            <span>请先连接钱包以注册 Agent</span>
          </div>
        </div>
      )}

      {/* 成功消息 */}
      {successMessage && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
          <div className="flex items-center gap-2 text-green-800">
            <CheckCircle className="w-4 h-4" />
            <span>{successMessage}</span>
          </div>
          {transactionHash && (
            <p className="text-xs text-green-600 mt-1 font-mono break-all">
              交易哈希: {transactionHash}
            </p>
          )}
        </div>
      )}

      {/* 现有 Agents 统计 */}
      {isConnected && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center">
              <Server className="w-8 h-8 text-blue-600 mr-4" />
              <div>
                <p className="text-sm font-medium text-gray-600">已注册 Agents</p>
                <p className="text-2xl font-bold text-gray-900">{uniqueUserAgents.length}</p>
                {userAgents.length !== uniqueUserAgents.length && (
                  <p className="text-xs text-orange-600 mt-1">
                    检测到重复数据，已自动去重
                  </p>
                )}
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center">
              <User className="w-8 h-8 text-green-600 mr-4" />
              <div>
                <p className="text-sm font-medium text-gray-600">当前 Agent ID</p>
                <p className="text-2xl font-bold text-gray-900">
                  {currentAgentId > 0 ? formatAgentId(currentAgentId) : '无'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  最新注册的 Agent ID
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center">
              <Settings className="w-8 h-8 text-purple-600 mr-4" />
              <div>
                <p className="text-sm font-medium text-gray-600">注册状态</p>
                <p className="text-2xl font-bold text-gray-900">
                  {isRegistering ? '注册中...' : isConfirming ? '确认中...' : '就绪'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 现有 Agents 列表 */}
      {isConnected && uniqueUserAgents.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-6 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">我的 Agents</h3>
            <div className="text-sm text-gray-500">
              共 {uniqueUserAgents.length} 个 Agent
              {userAgents.length !== uniqueUserAgents.length && (
                <span className="text-orange-600 ml-2">
                  (原始数据: {userAgents.length} 个)
                </span>
              )}
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Agent ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    状态
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {uniqueUserAgents.map((agentId) => (
                  <tr key={agentId}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatAgentId(agentId)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                        已注册
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditMetadata(agentId)}
                          className="text-blue-600 hover:text-blue-900 flex items-center gap-1 px-3 py-1 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                          title="编辑元数据"
                        >
                          <FileText className="w-4 h-4" />
                          编辑元数据
                        </button>
                        <button
                          onClick={handleManualRefresh}
                          className="text-gray-600 hover:text-gray-900 flex items-center gap-1 px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                          title="刷新"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 无 Agents 的提示 */}
      {isConnected && uniqueUserAgents.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
          <Server className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-2">暂无注册的 Agent</p>
          <p className="text-sm text-gray-500 mb-4">注册您的第一个 Agent 来开始提供服务</p>
          <button
            onClick={() => setShowRegistrationForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            注册第一个 Agent
          </button>
        </div>
      )}

      {/* 注册表单弹窗 */}
      {showRegistrationForm && (
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
                  注册新 Agent
                </h3>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Pinata 状态检查 */}
                <div className={`p-4 rounded-xl border ${
                  !pinataStatus.checked 
                    ? 'bg-blue-50 border-blue-200' 
                    : pinataStatus.working 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-red-50 border-red-200'
                }`}>
                  <div className="flex items-center gap-3">
                    {!pinataStatus.checked ? (
                      <>
                        <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse" />
                        <span className="text-sm text-blue-800">{pinataStatus.message}</span>
                      </>
                    ) : pinataStatus.working ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span className="text-sm text-green-800">{pinataStatus.message}</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-red-600" />
                        <span className="text-sm text-red-800">{pinataStatus.message}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Token URI 输入 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Token URI *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={registrationForm.tokenURI}
                      onChange={(e) => setRegistrationForm(prev => ({ ...prev, tokenURI: e.target.value }))}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                      placeholder="https://gateway.pinata.cloud/ipfs/Qm..."
                      disabled={isFormLoading}
                    />
                    <button
                      type="button"
                      onClick={handleFileUpload}
                      className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2 text-sm disabled:opacity-50 transition-colors"
                      disabled={isFormLoading || !pinataStatus.working}
                    >
                      <Upload className="w-4 h-4" />
                      {isUploading ? '上传中...' : '上传文件'}
                    </button>
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    <Info className="w-3 h-3 text-gray-400" />
                    <p className="text-xs text-gray-500">
                      输入 Token 元数据的 URI 地址，或点击上传按钮上传文件到 IPFS
                    </p>
                  </div>

                  {/* 上传进度 */}
                  {isUploading && uploadProgress > 0 && (
                    <div className="mt-3">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-600 mt-1 text-center">
                        上传进度: {uploadProgress}%
                      </p>
                    </div>
                  )}
                </div>

                {/* 元数据管理 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    元数据
                  </label>
                  
                  {/* 元数据说明 */}
                  <div className="bg-blue-50 rounded-xl p-4 mb-4">
                    <div className="flex items-center gap-2 text-blue-800 mb-2">
                      <Info className="w-4 h-4" />
                      <span className="text-sm font-medium">元数据字段说明</span>
                    </div>
                    <div className="text-sm text-blue-700 space-y-1">
                      <p><strong>必填项:</strong></p>
                      <ul className="list-disc list-inside ml-2">
                        <li><strong>name</strong> - Agent 名称</li>
                        <li><strong>description</strong> - Agent 描述</li>
                      </ul>
                      <p className="mt-2"><strong>选填项:</strong></p>
                      <ul className="list-disc list-inside ml-2">
                        <li><strong>tag</strong> - 标签</li>
                        <li><strong>version</strong> - 版本号</li>
                        <li><strong>prompt</strong> - 提示词</li>
                      </ul>
                    </div>
                  </div>
                  
                  {/* 添加元数据表单 */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <input
                        type="text"
                        value={currentMetadata.key}
                        onChange={(e) => setCurrentMetadata(prev => ({ ...prev, key: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                        placeholder="键名（如：name、description、tag等）"
                        disabled={isFormLoading}
                      />
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={currentMetadata.value}
                        onChange={(e) => setCurrentMetadata(prev => ({ ...prev, value: e.target.value }))}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                        placeholder="值"
                        disabled={isFormLoading}
                      />
                      <button
                        type="button"
                        onClick={handleAddMetadata}
                        className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        disabled={isFormLoading || !currentMetadata.key.trim() || !currentMetadata.value.trim()}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* 元数据列表 */}
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {registrationForm.metadata.map((meta, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex-1 grid grid-cols-2 gap-3">
                          <div className={`text-sm font-medium px-2 py-1 rounded border ${
                            ['name', 'description'].includes(meta.key) 
                              ? 'bg-red-50 text-red-900 border-red-200' 
                              : 'bg-white text-gray-900 border-gray-200'
                          }`}>
                            {meta.key}
                            {['name', 'description'].includes(meta.key) && (
                              <span className="text-xs text-red-600 ml-1">*</span>
                            )}
                          </div>
                          <div className="text-sm text-gray-600 bg-white px-2 py-1 rounded border border-gray-200">
                            {meta.value}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveMetadata(index)}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                          disabled={isFormLoading}
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {registrationForm.metadata.length === 0 && (
                    <div className="text-center py-4 border-2 border-dashed border-gray-300 rounded-lg">
                      <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">暂无元数据</p>
                      <p className="text-xs text-gray-400 mt-1">请添加必填的 name 和 description 字段</p>
                    </div>
                  )}

                  {/* 元数据上传按钮 */}
                  {registrationForm.metadata.length > 0 && (
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={handleMetadataUpload}
                        className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                        disabled={isFormLoading || !pinataStatus.working}
                      >
                        <Upload className="w-4 h-4" />
                        {isUploading ? '上传元数据中...' : '上传元数据到 IPFS'}
                      </button>
                      <div className="flex items-center gap-1 mt-2">
                        <Info className="w-3 h-3 text-gray-400" />
                        <p className="text-xs text-gray-500">
                          将元数据上传到 IPFS 并自动填充 Token URI
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* 费用信息 */}
                <div className="bg-blue-50 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-blue-800 mb-2">
                    <Link className="w-4 h-4" />
                    <span className="text-sm font-medium">注册费用</span>
                  </div>
                  <p className="text-sm text-blue-700">
                    注册 Agent 需要支付 0.001 ETH 作为网络费用。此费用用于确保网络安全和防止垃圾注册。
                  </p>
                </div>

                {/* 交易状态显示 */}
                {(isRegistering || isConfirming || transactionHash) && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <div className="flex items-center gap-3">
                      {isConfirming ? (
                        <>
                          <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-blue-800">交易确认中...</p>
                            <p className="text-xs text-blue-600">请等待交易在区块链上确认</p>
                          </div>
                        </>
                      ) : isRegistering ? (
                        <>
                          <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-blue-800">提交交易中...</p>
                            <p className="text-xs text-blue-600">正在向区块链提交注册请求</p>
                          </div>
                        </>
                      ) : null}
                    </div>
                    
                    {transactionHash && (
                      <div className="mt-2">
                        <p className="text-xs text-blue-600 font-mono break-all">
                          交易哈希: {transactionHash}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* 验证错误 */}
                {!validation.isValid && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center gap-2 text-red-700">
                      <XCircle className="w-4 h-4" />
                      <span className="text-sm">{validation.message}</span>
                    </div>
                  </div>
                )}

                {/* 成功消息 */}
                {validation.isValid && validation.message && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2 text-green-700">
                      <CheckCircle className="w-4 h-4" />
                      <span className="text-sm">{validation.message}</span>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    disabled={isFormLoading}
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={isFormDisabled || !pinataStatus.working}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    {isFormLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        {isConfirming ? '确认中...' : 
                         isUploading ? '上传中...' : '注册中...'}
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        注册 Agent
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 元数据编辑表单弹窗 */}
      {showMetadataForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-semibold text-gray-900">
                  编辑 Agent #{selectedAgentId} 元数据
                </h3>
                <button
                  onClick={handleMetadataCancel}
                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                  disabled={isSettingMetadata || isConfirming}
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleMetadataSubmit} className="space-y-6">
                {/* 元数据说明 */}
                <div className="bg-blue-50 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-blue-800 mb-2">
                    <Info className="w-4 h-4" />
                    <span className="text-sm font-medium">元数据说明</span>
                  </div>
                  <p className="text-sm text-blue-700">
                    元数据用于存储 Agent 的附加信息，如名称、描述、版本等。这些信息将永久存储在区块链上。
                    <strong className="block mt-1">注意：Token URI 是 ERC721 标准的一部分，无法通过此界面修改。</strong>
                  </p>
                </div>

                {/* 现有元数据显示 */}
                {agentMetadata.existingMetadata.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      现有元数据
                    </label>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {agentMetadata.existingMetadata.map((meta, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200"
                        >
                          <div className="flex-1 grid grid-cols-2 gap-3">
                            <div className="text-sm font-medium text-gray-900 bg-white px-2 py-1 rounded border">
                              {meta.key}
                            </div>
                            <div className="text-sm text-gray-600 bg-white px-2 py-1 rounded border">
                              {meta.value}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleEditExistingMetadata(index)}
                              className="p-1 text-blue-400 hover:text-blue-600 transition-colors"
                              title="编辑此元数据"
                              disabled={isSettingMetadata || isConfirming}
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveExistingMetadata(index)}
                              className="p-1 text-red-400 hover:text-red-600 transition-colors"
                              title="删除此元数据"
                              disabled={isSettingMetadata || isConfirming}
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 加载状态 */}
                {isLoadingMetadata && (
                  <div className="flex items-center justify-center py-4">
                    <div className="flex items-center gap-2 text-gray-600">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      加载现有元数据中...
                    </div>
                  </div>
                )}

                {/* 添加/修改元数据表单 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    {currentMetadata.key ? '修改元数据' : '添加新元数据'}
                  </label>
                  
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <input
                        type="text"
                        value={currentMetadata.key}
                        onChange={(e) => setCurrentMetadata(prev => ({ ...prev, key: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                        placeholder="键名 (例如: name, description, tag, version, prompt)"
                        disabled={isSettingMetadata || isConfirming}
                      />
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={currentMetadata.value}
                        onChange={(e) => setCurrentMetadata(prev => ({ ...prev, value: e.target.value }))}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                        placeholder="值"
                        disabled={isSettingMetadata || isConfirming}
                      />
                      <button
                        type="button"
                        onClick={handleAddAgentMetadata}
                        className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        disabled={(isSettingMetadata || isConfirming) || !currentMetadata.key.trim() || !currentMetadata.value.trim()}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* 待保存的元数据列表 */}
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {agentMetadata.metadata.map((meta, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 p-3 bg-yellow-50 rounded-lg border border-yellow-200"
                      >
                        <div className="flex-1 grid grid-cols-2 gap-3">
                          <div className="text-sm font-medium text-gray-900 bg-white px-2 py-1 rounded border">
                            {meta.key}
                          </div>
                          <div className="text-sm text-gray-600 bg-white px-2 py-1 rounded border">
                            {meta.value}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveAgentMetadata(index)}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                          disabled={isSettingMetadata || isConfirming}
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {agentMetadata.metadata.length === 0 && (
                    <div className="text-center py-4 border-2 border-dashed border-gray-300 rounded-lg">
                      <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">暂无待保存的元数据</p>
                    </div>
                  )}
                </div>

                {/* 交易状态显示 */}
                {(isSettingMetadata || isConfirming || transactionHash) && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <div className="flex items-center gap-3">
                      {isConfirming ? (
                        <>
                          <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-blue-800">交易确认中...</p>
                            <p className="text-xs text-blue-600">请等待交易在区块链上确认</p>
                          </div>
                        </>
                      ) : isSettingMetadata ? (
                        <>
                          <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-blue-800">提交交易中...</p>
                            <p className="text-xs text-blue-600">正在向区块链提交元数据更新请求</p>
                          </div>
                        </>
                      ) : null}
                    </div>
                    
                    {transactionHash && (
                      <div className="mt-2">
                        <p className="text-xs text-blue-600 font-mono break-all">
                          交易哈希: {transactionHash}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* 验证错误 */}
                {!validation.isValid && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center gap-2 text-red-700">
                      <XCircle className="w-4 h-4" />
                      <span className="text-sm">{validation.message}</span>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={handleMetadataCancel}
                    className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    disabled={isSettingMetadata || isConfirming}
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={isSettingMetadata || isConfirming}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    {isSettingMetadata || isConfirming ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        {isConfirming ? '确认中...' : '保存中...'}
                      </>
                    ) : (
                      <>
                        <FileText className="w-4 h-4" />
                        保存元数据
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
      {error && !showRegistrationForm && !showMetadataForm && (
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


