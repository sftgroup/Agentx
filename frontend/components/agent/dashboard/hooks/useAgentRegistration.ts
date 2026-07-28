// components/agent/dashboard/hooks/useAgentRegistration.ts
// AgentRegistration 状态管理与业务逻辑
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAccount } from 'wagmi'
import { useOnChainAgentRegistry as useAgentRegistry } from '../../hooks/useAgentRegistry'
import { uploadJSONToIPFS, uploadToIPFS, getIPFSUrl, testPinataConnection } from '@/lib/ipfs'

export interface MetadataEntry {
  key: string
  value: string
}

interface RegistrationForm {
  tokenURI: string
  metadata: MetadataEntry[]
}

interface ValidationResult {
  isValid: boolean
  message: string
}

interface AgentMetadata {
  agentId: number
  metadata: MetadataEntry[]
  existingMetadata: MetadataEntry[]
}

interface PinataStatus {
  checked: boolean
  working: boolean
  message: string
}

const DEFAULT_REGISTRATION: RegistrationForm = { tokenURI: '', metadata: [] }
const DEFAULT_AGENT_META: AgentMetadata = { agentId: 0, metadata: [], existingMetadata: [] }
const DEFAULT_PINATA: PinataStatus = { checked: false, working: false, message: '检查 Pinata 连接中...' }

