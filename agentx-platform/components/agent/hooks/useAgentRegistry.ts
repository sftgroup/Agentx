// components/agent/hooks/useAgentRegistry.ts
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

const IDENTITY_REGISTRY_ADDRESS = validateAddress(process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS)

// 完整的 ABI 定义，与智能合约完全匹配
const IDENTITY_REGISTRY_ABI = [
  // 注册函数 - 三个重载版本
  {
    name: 'register',
    type: 'function',
    inputs: [],
    outputs: [{ name: 'agentId', type: 'uint256' }],
    stateMutability: 'payable'
  },
  {
    name: 'register',
    type: 'function',
    inputs: [{ name: 'tokenURI', type: 'string' }],
    outputs: [{ name: 'agentId', type: 'uint256' }],
    stateMutability: 'payable'
  },
  {
    name: 'registerWithMetadata',
    type: 'function',
    inputs: [
      { name: 'tokenURI', type: 'string' },
      { 
        name: 'metadata', 
        type: 'tuple[]',
        components: [
          { name: 'key', type: 'string' },
          { name: 'value', type: 'bytes' }
        ]
      }
    ],
    outputs: [{ name: 'agentId', type: 'uint256' }],
    stateMutability: 'payable'
  },
  
  // 查询函数
  {
    name: 'getAgentsByOwner',
    type: 'function',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[]' }],
    stateMutability: 'view'
  },
  {
    name: 'getCurrentAgentId',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    name: 'agentExists',
    type: 'function',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view'
  },
  
  // 元数据函数
  {
    name: 'setMetadata',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'key', type: 'string' },
      { name: 'value', type: 'bytes' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    name: 'getMetadata',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'key', type: 'string' }
    ],
    outputs: [{ name: 'value', type: 'bytes' }],
    stateMutability: 'view'
  },
  
  // 管理函数
  {
    name: 'setRegistrationFee',
    type: 'function',
    inputs: [{ name: 'fee', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    name: 'withdrawFees',
    type: 'function',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  
  // 事件定义
  {
    name: 'Registered',
    type: 'event',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'tokenURI', type: 'string', indexed: false },
      { name: 'owner', type: 'address', indexed: true }
    ]
  },
  {
    name: 'MetadataSet',
    type: 'event',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'indexedKey', type: 'bytes32', indexed: true },
      { name: 'key', type: 'string', indexed: false },
      { name: 'value', type: 'bytes', indexed: false }
    ]
  }
] as const

// TypeScript 接口定义
interface UseAgentRegistryReturn {
  // 注册功能
  registerAgent: () => Promise<`0x${string}` | undefined>
  registerAgentWithTokenURI: (tokenURI: string) => Promise<`0x${string}` | undefined>
  registerAgentWithMetadata: (tokenURI: string, metadata: Array<{key: string, value: string}>) => Promise<`0x${string}` | undefined>
  
  // 查询功能
  userAgents: number[]
  currentAgentId: number
  checkAgentExists: (agentId: number) => Promise<boolean>
  refetchAgents: () => Promise<void>
  refetchCurrentAgentId: () => Promise<void>
  
  // 元数据功能
  setMetadata: (agentId: number, key: string, value: string) => Promise<`0x${string}` | undefined>
  getMetadata: (agentId: number, key: string) => Promise<string>
  
  // 状态
  isRegistering: boolean
  isConfirming: boolean
  isConfirmed: boolean
  isSettingMetadata: boolean
  error: Error | null
  hash: `0x${string}` | undefined
  
  // 工具函数
  resetState: () => void
}

