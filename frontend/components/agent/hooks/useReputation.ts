// components/agent/hooks/useReputation.ts
'use client'

import { 
  useWriteContract, 
  useReadContract, 
  useAccount, 
  useWaitForTransactionReceipt,
  usePublicClient 
} from 'wagmi'
import { useState, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

// 生产级环境变量验证
const validateAddress = (address: string | undefined): `0x${string}` => {
  if (!address || !address.startsWith('0x') || address.length !== 42) {
    console.error('Invalid contract address:', address)
    return '0x0000000000000000000000000000000000000000'
  }
  return address as `0x${string}`
}

const REPUTATION_REGISTRY_ADDRESS = validateAddress(process.env.NEXT_PUBLIC_REPUTATION_REGISTRY_ADDRESS)

// 完整的声誉系统 ABI 定义
const REPUTATION_REGISTRY_ABI = [
  // 反馈相关函数
  {
    name: 'giveFeedback',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'score', type: 'uint8' },
      { name: 'tag1', type: 'bytes32' },
      { name: 'tag2', type: 'bytes32' },
      { name: 'fileuri', type: 'string' },
      { name: 'filehash', type: 'bytes32' },
      { name: 'feedbackAuth', type: 'bytes' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    name: 'revokeFeedback',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'feedbackIndex', type: 'uint64' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    name: 'appendResponse',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'clientAddress', type: 'address' },
      { name: 'feedbackIndex', type: 'uint64' },
      { name: 'responseUri', type: 'string' },
      { name: 'responseHash', type: 'bytes32' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  
  // 查询函数
  {
    name: 'getReputationSummary',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'clientAddresses', type: 'address[]' },
      { name: 'tag1', type: 'bytes32' },
      { name: 'tag2', type: 'bytes32' }
    ],
    outputs: [
      { name: 'count', type: 'uint64' },
      { name: 'averageScore', type: 'uint8' }
    ],
    stateMutability: 'view'
  },
  {
    name: 'getReputationSummaryDetailed',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'clientAddresses', type: 'address[]' },
      { name: 'tag1', type: 'bytes32' },
      { name: 'tag2', type: 'bytes32' }
    ],
    outputs: [
      { name: 'count', type: 'uint64' },
      { name: 'totalScore', type: 'uint256' },
      { name: 'averageScorePrecise', type: 'uint16' }
    ],
    stateMutability: 'view'
  },
  {
    name: 'readFeedback',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'clientAddress', type: 'address' },
      { name: 'index', type: 'uint64' }
    ],
    outputs: [
      { name: 'score', type: 'uint8' },
      { name: 'tag1', type: 'bytes32' },
      { name: 'tag2', type: 'bytes32' },
      { name: 'isRevoked', type: 'bool' }
    ],
    stateMutability: 'view'
  },
  {
    name: 'getClients',
    type: 'function',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view'
  },
  {
    name: 'getLastIndex',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'clientAddress', type: 'address' }
    ],
    outputs: [{ name: '', type: 'uint64' }],
    stateMutability: 'view'
  }
] as const

// TypeScript 接口定义
export interface ReputationSummary {
  count: bigint
  averageScore: number
  totalScore?: bigint
  averageScorePrecise?: number
}

export interface Feedback {
  score: number
  tag1: string
  tag2: string
  isRevoked: boolean
}

export interface UseReputationReturn {
  // 查询功能
  getReputationSummary: (agentId: number) => Promise<ReputationSummary | null>
  getReputationSummaryDetailed: (agentId: number) => Promise<ReputationSummary | null>
  getFeedback: (agentId: number, clientAddress: string, index: number) => Promise<Feedback | null>
  getAgentClients: (agentId: number) => Promise<string[]>
  getLastFeedbackIndex: (agentId: number, clientAddress: string) => Promise<number>
  
  // 提交反馈功能
  giveFeedback: (
    agentId: number,
    score: number,
    tag1: string,
    tag2: string,
    fileuri: string,
    filehash: string,
    feedbackAuth: string
  ) => Promise<`0x${string}` | undefined>
  
  revokeFeedback: (agentId: number, feedbackIndex: number) => Promise<`0x${string}` | undefined>
  appendResponse: (
    agentId: number,
    clientAddress: string,
    feedbackIndex: number,
    responseUri: string,
    responseHash: string
  ) => Promise<`0x${string}` | undefined>
  
  // 实时数据
  reputationSummary: ReputationSummary | null
  reputationSummaryDetailed: ReputationSummary | null
  agentClients: string[]
  
  // 状态
  isGivingFeedback: boolean
  isRevokingFeedback: boolean
  isAppendingResponse: boolean
  isLoading: boolean
  error: Error | null
  transactionHash: `0x${string}` | undefined
  isConfirming: boolean
  isConfirmed: boolean
  
  // 工具函数
  refetchData: (agentId: number) => Promise<void>
  resetState: () => void
}

// 字符串转 bytes32 辅助函数
const stringToBytes32 = (str: string): `0x${string}` => {
  const hex = Buffer.from(str.padEnd(32, '\0')).toString('hex')
  return `0x${hex}` as `0x${string}`
}

