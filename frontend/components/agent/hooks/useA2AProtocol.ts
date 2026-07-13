// components/agent/hooks/useA2AProtocol.ts
'use client'

import { useWriteContract, useReadContract, useAccount } from 'wagmi'
import { useState, useEffect } from 'react'

// 导出类型定义
export interface AgentCard {
  cardId: bigint
  agentId: bigint
  name: string
  description: string
  version: string
  capabilities: string[]
  supportedTasks: string[]
  communicationProtocol: string
  authenticationMethod: string
  cardURI: string
  isActive: boolean
  createdAt: bigint
  updatedAt: bigint
  createdBy: `0x${string}`
}

export interface AgentSkill {
  agentId: bigint
  skillId: bigint
  skillEndpoint: string
  version: string
  price: bigint
  priceToken: `0x${string}`
  isActive: boolean
  registeredAt: bigint
}

export interface A2ASkill {
  skillId: bigint
  name: string
  description: string
  inputSchema: string
  outputSchema: string
  requiredCapabilities: string[]
  complexity: bigint
  isActive: boolean
  createdAt: bigint
}

// 确保地址是有效的 0x 格式
const A2A_PROTOCOL_ADDRESS = (process.env.NEXT_PUBLIC_A2A_PROTOCOL_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`
const A2A_PROTOCOL_ABI = [
  {
    name: 'createAgentCard',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'name', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'capabilities', type: 'string[]' },
      { name: 'supportedTasks', type: 'string[]' },
      { name: 'communicationProtocol', type: 'string' },
      { name: 'authenticationMethod', type: 'string' },
      { name: 'cardURI', type: 'string' }
    ],
    outputs: [{ name: 'cardId', type: 'uint256' }],
    stateMutability: 'nonpayable'
  },
  {
    name: 'getAgentCard',
    type: 'function',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'cardId', type: 'uint256' },
          { name: 'agentId', type: 'uint256' },
          { name: 'name', type: 'string' },
          { name: 'description', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'capabilities', type: 'string[]' },
          { name: 'supportedTasks', type: 'string[]' },
          { name: 'communicationProtocol', type: 'string' },
          { name: 'authenticationMethod', type: 'string' },
          { name: 'cardURI', type: 'string' },
          { name: 'isActive', type: 'bool' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'updatedAt', type: 'uint256' },
          { name: 'createdBy', type: 'address' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  {
    name: 'registerSkill',
    type: 'function',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'inputSchema', type: 'string' },
      { name: 'outputSchema', type: 'string' },
      { name: 'requiredCapabilities', type: 'string[]' },
      { name: 'complexity', type: 'uint256' }
    ],
    outputs: [{ name: 'skillId', type: 'uint256' }],
    stateMutability: 'nonpayable'
  },
  {
    name: 'addAgentSkill',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'skillId', type: 'uint256' },
      { name: 'skillEndpoint', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'price', type: 'uint256' },
      { name: 'priceToken', type: 'address' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    name: 'getAgentSkills',
    type: 'function',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'agentId', type: 'uint256' },
          { name: 'skillId', type: 'uint256' },
          { name: 'skillEndpoint', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'price', type: 'uint256' },
          { name: 'priceToken', type: 'address' },
          { name: 'isActive', type: 'bool' },
          { name: 'registeredAt', type: 'uint256' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  {
    name: 'getAllSkills',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'skillId', type: 'uint256' },
          { name: 'name', type: 'string' },
          { name: 'description', type: 'string' },
          { name: 'inputSchema', type: 'string' },
          { name: 'outputSchema', type: 'string' },
          { name: 'requiredCapabilities', type: 'string[]' },
          { name: 'complexity', type: 'uint256' },
          { name: 'isActive', type: 'bool' },
          { name: 'createdAt', type: 'uint256' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  {
    name: 'createTask',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'taskType', type: 'string' },
      { name: 'inputData', type: 'string' }
    ],
    outputs: [{ name: 'taskId', type: 'uint256' }],
    stateMutability: 'nonpayable'
  },
  {
    name: 'completeTask',
    type: 'function',
    inputs: [
      { name: 'taskId', type: 'uint256' },
      { name: 'outputData', type: 'string' },
      { name: 'status', type: 'uint256' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  }
] as const

export function useA2AProtocol() {
  const { address } = useAccount()
  const [currentAgentId, setCurrentAgentId] = useState<bigint | null>(null)
  const [agentCard, setAgentCard] = useState<AgentCard | null>(null)
  const [agentSkills, setAgentSkills] = useState<AgentSkill[]>([])
  const [allSkills, setAllSkills] = useState<A2ASkill[]>([])

  // 创建Agent卡片
  const { 
    writeContract: createAgentCardWrite,
    isPending: isCreatingCard,
    error: createCardError
  } = useWriteContract()

  // 注册技能
  const { 
    writeContract: registerSkillWrite,
    isPending: isRegisteringSkill,
    error: registerSkillError
  } = useWriteContract()

  // 添加Agent技能
  const { 
    writeContract: addAgentSkillWrite,
    isPending: isAddingSkill,
    error: addSkillError
  } = useWriteContract()

  // 创建任务
  const { 
    writeContract: createTaskWrite,
    isPending: isCreatingTask,
    error: createTaskError
  } = useWriteContract()

  // 完成任务
  const { 
    writeContract: completeTaskWrite,
    isPending: isCompletingTask,
    error: completeTaskError
  } = useWriteContract()

  // 获取Agent卡片 - 修复：使用 useReadContract 正确获取数据
  const { 
    data: agentCardData,
    refetch: refetchAgentCard,
    isPending: isLoadingCard
  } = useReadContract({
    address: A2A_PROTOCOL_ADDRESS,
    abi: A2A_PROTOCOL_ABI,
    functionName: 'getAgentCard',
    args: currentAgentId ? [currentAgentId] : undefined,
    query: {
      enabled: !!currentAgentId,
    },
  })

  // 获取Agent技能 - 修复：使用 useReadContract 正确获取数据
  const { 
    data: agentSkillsData,
    refetch: refetchAgentSkills,
    isPending: isLoadingSkills
  } = useReadContract({
    address: A2A_PROTOCOL_ADDRESS,
    abi: A2A_PROTOCOL_ABI,
    functionName: 'getAgentSkills',
    args: currentAgentId ? [currentAgentId] : undefined,
    query: {
      enabled: !!currentAgentId,
    },
  })

  // 获取所有技能 - 修复：使用 useReadContract 正确获取数据
  const { 
    data: allSkillsData,
    refetch: refetchAllSkills,
    isPending: isLoadingAllSkills
  } = useReadContract({
    address: A2A_PROTOCOL_ADDRESS,
    abi: A2A_PROTOCOL_ABI,
    functionName: 'getAllSkills',
  })

  // 修复：监听数据变化并更新状态
  useEffect(() => {
    if (agentCardData) {
      setAgentCard(agentCardData as AgentCard)
    } else {
      setAgentCard(null)
    }
  }, [agentCardData])

  useEffect(() => {
    if (agentSkillsData) {
      setAgentSkills(agentSkillsData as AgentSkill[])
    } else {
      setAgentSkills([])
    }
  }, [agentSkillsData])

  useEffect(() => {
    if (allSkillsData) {
      setAllSkills(allSkillsData as A2ASkill[])
    } else {
      setAllSkills([])
    }
  }, [allSkillsData])

  const createAgentCard = async (
    agentId: number,
    name: string,
    description: string,
    version: string,
    capabilities: string[],
    supportedTasks: string[],
    communicationProtocol: string,
    authenticationMethod: string,
    cardURI: string
  ) => {
    if (!address) throw new Error('请先连接钱包')
    
    // 修复：移除返回值检查，直接调用函数
    await createAgentCardWrite({
      address: A2A_PROTOCOL_ADDRESS,
      abi: A2A_PROTOCOL_ABI,
      functionName: 'createAgentCard',
      args: [
        BigInt(agentId),
        name,
        description,
        version,
        capabilities,
        supportedTasks,
        communicationProtocol,
        authenticationMethod,
        cardURI
      ]
    })

    // 修复：创建成功后立即刷新卡片数据（不检查返回值）
    setTimeout(() => {
      getAgentCard(agentId)
    }, 2000) // 等待2秒让链上确认
  }

  const registerSkill = async (
    name: string,
    description: string,
    inputSchema: string,
    outputSchema: string,
    requiredCapabilities: string[],
    complexity: number
  ) => {
    if (!address) throw new Error('请先连接钱包')
    
    return await registerSkillWrite({
      address: A2A_PROTOCOL_ADDRESS,
      abi: A2A_PROTOCOL_ABI,
      functionName: 'registerSkill',
      args: [
        name,
        description,
        inputSchema,
        outputSchema,
        requiredCapabilities,
        BigInt(complexity)
      ]
    })
  }

  const addAgentSkill = async (
    agentId: number,
    skillId: number,
    skillEndpoint: string,
    version: string,
    price: number,
    priceToken: string
  ) => {
    if (!address) throw new Error('请先连接钱包')
    
    return await addAgentSkillWrite({
      address: A2A_PROTOCOL_ADDRESS,
      abi: A2A_PROTOCOL_ABI,
      functionName: 'addAgentSkill',
      args: [
        BigInt(agentId),
        BigInt(skillId),
        skillEndpoint,
        version,
        BigInt(price),
        priceToken as `0x${string}`
      ]
    })
  }

  const createTask = async (
    agentId: number,
    taskType: string,
    inputData: string
  ) => {
    if (!address) throw new Error('请先连接钱包')
    
    return await createTaskWrite({
      address: A2A_PROTOCOL_ADDRESS,
      abi: A2A_PROTOCOL_ABI,
      functionName: 'createTask',
      args: [
        BigInt(agentId),
        taskType,
        inputData
      ]
    })
  }

  const completeTask = async (
    taskId: number,
    outputData: string,
    status: number
  ) => {
    if (!address) throw new Error('请先连接钱包')
    
    return await completeTaskWrite({
      address: A2A_PROTOCOL_ADDRESS,
      abi: A2A_PROTOCOL_ABI,
      functionName: 'completeTask',
      args: [
        BigInt(taskId),
        outputData,
        BigInt(status)
      ]
    })
  }

  // 修复：简化 getAgentCard 函数，直接设置 currentAgentId 触发 useReadContract
  const getAgentCard = async (agentId: number): Promise<AgentCard | null> => {
    try {
      setCurrentAgentId(BigInt(agentId))
      const result = await refetchAgentCard()
      return result.data as AgentCard || null
    } catch (error) {
      console.error('Failed to get agent card:', error)
      return null
    }
  }

  // 修复：简化 getAgentSkills 函数
  const getAgentSkills = async (agentId: number): Promise<AgentSkill[]> => {
    try {
      setCurrentAgentId(BigInt(agentId))
      const result = await refetchAgentSkills()
      return (result.data as AgentSkill[]) || []
    } catch (error) {
      console.error('Failed to get agent skills:', error)
      return []
    }
  }

  // 修复：简化 getAllSkills 函数
  const getAllSkills = async (): Promise<A2ASkill[]> => {
    try {
      const result = await refetchAllSkills()
      return (result.data as A2ASkill[]) || []
    } catch (error) {
      console.error('Failed to get all skills:', error)
      return []
    }
  }

  return {
    // Agent卡片功能
    createAgentCard,
    getAgentCard,
    agentCard, // 修复：直接返回卡片数据
    isCreatingCard,
    createCardError,

    // 技能功能
    registerSkill,
    addAgentSkill,
    getAgentSkills,
    getAllSkills,
    agentSkills, // 修复：直接返回技能数据
    allSkills,   // 修复：直接返回所有技能数据

    // 任务功能
    createTask,
    completeTask,
    isCreatingTask,
    isCompletingTask,

    // 状态
    isLoading: isCreatingCard || isLoadingCard || isLoadingSkills || isLoadingAllSkills || isRegisteringSkill || isAddingSkill,
    error: createCardError || registerSkillError || addSkillError || createTaskError || completeTaskError
  }
}
