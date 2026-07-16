// hooks/user/useUserSubscriptions.ts
'use client'

import { useAccount, usePublicClient, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useCallback } from 'react'

// 修正后的订阅管理器 ABI - 根据实际合约
const SUBSCRIPTION_MANAGER_ABI = [
  {
    name: 'getUserSubscriptions',
    type: 'function',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'subscriptionId', type: 'uint256' },
          { name: 'planId', type: 'uint256' },
          { name: 'agentId', type: 'uint256' },
          { name: 'subscriber', type: 'address' },
          { name: 'status', type: 'uint8' },
          { name: 'startDate', type: 'uint256' },
          { name: 'nextBillingDate', type: 'uint256' },
          { name: 'endDate', type: 'uint256' },
          { name: 'currentUsage', type: 'uint256' },
          { name: 'totalPaid', type: 'uint256' },
          { name: 'createdAt', type: 'uint256' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  {
    name: 'getSubscription',
    type: 'function',
    inputs: [{ name: 'subscriptionId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'subscriptionId', type: 'uint256' },
          { name: 'planId', type: 'uint256' },
          { name: 'agentId', type: 'uint256' },
          { name: 'subscriber', type: 'address' },
          { name: 'status', type: 'uint8' },
          { name: 'startDate', type: 'uint256' },
          { name: 'nextBillingDate', type: 'uint256' },
          { name: 'endDate', type: 'uint256' },
          { name: 'currentUsage', type: 'uint256' },
          { name: 'totalPaid', type: 'uint256' },
          { name: 'createdAt', type: 'uint256' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  {
    name: 'getPlan',
    type: 'function',
    inputs: [{ name: 'planId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'planId', type: 'uint256' },
          { name: 'agentId', type: 'uint256' },
          { name: 'name', type: 'string' },
          { name: 'description', type: 'string' },
          { name: 'token', type: 'address' },
          { name: 'price', type: 'uint256' },
          { name: 'billingPeriod', type: 'uint8' },
          { name: 'maxUsage', type: 'uint256' },
          { name: 'isActive', type: 'bool' },
          { name: 'createdAt', type: 'uint256' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  {
    name: 'processPayment',
    type: 'function',
    inputs: [{ name: 'subscriptionId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'payable'  // 修改为 payable 以支持原生代币支付
  },
  {
    name: 'cancelSubscription',
    type: 'function',
    inputs: [{ name: 'subscriptionId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    name: 'isSubscriptionActive',
    type: 'function',
    inputs: [{ name: 'subscriptionId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view'
  }
] as const

// 环境变量验证
const getSubscriptionManagerAddress = (): `0x${string}` => {
  const address = process.env.NEXT_PUBLIC_SUBSCRIPTION_MANAGER_ADDRESS
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    console.error('Invalid subscription manager address:', address)
    return '0x0000000000000000000000000000000000000000'
  }
  return address as `0x${string}`
}

// 订阅状态枚举 - 与合约匹配
export enum SubscriptionStatus {
  Active = 0,
  Cancelled = 1,
  Expired = 2,
  PaymentFailed = 3
}

// 计费周期枚举 - 与合约匹配
export enum BillingPeriod {
  Daily = 0,
  Weekly = 1,
  Monthly = 2,
  Quarterly = 3,
  Yearly = 4
}

export interface SubscriptionPlan {
  planId: bigint
  agentId: bigint
  name: string
  description: string
  token: `0x${string}`
  price: bigint
  billingPeriod: BillingPeriod
  maxUsage: bigint
  isActive: boolean
  createdAt: bigint
}

export interface Subscription {
  subscriptionId: bigint
  planId: bigint
  agentId: bigint
  subscriber: `0x${string}`
  status: SubscriptionStatus
  startDate: bigint
  nextBillingDate: bigint
  endDate: bigint
  currentUsage: bigint
  totalPaid: bigint
  createdAt: bigint
  isActive?: boolean // 计算字段，基于状态和时间
}

export interface UseUserSubscriptionsReturn {
  subscriptions: Subscription[] | null
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
  processPayment: (subscriptionId: number, planDetails?: SubscriptionPlan) => Promise<`0x${string}` | undefined>
  cancelSubscription: (subscriptionId: number) => Promise<`0x${string}` | undefined>
  checkSubscriptionActive: (subscriptionId: number) => Promise<boolean>
  getPlanDetails: (planId: number) => Promise<SubscriptionPlan | null>
}

// 数据转换辅助函数 - 处理合约返回的原始数据
const transformSubscriptionData = (rawData: any[]): Subscription[] => {
  if (!rawData || !Array.isArray(rawData)) {
    return []
  }

  const now = BigInt(Math.floor(Date.now() / 1000))

  return rawData.map((item: any) => {
    try {
      const subscriptionId = BigInt(item.subscriptionId?.toString() || '0')
      const planId = BigInt(item.planId?.toString() || '0')
      const agentId = BigInt(item.agentId?.toString() || '0')
      
      // 确保 subscriber 是有效的 0x${string} 类型
      let subscriber: `0x${string}`
      if (item.subscriber && typeof item.subscriber === 'string' && item.subscriber.startsWith('0x')) {
        subscriber = item.subscriber as `0x${string}`
      } else {
        subscriber = '0x0000000000000000000000000000000000000000'
      }
      
      const status = Number(item.status) as SubscriptionStatus
      const startDate = BigInt(item.startDate?.toString() || '0')
      const nextBillingDate = BigInt(item.nextBillingDate?.toString() || '0')
      const endDate = BigInt(item.endDate?.toString() || '0')
      const currentUsage = BigInt(item.currentUsage?.toString() || '0')
      const totalPaid = BigInt(item.totalPaid?.toString() || '0')
      const createdAt = BigInt(item.createdAt?.toString() || '0')

      // 计算 isActive 状态 - 根据合约逻辑
      const isActive = 
        status === SubscriptionStatus.Active && 
        nextBillingDate + BigInt(3 * 24 * 60 * 60) > now // 3天宽限期

      const subscription: Subscription = {
        subscriptionId,
        planId,
        agentId,
        subscriber,
        status,
        startDate,
        nextBillingDate,
        endDate,
        currentUsage,
        totalPaid,
        createdAt,
        isActive
      }

      return subscription
    } catch (error) {
      console.warn('Failed to transform subscription data:', error)
      // 返回一个默认的无效订阅，确保类型正确
      const defaultSubscription: Subscription = {
        subscriptionId: BigInt(0),
        planId: BigInt(0),
        agentId: BigInt(0),
        subscriber: '0x0000000000000000000000000000000000000000',
        status: SubscriptionStatus.Expired,
        startDate: BigInt(0),
        nextBillingDate: BigInt(0),
        endDate: BigInt(0),
        currentUsage: BigInt(0),
        totalPaid: BigInt(0),
        createdAt: BigInt(0),
        isActive: false
      }
      return defaultSubscription
    }
  }).filter(sub => Number(sub.subscriptionId) > 0) // 过滤掉无效订阅
}

export function useUserSubscriptions(): UseUserSubscriptionsReturn {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const queryClient = useQueryClient()
  const { writeContractAsync } = useWriteContract()
  const [error, setError] = useState<Error | null>(null)

  const subscriptionManagerAddress = getSubscriptionManagerAddress()

  // 获取用户订阅
  const {
    data: subscriptions,
    isLoading,
    isError,
    error: queryError,
    refetch
  } = useQuery({
    queryKey: ['userSubscriptions', address],
    queryFn: async (): Promise<Subscription[] | null> => {
      if (!address || !publicClient || !isConnected) {
        return null
      }

      try {
        console.log('🔄 获取用户订阅数据...', { address })

        // 获取基础订阅信息
        const subscriptionData = await publicClient.readContract({
          address: subscriptionManagerAddress,
          abi: SUBSCRIPTION_MANAGER_ABI,
          functionName: 'getUserSubscriptions',
          args: [address]
        }) as any[]

        console.log('📦 获取到原始订阅数据:', subscriptionData)

        // 转换数据格式
        const transformedData = transformSubscriptionData(subscriptionData)
        console.log('🔄 转换后的订阅数据:', transformedData)

        console.log('✅ 用户订阅数据加载完成:', transformedData.length)
        return transformedData
      } catch (err) {
        console.error('❌ 获取用户订阅失败:', err)
        
        // 检查是否是合约不存在或方法不存在
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        if (errorMessage.includes('execution reverted') || errorMessage.includes('Contract method not found')) {
          const friendlyError = new Error('订阅合约暂时不可用，请稍后重试')
          setError(friendlyError)
          throw friendlyError
        }
        
        const friendlyError = new Error(
          err instanceof Error 
            ? `获取订阅数据失败: ${err.message}`
            : '无法连接到订阅合约，请检查网络连接'
        )
        setError(friendlyError)
        throw friendlyError
      }
    },
    enabled: !!address && !!publicClient && isConnected,
    staleTime: 2 * 60 * 1000, // 2分钟
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  })

  // 错误处理
  useEffect(() => {
    if (queryError) {
      setError(queryError as Error)
    }
  }, [queryError])

  // 获取计划详情
  const getPlanDetails = useCallback(async (planId: number): Promise<SubscriptionPlan | null> => {
    if (!publicClient) {
      return null
    }

    try {
      const planData = await publicClient.readContract({
        address: subscriptionManagerAddress,
        abi: SUBSCRIPTION_MANAGER_ABI,
        functionName: 'getPlan',
        args: [BigInt(planId)]
      }) as any

      if (!planData || Number(planData.planId) === 0) {
        return null
      }

      const plan: SubscriptionPlan = {
        planId: BigInt(planData.planId?.toString() || '0'),
        agentId: BigInt(planData.agentId?.toString() || '0'),
        name: planData.name || '',
        description: planData.description || '',
        token: planData.token as `0x${string}`,
        price: BigInt(planData.price?.toString() || '0'),
        billingPeriod: Number(planData.billingPeriod) as BillingPeriod,
        maxUsage: BigInt(planData.maxUsage?.toString() || '0'),
        isActive: Boolean(planData.isActive),
        createdAt: BigInt(planData.createdAt?.toString() || '0')
      }

      return plan
    } catch (err) {
      console.error('获取计划详情失败:', err)
      return null
    }
  }, [publicClient])

  // 检查订阅是否活跃
  const checkSubscriptionActive = useCallback(async (subscriptionId: number): Promise<boolean> => {
    if (!publicClient || !address) {
      return false
    }

    try {
      const isActive = await publicClient.readContract({
        address: subscriptionManagerAddress,
        abi: SUBSCRIPTION_MANAGER_ABI,
        functionName: 'isSubscriptionActive',
        args: [BigInt(subscriptionId)]
      }) as boolean

      return isActive
    } catch (err) {
      console.error('检查订阅活跃状态失败:', err)
      return false
    }
  }, [publicClient, address])

  // 处理支付（续费）
  const processPayment = useCallback(async (
    subscriptionId: number, 
    planDetails?: SubscriptionPlan
  ): Promise<`0x${string}` | undefined> => {
    if (!address) {
      throw new Error('请先连接钱包')
    }

    try {
      console.log('🔄 处理订阅支付:', { subscriptionId, planDetails })

      setError(null)

      // 修复：正确构建 writeContract 参数
      const contractConfig: any = {
        address: subscriptionManagerAddress,
        abi: SUBSCRIPTION_MANAGER_ABI,
        functionName: 'processPayment',
        args: [BigInt(subscriptionId)],
      }

      // 如果提供了计划详情且使用原生代币支付，添加 value 参数
      if (planDetails) {
        // 如果代币地址是零地址，表示使用原生代币（ETH）
        if (planDetails.token === '0x0000000000000000000000000000000000000000') {
          contractConfig.value = planDetails.price
          console.log('使用原生代币支付，金额:', contractConfig.value.toString())
        }
      }
      
      const hash = await writeContractAsync(contractConfig)

      console.log('✅ 支付交易已提交:', hash)
      
      // 等待交易确认后刷新数据
      setTimeout(() => {
        refetch()
      }, 5000)
      
      return hash
    } catch (err) {
      console.error('❌ 处理支付失败:', err)
      const error = err instanceof Error ? err : new Error('处理支付失败')
      setError(error)
      return undefined
    }
  }, [address, writeContractAsync, refetch])

  // 取消订阅
  const cancelSubscription = useCallback(async (subscriptionId: number): Promise<`0x${string}` | undefined> => {
    if (!address) {
      throw new Error('请先连接钱包')
    }

    try {
      console.log('🔄 取消订阅:', { subscriptionId })

      setError(null)
      
      const hash = await writeContractAsync({
        address: subscriptionManagerAddress,
        abi: SUBSCRIPTION_MANAGER_ABI,
        functionName: 'cancelSubscription',
        args: [BigInt(subscriptionId)]
      })

      console.log('✅ 取消订阅交易已提交:', hash)
      
      // 等待交易确认后刷新数据
      setTimeout(() => {
        refetch()
      }, 5000)
      
      return hash
    } catch (err) {
      console.error('❌ 取消订阅失败:', err)
      const error = err instanceof Error ? err : new Error('取消订阅失败')
      setError(error)
      return undefined
    }
  }, [address, writeContractAsync, refetch])

  return {
    subscriptions: subscriptions || null,
    isLoading,
    isError,
    error,
    refetch,
    processPayment,
    cancelSubscription,
    checkSubscriptionActive,
    getPlanDetails
  }
}

// 获取单个订阅详情的Hook
export function useSubscriptionDetail(subscriptionId: number) {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()

  return useQuery({
    queryKey: ['subscriptionDetail', subscriptionId, address],
    queryFn: async (): Promise<Subscription | null> => {
      if (!subscriptionId || !publicClient || !address) {
        return null
      }

      try {
        // 直接获取单个订阅详情
        const subscriptionData = await publicClient.readContract({
          address: getSubscriptionManagerAddress(),
          abi: SUBSCRIPTION_MANAGER_ABI,
          functionName: 'getSubscription',
          args: [BigInt(subscriptionId)]
        }) as any

        console.log('📦 获取到单个订阅数据:', subscriptionData)

        if (!subscriptionData || Number(subscriptionData.subscriptionId) === 0) {
          return null
        }

        // 转换数据格式
        const transformedData = transformSubscriptionData([subscriptionData])
        return transformedData[0] || null
      } catch (err) {
        console.error('获取订阅详情失败:', err)
        
        // 如果单个订阅查询失败，尝试从用户订阅列表中查找
        try {
          const allSubscriptions = await publicClient.readContract({
            address: getSubscriptionManagerAddress(),
            abi: SUBSCRIPTION_MANAGER_ABI,
            functionName: 'getUserSubscriptions',
            args: [address]
          }) as any[]

          const transformedData = transformSubscriptionData(allSubscriptions)
          const subscription = transformedData.find(
            (sub: Subscription) => Number(sub.subscriptionId) === subscriptionId
          )

          return subscription || null
        } catch (fallbackError) {
          console.error('备用查询也失败:', fallbackError)
          throw err
        }
      }
    },
    enabled: !!subscriptionId && !!publicClient && !!address && isConnected,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  })
}

// 获取活跃订阅的Hook
export function useActiveSubscriptions() {
  const { subscriptions, isLoading, isError, error } = useUserSubscriptions()
  
  const activeSubscriptions = subscriptions?.filter(sub => 
    sub.isActive === true
  ) || []

  return {
    activeSubscriptions,
    isLoading,
    isError,
    error
  }
}