export function useAgentRegistration() {
  const { address, isConnected } = useAccount()
  const [showRegistrationForm, setShowRegistrationForm] = useState(false)
  const [showMetadataForm, setShowMetadataForm] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null)
  const [registrationForm, setRegistrationForm] = useState<RegistrationForm>(DEFAULT_REGISTRATION)
  const [currentMetadata, setCurrentMetadata] = useState<MetadataEntry>({ key: '', value: '' })
  const [agentMetadata, setAgentMetadata] = useState<AgentMetadata>(DEFAULT_AGENT_META)
  const [validation, setValidation] = useState<ValidationResult>({ isValid: true, message: '' })
  const [successMessage, setSuccessMessage] = useState<string>('')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [pinataStatus, setPinataStatus] = useState<PinataStatus>(DEFAULT_PINATA)
  const [lastRefetchTime, setLastRefetchTime] = useState<number>(0)
  const [autoRefreshCount, setAutoRefreshCount] = useState<number>(0)
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false)

  const successMessageTimerRef = useRef<NodeJS.Timeout | null>(null)
  const validationMessageTimerRef = useRef<NodeJS.Timeout | null>(null)

  const {
    registerAgentWithMetadata, setMetadata, getMetadata, userAgents,
    currentAgentId, isRegistering, isConfirming, isConfirmed, isSettingMetadata,
    error, hash: transactionHash, resetState, refetchAgents, refetchCurrentAgentId
  } = useAgentRegistry()

  // ---- Cleanup ----
  useEffect(() => {
    return () => {
      if (successMessageTimerRef.current) { clearTimeout(successMessageTimerRef.current); successMessageTimerRef.current = null }
      if (validationMessageTimerRef.current) { clearTimeout(validationMessageTimerRef.current); validationMessageTimerRef.current = null }
    }
  }, [])

  // ---- Pinata check ----
  useEffect(() => {
    if (!showRegistrationForm) return
    const checkPinata = async () => {
      try {
        const result = await testPinataConnection()
        setPinataStatus({ checked: true, working: result.success, message: result.message })
      } catch (err) {
        setPinataStatus({ checked: true, working: false, message: `检查失败: ${err instanceof Error ? err.message : '未知错误'}` })
      }
    }
    checkPinata()
  }, [showRegistrationForm])

  // ---- Registration confirmation ----
  useEffect(() => {
    if (!isConfirmed || !transactionHash) return
    console.log('🎉 Agent 注册成功，启动多重自动刷新机制...')
    setSuccessMessage('Agent 注册成功！正在自动刷新数据...')
    setShowRegistrationForm(false)
    setRegistrationForm(DEFAULT_REGISTRATION)
    setCurrentMetadata({ key: '', value: '' })

    if (successMessageTimerRef.current) { clearTimeout(successMessageTimerRef.current); successMessageTimerRef.current = null }

    ;[1000, 3000, 5000].forEach((delay, index) => {
      setTimeout(() => {
        setAutoRefreshCount(prev => prev + 1)
        Promise.all([refetchAgents(), refetchCurrentAgentId()]).catch(err =>
          console.error(`❌ 第 ${index + 1} 次自动刷新失败:`, err))
      }, delay)
    })

    successMessageTimerRef.current = setTimeout(() => {
      setSuccessMessage('')
      resetState()
      successMessageTimerRef.current = null
    }, 3000)
  }, [isConfirmed, transactionHash, resetState, refetchAgents, refetchCurrentAgentId])

  // ---- Metadata update confirmation ----
  useEffect(() => {
    if (!isConfirmed || !transactionHash || !showMetadataForm || isSettingMetadata) return
    console.log('🎉 元数据更新成功，自动关闭弹框...')
    setSuccessMessage('元数据更新成功！正在刷新数据...')
    setShowMetadataForm(false)
    setSelectedAgentId(null)
    setAgentMetadata(DEFAULT_AGENT_META)
    setCurrentMetadata({ key: '', value: '' })

    ;[1000, 3000].forEach((delay) => {
      setTimeout(() => {
        if (selectedAgentId) { loadExistingMetadataSilent(selectedAgentId) }
        refetchAgents()
      }, delay)
    })

    if (successMessageTimerRef.current) { clearTimeout(successMessageTimerRef.current); successMessageTimerRef.current = null }
    successMessageTimerRef.current = setTimeout(() => {
      setSuccessMessage('')
      resetState()
      successMessageTimerRef.current = null
    }, 3000)
  }, [isConfirmed, transactionHash, showMetadataForm, isSettingMetadata])
  // selectedAgentId intentional stale closure — used for inline loadExistingMetadata call

  // ---- Error handling ----
  useEffect(() => {
    if (error) {
      console.error('❌ Registration error:', error)
      setValidation({ isValid: false, message: error.message || '注册失败，请重试' })
    }
  }, [error])

  // ---- Validation ----
  const validateForm = useCallback((): ValidationResult => {
    if (!registrationForm.tokenURI.trim()) return { isValid: false, message: 'Token URI 不能为空' }
    if (registrationForm.metadata.length === 0) return { isValid: false, message: '至少需要添加一条元数据' }
    const hasName = registrationForm.metadata.some(meta => meta.key === 'name' && meta.value.trim())
    const hasDescription = registrationForm.metadata.some(meta => meta.key === 'description' && meta.value.trim())
    if (!hasName) return { isValid: false, message: '必须包含名称 (name) 元数据' }
    if (!hasDescription) return { isValid: false, message: '必须包含描述 (description) 元数据' }
    for (const meta of registrationForm.metadata) {
      if (!meta.key.trim() || !meta.value.trim()) return { isValid: false, message: '元数据的键和值都不能为空' }
    }
    return { isValid: true, message: '' }
  }, [registrationForm.tokenURI, registrationForm.metadata])

  useEffect(() => {
    setValidation(validateForm())
  }, [validateForm])

  // ---- Metadata handlers ----
  const handleAddMetadata = useCallback(() => {
    if (currentMetadata.key.trim() && currentMetadata.value.trim()) {
      setRegistrationForm(prev => ({ ...prev, metadata: [...prev.metadata, { ...currentMetadata }] }))
      setCurrentMetadata({ key: '', value: '' })
    }
  }, [currentMetadata])

  const handleRemoveMetadata = useCallback((index: number) => {
    setRegistrationForm(prev => ({ ...prev, metadata: prev.metadata.filter((_, i) => i !== index) }))
  }, [])

  const handleAddAgentMetadata = useCallback(() => {
    if (currentMetadata.key.trim() && currentMetadata.value.trim()) {
      setAgentMetadata(prev => ({ ...prev, metadata: [...prev.metadata, { ...currentMetadata }] }))
      setCurrentMetadata({ key: '', value: '' })
    }
  }, [currentMetadata])

  const handleRemoveAgentMetadata = useCallback((index: number) => {
    setAgentMetadata(prev => ({ ...prev, metadata: prev.metadata.filter((_, i) => i !== index) }))
  }, [])

  const handleEditExistingMetadata = useCallback((index: number) => {
    const existingMeta = agentMetadata.existingMetadata[index]
    setCurrentMetadata({ key: existingMeta.key, value: existingMeta.value })
    setAgentMetadata(prev => ({
      ...prev,
      existingMetadata: prev.existingMetadata.filter((_, i) => i !== index),
      metadata: [...prev.metadata, existingMeta]
    }))
  }, [agentMetadata.existingMetadata])

  const handleRemoveExistingMetadata = useCallback((index: number) => {
    setAgentMetadata(prev => ({ ...prev, existingMetadata: prev.existingMetadata.filter((_, i) => i !== index) }))
  }, [])

  // ---- File Upload ----
  const handleFileUpload = useCallback(async () => {
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
          const cid = await uploadToIPFS(file)
          const ipfsUrl = getIPFSUrl(cid)
          setUploadProgress(100)
          setRegistrationForm(prev => ({ ...prev, tokenURI: ipfsUrl }))
          setValidation({ isValid: true, message: `文件上传成功！IPFS CID: ${cid}` })
          if (validationMessageTimerRef.current) { clearTimeout(validationMessageTimerRef.current) }
          validationMessageTimerRef.current = setTimeout(() => {
            setValidation({ isValid: true, message: '' })
            validationMessageTimerRef.current = null
          }, 3000)
        } catch (err) {
          setValidation({ isValid: false, message: `文件上传失败: ${err instanceof Error ? err.message : '未知错误'}` })
        } finally {
          setIsUploading(false)
          setUploadProgress(0)
        }
      }
      input.click()
    } catch (err) {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }, [isUploading])

  const handleMetadataUpload = useCallback(async () => {
    if (isUploading || registrationForm.metadata.length === 0) return
    try {
      setIsUploading(true)
      setUploadProgress(0)
      setValidation({ isValid: true, message: '' })

      const metadataObject: Record<string, string> = {}
      registrationForm.metadata.forEach(meta => { metadataObject[meta.key] = meta.value })

      const agentMeta = {
        name: `Agent Metadata - ${Date.now()}`,
        description: 'AI Agent Metadata',
        attributes: metadataObject,
        created: new Date().toISOString(),
        version: '1.0.0'
      }

      setUploadProgress(50)
      const cid = await uploadJSONToIPFS(agentMeta)
      const ipfsUrl = getIPFSUrl(cid)
      setUploadProgress(100)
      setRegistrationForm(prev => ({ ...prev, tokenURI: ipfsUrl }))
      setValidation({ isValid: true, message: `元数据上传成功！IPFS CID: ${cid}` })

      if (validationMessageTimerRef.current) { clearTimeout(validationMessageTimerRef.current) }
      validationMessageTimerRef.current = setTimeout(() => {
        setValidation({ isValid: true, message: '' })
        validationMessageTimerRef.current = null
      }, 3000)
    } catch (err) {
      setValidation({ isValid: false, message: `元数据上传失败: ${err instanceof Error ? err.message : '未知错误'}` })
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }, [isUploading, registrationForm.metadata])

  // ---- Submit handlers ----
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isConnected || !address) { setValidation({ isValid: false, message: '请先连接钱包' }); return }
    const vr = validateForm()
    if (!vr.isValid) { setValidation(vr); return }
    try {
      setValidation({ isValid: true, message: '' })
      await registerAgentWithMetadata(registrationForm.tokenURI, registrationForm.metadata)
    } catch (err) {
      console.error('❌ Registration failed:', err)
    }
  }, [isConnected, address, registrationForm, validateForm, registerAgentWithMetadata])

  const loadExistingMetadata = useCallback(async (agentId: number) => {
    if (!agentId) return
    setIsLoadingMetadata(true)
    try {
      const commonKeys = ['name', 'description', 'version', 'tag', 'prompt', 'created_at', 'updated_at']
      const existingMeta: MetadataEntry[] = []
      for (const key of commonKeys) {
        try {
          const value = await getMetadata(agentId, key)
          if (value && value.trim()) { existingMeta.push({ key, value }) }
        } catch { /* key not found, skip */ }
      }
      setAgentMetadata(prev => ({ ...prev, existingMetadata: existingMeta }))
    } catch (err) {
      console.error('Failed to load existing metadata:', err)
    } finally {
      setIsLoadingMetadata(false)
    }
  }, [getMetadata])

  const loadExistingMetadataSilent = useCallback((agentId: number) => {
    loadExistingMetadata(agentId).catch(console.error)
  }, [loadExistingMetadata])

  const handleMetadataSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isConnected || !address) { setValidation({ isValid: false, message: '请先连接钱包' }); return }
    if (!selectedAgentId) { setValidation({ isValid: false, message: '请选择 Agent' }); return }
    if (agentMetadata.metadata.length === 0 && agentMetadata.existingMetadata.length === 0) {
      setValidation({ isValid: false, message: '没有需要保存的元数据' }); return
    }
    try {
      setValidation({ isValid: true, message: '' })
      for (const meta of agentMetadata.metadata) {
        if (meta.key.trim() && meta.value.trim()) { await setMetadata(selectedAgentId, meta.key, meta.value) }
      }
    } catch (err) {
      console.error('Metadata update failed:', err)
    }
  }, [isConnected, address, selectedAgentId, agentMetadata, setMetadata])

  // ---- Cancel / Edit ----
  const handleCancel = useCallback(() => {
    setShowRegistrationForm(false)
    setRegistrationForm(DEFAULT_REGISTRATION)
    setCurrentMetadata({ key: '', value: '' })
    setValidation({ isValid: true, message: '' })
    resetState()
    setIsUploading(false)
    setUploadProgress(0)
    if (successMessageTimerRef.current) { clearTimeout(successMessageTimerRef.current); successMessageTimerRef.current = null }
    if (validationMessageTimerRef.current) { clearTimeout(validationMessageTimerRef.current); validationMessageTimerRef.current = null }
  }, [resetState])

  const handleMetadataCancel = useCallback(() => {
    setShowMetadataForm(false)
    setSelectedAgentId(null)
    setAgentMetadata(DEFAULT_AGENT_META)
    setCurrentMetadata({ key: '', value: '' })
    setValidation({ isValid: true, message: '' })
    resetState()
  }, [resetState])

  const handleEditMetadata = useCallback(async (agentId: number) => {
    setSelectedAgentId(agentId)
    setAgentMetadata({ agentId, metadata: [], existingMetadata: [] })
    setShowMetadataForm(true)
    setValidation({ isValid: true, message: '' })
    await loadExistingMetadata(agentId)
  }, [loadExistingMetadata])

  const handleManualRefresh = useCallback(async () => {
    const now = Date.now()
    if (now - lastRefetchTime < 3000) return
    setLastRefetchTime(now)
    await Promise.all([refetchAgents(), refetchCurrentAgentId()])
  }, [refetchAgents, refetchCurrentAgentId, lastRefetchTime])

  // ---- Utilities ----
  const formatAgentId = useCallback((agentId: number) => `#${agentId}`, [])

  // ---- Computed ----
  const isFormLoading = isRegistering || isConfirming || isUploading
  const isFormDisabled = isFormLoading || !validation.isValid
  const uniqueUserAgents = Array.from(new Set(userAgents))

  return {
    // State
    showRegistrationForm, showMetadataForm, selectedAgentId, registrationForm,
    currentMetadata, agentMetadata, validation, successMessage, isUploading,
    uploadProgress, pinataStatus, isLoadingMetadata, isConnected, address,
    userAgents, currentAgentId, isRegistering, isConfirming, isConfirmed,
    isSettingMetadata, error, transactionHash, uniqueUserAgents,
    // Setters
    setShowRegistrationForm, setShowMetadataForm, setRegistrationForm,
    setCurrentMetadata, setValidation, setSuccessMessage,
    // Handlers
    handleAddMetadata, handleRemoveMetadata, handleAddAgentMetadata,
    handleRemoveAgentMetadata, handleEditExistingMetadata, handleRemoveExistingMetadata,
    handleFileUpload, handleMetadataUpload, handleSubmit, handleMetadataSubmit,
    handleCancel, handleMetadataCancel, handleEditMetadata, handleManualRefresh,
    loadExistingMetadata,
    // Computed
    isFormLoading, isFormDisabled,
    // Utilities
    formatAgentId, resetState, refetchAgents, refetchCurrentAgentId,
  }
}