export function useAgentRegistry(): UseAgentRegistryReturn {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: blockNumber } = useBlockNumber({ watch: true })
  
  const [userAgents, setUserAgents] = useState<number[]>([])
  const [currentAgentId, setCurrentAgentId] = useState<number>(0)
  const [error, setError] = useState<Error | null>(null)
  const [transactionHash, setTransactionHash] = useState<`0x${string}` | undefined>()
  const [lastRefetchTime, setLastRefetchTime] = useState<number>(0)
  const [forceRefresh, setForceRefresh] = useState<number>(0)
  
  // 使用 ref 来存储最新的交易哈希，避免闭包问题
  const transactionHashRef = useRef<`0x${string}` | undefined>()

  // 注册交易 - 无参数版本
  const { 
    writeContractAsync: registerWithoutURIAsync,
    isPending: isRegisteringWithoutURI,
    error: registerWithoutURIError,
    reset: resetRegisterWithoutURI
  } = useWriteContract()

  // 注册交易 - 带 tokenURI 版本
  const { 
    writeContractAsync: registerWithURIAsync,
    isPending: isRegisteringWithURI,
    error: registerWithURIError,
    reset: resetRegisterWithURI
  } = useWriteContract()

  // 注册交易 - 带元数据版本
  const { 
    writeContractAsync: registerWithMetadataAsync,
    isPending: isRegisteringWithMetadata,
    error: registerWithMetadataError,
    reset: resetRegisterWithMetadata
  } = useWriteContract()

  // 设置元数据交易
  const { 
    writeContractAsync: setMetadataAsync,
    isPending: isSettingMetadata,
    error: setMetadataError,
    reset: resetSetMetadata
  } = useWriteContract()

  // 统一的交易确认状态
  const { 
    isLoading: isConfirming, 
    isSuccess: isConfirmed,
    data: receipt
  } = useWaitForTransactionReceipt({
    hash: transactionHash,
  })

  // 获取用户拥有的 Agents - 修复：添加防重复查询
  const { 
    data: agentsData, 
    refetch: refetchAgentsQuery,
    error: agentsError,
    isLoading: isLoadingAgents
  } = useReadContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: 'getAgentsByOwner',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && isConnected,
      staleTime: 0, // 立即过期，确保每次都会重新获取
    },
  })

  // 获取当前 Agent ID - 修复：添加自动刷新
  const { 
    data: currentAgentIdData,
    error: currentAgentIdError,
    refetch: refetchCurrentAgentIdQuery,
    isLoading: isLoadingCurrentAgentId
  } = useReadContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: 'getCurrentAgentId',
    query: {
      enabled: true,
      staleTime: 0, // 立即过期，确保每次都会重新获取
    },
  })

  // 检查 Agent 是否存在
  const checkAgentExists = useCallback(async (agentId: number): Promise<boolean> => {
    try {
      if (!agentId || agentId <= 0) {
        return false
      }

      if (!publicClient) {
        console.error('Public client not available')
        return false
      }

      const result = await publicClient.readContract({
        address: IDENTITY_REGISTRY_ADDRESS,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'agentExists',
        args: [BigInt(agentId)],
      })

      return result as boolean
    } catch (err) {
      console.error('Check agent exists error:', err)
      return false
    }
  }, [publicClient])

  // 获取元数据
  const getMetadata = useCallback(async (agentId: number, key: string): Promise<string> => {
    try {
      if (!agentId || agentId <= 0) {
        throw new Error('无效的 Agent ID')
      }

      if (!key || key.trim().length === 0) {
        throw new Error('元数据键不能为空')
      }

      if (!publicClient) {
        throw new Error('Public client not available')
      }

      const result = await publicClient.readContract({
        address: IDENTITY_REGISTRY_ADDRESS,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'getMetadata',
        args: [BigInt(agentId), key],
      })
      
      if (result) {
        return bytesToString(result as `0x${string}`)
      }
      
      return ''
    } catch (err) {
      console.error('Get metadata error:', err)
      return ''
    }
  }, [publicClient])

  // 错误处理 Effect
  useEffect(() => {
    const currentError = registerWithoutURIError || registerWithURIError || 
                        registerWithMetadataError || setMetadataError ||
                        agentsError || currentAgentIdError
    
    if (currentError) {
      setError(currentError)
    }
  }, [
    registerWithoutURIError, registerWithURIError, registerWithMetadataError,
    setMetadataError, agentsError, currentAgentIdError
  ])

  // 数据同步 Effect - 修复：添加去重逻辑和强制刷新
  useEffect(() => {
    if (agentsData) {
      try {
        const agents = agentsData.map((id: bigint) => Number(id))
        
        // 去重逻辑：确保没有重复的 Agent ID
        const uniqueAgents = Array.from(new Set(agents))
        
        console.log('🔄 原始 Agent 数据:', agents)
        console.log('✅ 去重后 Agent 数据:', uniqueAgents)
        
        // 只有当数据发生变化时才更新状态
        if (JSON.stringify(uniqueAgents) !== JSON.stringify(userAgents)) {
          console.log('🔄 更新 Agents 列表:', userAgents, '->', uniqueAgents)
          setUserAgents(uniqueAgents)
        }
      } catch (err) {
        console.error('Error processing agents data:', err)
        setUserAgents([])
      }
    } else {
      // 如果没有数据，确保清空列表
      if (userAgents.length > 0) {
        console.log('🔄 清空 Agents 列表')
        setUserAgents([])
      }
    }
  }, [agentsData, userAgents, forceRefresh])

  // 当前 Agent ID 同步 Effect - 修复：强制更新机制
  useEffect(() => {
    if (currentAgentIdData !== undefined) {
      try {
        const newAgentId = Number(currentAgentIdData)
        console.log('🔄 当前 Agent ID 数据更新:', newAgentId)
        
        if (newAgentId !== currentAgentId) {
          console.log('✅ 更新当前 Agent ID:', currentAgentId, '->', newAgentId)
          setCurrentAgentId(newAgentId)
        } else {
          console.log('ℹ️ 当前 Agent ID 没有变化:', currentAgentId)
        }
      } catch (err) {
        console.error('Error processing current agent ID:', err)
        setCurrentAgentId(0)
      }
    } else {
      console.log('⚠️ 当前 Agent ID 数据为空')
    }
  }, [currentAgentIdData, currentAgentId, forceRefresh])

  // 修复：监听区块高度变化，自动刷新数据
  useEffect(() => {
    if (blockNumber) {
      console.log('📦 新区块:', blockNumber, '触发数据刷新')
      // 每次新区块都强制刷新数据
      setForceRefresh(prev => prev + 1)
    }
  }, [blockNumber])

  // 修复：监听交易确认，强制刷新所有数据
  useEffect(() => {
    if (isConfirmed && receipt) {
      console.log('🎉 交易确认成功，强制刷新所有数据')
      console.log('📄 交易收据:', receipt)
      
      // 强制刷新所有数据
      setForceRefresh(prev => prev + 1)
      
      // 立即重新获取数据
      setTimeout(() => {
        console.log('🔄 立即重新获取 Agent 数据...')
        refetchAgentsQuery()
        refetchCurrentAgentIdQuery()
      }, 1000)
    }
  }, [isConfirmed, receipt, refetchAgentsQuery, refetchCurrentAgentIdQuery])

  // 字符串到 bytes 转换工具函数
  const stringToBytes = useCallback((value: string): `0x${string}` => {
    try {
      return `0x${Buffer.from(value, 'utf8').toString('hex')}` as `0x${string}`
    } catch (err) {
      console.error('Error converting string to bytes:', err)
      return '0x' as `0x${string}`
    }
  }, [])

  // bytes 到字符串转换工具函数
  const bytesToString = useCallback((bytes: `0x${string}`): string => {
    try {
      return Buffer.from(bytes.slice(2), 'hex').toString('utf8')
    } catch (err) {
      console.error('Error converting bytes to string:', err)
      return ''
    }
  }, [])

  // 注册函数 - 无参数版本
  const registerAgent = useCallback(async (): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      setError(null)
      
      console.log('🔄 开始注册 Agent...')
      const hash = await registerWithoutURIAsync({
        address: IDENTITY_REGISTRY_ADDRESS,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'register',
        value: BigInt(1000000000000000), // 0.001 ETH
      })

      console.log('✅ 注册交易提交成功，哈希:', hash)
      setTransactionHash(hash)
      transactionHashRef.current = hash
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('注册失败')
      setError(error)
      console.error('❌ Register agent error:', err)
      return undefined
    }
  }, [isConnected, address, registerWithoutURIAsync])

  // 注册函数 - 带 tokenURI 版本
  const registerAgentWithTokenURI = useCallback(async (tokenURI: string): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (!tokenURI || tokenURI.trim().length === 0) {
        throw new Error('Token URI 不能为空')
      }

      setError(null)
      
      console.log('🔄 开始注册带 Token URI 的 Agent...')
      const hash = await registerWithURIAsync({
        address: IDENTITY_REGISTRY_ADDRESS,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'register',
        args: [tokenURI],
        value: BigInt(1000000000000000), // 0.001 ETH
      })

      console.log('✅ 注册交易提交成功，哈希:', hash)
      setTransactionHash(hash)
      transactionHashRef.current = hash
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('注册失败')
      setError(error)
      console.error('❌ Register agent with tokenURI error:', err)
      return undefined
    }
  }, [isConnected, address, registerWithURIAsync])

  // 注册函数 - 带元数据版本
  const registerAgentWithFullMetadata = useCallback(async (
    tokenURI: string, 
    metadata: Array<{key: string, value: string}>
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (!tokenURI || tokenURI.trim().length === 0) {
        throw new Error('Token URI 不能为空')
      }

      if (!metadata || metadata.length === 0) {
        throw new Error('元数据不能为空')
      }

      // 修复：使用正确的元组类型
      const formattedMetadata = metadata.map(item => ({
        key: item.key,
        value: stringToBytes(item.value)
      })) as readonly {
        readonly key: string
        readonly value: `0x${string}`
      }[]

      setError(null)
      
      console.log('🔄 开始注册带元数据的 Agent...')
      const hash = await registerWithMetadataAsync({
        address: IDENTITY_REGISTRY_ADDRESS,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'registerWithMetadata',
        args: [tokenURI, formattedMetadata],
        value: BigInt(1000000000000000), // 0.001 ETH
      })

      console.log('✅ 注册交易提交成功，哈希:', hash)
      setTransactionHash(hash)
      transactionHashRef.current = hash
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('注册失败')
      setError(error)
      console.error('❌ Register agent with metadata error:', err)
      return undefined
    }
  }, [isConnected, address, registerWithMetadataAsync, stringToBytes])

  // 设置元数据
  const setMetadata = useCallback(async (
    agentId: number, 
    key: string, 
    value: string
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (!agentId || agentId <= 0) {
        throw new Error('无效的 Agent ID')
      }

      if (!key || key.trim().length === 0) {
        throw new Error('元数据键不能为空')
      }

      setError(null)
      
      const valueBytes = stringToBytes(value)
      
      const hash = await setMetadataAsync({
        address: IDENTITY_REGISTRY_ADDRESS,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'setMetadata',
        args: [BigInt(agentId), key, valueBytes],
      })

      setTransactionHash(hash)
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('设置元数据失败')
      setError(error)
      console.error('Set metadata error:', err)
      return undefined
    }
  }, [isConnected, address, setMetadataAsync, stringToBytes])

  // 重新获取用户 Agents
  const refetchAgents = useCallback(async (): Promise<void> => {
    try {
      const now = Date.now()
      // 防止频繁调用：1秒内只能调用一次
      if (now - lastRefetchTime < 1000) {
        console.log('⏰ 防重复调用：跳过重复的 refetch')
        return
      }
      
      setLastRefetchTime(now)
      console.log('🔄 开始重新获取 Agent 列表...')
      
      const result = await refetchAgentsQuery()
      console.log('✅ 重新获取 Agent 列表结果:', result)
      
    } catch (err) {
      console.error('❌ Refetch agents error:', err)
    }
  }, [refetchAgentsQuery, lastRefetchTime])

  // 专门刷新当前 Agent ID 的函数
  const refetchCurrentAgentId = useCallback(async (): Promise<void> => {
    try {
      const now = Date.now()
      // 防止频繁调用：1秒内只能调用一次
      if (now - lastRefetchTime < 1000) {
        console.log('⏰ 防重复调用：跳过重复的当前 Agent ID refetch')
        return
      }
      
      setLastRefetchTime(now)
      console.log('🔄 开始重新获取当前 Agent ID...')
      
      const result = await refetchCurrentAgentIdQuery()
      console.log('✅ 重新获取当前 Agent ID 结果:', result)
      
    } catch (err) {
      console.error('❌ Refetch current agent ID error:', err)
    }
  }, [refetchCurrentAgentIdQuery, lastRefetchTime])

  // 重置状态
  const resetState = useCallback((): void => {
    setError(null)
    setTransactionHash(undefined)
    transactionHashRef.current = undefined
    resetRegisterWithoutURI()
    resetRegisterWithURI()
    resetRegisterWithMetadata()
    resetSetMetadata()
  }, [resetRegisterWithoutURI, resetRegisterWithURI, resetRegisterWithMetadata, resetSetMetadata])

  // 组合状态
  const isRegistering = isRegisteringWithoutURI || isRegisteringWithURI || isRegisteringWithMetadata

  // 使用 useMemo 优化返回值，避免不必要的重新渲染
  const result = useMemo(() => ({
    // 注册功能
    registerAgent,
    registerAgentWithTokenURI,
    registerAgentWithMetadata: registerAgentWithFullMetadata,
    
    // 查询功能
    userAgents,
    currentAgentId,
    checkAgentExists,
    refetchAgents,
    refetchCurrentAgentId,
    
    // 元数据功能
    setMetadata,
    getMetadata,
    
    // 状态
    isRegistering,
    isConfirming,
    isConfirmed,
    isSettingMetadata,
    error,
    hash: transactionHash,
    
    // 工具函数
    resetState
  }), [
    registerAgent,
    registerAgentWithTokenURI,
    registerAgentWithFullMetadata,
    userAgents,
    currentAgentId,
    checkAgentExists,
    refetchAgents,
    refetchCurrentAgentId,
    setMetadata,
    getMetadata,
    isRegistering,
    isConfirming,
    isConfirmed,
    isSettingMetadata,
    error,
    transactionHash,
    resetState
  ])

  return result
}
