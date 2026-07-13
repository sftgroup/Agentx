// components/agent/hooks/useMultiEndpoint.ts
'use client'

import { 
  useWriteContract, 
  useReadContract, 
  useAccount, 
  useWaitForTransactionReceipt,
  useBlockNumber,
  usePublicClient 
} from 'wagmi'
import { useState, useEffect, useCallback, useMemo } from 'react'

// 生产级环境变量验证
const validateAddress = (address: string | undefined): `0x${string}` => {
  if (!address || !address.startsWith('0x') || address.length !== 42) {
    console.error('Invalid contract address:', address)
    return '0x0000000000000000000000000000000000000000'
  }
  return address as `0x${string}`
}

const MULTI_ENDPOINT_ADDRESS = validateAddress(process.env.NEXT_PUBLIC_MULTI_ENDPOINT_ADDRESS)

// 完整的 ABI 定义，与智能合约完全匹配
const MULTI_ENDPOINT_ABI = [
  // 端点管理函数
  {
    name: 'createEndpoint',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'name', type: 'string' },
      { name: 'endpointType', type: 'string' },
      { name: 'protocol', type: 'string' },
      { name: 'url', type: 'string' },
      { name: 'description', type: 'string' }
    ],
    outputs: [{ name: 'endpointId', type: 'uint256' }],
    stateMutability: 'nonpayable'
  },
  {
    name: 'updateEndpoint',
    type: 'function',
    inputs: [
      { name: 'endpointId', type: 'uint256' },
      { name: 'name', type: 'string' },
      { name: 'endpointType', type: 'string' },
      { name: 'protocol', type: 'string' },
      { name: 'url', type: 'string' },
      { name: 'description', type: 'string' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    name: 'deactivateEndpoint',
    type: 'function',
    inputs: [{ name: 'endpointId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    name: 'addProtocolSupport',
    type: 'function',
    inputs: [
      { name: 'protocol', type: 'string' },
      { name: 'maxEndpointsPerAgent', type: 'uint256' },
      { name: 'requiredParams', type: 'string[]' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  
  // 查询函数
  {
    name: 'getEndpoint',
    type: 'function',
    inputs: [{ name: 'endpointId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'endpointId', type: 'uint256' },
          { name: 'agentId', type: 'uint256' },
          { name: 'name', type: 'string' },
          { name: 'endpointType', type: 'string' },
          { name: 'protocol', type: 'string' },
          { name: 'url', type: 'string' },
          { name: 'description', type: 'string' },
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
    name: 'getAgentEndpoints',
    type: 'function',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'endpointId', type: 'uint256' },
          { name: 'agentId', type: 'uint256' },
          { name: 'name', type: 'string' },
          { name: 'endpointType', type: 'string' },
          { name: 'protocol', type: 'string' },
          { name: 'url', type: 'string' },
          { name: 'description', type: 'string' },
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
    name: 'getActiveAgentEndpoints',
    type: 'function',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'endpointId', type: 'uint256' },
          { name: 'agentId', type: 'uint256' },
          { name: 'name', type: 'string' },
          { name: 'endpointType', type: 'string' },
          { name: 'protocol', type: 'string' },
          { name: 'url', type: 'string' },
          { name: 'description', type: 'string' },
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
    name: 'getEndpointsByProtocol',
    type: 'function',
    inputs: [{ name: 'protocol', type: 'string' }],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'endpointId', type: 'uint256' },
          { name: 'agentId', type: 'uint256' },
          { name: 'name', type: 'string' },
          { name: 'endpointType', type: 'string' },
          { name: 'protocol', type: 'string' },
          { name: 'url', type: 'string' },
          { name: 'description', type: 'string' },
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
    name: 'getSupportedProtocols',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'string[]' }],
    stateMutability: 'view'
  },
  {
    name: 'getProtocolConfig',
    type: 'function',
    inputs: [{ name: 'protocol', type: 'string' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'protocol', type: 'string' },
          { name: 'isSupported', type: 'bool' },
          { name: 'maxEndpointsPerAgent', type: 'uint256' },
          { name: 'requiredParams', type: 'string[]' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  {
    name: 'isProtocolSupported',
    type: 'function',
    inputs: [{ name: 'protocol', type: 'string' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view'
  },
  {
    name: 'getAgentEndpointStats',
    type: 'function',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [
      { name: 'totalEndpoints', type: 'uint256' },
      { name: 'activeEndpoints', type: 'uint256' },
      { name: 'httpEndpoints', type: 'uint256' },
      { name: 'websocketEndpoints', type: 'uint256' },
      { name: 'grpcEndpoints', type: 'uint256' }
    ],
    stateMutability: 'view'
  },
  {
    name: 'searchEndpoints',
    type: 'function',
    inputs: [
      { name: 'endpointType', type: 'string' },
      { name: 'protocol', type: 'string' }
    ],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'endpointId', type: 'uint256' },
          { name: 'agentId', type: 'uint256' },
          { name: 'name', type: 'string' },
          { name: 'endpointType', type: 'string' },
          { name: 'protocol', type: 'string' },
          { name: 'url', type: 'string' },
          { name: 'description', type: 'string' },
          { name: 'isActive', type: 'bool' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'updatedAt', type: 'uint256' },
          { name: 'createdBy', type: 'address' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  
  // 事件定义
  {
    name: 'EndpointCreated',
    type: 'event',
    inputs: [
      { name: 'endpointId', type: 'uint256', indexed: true },
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'endpointType', type: 'string', indexed: false },
      { name: 'protocol', type: 'string', indexed: false },
      { name: 'url', type: 'string', indexed: false }
    ]
  },
  {
    name: 'EndpointUpdated',
    type: 'event',
    inputs: [
      { name: 'endpointId', type: 'uint256', indexed: true },
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'endpointType', type: 'string', indexed: false },
      { name: 'protocol', type: 'string', indexed: false },
      { name: 'url', type: 'string', indexed: false }
    ]
  },
  {
    name: 'EndpointDeactivated',
    type: 'event',
    inputs: [
      { name: 'endpointId', type: 'uint256', indexed: true },
      { name: 'agentId', type: 'uint256', indexed: true }
    ]
  },
  {
    name: 'ProtocolSupported',
    type: 'event',
    inputs: [
      { name: 'protocol', type: 'string', indexed: false },
      { name: 'maxEndpointsPerAgent', type: 'uint256', indexed: false }
    ]
  }
] as const

// TypeScript 接口定义
export interface Endpoint {
  endpointId: bigint
  agentId: bigint
  name: string
  endpointType: string
  protocol: string
  url: string
  description: string
  isActive: boolean
  createdAt: bigint
  updatedAt: bigint
  createdBy: `0x${string}`
}

export interface ProtocolConfig {
  protocol: string
  isSupported: boolean
  maxEndpointsPerAgent: bigint
  requiredParams: string[]
}

export interface EndpointStats {
  totalEndpoints: bigint
  activeEndpoints: bigint
  httpEndpoints: bigint
  websocketEndpoints: bigint
  grpcEndpoints: bigint
}

// 类型守卫函数 - 检查是否为 EndpointStats 类型
const isEndpointStats = (data: unknown): data is EndpointStats => {
  if (typeof data !== 'object' || data === null) return false
  const stats = data as Record<string, unknown>
  return (
    typeof stats.totalEndpoints === 'bigint' &&
    typeof stats.activeEndpoints === 'bigint' &&
    typeof stats.httpEndpoints === 'bigint' &&
    typeof stats.websocketEndpoints === 'bigint' &&
    typeof stats.grpcEndpoints === 'bigint'
  )
}

// 类型转换函数 - 将元组转换为 EndpointStats 对象
const tupleToEndpointStats = (tuple: readonly [bigint, bigint, bigint, bigint, bigint] | undefined): EndpointStats | null => {
  if (!tuple || !Array.isArray(tuple) || tuple.length !== 5) {
    return null
  }
  
  return {
    totalEndpoints: tuple[0],
    activeEndpoints: tuple[1],
    httpEndpoints: tuple[2],
    websocketEndpoints: tuple[3],
    grpcEndpoints: tuple[4]
  }
}

interface UseMultiEndpointReturn {
  // 端点操作
  createEndpoint: (
    agentId: number,
    name: string,
    endpointType: string,
    protocol: string,
    url: string,
    description: string
  ) => Promise<`0x${string}` | undefined>
  updateEndpoint: (
    endpointId: number,
    name: string,
    endpointType: string,
    protocol: string,
    url: string,
    description: string
  ) => Promise<`0x${string}` | undefined>
  deactivateEndpoint: (endpointId: number) => Promise<`0x${string}` | undefined>
  addProtocolSupport: (
    protocol: string,
    maxEndpointsPerAgent: number,
    requiredParams: string[]
  ) => Promise<`0x${string}` | undefined>
  
  // 查询功能
  getEndpoint: (endpointId: number) => Promise<Endpoint | null>
  getAgentEndpoints: (agentId: number) => Promise<Endpoint[]>
  getActiveAgentEndpoints: (agentId: number) => Promise<Endpoint[]>
  getEndpointsByProtocol: (protocol: string) => Promise<Endpoint[]>
  getSupportedProtocols: () => Promise<string[]>
  getProtocolConfig: (protocol: string) => Promise<ProtocolConfig | null>
  isProtocolSupported: (protocol: string) => Promise<boolean>
  getAgentEndpointStats: (agentId: number) => Promise<EndpointStats | null>
  searchEndpoints: (endpointType: string, protocol: string) => Promise<Endpoint[]>
  
  // 实时数据
  agentEndpoints: Endpoint[]
  activeAgentEndpoints: Endpoint[]
  endpointsByProtocol: Endpoint[]
  supportedProtocols: string[]
  protocolConfig: ProtocolConfig | null
  endpointStats: EndpointStats | null
  searchResults: Endpoint[]
  
  // 状态
  isCreatingEndpoint: boolean
  isUpdatingEndpoint: boolean
  isDeactivatingEndpoint: boolean
  isAddingProtocolSupport: boolean
  isLoading: boolean
  error: Error | null
  transactionHash: `0x${string}` | undefined
  isConfirming: boolean
  isConfirmed: boolean
  
  // 工具函数
  refetchData: () => Promise<void>
  resetState: () => void
}

export function useMultiEndpoint(): UseMultiEndpointReturn {
  const { address, isConnected } = useAccount()
  const { data: blockNumber } = useBlockNumber({ watch: true })
  const publicClient = usePublicClient()
  
  const [error, setError] = useState<Error | null>(null)
  const [transactionHash, setTransactionHash] = useState<`0x${string}` | undefined>()
  const [currentAgentId, setCurrentAgentId] = useState<number | null>(null)
  const [currentProtocol, setCurrentProtocol] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useState<{endpointType: string, protocol: string} | null>(null)

  // 创建端点 - 修复：使用 writeContractAsync
  const { 
    writeContractAsync: createEndpointAsync,
    isPending: isCreatingEndpoint,
    error: createEndpointError,
    reset: resetCreateEndpoint
  } = useWriteContract()

  // 更新端点 - 修复：使用 writeContractAsync
  const { 
    writeContractAsync: updateEndpointAsync,
    isPending: isUpdatingEndpoint,
    error: updateEndpointError,
    reset: resetUpdateEndpoint
  } = useWriteContract()

  // 停用端点 - 修复：使用 writeContractAsync
  const { 
    writeContractAsync: deactivateEndpointAsync,
    isPending: isDeactivatingEndpoint,
    error: deactivateEndpointError,
    reset: resetDeactivateEndpoint
  } = useWriteContract()

  // 添加协议支持 - 修复：使用 writeContractAsync
  const { 
    writeContractAsync: addProtocolSupportAsync,
    isPending: isAddingProtocolSupport,
    error: addProtocolSupportError,
    reset: resetAddProtocolSupport
  } = useWriteContract()

  // 统一的交易确认状态
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: transactionHash,
  })

  // 修复：使用 publicClient 替代 useReadContract 以避免 ABI 参数不匹配问题
  const [agentEndpoints, setAgentEndpoints] = useState<Endpoint[]>([])
  const [activeAgentEndpoints, setActiveAgentEndpoints] = useState<Endpoint[]>([])
  const [endpointsByProtocol, setEndpointsByProtocol] = useState<Endpoint[]>([])
  const [supportedProtocols, setSupportedProtocols] = useState<string[]>([])
  const [protocolConfig, setProtocolConfig] = useState<ProtocolConfig | null>(null)
  const [endpointStats, setEndpointStats] = useState<EndpointStats | null>(null)
  const [searchResults, setSearchResults] = useState<Endpoint[]>([])

  // 错误处理 Effect
  useEffect(() => {
    const currentError = createEndpointError || updateEndpointError || deactivateEndpointError || 
                        addProtocolSupportError
    
    if (currentError) {
      setError(currentError)
    }
  }, [
    createEndpointError, updateEndpointError, deactivateEndpointError, addProtocolSupportError
  ])

  // 数据自动刷新 Effect
  useEffect(() => {
    if (blockNumber) {
      if (currentAgentId !== null) {
        loadAgentEndpoints(currentAgentId)
        loadActiveAgentEndpoints(currentAgentId)
        loadEndpointStats(currentAgentId)
      }
      loadSupportedProtocols()
      if (currentProtocol) {
        loadProtocolConfig(currentProtocol)
      }
      if (searchParams) {
        loadSearchResults(searchParams.endpointType, searchParams.protocol)
      }
    }
  }, [
    blockNumber,
    currentAgentId,
    currentProtocol,
    searchParams
  ])

  // 修复：使用 publicClient 加载数据
  const loadAgentEndpoints = async (agentId: number) => {
    try {
      if (!publicClient) return
      
      const result = await publicClient.readContract({
        address: MULTI_ENDPOINT_ADDRESS,
        abi: MULTI_ENDPOINT_ABI,
        functionName: 'getAgentEndpoints',
        args: [BigInt(agentId)],
      })
      
      setAgentEndpoints(result as Endpoint[])
    } catch (err) {
      console.error('Load agent endpoints error:', err)
      setAgentEndpoints([])
    }
  }

  const loadActiveAgentEndpoints = async (agentId: number) => {
    try {
      if (!publicClient) return
      
      const result = await publicClient.readContract({
        address: MULTI_ENDPOINT_ADDRESS,
        abi: MULTI_ENDPOINT_ABI,
        functionName: 'getActiveAgentEndpoints',
        args: [BigInt(agentId)],
      })
      
      setActiveAgentEndpoints(result as Endpoint[])
    } catch (err) {
      console.error('Load active agent endpoints error:', err)
      setActiveAgentEndpoints([])
    }
  }

  const loadSupportedProtocols = async () => {
    try {
      if (!publicClient) return
      
      const result = await publicClient.readContract({
        address: MULTI_ENDPOINT_ADDRESS,
        abi: MULTI_ENDPOINT_ABI,
        functionName: 'getSupportedProtocols',
      })
      
      setSupportedProtocols(result as string[])
    } catch (err) {
      console.error('Load supported protocols error:', err)
      setSupportedProtocols([])
    }
  }

  const loadProtocolConfig = async (protocol: string) => {
    try {
      if (!publicClient) return
      
      const result = await publicClient.readContract({
        address: MULTI_ENDPOINT_ADDRESS,
        abi: MULTI_ENDPOINT_ABI,
        functionName: 'getProtocolConfig',
        args: [protocol],
      })
      
      setProtocolConfig(result as ProtocolConfig)
    } catch (err) {
      console.error('Load protocol config error:', err)
      setProtocolConfig(null)
    }
  }

  const loadEndpointStats = async (agentId: number) => {
    try {
      if (!publicClient) return
      
      const result = await publicClient.readContract({
        address: MULTI_ENDPOINT_ADDRESS,
        abi: MULTI_ENDPOINT_ABI,
        functionName: 'getAgentEndpointStats',
        args: [BigInt(agentId)],
      })
      
      // 修复：正确处理元组返回类型
      const stats = tupleToEndpointStats(result as readonly [bigint, bigint, bigint, bigint, bigint])
      setEndpointStats(stats)
    } catch (err) {
      console.error('Load endpoint stats error:', err)
      setEndpointStats(null)
    }
  }

  const loadSearchResults = async (endpointType: string, protocol: string) => {
    try {
      if (!publicClient) return
      
      const result = await publicClient.readContract({
        address: MULTI_ENDPOINT_ADDRESS,
        abi: MULTI_ENDPOINT_ABI,
        functionName: 'searchEndpoints',
        args: [endpointType, protocol],
      })
      
      setSearchResults(result as Endpoint[])
    } catch (err) {
      console.error('Load search results error:', err)
      setSearchResults([])
    }
  }

  // 创建端点 - 修复：使用 writeContractAsync
  const createEndpoint = useCallback(async (
    agentId: number,
    name: string,
    endpointType: string,
    protocol: string,
    url: string,
    description: string
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (agentId <= 0) {
        throw new Error('无效的Agent ID')
      }

      if (!name || name.trim().length === 0) {
        throw new Error('端点名称不能为空')
      }

      if (!endpointType || endpointType.trim().length === 0) {
        throw new Error('端点类型不能为空')
      }

      if (!protocol || protocol.trim().length === 0) {
        throw new Error('协议不能为空')
      }

      if (!url || url.trim().length === 0) {
        throw new Error('URL不能为空')
      }

      // 验证URL格式
      try {
        new URL(url)
      } catch {
        throw new Error('无效的URL格式')
      }

      setError(null)
      
      // 修复：使用 writeContractAsync 替代 writeContract
      const hash = await createEndpointAsync({
        address: MULTI_ENDPOINT_ADDRESS,
        abi: MULTI_ENDPOINT_ABI,
        functionName: 'createEndpoint',
        args: [
          BigInt(agentId),
          name,
          endpointType,
          protocol,
          url,
          description || ''
        ]
      })

      setTransactionHash(hash)
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('创建端点失败')
      setError(error)
      console.error('Create endpoint error:', err)
      return undefined
    }
  }, [isConnected, address, createEndpointAsync])

  // 更新端点 - 修复：使用 writeContractAsync
  const updateEndpoint = useCallback(async (
    endpointId: number,
    name: string,
    endpointType: string,
    protocol: string,
    url: string,
    description: string
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (endpointId <= 0) {
        throw new Error('无效的端点ID')
      }

      if (!name || name.trim().length === 0) {
        throw new Error('端点名称不能为空')
      }

      if (!endpointType || endpointType.trim().length === 0) {
        throw new Error('端点类型不能为空')
      }

      if (!protocol || protocol.trim().length === 0) {
        throw new Error('协议不能为空')
      }

      if (!url || url.trim().length === 0) {
        throw new Error('URL不能为空')
      }

      // 验证URL格式
      try {
        new URL(url)
      } catch {
        throw new Error('无效的URL格式')
      }

      setError(null)
      
      // 修复：使用 writeContractAsync 替代 writeContract
      const hash = await updateEndpointAsync({
        address: MULTI_ENDPOINT_ADDRESS,
        abi: MULTI_ENDPOINT_ABI,
        functionName: 'updateEndpoint',
        args: [
          BigInt(endpointId),
          name,
          endpointType,
          protocol,
          url,
          description || ''
        ]
      })

      setTransactionHash(hash)
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('更新端点失败')
      setError(error)
      console.error('Update endpoint error:', err)
      return undefined
    }
  }, [isConnected, address, updateEndpointAsync])

  // 停用端点 - 修复：使用 writeContractAsync
  const deactivateEndpoint = useCallback(async (
    endpointId: number
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (endpointId <= 0) {
        throw new Error('无效的端点ID')
      }

      setError(null)
      
      // 修复：使用 writeContractAsync 替代 writeContract
      const hash = await deactivateEndpointAsync({
        address: MULTI_ENDPOINT_ADDRESS,
        abi: MULTI_ENDPOINT_ABI,
        functionName: 'deactivateEndpoint',
        args: [BigInt(endpointId)]
      })

      setTransactionHash(hash)
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('停用端点失败')
      setError(error)
      console.error('Deactivate endpoint error:', err)
      return undefined
    }
  }, [isConnected, address, deactivateEndpointAsync])

  // 添加协议支持 - 修复：使用 writeContractAsync
  const addProtocolSupport = useCallback(async (
    protocol: string,
    maxEndpointsPerAgent: number,
    requiredParams: string[]
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (!protocol || protocol.trim().length === 0) {
        throw new Error('协议名称不能为空')
      }

      if (maxEndpointsPerAgent <= 0) {
        throw new Error('每个Agent的最大端点数必须大于0')
      }

      setError(null)
      
      // 修复：使用 writeContractAsync 替代 writeContract
      const hash = await addProtocolSupportAsync({
        address: MULTI_ENDPOINT_ADDRESS,
        abi: MULTI_ENDPOINT_ABI,
        functionName: 'addProtocolSupport',
        args: [
          protocol,
          BigInt(maxEndpointsPerAgent),
          requiredParams || []
        ]
      })

      setTransactionHash(hash)
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('添加协议支持失败')
      setError(error)
      console.error('Add protocol support error:', err)
      return undefined
    }
  }, [isConnected, address, addProtocolSupportAsync])

  // 获取端点详情 - 修复：使用 publicClient 替代 refetch
  const getEndpoint = useCallback(async (endpointId: number): Promise<Endpoint | null> => {
    try {
      if (endpointId <= 0) {
        return null
      }

      if (!publicClient) {
        console.error('Public client not available')
        return null
      }

      const result = await publicClient.readContract({
        address: MULTI_ENDPOINT_ADDRESS,
        abi: MULTI_ENDPOINT_ABI,
        functionName: 'getEndpoint',
        args: [BigInt(endpointId)],
      })

      return result as Endpoint || null
    } catch (err) {
      console.error('Get endpoint error:', err)
      return null
    }
  }, [publicClient])

  // 获取Agent的所有端点 - 修复：使用 publicClient 替代 refetch
  const getAgentEndpoints = useCallback(async (agentId: number): Promise<Endpoint[]> => {
    try {
      if (agentId <= 0) {
        return []
      }

      setCurrentAgentId(agentId)
      await loadAgentEndpoints(agentId)
      return agentEndpoints
    } catch (err) {
      console.error('Get agent endpoints error:', err)
      return []
    }
  }, [publicClient, agentEndpoints])

  // 获取Agent的活跃端点 - 修复：使用 publicClient 替代 refetch
  const getActiveAgentEndpoints = useCallback(async (agentId: number): Promise<Endpoint[]> => {
    try {
      if (agentId <= 0) {
        return []
      }

      setCurrentAgentId(agentId)
      await loadActiveAgentEndpoints(agentId)
      return activeAgentEndpoints
    } catch (err) {
      console.error('Get active agent endpoints error:', err)
      return []
    }
  }, [publicClient, activeAgentEndpoints])

  // 获取指定协议的所有端点 - 修复：使用 publicClient 替代 refetch
  const getEndpointsByProtocol = useCallback(async (protocol: string): Promise<Endpoint[]> => {
    try {
      if (!protocol || protocol.trim().length === 0) {
        return []
      }

      if (!publicClient) {
        console.error('Public client not available')
        return []
      }

      const result = await publicClient.readContract({
        address: MULTI_ENDPOINT_ADDRESS,
        abi: MULTI_ENDPOINT_ABI,
        functionName: 'getEndpointsByProtocol',
        args: [protocol],
      })

      setEndpointsByProtocol(result as Endpoint[])
      return result as Endpoint[] || []
    } catch (err) {
      console.error('Get endpoints by protocol error:', err)
      return []
    }
  }, [publicClient])

  // 获取支持的协议列表 - 修复：使用 publicClient 替代 refetch
  const getSupportedProtocols = useCallback(async (): Promise<string[]> => {
    try {
      await loadSupportedProtocols()
      return supportedProtocols
    } catch (err) {
      console.error('Get supported protocols error:', err)
      return []
    }
  }, [publicClient, supportedProtocols])

  // 获取协议配置 - 修复：使用 publicClient 替代 refetch
  const getProtocolConfig = useCallback(async (protocol: string): Promise<ProtocolConfig | null> => {
    try {
      if (!protocol || protocol.trim().length === 0) {
        return null
      }

      setCurrentProtocol(protocol)
      await loadProtocolConfig(protocol)
      return protocolConfig
    } catch (err) {
      console.error('Get protocol config error:', err)
      return null
    }
  }, [publicClient, protocolConfig])

  // 检查协议是否支持
  const isProtocolSupported = useCallback(async (protocol: string): Promise<boolean> => {
    try {
      if (!protocol || protocol.trim().length === 0) {
        return false
      }

      const config = await getProtocolConfig(protocol)
      return config ? config.isSupported : false
    } catch (err) {
      console.error('Check protocol support error:', err)
      return false
    }
  }, [getProtocolConfig])

  // 获取Agent端点统计 - 修复：使用 publicClient 替代 refetch
  const getAgentEndpointStats = useCallback(async (agentId: number): Promise<EndpointStats | null> => {
    try {
      if (agentId <= 0) {
        return null
      }

      setCurrentAgentId(agentId)
      await loadEndpointStats(agentId)
      return endpointStats
    } catch (err) {
      console.error('Get agent endpoint stats error:', err)
      return null
    }
  }, [publicClient, endpointStats])

  // 搜索端点 - 修复：使用 publicClient 替代 refetch
  const searchEndpoints = useCallback(async (
    endpointType: string,
    protocol: string
  ): Promise<Endpoint[]> => {
    try {
      setSearchParams({ endpointType, protocol })
      await loadSearchResults(endpointType, protocol)
      return searchResults
    } catch (err) {
      console.error('Search endpoints error:', err)
      return []
    }
  }, [publicClient, searchResults])

  // 重新获取所有数据
  const refetchData = useCallback(async (): Promise<void> => {
    try {
      await Promise.all([
        loadSupportedProtocols(),
        currentAgentId !== null && loadAgentEndpoints(currentAgentId),
        currentAgentId !== null && loadActiveAgentEndpoints(currentAgentId),
        currentAgentId !== null && loadEndpointStats(currentAgentId),
        currentProtocol && loadProtocolConfig(currentProtocol),
        searchParams && loadSearchResults(searchParams.endpointType, searchParams.protocol)
      ].filter(Boolean))
    } catch (err) {
      console.error('Refetch data error:', err)
    }
  }, [
    currentAgentId,
    currentProtocol,
    searchParams
  ])

  // 重置状态
  const resetState = useCallback((): void => {
    setError(null)
    setTransactionHash(undefined)
    setCurrentAgentId(null)
    setCurrentProtocol(null)
    setSearchParams(null)
    resetCreateEndpoint()
    resetUpdateEndpoint()
    resetDeactivateEndpoint()
    resetAddProtocolSupport()
  }, [
    resetCreateEndpoint,
    resetUpdateEndpoint,
    resetDeactivateEndpoint,
    resetAddProtocolSupport
  ])

  // 计算状态
  const isLoading = useMemo(() => 
    isCreatingEndpoint || isUpdatingEndpoint || isDeactivatingEndpoint || isAddingProtocolSupport,
    [
      isCreatingEndpoint,
      isUpdatingEndpoint,
      isDeactivatingEndpoint,
      isAddingProtocolSupport
    ]
  )

  return {
    // 端点操作
    createEndpoint,
    updateEndpoint,
    deactivateEndpoint,
    addProtocolSupport,
    
    // 查询功能
    getEndpoint,
    getAgentEndpoints,
    getActiveAgentEndpoints,
    getEndpointsByProtocol,
    getSupportedProtocols,
    getProtocolConfig,
    isProtocolSupported,
    getAgentEndpointStats,
    searchEndpoints,
    
    // 实时数据
    agentEndpoints,
    activeAgentEndpoints,
    endpointsByProtocol,
    supportedProtocols,
    protocolConfig,
    endpointStats,
    searchResults,
    
    // 状态
    isCreatingEndpoint,
    isUpdatingEndpoint,
    isDeactivatingEndpoint,
    isAddingProtocolSupport,
    isLoading,
    error,
    transactionHash,
    isConfirming,
    isConfirmed,
    
    // 工具函数
    refetchData,
    resetState
  }
}
