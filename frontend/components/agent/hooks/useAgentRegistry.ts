// components/agent/hooks/useAgentRegistry.ts
// #14 精简：去掉按区块强制刷新（useBlockNumber + forceRefresh）、1s refetch 节流与
// 冗余 transactionHashRef；数据新鲜度由 react-query refetchInterval + 交易确认后主动
// refetch 保证。接口（UseAgentRegistryReturn）保持不变。
'use client'

import {
  useWriteContract,
  useReadContract,
  useAccount,
  useWaitForTransactionReceipt,
  usePublicClient,
} from 'wagmi'
import { useState, useEffect, useCallback, useMemo } from 'react'

import { validateAddress } from './contract-address'

const IDENTITY_REGISTRY_ADDRESS = validateAddress(process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS)

// 完整的 ABI 定义，与智能合约完全匹配
import { IDENTITY_REGISTRY_ABI } from '@/abis/IdentityRegistry'

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

export function useOnChainAgentRegistry(): UseAgentRegistryReturn {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()

  const [userAgents, setUserAgents] = useState<number[]>([])
  const [currentAgentId, setCurrentAgentId] = useState<number>(0)
  const [error, setError] = useState<Error | null>(null)
  const [transactionHash, setTransactionHash] = useState<`0x${string}` | undefined>()

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
  } = useWaitForTransactionReceipt({
    hash: transactionHash,
  })

  // 获取用户拥有的 Agents（refetchInterval 替代原按区块强制刷新）
  const {
    data: agentsData,
    refetch: refetchAgentsQuery,
    error: agentsError,
  } = useReadContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: 'getAgentsByOwner',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && isConnected,
      staleTime: 0, // 立即过期，确保每次都会重新获取
      refetchInterval: 30_000,
    },
  })

  // 获取当前 Agent ID
  const {
    data: currentAgentIdData,
    error: currentAgentIdError,
    refetch: refetchCurrentAgentIdQuery,
  } = useReadContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: 'getCurrentAgentId',
    query: {
      enabled: true,
      staleTime: 0,
      refetchInterval: 30_000,
    },
  })

  // 检查 Agent 是否存在
  const checkAgentExists = useCallback(async (agentId: number): Promise<boolean> => {
    try {
      if (!agentId || agentId <= 0) {
        return false
      }

      if (!publicClient) {
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

  // 数据同步 Effect（react-query 结构共享保证引用稳定，无需额外去重）
  useEffect(() => {
    if (agentsData) {
      try {
        const agents = (agentsData as unknown as readonly bigint[]).map((id) => Number(id))
        setUserAgents(Array.from(new Set(agents)))
      } catch {
        setUserAgents([])
      }
    } else {
      setUserAgents([])
    }
  }, [agentsData])

  // 当前 Agent ID 同步 Effect
  useEffect(() => {
    if (currentAgentIdData !== undefined) {
      try {
        setCurrentAgentId(Number(currentAgentIdData))
      } catch {
        setCurrentAgentId(0)
      }
    }
  }, [currentAgentIdData])

  // 监听交易确认，主动刷新链上数据
  useEffect(() => {
    if (isConfirmed) {
      refetchAgentsQuery()
      refetchCurrentAgentIdQuery()
    }
  }, [isConfirmed, refetchAgentsQuery, refetchCurrentAgentIdQuery])

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

      const hash = await registerWithoutURIAsync({
        address: IDENTITY_REGISTRY_ADDRESS,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'register',
        value: BigInt(1000000000000000), // 0.001 ETH
      })

      setTransactionHash(hash)
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('注册失败')
      setError(error)
      console.error('Register agent error:', err)
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

      const hash = await registerWithURIAsync({
        address: IDENTITY_REGISTRY_ADDRESS,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'register',
        args: [tokenURI],
        value: BigInt(1000000000000000), // 0.001 ETH
      })

      setTransactionHash(hash)
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('注册失败')
      setError(error)
      console.error('Register agent with tokenURI error:', err)
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

      const hash = await registerWithMetadataAsync({
        address: IDENTITY_REGISTRY_ADDRESS,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'registerWithMetadata',
        args: [tokenURI, formattedMetadata],
        value: BigInt(1000000000000000), // 0.001 ETH
      })

      setTransactionHash(hash)
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('注册失败')
      setError(error)
      console.error('Register agent with metadata error:', err)
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
      await refetchAgentsQuery()
    } catch (err) {
      console.error('Refetch agents error:', err)
    }
  }, [refetchAgentsQuery])

  // 专门刷新当前 Agent ID 的函数
  const refetchCurrentAgentId = useCallback(async (): Promise<void> => {
    try {
      await refetchCurrentAgentIdQuery()
    } catch (err) {
      console.error('Refetch current agent ID error:', err)
    }
  }, [refetchCurrentAgentIdQuery])

  // 重置状态
  const resetState = useCallback((): void => {
    setError(null)
    setTransactionHash(undefined)
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
