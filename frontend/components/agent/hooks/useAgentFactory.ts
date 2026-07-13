// components/agent/hooks/useAgentFactory.ts
'use client'

import { 
  useWriteContract, 
  useReadContract, 
  useAccount, 
  useWaitForTransactionReceipt,
  usePublicClient,
  useBlockNumber
} from 'wagmi'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'

// 生产级环境变量验证
const validateAddress = (address: string | undefined): `0x${string}` => {
  if (!address || !address.startsWith('0x') || address.length !== 42) {
    console.error('Invalid contract address:', address)
    return '0x0000000000000000000000000000000000000000'
  }
  return address as `0x${string}`
}

const AGENT_FACTORY_ADDRESS = validateAddress(process.env.NEXT_PUBLIC_AGENT_FACTORY_ADDRESS)

// 完整的 AgentFactory ABI，与智能合约完全匹配
const AGENT_FACTORY_ABI = [
  // 模板管理函数
  {
    name: 'createTemplate',
    type: 'function',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'baseURI', type: 'string' },
      { name: 'endpointTypes', type: 'string[]' },
      { name: 'endpointURIs', type: 'string[]' },
      { name: 'protocols', type: 'string[]' },
      { name: 'endpointNames', type: 'string[]' },
      { name: 'configKeys', type: 'string[]' },
      { name: 'configValues', type: 'string[]' },
      { name: 'dataTypes', type: 'string[]' }
    ],
    outputs: [{ name: 'templateId', type: 'uint256' }],
    stateMutability: 'nonpayable'
  },
  {
    name: 'updateTemplate',
    type: 'function',
    inputs: [
      { name: 'templateId', type: 'uint256' },
      { name: 'name', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'baseURI', type: 'string' },
      { name: 'endpointTypes', type: 'string[]' },
      { name: 'endpointURIs', type: 'string[]' },
      { name: 'protocols', type: 'string[]' },
      { name: 'endpointNames', type: 'string[]' },
      { name: 'configKeys', type: 'string[]' },
      { name: 'configValues', type: 'string[]' },
      { name: 'dataTypes', type: 'string[]' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    name: 'setTemplateActive',
    type: 'function',
    inputs: [
      { name: 'templateId', type: 'uint256' },
      { name: 'isActive', type: 'bool' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  
  // Agent 创建函数
  {
    name: 'createAgentFromTemplate',
    type: 'function',
    inputs: [{ name: 'templateId', type: 'uint256' }],
    outputs: [{ name: 'agentId', type: 'uint256' }],
    stateMutability: 'payable'
  },
  {
    name: 'createAgentsFromTemplate',
    type: 'function',
    inputs: [
      { name: 'templateId', type: 'uint256' },
      { name: 'count', type: 'uint256' }
    ],
    outputs: [{ name: 'agentIds', type: 'uint256[]' }],
    stateMutability: 'payable'
  },
  
  // 查询函数
  {
    name: 'getTemplate',
    type: 'function',
    inputs: [{ name: 'templateId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'templateId', type: 'uint256' },
          { name: 'name', type: 'string' },
          { name: 'description', type: 'string' },
          { name: 'baseURI', type: 'string' },
          { name: 'endpointTypes', type: 'string[]' },
          { name: 'endpointURIs', type: 'string[]' },
          { name: 'protocols', type: 'string[]' },
          { name: 'endpointNames', type: 'string[]' },
          { name: 'configKeys', type: 'string[]' },
          { name: 'configValues', type: 'string[]' },
          { name: 'dataTypes', type: 'string[]' },
          { name: 'isActive', type: 'bool' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'createdBy', type: 'address' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  {
    name: 'getAllTemplates',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'templateId', type: 'uint256' },
          { name: 'name', type: 'string' },
          { name: 'description', type: 'string' },
          { name: 'baseURI', type: 'string' },
          { name: 'endpointTypes', type: 'string[]' },
          { name: 'endpointURIs', type: 'string[]' },
          { name: 'protocols', type: 'string[]' },
          { name: 'endpointNames', type: 'string[]' },
          { name: 'configKeys', type: 'string[]' },
          { name: 'configValues', type: 'string[]' },
          { name: 'dataTypes', type: 'string[]' },
          { name: 'isActive', type: 'bool' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'createdBy', type: 'address' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  {
    name: 'getAgentTemplates',
    type: 'function',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256[]' }],
    stateMutability: 'view'
  },
  {
    name: 'getTotalTemplates',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    name: 'getTemplateCounter',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    name: 'templateExists',
    type: 'function',
    inputs: [{ name: 'templateId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view'
  },
  
  // 事件定义
  {
    name: 'TemplateCreated',
    type: 'event',
    inputs: [
      { name: 'templateId', type: 'uint256', indexed: true },
      { name: 'name', type: 'string', indexed: false },
      { name: 'description', type: 'string', indexed: false },
      { name: 'createdBy', type: 'address', indexed: true }
    ]
  },
  {
    name: 'AgentCreated',
    type: 'event',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'templateId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'agentURI', type: 'string', indexed: false }
    ]
  }
] as const

// TypeScript 接口定义
export interface AgentTemplate {
  templateId: number
  name: string
  description: string
  baseURI: string
  endpointTypes: string[]
  endpointURIs: string[]
  protocols: string[]
  endpointNames: string[]
  capabilities?: string[]
  supportedTasks?: string[]
  configKeys: string[]
  configValues: string[]
  dataTypes: string[]
  isActive: boolean
  createdAt: number
  createdBy: string
}

export interface TemplateCreationData {
  name: string
  description: string
  baseURI: string
  endpointTypes: string[]
  endpointURIs: string[]
  protocols: string[]
  endpointNames: string[]
  configKeys: string[]
  configValues: string[]
  dataTypes: string[]
}

export interface BatchCreationResult {
  agentIds: number[]
  transactionHash: `0x${string}`
}

interface UseAgentFactoryReturn {
  // 模板管理功能（管理员）
  createTemplate: (templateData: TemplateCreationData) => Promise<`0x${string}` | undefined>
  updateTemplate: (templateId: number, templateData: TemplateCreationData) => Promise<`0x${string}` | undefined>
  setTemplateActive: (templateId: number, isActive: boolean) => Promise<`0x${string}` | undefined>
  
  // Agent 创建功能（用户）
  createAgentFromTemplate: (templateId: number) => Promise<`0x${string}` | undefined>
  createAgentsFromTemplate: (templateId: number, count: number) => Promise<`0x${string}` | undefined>
  
  // 查询功能
  getTemplate: (templateId: number) => Promise<AgentTemplate | null>
  getAllTemplates: () => Promise<AgentTemplate[]>
  getAgentTemplates: (agentId: number) => Promise<number[]>
  getTotalTemplates: () => Promise<number>
  templateExists: (templateId: number) => Promise<boolean>
  
  // 实时数据
  templates: AgentTemplate[]
  totalTemplates: number
  agentTemplates: Record<number, number[]>
  
  // 状态
  isCreatingTemplate: boolean
  isUpdatingTemplate: boolean
  isSettingTemplateActive: boolean
  isCreatingAgent: boolean
  isCreatingAgents: boolean
  isConfirming: boolean
  isConfirmed: boolean
  isLoadingTemplates: boolean
  error: Error | null
  hash: `0x${string}` | undefined
  
  // 工具函数
  refetchTemplates: () => Promise<void>
  refetchAllData: () => Promise<void>
  resetState: () => void
}

export function useAgentFactory(): UseAgentFactoryReturn {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: blockNumber } = useBlockNumber({ watch: true })
  
  const [templates, setTemplates] = useState<AgentTemplate[]>([])
  const [totalTemplates, setTotalTemplates] = useState<number>(0)
  const [agentTemplates, setAgentTemplates] = useState<Record<number, number[]>>({})
  const [error, setError] = useState<Error | null>(null)
  const [transactionHash, setTransactionHash] = useState<`0x${string}` | undefined>()
  const [lastRefetchTime, setLastRefetchTime] = useState<number>(0)
  const [forceRefresh, setForceRefresh] = useState<number>(0)
  
  // 使用 ref 来存储最新的交易哈希，避免闭包问题
  const transactionHashRef = useRef<`0x${string}` | undefined>()

  // 创建模板交易
  const { 
    writeContractAsync: createTemplateAsync,
    isPending: isCreatingTemplate,
    error: createTemplateError,
    reset: resetCreateTemplate
  } = useWriteContract()

  // 更新模板交易
  const { 
    writeContractAsync: updateTemplateAsync,
    isPending: isUpdatingTemplate,
    error: updateTemplateError,
    reset: resetUpdateTemplate
  } = useWriteContract()

  // 设置模板激活状态交易
  const { 
    writeContractAsync: setTemplateActiveAsync,
    isPending: isSettingTemplateActive,
    error: setTemplateActiveError,
    reset: resetSetTemplateActive
  } = useWriteContract()

  // 创建单个 Agent 交易
  const { 
    writeContractAsync: createAgentAsync,
    isPending: isCreatingAgent,
    error: createAgentError,
    reset: resetCreateAgent
  } = useWriteContract()

  // 批量创建 Agents 交易
  const { 
    writeContractAsync: createAgentsAsync,
    isPending: isCreatingAgents,
    error: createAgentsError,
    reset: resetCreateAgents
  } = useWriteContract()

  // 统一的交易确认状态
  const { 
    isLoading: isConfirming, 
    isSuccess: isConfirmed,
    data: receipt
  } = useWaitForTransactionReceipt({
    hash: transactionHash,
  })

  // 获取所有模板 - 使用 useReadContract 从合约读取真实模板数据
  const { 
    data: templatesData, 
    refetch: refetchTemplatesQuery,
    error: templatesError,
    isLoading: isLoadingTemplatesQuery
  } = useReadContract({
    address: AGENT_FACTORY_ADDRESS,
    abi: AGENT_FACTORY_ABI,
    functionName: 'getAllTemplates',
    query: {
      enabled: true,
      staleTime: 30000, // 30秒缓存
    },
  })

  // 获取模板总数
  const { 
    data: totalTemplatesData,
    error: totalTemplatesError,
    refetch: refetchTotalTemplates
  } = useReadContract({
    address: AGENT_FACTORY_ADDRESS,
    abi: AGENT_FACTORY_ABI,
    functionName: 'getTotalTemplates',
    query: {
      enabled: true,
    },
  })

  // 获取模板计数器
  const { 
    data: templateCounterData,
    error: templateCounterError
  } = useReadContract({
    address: AGENT_FACTORY_ADDRESS,
    abi: AGENT_FACTORY_ABI,
    functionName: 'getTemplateCounter',
    query: {
      enabled: true,
    },
  })

  // 错误处理 Effect
  useEffect(() => {
    const currentError = createTemplateError || updateTemplateError || setTemplateActiveError || 
                        createAgentError || createAgentsError || templatesError || 
                        totalTemplatesError || templateCounterError
    
    if (currentError) {
      setError(currentError)
    }
  }, [
    createTemplateError, updateTemplateError, setTemplateActiveError,
    createAgentError, createAgentsError, templatesError,
    totalTemplatesError, templateCounterError
  ])

  // 模板数据同步 Effect - 从合约读取真实模板数据
  useEffect(() => {
    if (templatesData) {
      try {
        console.log('🔄 原始模板数据从合约读取:', templatesData)
        
        // 处理从合约返回的模板数据
        const processedTemplates = (templatesData as any[]).map((template, index) => {
          // 确保所有字段都有默认值，避免 undefined
          const processedTemplate = {
            templateId: Number(template.templateId) || index + 1,
            name: template.name || `模板 ${index + 1}`,
            description: template.description || '暂无描述',
            baseURI: template.baseURI || '',
            endpointTypes: Array.isArray(template.endpointTypes) ? template.endpointTypes : [],
            endpointURIs: Array.isArray(template.endpointURIs) ? template.endpointURIs : [],
            protocols: Array.isArray(template.protocols) ? template.protocols : [],
            endpointNames: Array.isArray(template.endpointNames) ? template.endpointNames : [],
            configKeys: Array.isArray(template.configKeys) ? template.configKeys : [],
            configValues: Array.isArray(template.configValues) ? template.configValues : [],
            dataTypes: Array.isArray(template.dataTypes) ? template.dataTypes : [],
            isActive: template.isActive !== undefined ? template.isActive : true,
            createdAt: Number(template.createdAt) || Math.floor(Date.now() / 1000),
            createdBy: template.createdBy || '0x0000000000000000000000000000000000000000'
          }
          
          console.log(`✅ 处理模板 ${index + 1}:`, processedTemplate)
          return processedTemplate
        }).filter(template => template.isActive) // 只显示活跃模板
        
        console.log('🎯 最终处理的模板数据:', processedTemplates)
        setTemplates(processedTemplates)
      } catch (err) {
        console.error('❌ 处理模板数据错误:', err)
        setTemplates([])
      }
    } else {
      console.log('⚠️ 模板数据为空，合约可能没有模板或网络连接问题')
      setTemplates([])
    }
  }, [templatesData, forceRefresh])

  // 模板总数同步 Effect
  useEffect(() => {
    if (totalTemplatesData !== undefined) {
      const newTotal = Number(totalTemplatesData)
      console.log('🔄 模板总数更新:', totalTemplates, '->', newTotal)
      if (newTotal !== totalTemplates) {
        setTotalTemplates(newTotal)
      }
    }
  }, [totalTemplatesData, totalTemplates, forceRefresh])

  // 监听区块高度变化，自动刷新数据
  useEffect(() => {
    if (blockNumber) {
      console.log('📦 新区块:', blockNumber, '触发工厂数据刷新')
      setForceRefresh(prev => prev + 1)
    }
  }, [blockNumber])

  // 监听交易确认，强制刷新所有数据
  useEffect(() => {
    if (isConfirmed && receipt) {
      console.log('🎉 工厂交易确认成功，强制刷新所有数据')
      console.log('📄 工厂交易收据:', receipt)
      
      // 强制刷新所有数据
      setForceRefresh(prev => prev + 1)
      
      // 立即重新获取数据
      setTimeout(() => {
        console.log('🔄 立即重新获取工厂数据...')
        refetchTemplatesQuery()
        refetchTotalTemplates()
      }, 1000)
    }
  }, [isConfirmed, receipt, refetchTemplatesQuery, refetchTotalTemplates])

  // 创建模板
  const createTemplate = useCallback(async (
    templateData: TemplateCreationData
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      // 验证模板数据
      if (!templateData.name.trim()) {
        throw new Error('模板名称不能为空')
      }

      if (!templateData.description.trim()) {
        throw new Error('模板描述不能为空')
      }

      if (templateData.endpointTypes.length !== templateData.endpointURIs.length ||
          templateData.endpointTypes.length !== templateData.protocols.length ||
          templateData.endpointTypes.length !== templateData.endpointNames.length) {
        throw new Error('端点配置数组长度不匹配')
      }

      if (templateData.configKeys.length !== templateData.configValues.length ||
          templateData.configKeys.length !== templateData.dataTypes.length) {
        throw new Error('配置参数数组长度不匹配')
      }

      setError(null)
      
      console.log('🔄 开始创建模板...', templateData)
      const hash = await createTemplateAsync({
        address: AGENT_FACTORY_ADDRESS,
        abi: AGENT_FACTORY_ABI,
        functionName: 'createTemplate',
        args: [
          templateData.name,
          templateData.description,
          templateData.baseURI,
          templateData.endpointTypes,
          templateData.endpointURIs,
          templateData.protocols,
          templateData.endpointNames,
          templateData.configKeys,
          templateData.configValues,
          templateData.dataTypes
        ]
      })

      console.log('✅ 创建模板交易提交成功，哈希:', hash)
      setTransactionHash(hash)
      transactionHashRef.current = hash
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('创建模板失败')
      setError(error)
      console.error('❌ Create template error:', err)
      return undefined
    }
  }, [isConnected, address, createTemplateAsync])

  // 更新模板
  const updateTemplate = useCallback(async (
    templateId: number,
    templateData: TemplateCreationData
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (templateId <= 0) {
        throw new Error('无效的模板ID')
      }

      // 验证模板数据
      if (!templateData.name.trim()) {
        throw new Error('模板名称不能为空')
      }

      if (!templateData.description.trim()) {
        throw new Error('模板描述不能为空')
      }

      setError(null)
      
      console.log('🔄 开始更新模板...', templateId, templateData)
      const hash = await updateTemplateAsync({
        address: AGENT_FACTORY_ADDRESS,
        abi: AGENT_FACTORY_ABI,
        functionName: 'updateTemplate',
        args: [
          BigInt(templateId),
          templateData.name,
          templateData.description,
          templateData.baseURI,
          templateData.endpointTypes,
          templateData.endpointURIs,
          templateData.protocols,
          templateData.endpointNames,
          templateData.configKeys,
          templateData.configValues,
          templateData.dataTypes
        ]
      })

      console.log('✅ 更新模板交易提交成功，哈希:', hash)
      setTransactionHash(hash)
      transactionHashRef.current = hash
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('更新模板失败')
      setError(error)
      console.error('❌ Update template error:', err)
      return undefined
    }
  }, [isConnected, address, updateTemplateAsync])

  // 设置模板激活状态
  const setTemplateActive = useCallback(async (
    templateId: number,
    isActive: boolean
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (templateId <= 0) {
        throw new Error('无效的模板ID')
      }

      setError(null)
      
      console.log('🔄 设置模板激活状态...', templateId, isActive)
      const hash = await setTemplateActiveAsync({
        address: AGENT_FACTORY_ADDRESS,
        abi: AGENT_FACTORY_ABI,
        functionName: 'setTemplateActive',
        args: [BigInt(templateId), isActive]
      })

      console.log('✅ 设置模板激活状态交易提交成功，哈希:', hash)
      setTransactionHash(hash)
      transactionHashRef.current = hash
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('设置模板激活状态失败')
      setError(error)
      console.error('❌ Set template active error:', err)
      return undefined
    }
  }, [isConnected, address, setTemplateActiveAsync])

  // 从模板创建单个 Agent - 使用真实合约数据
  const createAgentFromTemplate = useCallback(async (
    templateId: number
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (templateId <= 0) {
        throw new Error('无效的模板ID')
      }

      // 验证模板是否存在且活跃
      const templateExists = await checkTemplateExists(templateId)
      if (!templateExists) {
        throw new Error('模板不存在')
      }

      setError(null)
      
      console.log('🔄 从模板创建 Agent...', templateId)
      const hash = await createAgentAsync({
        address: AGENT_FACTORY_ADDRESS,
        abi: AGENT_FACTORY_ABI,
        functionName: 'createAgentFromTemplate',
        args: [BigInt(templateId)],
        value: BigInt(1000000000000000), // 0.001 ETH
      })

      console.log('✅ 创建 Agent 交易提交成功，哈希:', hash)
      setTransactionHash(hash)
      transactionHashRef.current = hash
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('从模板创建 Agent 失败')
      setError(error)
      console.error('❌ Create agent from template error:', err)
      return undefined
    }
  }, [isConnected, address, createAgentAsync])

  // 从模板批量创建 Agents - 使用真实合约数据
  const createAgentsFromTemplate = useCallback(async (
    templateId: number,
    count: number
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (templateId <= 0) {
        throw new Error('无效的模板ID')
      }

      if (count <= 0 || count > 10) {
        throw new Error('创建数量必须在 1-10 之间')
      }

      // 验证模板是否存在且活跃
      const templateExists = await checkTemplateExists(templateId)
      if (!templateExists) {
        throw new Error('模板不存在')
      }

      setError(null)
      
      console.log('🔄 批量创建 Agents...', templateId, count)
      
      // 修复：正确的 BigInt 乘法操作
      const baseValue = BigInt(1000000000000000) // 0.001 ETH
      const totalValue = baseValue * BigInt(count)
      
      const hash = await createAgentsAsync({
        address: AGENT_FACTORY_ADDRESS,
        abi: AGENT_FACTORY_ABI,
        functionName: 'createAgentsFromTemplate',
        args: [BigInt(templateId), BigInt(count)],
        value: totalValue, // 0.001 ETH * count
      })

      console.log('✅ 批量创建 Agents 交易提交成功，哈希:', hash)
      setTransactionHash(hash)
      transactionHashRef.current = hash
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('批量创建 Agents 失败')
      setError(error)
      console.error('❌ Create agents from template error:', err)
      return undefined
    }
  }, [isConnected, address, createAgentsAsync])

  // 检查模板是否存在 - 辅助函数
  const checkTemplateExists = useCallback(async (templateId: number): Promise<boolean> => {
    try {
      if (!publicClient) return false
      
      const result = await publicClient.readContract({
        address: AGENT_FACTORY_ADDRESS,
        abi: AGENT_FACTORY_ABI,
        functionName: 'templateExists',
        args: [BigInt(templateId)],
      })
      
      return result as boolean
    } catch (err) {
      console.error('Check template exists error:', err)
      return false
    }
  }, [publicClient])

  // 获取单个模板 - 从合约读取真实数据
  const getTemplate = useCallback(async (templateId: number): Promise<AgentTemplate | null> => {
    try {
      if (templateId <= 0) {
        return null
      }

      if (!publicClient) {
        console.error('Public client not available')
        return null
      }

      const result = await publicClient.readContract({
        address: AGENT_FACTORY_ADDRESS,
        abi: AGENT_FACTORY_ABI,
        functionName: 'getTemplate',
        args: [BigInt(templateId)],
      })

      const template = result as any
      console.log('📋 获取单个模板数据:', template)
      
      return {
        templateId: Number(template.templateId),
        name: template.name,
        description: template.description,
        baseURI: template.baseURI,
        endpointTypes: template.endpointTypes,
        endpointURIs: template.endpointURIs,
        protocols: template.protocols,
        endpointNames: template.endpointNames,
        configKeys: template.configKeys,
        configValues: template.configValues,
        dataTypes: template.dataTypes,
        isActive: template.isActive,
        createdAt: Number(template.createdAt),
        createdBy: template.createdBy
      }
    } catch (err) {
      console.error('❌ Get template error:', err)
      return null
    }
  }, [publicClient])

  // 获取所有模板 - 从合约读取真实数据
  const getAllTemplates = useCallback(async (): Promise<AgentTemplate[]> => {
    try {
      await refetchTemplatesQuery()
      return templates
    } catch (err) {
      console.error('❌ Get all templates error:', err)
      return []
    }
  }, [refetchTemplatesQuery, templates])

  // 获取 Agent 使用的模板
  const getAgentTemplates = useCallback(async (agentId: number): Promise<number[]> => {
    try {
      if (agentId <= 0) {
        return []
      }

      if (!publicClient) {
        console.error('Public client not available')
        return []
      }

      const result = await publicClient.readContract({
        address: AGENT_FACTORY_ADDRESS,
        abi: AGENT_FACTORY_ABI,
        functionName: 'getAgentTemplates',
        args: [BigInt(agentId)],
      })

      return (result as bigint[]).map(id => Number(id))
    } catch (err) {
      console.error('❌ Get agent templates error:', err)
      return []
    }
  }, [publicClient])

  // 获取模板总数
  const getTotalTemplates = useCallback(async (): Promise<number> => {
    try {
      const result = await refetchTotalTemplates()
      return result.data ? Number(result.data) : 0
    } catch (err) {
      console.error('❌ Get total templates error:', err)
      return 0
    }
  }, [refetchTotalTemplates])

  // 检查模板是否存在
  const templateExists = useCallback(async (templateId: number): Promise<boolean> => {
    try {
      if (templateId <= 0) {
        return false
      }

      if (!publicClient) {
        console.error('Public client not available')
        return false
      }

      const result = await publicClient.readContract({
        address: AGENT_FACTORY_ADDRESS,
        abi: AGENT_FACTORY_ABI,
        functionName: 'templateExists',
        args: [BigInt(templateId)],
      })

      return result as boolean
    } catch (err) {
      console.error('❌ Template exists error:', err)
      return false
    }
  }, [publicClient])

  // 重新获取模板
  const refetchTemplates = useCallback(async (): Promise<void> => {
    try {
      const now = Date.now()
      // 防止频繁调用：1秒内只能调用一次
      if (now - lastRefetchTime < 1000) {
        console.log('⏰ 防重复调用：跳过重复的模板 refetch')
        return
      }
      
      setLastRefetchTime(now)
      console.log('🔄 开始重新获取模板列表...')
      
      const result = await refetchTemplatesQuery()
      console.log('✅ 重新获取模板列表结果:', result)
      
    } catch (err) {
      console.error('❌ Refetch templates error:', err)
    }
  }, [refetchTemplatesQuery, lastRefetchTime])

  // 重新获取所有数据
  const refetchAllData = useCallback(async (): Promise<void> => {
    try {
      console.log('🔄 重新获取所有工厂数据...')
      await Promise.all([
        refetchTemplatesQuery(),
        refetchTotalTemplates()
      ])
    } catch (err) {
      console.error('❌ Refetch all factory data error:', err)
    }
  }, [refetchTemplatesQuery, refetchTotalTemplates])

  // 重置状态
  const resetState = useCallback((): void => {
    setError(null)
    setTransactionHash(undefined)
    transactionHashRef.current = undefined
    resetCreateTemplate()
    resetUpdateTemplate()
    resetSetTemplateActive()
    resetCreateAgent()
    resetCreateAgents()
  }, [
    resetCreateTemplate,
    resetUpdateTemplate,
    resetSetTemplateActive,
    resetCreateAgent,
    resetCreateAgents
  ])

  // 组合状态
  const isLoadingTemplates = isLoadingTemplatesQuery

  // 使用 useMemo 优化返回值，避免不必要的重新渲染
  const result = useMemo(() => ({
    // 模板管理功能（管理员）
    createTemplate,
    updateTemplate,
    setTemplateActive,
    
    // Agent 创建功能（用户）
    createAgentFromTemplate,
    createAgentsFromTemplate,
    
    // 查询功能
    getTemplate,
    getAllTemplates,
    getAgentTemplates,
    getTotalTemplates,
    templateExists,
    
    // 实时数据
    templates,
    totalTemplates,
    agentTemplates,
    
    // 状态
    isCreatingTemplate,
    isUpdatingTemplate,
    isSettingTemplateActive,
    isCreatingAgent,
    isCreatingAgents,
    isConfirming,
    isConfirmed,
    isLoadingTemplates,
    error,
    hash: transactionHash,
    
    // 工具函数
    refetchTemplates,
    refetchAllData,
    resetState
  }), [
    createTemplate,
    updateTemplate,
    setTemplateActive,
    createAgentFromTemplate,
    createAgentsFromTemplate,
    getTemplate,
    getAllTemplates,
    getAgentTemplates,
    getTotalTemplates,
    templateExists,
    templates,
    totalTemplates,
    agentTemplates,
    isCreatingTemplate,
    isUpdatingTemplate,
    isSettingTemplateActive,
    isCreatingAgent,
    isCreatingAgents,
    isConfirming,
    isConfirmed,
    isLoadingTemplates,
    error,
    transactionHash,
    refetchTemplates,
    refetchAllData,
    resetState
  ])

  return result
}
