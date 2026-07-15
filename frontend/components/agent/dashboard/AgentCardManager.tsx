// components/agent/dashboard/AgentCardManager.tsx
'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import {
  Brain,
  Edit,
  Plus,
  Upload,
  CheckCircle,
  XCircle,
  RefreshCw,
  Zap,
  Server,
  AlertCircle,
  ExternalLink,
  DollarSign,
  Coins,
  ArrowLeft
} from 'lucide-react'
import {
  useA2AProtocol,
  type AgentCard,
  type AgentSkill,
  type A2ASkill
} from '../hooks/useA2AProtocol'
import { useAgentRegistry } from '../hooks/useAgentRegistry'

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
      headers: {
        'Content-Type': 'application/json',
      },
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

export function AgentCardManager() {
  const { address, isConnected } = useAccount()
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showSkillConfig, setShowSkillConfig] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [editingCard, setEditingCard] = useState<AgentCard | null>(null)
  const [formData, setFormData] = useState<AgentCardForm>({
    name: '',
    description: '',
    version: '1.0.0',
    capabilities: [],
    supportedTasks: [],
    communicationProtocol: 'HTTP',
    authenticationMethod: 'API Key',
    cardURI: ''
  })
  const [validation, setValidation] = useState<ValidationResult>({ isValid: true, message: '' })
  const [currentCapability, setCurrentCapability] = useState('')
  const [currentTask, setCurrentTask] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [activeTab, setActiveTab] = useState<'cards' | 'skills'>('cards')
  const [selectedSkill, setSelectedSkill] = useState<A2ASkill | null>(null)
  const [isEditingSkill, setIsEditingSkill] = useState(false)
  const [editingSkill, setEditingSkill] = useState<AgentSkill | null>(null)

  const [skillConfigData, setSkillConfigData] = useState<SkillConfigForm>({
    skillId: 0,
    skillEndpoint: '',
    version: '1.0.0',
    price: 0,
    priceToken: '0x0000000000000000000000000000000000000000'
  })

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

  useEffect(() => {
    if (selectedAgentId) {
      loadAgentData(selectedAgentId)
    }
  }, [selectedAgentId])

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage('')
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [successMessage])

  const validateForm = (): ValidationResult => {
    if (!formData.name.trim()) {
      return { isValid: false, message: '卡片名称不能为空' }
    }

    if (!formData.description.trim()) {
      return { isValid: false, message: '卡片描述不能为空' }
    }

    if (!formData.cardURI.trim()) {
      return { isValid: false, message: '卡片URI不能为空' }
    }

    if (!formData.cardURI.startsWith('ipfs://') && !formData.cardURI.startsWith('https://')) {
      return { isValid: false, message: '卡片URI必须以ipfs://或https://开头' }
    }

    return { isValid: true, message: '' }
  }

  useEffect(() => {
    if (formData.name || formData.description || formData.cardURI) {
      setValidation(validateForm())
    } else {
      setValidation({ isValid: true, message: '' })
    }
  }, [formData.name, formData.description, formData.cardURI])

  const loadAgentData = async (agentId: number) => {
    try {
      console.log('🔄 加载Agent数据:', agentId)
      await Promise.all([
        getAgentCard(agentId),
        getAgentSkills(agentId),
        getAllSkills()
      ])
      console.log('✅ Agent数据加载完成')
    } catch (error) {
      console.error('❌ 加载Agent数据失败:', error)
    }
  }

  const handleAddCapability = () => {
    if (currentCapability.trim()) {
      setFormData(prev => ({
        ...prev,
        capabilities: [...prev.capabilities, currentCapability.trim()]
      }))
      setCurrentCapability('')
    }
  }

  const handleRemoveCapability = (index: number) => {
    setFormData(prev => ({
      ...prev,
      capabilities: prev.capabilities.filter((_, i) => i !== index)
    }))
  }

  const handleAddTask = () => {
    if (currentTask.trim()) {
      setFormData(prev => ({
        ...prev,
        supportedTasks: [...prev.supportedTasks, currentTask.trim()]
      }))
      setCurrentTask('')
    }
  }

  const handleRemoveTask = (index: number) => {
    setFormData(prev => ({
      ...prev,
      supportedTasks: prev.supportedTasks.filter((_, i) => i !== index)
    }))
  }

  const handleUploadToIPFS = async () => {
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
          {
            trait_type: "Capabilities Count",
            value: formData.capabilities.length
          },
          {
            trait_type: "Supported Tasks Count",
            value: formData.supportedTasks.length
          },
          {
            trait_type: "Communication Protocol",
            value: formData.communicationProtocol
          },
          {
            trait_type: "Authentication Method",
            value: formData.authenticationMethod
          },
          {
            trait_type: "Creation Date",
            value: new Date().toISOString()
          }
        ]
      }

      const metadataCID = await uploadJSONToIPFS(cardMetadata)
      const cardURI = `ipfs://${metadataCID}`

      setFormData(prev => ({ ...prev, cardURI }))

      setSuccessMessage(`卡片已上传到IPFS! CID: ${metadataCID}`)

    } catch (error) {
      console.error('Failed to upload card to IPFS:', error)
      alert(`上传失败: ${error instanceof Error ? error.message : '请重试'}`)
    } finally {
      setIsUploading(false)
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
      console.log('🔄 开始创建Agent卡片...')
      await createAgentCard(
        selectedAgentId,
        formData.name,
        formData.description,
        formData.version,
        formData.capabilities,
        formData.supportedTasks,
        formData.communicationProtocol,
        formData.authenticationMethod,
        formData.cardURI
      )

      setTimeout(async () => {
        console.log('🔄 重新加载Agent数据...')
        await loadAgentData(selectedAgentId)

        setShowForm(false)
        setEditingCard(null)
        setFormData({
          name: '',
          description: '',
          version: '1.0.0',
          capabilities: [],
          supportedTasks: [],
          communicationProtocol: 'HTTP',
          authenticationMethod: 'API Key',
          cardURI: ''
        })

        setSuccessMessage('Agent卡片创建成功！')
        console.log('✅ Agent卡片创建完成')

      }, 3000)

    } catch (error) {
      console.error('❌ 创建Agent卡片失败:', error)
      alert(`创建失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  const handleConfigureSkill = (skill: A2ASkill) => {
    setSelectedSkill(skill)
    setIsEditingSkill(false)
    setEditingSkill(null)
    setSkillConfigData({
      skillId: Number(skill.skillId),
      skillEndpoint: `https://api.youragent.com/agents/${selectedAgentId}/skills/${skill.skillId}`,
      version: '1.0.0',
      price: 0,
      priceToken: '0x0000000000000000000000000000000000000000'
    })
    setShowSkillConfig(true)
  }

  const handleEditConfiguredSkill = (skill: AgentSkill) => {
    const systemSkill = allSkills.find(s => s.skillId === skill.skillId)
    if (systemSkill) {
      setSelectedSkill(systemSkill)
      setIsEditingSkill(true)
      setEditingSkill(skill)
      setSkillConfigData({
        skillId: Number(skill.skillId),
        skillEndpoint: skill.skillEndpoint,
        version: skill.version,
        price: Number(skill.price),
        priceToken: skill.priceToken
      })
      setShowSkillConfig(true)
    }
  }

  const handleSubmitSkillConfig = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedAgentId) {
      alert('请先选择Agent')
      return
    }

    if (!isConnected || !address) {
      alert('请先连接钱包')
      return
    }

    if (!skillConfigData.skillEndpoint.trim()) {
      alert('请填写服务端点')
      return
    }

    try {
      console.log('🔄 开始配置技能端点...')
      console.log('技能配置数据:', skillConfigData)

      await addAgentSkill(
        selectedAgentId,
        skillConfigData.skillId,
        skillConfigData.skillEndpoint,
        skillConfigData.version,
        skillConfigData.price,
        skillConfigData.priceToken
      )

      console.log('✅ 技能端点配置成功')

      setTimeout(async () => {
        await getAgentSkills(selectedAgentId)
        setShowSkillConfig(false)
        setSelectedSkill(null)
        setIsEditingSkill(false)
        setEditingSkill(null)
        setSkillConfigData({
          skillId: 0,
          skillEndpoint: '',
          version: '1.0.0',
          price: 0,
          priceToken: '0x0000000000000000000000000000000000000000'
        })
        setSuccessMessage(isEditingSkill ? '技能配置更新成功！' : '技能端点配置成功！')
        console.log('✅ 技能端点配置完成')
      }, 2000)

    } catch (error) {
      console.error('❌ 配置技能端点失败:', error)
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      alert(`配置失败: ${errorMessage}`)
    }
  }

  const handleEditCard = (card: AgentCard) => {
    setEditingCard(card)
    setFormData({
      name: card.name,
      description: card.description,
      version: card.version,
      capabilities: card.capabilities || [],
      supportedTasks: card.supportedTasks || [],
      communicationProtocol: card.communicationProtocol,
      authenticationMethod: card.authenticationMethod,
      cardURI: card.cardURI
    })
    setShowForm(true)
    setValidation({ isValid: true, message: '' })
  }

  const handleCancelForm = () => {
    setShowForm(false)
    setEditingCard(null)
    setFormData({
      name: '',
      description: '',
      version: '1.0.0',
      capabilities: [],
      supportedTasks: [],
      communicationProtocol: 'HTTP',
      authenticationMethod: 'API Key',
      cardURI: ''
    })
    setValidation({ isValid: true, message: '' })
  }

  const handleCancelSkillConfig = () => {
    setShowSkillConfig(false)
    setSelectedSkill(null)
    setIsEditingSkill(false)
    setEditingSkill(null)
    setSkillConfigData({
      skillId: 0,
      skillEndpoint: '',
      version: '1.0.0',
      price: 0,
      priceToken: '0x0000000000000000000000000000000000000000'
    })
  }

  const formatTimestamp = (timestamp: bigint) => {
    return new Date(Number(timestamp) * 1000).toLocaleString('zh-CN')
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setSuccessMessage('已复制到剪贴板')
    }).catch(() => {
      alert('复制失败，请手动复制')
    })
  }

  const isFormLoading = isCreatingCard || isLoading
  const isFormDisabled = isFormLoading || !validation.isValid

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">卡片管理</h2>
          <p className="text-gray-600 mt-1">管理您的Agent服务卡片和技能配置</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => selectedAgentId && loadAgentData(selectedAgentId)}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50 transition-colors"
            disabled={!selectedAgentId || isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            刷新数据
          </button>

          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 transition-colors font-medium"
            disabled={!selectedAgentId || !isConnected}
          >
            <Plus className="w-4 h-4" />
            创建卡片
          </button>
        </div>
      </div>

      {/* 状态提示 */}
      {!isConnected && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
          <div className="flex items-center gap-2 text-yellow-800">
            <AlertCircle className="w-5 h-5" />
            <span>请先连接钱包以管理Agent卡片和技能</span>
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

      {/* 主要内容区域 */}
      <div className="bg-white rounded-xl border border-gray-200">
        {/* Agent选择 */}
        <div className="p-6 border-b border-gray-200">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            选择Agent
          </label>
          <select
            value={selectedAgentId || ''}
            onChange={(e) => setSelectedAgentId(e.target.value ? Number(e.target.value) : null)}
            className="w-full max-w-md px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            disabled={!isConnected}
          >
            <option value="">请选择要管理的Agent</option>
            {userAgents.map((agentId) => (
              <option key={agentId} value={agentId}>
                Agent #{agentId}
              </option>
            ))}
          </select>
        </div>

        {/* 统计信息 */}
        {selectedAgentId && isConnected && (
          <div className="p-6 border-b border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-blue-50 rounded-xl p-6">
                <div className="flex items-center">
                  <Brain className="w-8 h-8 text-blue-600 mr-4" />
                  <div>
                    <p className="text-sm font-medium text-blue-600">Agent技能</p>
                    <p className="text-2xl font-bold text-blue-900">
                      {agentSkills.length}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-green-50 rounded-xl p-6">
                <div className="flex items-center">
                  <Zap className="w-8 h-8 text-green-600 mr-4" />
                  <div>
                    <p className="text-sm font-medium text-green-600">系统技能</p>
                    <p className="text-2xl font-bold text-green-900">
                      {allSkills.length}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-purple-50 rounded-xl p-6">
                <div className="flex items-center">
                  <Server className="w-8 h-8 text-purple-600 mr-4" />
                  <div>
                    <p className="text-sm font-medium text-purple-600">Agent卡片</p>
                    <p className="text-2xl font-bold text-purple-900">
                      {agentCard ? 1 : 0}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-orange-50 rounded-xl p-6">
                <div className="flex items-center">
                  <ExternalLink className="w-8 h-8 text-orange-600 mr-4" />
                  <div>
                    <p className="text-sm font-medium text-orange-600">可用能力</p>
                    <p className="text-2xl font-bold text-orange-900">
                      {agentCard ? (agentCard.capabilities?.length || 0) : 0}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 标签页导航 */}
        {selectedAgentId && isConnected && (
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6" aria-label="Tabs">
              <button
                onClick={() => setActiveTab('cards')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'cards'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Agent卡片
              </button>
              <button
                onClick={() => setActiveTab('skills')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'skills'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                技能管理
              </button>
            </nav>
          </div>
        )}

        {/* 标签页内容 */}
        {selectedAgentId && isConnected && (
          <div className="p-6">
            {activeTab === 'cards' && (
              <div className="space-y-6">
                {/* Agent卡片显示 */}
                <div>
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Agent服务卡片</h3>
                      <p className="text-gray-600 mt-1">管理Agent的服务发现卡片</p>
                    </div>
                    {agentCard && (
                      <div className="flex gap-2">
                        <button
                          className="flex items-center gap-2 px-4 py-2 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                          onClick={() => handleEditCard(agentCard)}
                          disabled={isLoading}
                        >
                          <Edit className="w-4 h-4" />
                          编辑
                        </button>
                      </div>
                    )}
                  </div>

                  {agentCard ? (
                    <div className="bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 p-8">
                      <div className="bg-white rounded-xl border border-gray-200 p-6">
                        <div className="flex justify-between items-start mb-6">
                          <div>
                            <h4 className="text-xl font-bold text-gray-900">{agentCard.name}</h4>
                            <p className="text-gray-600 mt-2 text-lg">{agentCard.description}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                              agentCard.isActive
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {agentCard.isActive ? '活跃' : '未激活'}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6 mb-6">
                          <div className="space-y-4">
                            <div>
                              <span className="text-sm font-medium text-gray-500">版本</span>
                              <p className="text-gray-900 font-mono">{agentCard.version}</p>
                            </div>
                            <div>
                              <span className="text-sm font-medium text-gray-500">通信协议</span>
                              <p className="text-gray-900">{agentCard.communicationProtocol}</p>
                            </div>
                            <div>
                              <span className="text-sm font-medium text-gray-500">卡片ID</span>
                              <p className="text-gray-900 font-mono">#{agentCard.cardId.toString()}</p>
                            </div>
                          </div>
                          <div className="space-y-4">
                            <div>
                              <span className="text-sm font-medium text-gray-500">认证方式</span>
                              <p className="text-gray-900">{agentCard.authenticationMethod}</p>
                            </div>
                            <div>
                              <span className="text-sm font-medium text-gray-500">Agent ID</span>
                              <p className="text-gray-900 font-mono">#{agentCard.agentId.toString()}</p>
                            </div>
                            <div>
                              <span className="text-sm font-medium text-gray-500">创建者</span>
                              <p className="text-gray-900 font-mono text-sm truncate">
                                {agentCard.createdBy}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="mb-6">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-gray-500">卡片URI</span>
                            <button
                              onClick={() => copyToClipboard(agentCard.cardURI)}
                              className="text-blue-600 hover:text-blue-800 text-sm transition-colors"
                            >
                              复制
                            </button>
                          </div>
                          <p className="text-gray-900 font-mono text-sm bg-gray-50 p-3 rounded-lg break-all">
                            {agentCard.cardURI}
                          </p>
                        </div>

                        {agentCard.capabilities && agentCard.capabilities.length > 0 && (
                          <div className="mb-6">
                            <span className="text-sm font-medium text-gray-500 mb-3 block">能力标签</span>
                            <div className="flex flex-wrap gap-2">
                              {agentCard.capabilities.map((capability, index) => (
                                <span
                                  key={index}
                                  className="px-3 py-2 bg-blue-100 text-blue-800 rounded-lg text-sm font-medium"
                                >
                                  {capability}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {agentCard.supportedTasks && agentCard.supportedTasks.length > 0 && (
                          <div className="mb-6">
                            <span className="text-sm font-medium text-gray-500 mb-3 block">支持任务</span>
                            <div className="flex flex-wrap gap-2">
                              {agentCard.supportedTasks.map((task, index) => (
                                <span
                                  key={index}
                                  className="px-3 py-2 bg-green-100 text-green-800 rounded-lg text-sm font-medium"
                                >
                                  {task}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="pt-6 border-t border-gray-200">
                          <div className="grid grid-cols-2 gap-4 text-sm text-gray-500">
                            <div>
                              <span className="font-medium">创建时间:</span>
                              <p>{formatTimestamp(agentCard.createdAt)}</p>
                            </div>
                            <div>
                              <span className="font-medium">更新时间:</span>
                              <p>{formatTimestamp(agentCard.updatedAt)}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
                      <Brain className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">暂无Agent卡片</h3>
                      <p className="text-gray-600 mb-6 max-w-md mx-auto">
                        为您的Agent创建服务卡片，让其他Agent可以发现和调用您的服务。卡片包含服务描述、能力和任务信息。
                      </p>
                      <button
                        onClick={() => setShowForm(true)}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                      >
                        <Plus className="w-5 h-5" />
                        创建第一个卡片
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'skills' && (
              <div className="space-y-8">
                {/* Agent技能 */}
                <div>
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Agent已配置技能</h3>
                      <p className="text-gray-600 mt-1">当前Agent已启用的技能配置</p>
                    </div>
                    <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                      {agentSkills.length} 个技能
                    </span>
                  </div>

                  {agentSkills.length === 0 ? (
                    <div className="bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
                      <Zap className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">暂无Agent技能</h3>
                      <p className="text-gray-600 mb-6">
                        为您的Agent配置系统技能端点，扩展其功能范围。
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {agentSkills.map((skill) => {
                        const systemSkill = allSkills.find(s => s.skillId === skill.skillId)
                        return (
                          <div key={skill.skillId.toString()} className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-all duration-300">
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-gray-900 text-lg truncate">
                                  {systemSkill ? systemSkill.name : `技能 #${skill.skillId.toString()}`}
                                </h4>
                                {systemSkill && (
                                  <p className="text-gray-600 text-sm mt-1 line-clamp-2">
                                    {systemSkill.description}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0 self-start sm:self-auto">
                                <button
                                  onClick={() => handleEditConfiguredSkill(skill)}
                                  className="flex items-center gap-1 px-3 py-1.5 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors text-sm whitespace-nowrap"
                                  disabled={isLoading}
                                >
                                  <Edit className="w-3 h-3 flex-shrink-0" />
                                  编辑
                                </button>
                                <span className={`px-2 py-1 text-xs rounded-full whitespace-nowrap flex-shrink-0 ${
                                  skill.isActive
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {skill.isActive ? '活跃' : '未激活'}
                                </span>
                              </div>
                            </div>

                            <div className="space-y-3">
                              <div>
                                <span className="text-sm font-medium text-gray-500">服务端点</span>
                                <p className="text-gray-900 text-sm font-mono truncate" title={skill.skillEndpoint}>
                                  {skill.skillEndpoint}
                                </p>
                              </div>
                              <div>
                                <span className="text-sm font-medium text-gray-500">版本</span>
                                <p className="text-gray-900">{skill.version}</p>
                              </div>
                              {skill.price > 0 && (
                                <div className="flex items-center gap-2">
                                  <DollarSign className="w-4 h-4 text-green-600 flex-shrink-0" />
                                  <div className="min-w-0">
                                    <span className="text-sm font-medium text-gray-500">调用价格</span>
                                    <p className="text-gray-900 truncate">
                                      {Number(skill.price) / 1e18} ETH
                                    </p>
                                  </div>
                                </div>
                              )}
                              {skill.priceToken !== '0x0000000000000000000000000000000000000000' && (
                                <div className="flex items-center gap-2">
                                  <Coins className="w-4 h-4 text-yellow-600 flex-shrink-0" />
                                  <div className="min-w-0">
                                    <span className="text-sm font-medium text-gray-500">代币地址</span>
                                    <p className="text-gray-900 font-mono text-xs truncate">
                                      {skill.priceToken}
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="mt-4 pt-4 border-t border-gray-200">
                              <div className="text-xs text-gray-500">
                                注册时间: {formatTimestamp(skill.registeredAt)}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* 系统可用技能 */}
                <div>
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">系统可用技能</h3>
                      <p className="text-gray-600 mt-1">预定义的技能模板，可以配置端点后添加到您的Agent</p>
                    </div>
                  </div>

                  {allSkills.length === 0 ? (
                    <div className="bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
                      <Server className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">暂无系统技能</h3>
                      <p className="text-gray-600 mb-6">
                        系统技能库为空
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {allSkills.map((skill) => {
                        const isAdded = agentSkills.some(s => s.skillId === skill.skillId)
                        return (
                          <div key={skill.skillId.toString()} className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-all duration-300">
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-gray-900 text-lg truncate">
                                  {skill.name}
                                </h4>
                              </div>
                              <span className={`px-2 py-1 text-xs rounded-full whitespace-nowrap flex-shrink-0 self-start sm:self-auto ${
                                skill.isActive
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                                {skill.isActive ? '可用' : '不可用'}
                              </span>
                            </div>

                            <p className="text-gray-600 mb-4 text-sm leading-relaxed line-clamp-3">
                              {skill.description}
                            </p>

                            <div className="space-y-3 mb-4">
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-500">输入格式:</span>
                                <span className="text-gray-900 font-mono text-xs truncate ml-2">
                                  {skill.inputSchema.length > 20
                                    ? skill.inputSchema.substring(0, 20) + '...'
                                    : skill.inputSchema
                                  }
                                </span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-500">输出格式:</span>
                                <span className="text-gray-900 font-mono text-xs truncate ml-2">
                                  {skill.outputSchema.length > 20
                                    ? skill.outputSchema.substring(0, 20) + '...'
                                    : skill.outputSchema
                                  }
                                </span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-500">复杂度:</span>
                                <span className="text-gray-900">
                                  {skill.complexity.toString()}/10
                                </span>
                              </div>
                            </div>

                            {skill.requiredCapabilities.length > 0 && (
                              <div className="mb-4">
                                <p className="text-xs text-gray-600 mb-2">所需能力:</p>
                                <div className="flex flex-wrap gap-1">
                                  {skill.requiredCapabilities.map((capability, index) => (
                                    <span
                                      key={index}
                                      className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs whitespace-nowrap"
                                    >
                                      {capability}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="flex justify-between items-center pt-4 border-t border-gray-200">
                              <span className="text-xs text-gray-500 whitespace-nowrap">
                                创建: {formatTimestamp(skill.createdAt)}
                              </span>
                              <button
                                onClick={() => handleConfigureSkill(skill)}
                                disabled={isLoading || isAdded}
                                className={`px-4 py-2 rounded text-sm font-medium transition-colors whitespace-nowrap ${
                                  isAdded
                                    ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                                }`}
                              >
                                {isAdded ? '已配置' : isLoading ? '配置中...' : '配置端点'}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 创建/编辑卡片弹窗 */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <button
                  onClick={handleCancelForm}
                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h3 className="text-xl font-semibold text-gray-900">
                  {editingCard ? '编辑Agent卡片' : '创建Agent卡片'}
                </h3>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* 基础信息 */}
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        卡片名称 *
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                        placeholder="例如：智能客服Agent"
                        required
                        disabled={isFormLoading}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        描述 *
                      </label>
                      <textarea
                        value={formData.description}
                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        rows={4}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                        placeholder="详细描述Agent的功能和服务范围"
                        required
                        disabled={isFormLoading}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          版本
                        </label>
                        <input
                          type="text"
                          value={formData.version}
                          onChange={(e) => setFormData(prev => ({ ...prev, version: e.target.value }))}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                          placeholder="1.0.0"
                          disabled={isFormLoading}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          通信协议
                        </label>
                        <select
                          value={formData.communicationProtocol}
                          onChange={(e) => setFormData(prev => ({ ...prev, communicationProtocol: e.target.value }))}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                          disabled={isFormLoading}
                        >
                          <option value="HTTP">HTTP REST API</option>
                          <option value="WebSocket">WebSocket</option>
                          <option value="gRPC">gRPC</option>
                          <option value="A2A">A2A Protocol</option>
                          <option value="Custom">自定义协议</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        认证方式
                      </label>
                      <select
                        value={formData.authenticationMethod}
                        onChange={(e) => setFormData(prev => ({ ...prev, authenticationMethod: e.target.value }))}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                        disabled={isFormLoading}
                      >
                        <option value="API Key">API密钥</option>
                        <option value="OAuth">OAuth 2.0</option>
                        <option value="JWT">JWT令牌</option>
                        <option value="Wallet">钱包签名</option>
                        <option value="None">无认证</option>
                      </select>
                    </div>
                  </div>

                  {/* 能力配置 */}
                  <div className="space-y-6">
                    {/* 能力标签 */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        能力标签
                      </label>
                      <div className="flex gap-2 mb-3">
                        <input
                          type="text"
                          value={currentCapability}
                          onChange={(e) => setCurrentCapability(e.target.value)}
                          className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                          placeholder="例如：文本生成、图像处理、数据分析"
                          disabled={isFormLoading}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleAddCapability()
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={handleAddCapability}
                          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
                          disabled={isFormLoading || !currentCapability.trim()}
                        >
                          添加
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2 min-h-12">
                        {formData.capabilities.map((capability, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center gap-2 px-3 py-2 bg-blue-100 text-blue-800 rounded-lg text-sm font-medium"
                          >
                            {capability}
                            <button
                              type="button"
                              onClick={() => handleRemoveCapability(index)}
                              className="text-blue-600 hover:text-blue-800 transition-colors"
                              disabled={isFormLoading}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* 支持任务 */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        支持任务
                      </label>
                      <div className="flex gap-2 mb-3">
                        <input
                          type="text"
                          value={currentTask}
                          onChange={(e) => setCurrentTask(e.target.value)}
                          className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                          placeholder="例如：聊天对话、内容总结、语言翻译"
                          disabled={isFormLoading}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleAddTask()
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={handleAddTask}
                          className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors font-medium"
                          disabled={isFormLoading || !currentTask.trim()}
                        >
                          添加
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2 min-h-12">
                        {formData.supportedTasks.map((task, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center gap-2 px-3 py-2 bg-green-100 text-green-800 rounded-lg text-sm font-medium"
                          >
                            {task}
                            <button
                              type="button"
                              onClick={() => handleRemoveTask(index)}
                              className="text-green-600 hover:text-green-800 transition-colors"
                              disabled={isFormLoading}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* IPFS上传 */}
                    <div className="border-t pt-6">
                      <div className="flex justify-between items-center mb-3">
                        <label className="block text-sm font-medium text-gray-700">
                          卡片URI（IPFS CID）*
                        </label>
                        <button
                          type="button"
                          onClick={handleUploadToIPFS}
                          disabled={isUploading || !formData.name || !formData.description || isFormLoading}
                          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors text-sm font-medium"
                        >
                          <Upload className="w-4 h-4" />
                          {isUploading ? '上传中...' : '上传到IPFS'}
                        </button>
                      </div>
                      <input
                        type="text"
                        value={formData.cardURI}
                        onChange={(e) => setFormData(prev => ({ ...prev, cardURI: e.target.value }))}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors font-mono text-sm"
                        placeholder="ipfs://... 或 https://..."
                        required
                        disabled={isFormLoading}
                      />
                      <p className="text-xs text-gray-500 mt-2">
                        点击"上传到IPFS"自动生成IPFS URI，或手动输入现有URI。
                      </p>
                    </div>
                  </div>
                </div>

                {/* 验证错误 */}
                {!validation.isValid && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center gap-2 text-red-700">
                      <AlertCircle className="w-5 h-5" />
                      <span className="font-medium">{validation.message}</span>
                    </div>
                  </div>
                )}

                {/* 表单操作 */}
                <div className="flex justify-end gap-4 pt-6 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={handleCancelForm}
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
                        保存中...
                      </>
                    ) : (
                      <>
                        <Plus className="w-5 h-5" />
                        {editingCard ? '更新卡片' : '创建卡片'}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 配置/编辑技能端点弹窗 */}
      {showSkillConfig && selectedSkill && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-semibold text-gray-900">
                  {isEditingSkill ? '编辑技能配置' : '配置技能端点'} - {selectedSkill.name}
                </h3>
                <button
                  onClick={handleCancelSkillConfig}
                  className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-blue-800">技能配置说明</p>
                    <p className="text-sm text-blue-700 mt-1">
                      此技能使用系统预定义的输入输出格式，您只需配置服务端点即可让Agent使用此技能。
                    </p>
                  </div>
                </div>
              </div>

              {/* 价格说明 */}
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <DollarSign className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-green-800">价格设置说明</p>
                    <p className="text-sm text-green-700 mt-1">
                      • 价格设为0表示免费，非0值表示每次调用费用
                      <br/>
                      • 如需使用ERC20代币，请填写代币合约地址
                    </p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSubmitSkillConfig} className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      技能名称
                    </label>
                    <input
                      type="text"
                      value={selectedSkill.name}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50"
                      readOnly
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      技能描述
                    </label>
                    <textarea
                      value={selectedSkill.description}
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50"
                      readOnly
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      服务端点 *
                    </label>
                    <input
                      type="text"
                      value={skillConfigData.skillEndpoint}
                      onChange={(e) => setSkillConfigData(prev => ({ ...prev, skillEndpoint: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      placeholder="https://api.example.com/skills/endpoint"
                      required
                      disabled={isLoading}
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      此技能的服务调用端点URL
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        版本
                      </label>
                      <input
                        type="text"
                        value={skillConfigData.version}
                        onChange={(e) => setSkillConfigData(prev => ({ ...prev, version: e.target.value }))}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                        placeholder="1.0.0"
                        disabled={isLoading}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        单次调用价格 (ETH)
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={skillConfigData.price}
                        onChange={(e) => setSkillConfigData(prev => ({ ...prev, price: parseFloat(e.target.value) }))}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                        placeholder="0"
                        disabled={isLoading}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        设为0表示免费服务
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      代币支付地址（可选）
                    </label>
                    <input
                      type="text"
                      value={skillConfigData.priceToken}
                      onChange={(e) => setSkillConfigData(prev => ({ ...prev, priceToken: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors font-mono text-sm"
                      placeholder="0x0000000000000000000000000000000000000000"
                      disabled={isLoading}
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      留空或使用零地址表示使用ETH支付
                    </p>
                  </div>
                </div>

                {/* 技能规格信息 */}
                <div className="border-t pt-6">
                  <h4 className="text-lg font-medium text-gray-900 mb-4">技能规格</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-500">输入格式:</span>
                      <div className="mt-1 p-2 bg-gray-50 rounded border font-mono text-xs overflow-x-auto">
                        {selectedSkill.inputSchema}
                      </div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-500">输出格式:</span>
                      <div className="mt-1 p-2 bg-gray-50 rounded border font-mono text-xs overflow-x-auto">
                        {selectedSkill.outputSchema}
                      </div>
                    </div>
                  </div>

                  {selectedSkill.requiredCapabilities.length > 0 && (
                    <div className="mt-4">
                      <span className="font-medium text-gray-500 text-sm">所需能力:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedSkill.requiredCapabilities.map((capability, index) => (
                          <span
                            key={index}
                            className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs"
                          >
                            {capability}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-4">
                    <span className="font-medium text-gray-500 text-sm">复杂度:</span>
                    <span className="ml-2 text-gray-900">{selectedSkill.complexity.toString()}/10</span>
                  </div>
                </div>

                {/* 表单操作 */}
                <div className="flex justify-end gap-4 pt-6 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={handleCancelSkillConfig}
                    className="px-6 py-3 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors font-medium"
                    disabled={isLoading}
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading || !skillConfigData.skillEndpoint.trim()}
                    className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    {isLoading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        {isEditingSkill ? '更新中...' : '配置中...'}
                      </>
                    ) : (
                      <>
                        <Plus className="w-5 h-5" />
                        {isEditingSkill ? '更新技能配置' : '配置技能端点'}
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
        <div className="fixed bottom-4 right-4 p-4 bg-red-50 border border-red-200 rounded-lg shadow-lg max-w-md">
          <div className="flex items-center gap-2 text-red-700">
            <XCircle className="w-5 h-5 flex-shrink-0" />
            <div>
              <span className="font-medium">操作失败:</span>
              <span className="ml-1">{error.message || '未知错误'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

