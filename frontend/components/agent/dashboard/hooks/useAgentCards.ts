// components/agent/dashboard/hooks/useAgentCards.ts
// AgentCardManager 状态管理与业务逻辑
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAccount } from 'wagmi'
import {
  useA2AProtocol,
  type AgentCard,
  type AgentSkill,
  type A2ASkill
} from '../../hooks/useA2AProtocol'
import { useOnChainAgentRegistry as useAgentRegistry } from '../../hooks/useAgentRegistry'

interface AgentCardForm {
  name: string
  description: string
  version: string
  capabilities: string[]
  supportedTasks: string[]
  communicationProtocol: string
  authenticationMethod: string
  cardURI: string
}

interface ValidationResult {
  isValid: boolean
  message: string
}

interface SkillConfigForm {
  skillId: number
  skillEndpoint: string
  version: string
  price: number
  priceToken: string
}

const uploadJSONToIPFS = async (metadata: any): Promise<string> => {
  try {
    const response = await fetch('/api/ipfs/upload-json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || '卡片元数据上传失败')
    }

    const data = await response.json()
    return data.IpfsHash
  } catch (error) {
    console.error('IPFS卡片上传失败:', error)
    throw new Error(`卡片上传失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}

const DEFAULT_FORM: AgentCardForm = {
  name: '',
  description: '',
  version: '1.0.0',
  capabilities: [],
  supportedTasks: [],
  communicationProtocol: 'HTTP',
  authenticationMethod: 'API Key',
  cardURI: ''
}

const DEFAULT_SKILL_CONFIG: SkillConfigForm = {
  skillId: 0,
  skillEndpoint: '',
  version: '1.0.0',
  price: 0,
  priceToken: '0x0000000000000000000000000000000000000000'
}

export function useAgentCards() {
  const { address, isConnected } = useAccount()
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showSkillConfig, setShowSkillConfig] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [editingCard, setEditingCard] = useState<AgentCard | null>(null)
  const [formData, setFormData] = useState<AgentCardForm>(DEFAULT_FORM)
  const [validation, setValidation] = useState<ValidationResult>({ isValid: true, message: '' })
  const [currentCapability, setCurrentCapability] = useState('')
  const [currentTask, setCurrentTask] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [activeTab, setActiveTab] = useState<'cards' | 'skills'>('cards')
  const [selectedSkill, setSelectedSkill] = useState<A2ASkill | null>(null)
  const [isEditingSkill, setIsEditingSkill] = useState(false)
  const [editingSkill, setEditingSkill] = useState<AgentSkill | null>(null)
  const [skillConfigData, setSkillConfigData] = useState<SkillConfigForm>(DEFAULT_SKILL_CONFIG)

  const {
    createAgentCard,
    getAgentCard,
    agentCard,
    addAgentSkill,
    getAgentSkills,
    getAllSkills,
    agentSkills,
    allSkills,
    isCreatingCard,
    error,
    isLoading
  } = useA2AProtocol()

  const { userAgents } = useAgentRegistry()

  // ---- Validation ----
  const validateForm = useCallback((): ValidationResult => {
    if (!formData.name.trim()) return { isValid: false, message: '卡片名称不能为空' }
    if (!formData.description.trim()) return { isValid: false, message: '卡片描述不能为空' }
    if (!formData.cardURI.trim()) return { isValid: false, message: '卡片URI不能为空' }
    if (!formData.cardURI.startsWith('ipfs://') && !formData.cardURI.startsWith('https://')) {
      return { isValid: false, message: '卡片URI必须以ipfs://或https://开头' }
    }
    return { isValid: true, message: '' }
  }, [formData.name, formData.description, formData.cardURI])

  useEffect(() => {
    if (formData.name || formData.description || formData.cardURI) {
      setValidation(validateForm())
    } else {
      setValidation({ isValid: true, message: '' })
    }
  }, [formData.name, formData.description, formData.cardURI, validateForm])

  // ---- Data loading ----
  const loadAgentData = useCallback(async (agentId: number) => {
    try {
      console.log('🔄 加载Agent数据:', agentId)
      await Promise.all([getAgentCard(agentId), getAgentSkills(agentId), getAllSkills()])
      console.log('✅ Agent数据加载完成')
    } catch (err) {
      console.error('❌ 加载Agent数据失败:', err)
    }
  }, [getAgentCard, getAgentSkills, getAllSkills])

  useEffect(() => {
    if (selectedAgentId) {
      loadAgentData(selectedAgentId)
    }
  }, [selectedAgentId, loadAgentData])

  // ---- Success message auto-dismiss ----
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(''), 5000)
      return () => clearTimeout(timer)
    }
  }, [successMessage])

  // ---- Card handlers ----
  const handleAddCapability = useCallback(() => {
    if (currentCapability.trim()) {
      setFormData(prev => ({ ...prev, capabilities: [...prev.capabilities, currentCapability.trim()] }))
      setCurrentCapability('')
    }
  }, [currentCapability])

  const handleRemoveCapability = useCallback((index: number) => {
    setFormData(prev => ({ ...prev, capabilities: prev.capabilities.filter((_, i) => i !== index) }))
  }, [])

  const handleAddTask = useCallback(() => {
    if (currentTask.trim()) {
      setFormData(prev => ({ ...prev, supportedTasks: [...prev.supportedTasks, currentTask.trim()] }))
      setCurrentTask('')
    }
  }, [currentTask])

  const handleRemoveTask = useCallback((index: number) => {
    setFormData(prev => ({ ...prev, supportedTasks: prev.supportedTasks.filter((_, i) => i !== index) }))
  }, [])

  const handleUploadToIPFS = useCallback(async () => {
    if (!formData.name || !formData.description) {
      alert('请先填写卡片名称和描述')
      return
    }

    try {
      setIsUploading(true)
      const cardMetadata = {
        name: formData.name,
        description: formData.description,
        version: formData.version,
        capabilities: formData.capabilities,
        supportedTasks: formData.supportedTasks,
        communicationProtocol: formData.communicationProtocol,
        authenticationMethod: formData.authenticationMethod,
        attributes: [
          { trait_type: "Capabilities Count", value: formData.capabilities.length },
          { trait_type: "Supported Tasks Count", value: formData.supportedTasks.length },
          { trait_type: "Communication Protocol", value: formData.communicationProtocol },
          { trait_type: "Authentication Method", value: formData.authenticationMethod },
          { trait_type: "Creation Date", value: new Date().toISOString() }
        ]
      }

      const metadataCID = await uploadJSONToIPFS(cardMetadata)
      setFormData(prev => ({ ...prev, cardURI: `ipfs://${metadataCID}` }))
      setSuccessMessage(`卡片已上传到IPFS! CID: ${metadataCID}`)
    } catch (err) {
      console.error('Failed to upload card to IPFS:', err)
      alert(`上传失败: ${err instanceof Error ? err.message : '请重试'}`)
    } finally {
      setIsUploading(false)
    }
  }, [formData])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedAgentId) { alert('请选择Agent'); return }
    if (!isConnected || !address) { alert('请先连接钱包'); return }

    const validationResult = validateForm()
    if (!validationResult.isValid) { setValidation(validationResult); return }

    try {
      console.log('🔄 开始创建Agent卡片...')
      await createAgentCard(
        selectedAgentId, formData.name, formData.description, formData.version,
        formData.capabilities, formData.supportedTasks, formData.communicationProtocol,
        formData.authenticationMethod, formData.cardURI
      )

      setTimeout(async () => {
        await loadAgentData(selectedAgentId)
        setShowForm(false)
        setEditingCard(null)
        setFormData(DEFAULT_FORM)
        setSuccessMessage('Agent卡片创建成功！')
      }, 3000)
    } catch (err) {
      console.error('❌ 创建Agent卡片失败:', err)
      alert(`创建失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }
  }, [selectedAgentId, isConnected, address, formData, createAgentCard, validateForm, loadAgentData])

  const handleEditCard = useCallback((card: AgentCard) => {
    setEditingCard(card)
    setFormData({
      name: card.name, description: card.description, version: card.version,
      capabilities: card.capabilities || [], supportedTasks: card.supportedTasks || [],
      communicationProtocol: card.communicationProtocol,
      authenticationMethod: card.authenticationMethod, cardURI: card.cardURI
    })
    setShowForm(true)
    setValidation({ isValid: true, message: '' })
  }, [])

  const handleCancelForm = useCallback(() => {
    setShowForm(false)
    setEditingCard(null)
    setFormData(DEFAULT_FORM)
    setValidation({ isValid: true, message: '' })
  }, [])

  // ---- Skill handlers ----
  const handleConfigureSkill = useCallback((skill: A2ASkill) => {
    setSelectedSkill(skill)
    setIsEditingSkill(false)
    setEditingSkill(null)
    setSkillConfigData({
      skillId: Number(skill.skillId),
      skillEndpoint: `https://api.youragent.com/agents/${selectedAgentId}/skills/${skill.skillId}`,
      version: '1.0.0', price: 0, priceToken: '0x0000000000000000000000000000000000000000'
    })
    setShowSkillConfig(true)
  }, [selectedAgentId])

  const handleEditConfiguredSkill = useCallback((skill: AgentSkill) => {
    const systemSkill = allSkills.find(s => s.skillId === skill.skillId)
    if (systemSkill) {
      setSelectedSkill(systemSkill)
      setIsEditingSkill(true)
      setEditingSkill(skill)
      setSkillConfigData({
        skillId: Number(skill.skillId), skillEndpoint: skill.skillEndpoint,
        version: skill.version, price: Number(skill.price), priceToken: skill.priceToken
      })
      setShowSkillConfig(true)
    }
  }, [allSkills])

  const handleSubmitSkillConfig = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedAgentId) { alert('请先选择Agent'); return }
    if (!isConnected || !address) { alert('请先连接钱包'); return }
    if (!skillConfigData.skillEndpoint.trim()) { alert('请填写服务端点'); return }

    try {
      console.log('🔄 开始配置技能端点...')
      await addAgentSkill(
        selectedAgentId, skillConfigData.skillId, skillConfigData.skillEndpoint,
        skillConfigData.version, skillConfigData.price, skillConfigData.priceToken
      )
      console.log('✅ 技能端点配置成功')

      setTimeout(async () => {
        await getAgentSkills(selectedAgentId)
        setShowSkillConfig(false)
        setSelectedSkill(null)
        setIsEditingSkill(false)
        setEditingSkill(null)
        setSkillConfigData(DEFAULT_SKILL_CONFIG)
        setSuccessMessage(isEditingSkill ? '技能配置更新成功！' : '技能端点配置成功！')
      }, 2000)
    } catch (err) {
      console.error('❌ 配置技能端点失败:', err)
      alert(`配置失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }
  }, [selectedAgentId, isConnected, address, skillConfigData, addAgentSkill, getAgentSkills, isEditingSkill])

  const handleCancelSkillConfig = useCallback(() => {
    setShowSkillConfig(false)
    setSelectedSkill(null)
    setIsEditingSkill(false)
    setEditingSkill(null)
    setSkillConfigData(DEFAULT_SKILL_CONFIG)
  }, [])

  // ---- Utilities ----
  const formatTimestamp = useCallback((timestamp: bigint) => {
    return new Date(Number(timestamp) * 1000).toLocaleString('zh-CN')
  }, [])

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(
      () => setSuccessMessage('已复制到剪贴板'),
      () => alert('复制失败，请手动复制')
    )
  }, [])

  // ---- Computed ----
  const isFormLoading = isCreatingCard || isLoading
  const isFormDisabled = isFormLoading || !validation.isValid

  return {
    // State
    selectedAgentId, showForm, showSkillConfig, isUploading, editingCard,
    formData, validation, currentCapability, currentTask, successMessage,
    activeTab, selectedSkill, isEditingSkill, editingSkill, skillConfigData,
    agentCard, agentSkills, allSkills, isCreatingCard, error, isLoading,
    userAgents, isConnected, address,
    // Setters
    setSelectedAgentId, setShowForm, setShowSkillConfig, setFormData,
    setCurrentCapability, setCurrentTask, setSuccessMessage, setActiveTab, setSkillConfigData,
    // Handlers
    loadAgentData, handleAddCapability, handleRemoveCapability,
    handleAddTask, handleRemoveTask, handleUploadToIPFS, handleSubmit,
    handleConfigureSkill, handleEditConfiguredSkill, handleSubmitSkillConfig,
    handleEditCard, handleCancelForm, handleCancelSkillConfig,
    // Computed
    isFormLoading, isFormDisabled,
    // Utilities
    formatTimestamp, copyToClipboard,
  }
}