// bytes32 转字符串辅助函数
const bytes32ToString = (bytes32: `0x${string}`): string => {
  return Buffer.from(bytes32.slice(2), 'hex').toString('utf8').replace(/\0+$/, '')
}

export function useReputation(): UseReputationReturn {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const queryClient = useQueryClient()
  
  const [error, setError] = useState<Error | null>(null)
  const [transactionHash, setTransactionHash] = useState<`0x${string}` | undefined>()
  const [currentAgentId, setCurrentAgentId] = useState<number | null>(null)

  // 实时数据状态
  const [reputationSummary, setReputationSummary] = useState<ReputationSummary | null>(null)
  const [reputationSummaryDetailed, setReputationSummaryDetailed] = useState<ReputationSummary | null>(null)
  const [agentClients, setAgentClients] = useState<string[]>([])

  // 提交反馈
  const { 
    writeContractAsync: giveFeedbackAsync,
    isPending: isGivingFeedback,
    error: giveFeedbackError,
    reset: resetGiveFeedback
  } = useWriteContract()

  // 撤销反馈
  const { 
    writeContractAsync: revokeFeedbackAsync,
    isPending: isRevokingFeedback,
    error: revokeFeedbackError,
    reset: resetRevokeFeedback
  } = useWriteContract()

  // 追加回复
  const { 
    writeContractAsync: appendResponseAsync,
    isPending: isAppendingResponse,
    error: appendResponseError,
    reset: resetAppendResponse
  } = useWriteContract()

  // 统一的交易确认状态
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: transactionHash,
  })

  // 错误处理
  const currentError = giveFeedbackError || revokeFeedbackError || appendResponseError
  if (currentError && error !== currentError) {
    setError(currentError)
  }

  // 获取声誉摘要
  const getReputationSummary = useCallback(async (agentId: number): Promise<ReputationSummary | null> => {
    try {
      if (!publicClient || agentId <= 0) {
        return null
      }

      const result = await publicClient.readContract({
        address: REPUTATION_REGISTRY_ADDRESS,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: 'getReputationSummary',
        args: [BigInt(agentId), [], '0x0000000000000000000000000000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000000000000000000000000000']
      }) as [bigint, number]

      const summary: ReputationSummary = {
        count: result[0],
        averageScore: result[1]
      }

      setReputationSummary(summary)
      return summary
    } catch (err) {
      console.error('Get reputation summary error:', err)
      return null
    }
  }, [publicClient])

  // 获取详细声誉摘要
  const getReputationSummaryDetailed = useCallback(async (agentId: number): Promise<ReputationSummary | null> => {
    try {
      if (!publicClient || agentId <= 0) {
        return null
      }

      const result = await publicClient.readContract({
        address: REPUTATION_REGISTRY_ADDRESS,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: 'getReputationSummaryDetailed',
        args: [BigInt(agentId), [], '0x0000000000000000000000000000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000000000000000000000000000']
      }) as [bigint, bigint, number]

      const summary: ReputationSummary = {
        count: result[0],
        totalScore: result[1],
        averageScore: Math.floor(result[2] / 100),
        averageScorePrecise: result[2]
      }

      setReputationSummaryDetailed(summary)
      return summary
    } catch (err) {
      console.error('Get reputation summary detailed error:', err)
      return null
    }
  }, [publicClient])

  // 获取单个反馈
  const getFeedback = useCallback(async (agentId: number, clientAddress: string, index: number): Promise<Feedback | null> => {
    try {
      if (!publicClient || agentId <= 0 || !clientAddress) {
        return null
      }

      const result = await publicClient.readContract({
        address: REPUTATION_REGISTRY_ADDRESS,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: 'readFeedback',
        args: [BigInt(agentId), clientAddress as `0x${string}`, BigInt(index)]
      }) as [number, `0x${string}`, `0x${string}`, boolean]

      return {
        score: result[0],
        tag1: bytes32ToString(result[1]),
        tag2: bytes32ToString(result[2]),
        isRevoked: result[3]
      }
    } catch (err) {
      console.error('Get feedback error:', err)
      return null
    }
  }, [publicClient])

  // 获取 Agent 的所有客户
  const getAgentClients = useCallback(async (agentId: number): Promise<string[]> => {
    try {
      if (!publicClient || agentId <= 0) {
        return []
      }

      const result = await publicClient.readContract({
        address: REPUTATION_REGISTRY_ADDRESS,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: 'getClients',
        args: [BigInt(agentId)]
      }) as string[]

      setAgentClients(result)
      return result
    } catch (err) {
      console.error('Get agent clients error:', err)
      return []
    }
  }, [publicClient])

  // 获取最后反馈索引
  const getLastFeedbackIndex = useCallback(async (agentId: number, clientAddress: string): Promise<number> => {
    try {
      if (!publicClient || agentId <= 0 || !clientAddress) {
        return 0
      }

      const result = await publicClient.readContract({
        address: REPUTATION_REGISTRY_ADDRESS,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: 'getLastIndex',
        args: [BigInt(agentId), clientAddress as `0x${string}`]
      }) as bigint

      return Number(result)
    } catch (err) {
      console.error('Get last feedback index error:', err)
      return 0
    }
  }, [publicClient])

  // 提交反馈
  const giveFeedback = useCallback(async (
    agentId: number,
    score: number,
    tag1: string,
    tag2: string,
    fileuri: string,
    filehash: string,
    feedbackAuth: string
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (agentId <= 0) {
        throw new Error('无效的 Agent ID')
      }

      if (score < 0 || score > 100) {
        throw new Error('评分必须在 0-100 之间')
      }

      setError(null)
      
      const hash = await giveFeedbackAsync({
        address: REPUTATION_REGISTRY_ADDRESS,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: 'giveFeedback',
        args: [
          BigInt(agentId),
          score,
          stringToBytes32(tag1),
          stringToBytes32(tag2),
          fileuri,
          filehash as `0x${string}`,
          feedbackAuth as `0x${string}`
        ]
      })

      setTransactionHash(hash)
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('提交反馈失败')
      setError(error)
      console.error('Give feedback error:', err)
      return undefined
    }
  }, [isConnected, address, giveFeedbackAsync])

  // 撤销反馈
  const revokeFeedback = useCallback(async (
    agentId: number,
    feedbackIndex: number
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (agentId <= 0 || feedbackIndex <= 0) {
        throw new Error('无效的参数')
      }

      setError(null)
      
      const hash = await revokeFeedbackAsync({
        address: REPUTATION_REGISTRY_ADDRESS,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: 'revokeFeedback',
        args: [BigInt(agentId), BigInt(feedbackIndex)]
      })

      setTransactionHash(hash)
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('撤销反馈失败')
      setError(error)
      console.error('Revoke feedback error:', err)
      return undefined
    }
  }, [isConnected, address, revokeFeedbackAsync])

  // 追加回复
  const appendResponse = useCallback(async (
    agentId: number,
    clientAddress: string,
    feedbackIndex: number,
    responseUri: string,
    responseHash: string
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (agentId <= 0 || feedbackIndex <= 0 || !clientAddress) {
        throw new Error('无效的参数')
      }

      setError(null)
      
      const hash = await appendResponseAsync({
        address: REPUTATION_REGISTRY_ADDRESS,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: 'appendResponse',
        args: [
          BigInt(agentId),
          clientAddress as `0x${string}`,
          BigInt(feedbackIndex),
          responseUri,
          responseHash as `0x${string}`
        ]
      })

      setTransactionHash(hash)
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('追加回复失败')
      setError(error)
      console.error('Append response error:', err)
      return undefined
    }
  }, [isConnected, address, appendResponseAsync])

  // 重新获取所有数据
  const refetchData = useCallback(async (agentId: number): Promise<void> => {
    try {
      setCurrentAgentId(agentId)
      await Promise.all([
        getReputationSummary(agentId),
        getReputationSummaryDetailed(agentId),
        getAgentClients(agentId)
      ])
    } catch (err) {
      console.error('Refetch reputation data error:', err)
    }
  }, [getReputationSummary, getReputationSummaryDetailed, getAgentClients])

  // 重置状态
  const resetState = useCallback((): void => {
    setError(null)
    setTransactionHash(undefined)
    setCurrentAgentId(null)
    setReputationSummary(null)
    setReputationSummaryDetailed(null)
    setAgentClients([])
    resetGiveFeedback()
    resetRevokeFeedback()
    resetAppendResponse()
  }, [resetGiveFeedback, resetRevokeFeedback, resetAppendResponse])

  // 计算加载状态
  const isLoading = useMemo(() => 
    isGivingFeedback || isRevokingFeedback || isAppendingResponse,
    [isGivingFeedback, isRevokingFeedback, isAppendingResponse]
  )

  return {
    // 查询功能
    getReputationSummary,
    getReputationSummaryDetailed,
    getFeedback,
    getAgentClients,
    getLastFeedbackIndex,
    
    // 提交反馈功能
    giveFeedback,
    revokeFeedback,
    appendResponse,
    
    // 实时数据
    reputationSummary,
    reputationSummaryDetailed,
    agentClients,
    
    // 状态
    isGivingFeedback,
    isRevokingFeedback,
    isAppendingResponse,
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

// 创建查询特定 Agent 声誉的 Hook
export function useAgentReputation(agentId: number) {
  const { getReputationSummary, getReputationSummaryDetailed, refetchData } = useReputation()

  return useQuery({
    queryKey: ['agentReputation', agentId],
    queryFn: async () => {
      if (!agentId || agentId <= 0) return null

      const [summary, detailed] = await Promise.all([
        getReputationSummary(agentId),
        getReputationSummaryDetailed(agentId)
      ])

      return {
        summary,
        detailed,
        rating: detailed?.averageScore || summary?.averageScore || 0,
        reviewCount: Number(detailed?.count || summary?.count || 0)
      }
    },
    enabled: !!agentId && agentId > 0,
    staleTime: 2 * 60 * 1000, // 2分钟
    gcTime: 10 * 60 * 1000, // 10分钟
  })
}
