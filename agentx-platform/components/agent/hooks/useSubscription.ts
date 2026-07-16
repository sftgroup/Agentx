// components/agent/hooks/useSubscription.ts

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

const SUBSCRIPTION_MANAGER_ADDRESS = validateAddress(process.env.NEXT_PUBLIC_SUBSCRIPTION_MANAGER_ADDRESS)

// 完整的 ABI 定义，与智能合约完全匹配
const SUBSCRIPTION_MANAGER_ABI = [
  // 订阅计划管理
  {
    name: 'createPlan',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'name', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'token', type: 'address' },
      { name: 'price', type: 'uint256' },
      { name: 'billingPeriod', type: 'uint8' },
      { name: 'maxUsage', type: 'uint256' }
    ],
    outputs: [{ name: 'planId', type: 'uint256' }],
    stateMutability: 'nonpayable'
  },
  {
    name: 'updatePlan',
    type: 'function',
    inputs: [
      { name: 'planId', type: 'uint256' },
      { name: 'name', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'price', type: 'uint256' },
      { name: 'billingPeriod', type: 'uint8' },
      { name: 'maxUsage', type: 'uint256' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    name: 'deactivatePlan',
    type: 'function',
    inputs: [{ name: 'planId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  
  // 订阅管理
  {
    name: 'subscribe',
    type: 'function',
    inputs: [{ name: 'planId', type: 'uint256' }],
    outputs: [{ name: 'subscriptionId', type: 'uint256' }],
    stateMutability: 'payable'
  },
  {
    name: 'processPayment',
    type: 'function',
    inputs: [{ name: 'subscriptionId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    name: 'cancelSubscription',
    type: 'function',
    inputs: [{ name: 'subscriptionId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    name: 'recordUsage',
    type: 'function',
    inputs: [
      { name: 'subscriptionId', type: 'uint256' },
      { name: 'usage', type: 'uint256' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  
  // 查询函数
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
    name: 'getAgentPlans',
    type: 'function',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
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
    name: 'getPlanSubscriptions',
    type: 'function',
    inputs: [{ name: 'planId', type: 'uint256' }],
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
    name: 'isSubscriptionActive',
    type: 'function',
    inputs: [{ name: 'subscriptionId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view'
  },
  {
    name: 'getTotalPlanCount',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    name: 'getTotalSubscriptionCount',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    name: 'getAgentSubscriptionStats',
    type: 'function',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [
      { name: 'totalSubscriptions', type: 'uint256' },
      { name: 'activeSubscriptions', type: 'uint256' },
      { name: 'totalRevenue', type: 'uint256' },
      { name: 'monthlyRecurringRevenue', type: 'uint256' }
    ],
    stateMutability: 'view'
  },
  {
    name: 'getDueSubscriptions',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256[]' }],
    stateMutability: 'view'
  },
  {
    name: 'withdrawSubscriptionRevenue',
    type: 'function',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    name: 'getWithdrawableRevenue',
    type: 'function',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{ name: 'amount', type: 'uint256' }],
    stateMutability: 'view'
  },
  
  // 事件定义
  {
    name: 'PlanCreated',
    type: 'event',
    inputs: [
      { name: 'planId', type: 'uint256', indexed: true },
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'name', type: 'string', indexed: false },
      { name: 'token', type: 'address', indexed: false },
      { name: 'price', type: 'uint256', indexed: false },
      { name: 'billingPeriod', type: 'uint8', indexed: false }
    ]
  },
  {
    name: 'PlanUpdated',
    type: 'event',
    inputs: [
      { name: 'planId', type: 'uint256', indexed: true },
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'name', type: 'string', indexed: false },
      { name: 'price', type: 'uint256', indexed: false },
      { name: 'billingPeriod', type: 'uint8', indexed: false }
    ]
  },
  {
    name: 'PlanDeactivated',
    type: 'event',
    inputs: [
      { name: 'planId', type: 'uint256', indexed: true },
      { name: 'agentId', type: 'uint256', indexed: true }
    ]
  },
  {
    name: 'SubscriptionCreated',
    type: 'event',
    inputs: [
      { name: 'subscriptionId', type: 'uint256', indexed: true },
      { name: 'planId', type: 'uint256', indexed: true },
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'subscriber', type: 'address', indexed: false },
      { name: 'startDate', type: 'uint256', indexed: false },
      { name: 'nextBillingDate', type: 'uint256', indexed: false }
    ]
  },
  {
    name: 'SubscriptionRenewed',
    type: 'event',
    inputs: [
      { name: 'subscriptionId', type: 'uint256', indexed: true },
      { name: 'planId', type: 'uint256', indexed: true },
      { name: 'subscriber', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'nextBillingDate', type: 'uint256', indexed: false }
    ]
  },
  {
    name: 'SubscriptionCancelled',
    type: 'event',
    inputs: [
      { name: 'subscriptionId', type: 'uint256', indexed: true },
      { name: 'planId', type: 'uint256', indexed: true },
      { name: 'subscriber', type: 'address', indexed: false },
      { name: 'cancelledAt', type: 'uint256', indexed: false }
    ]
  },
  {
    name: 'PaymentProcessed',
    type: 'event',
    inputs: [
      { name: 'subscriptionId', type: 'uint256', indexed: true },
      { name: 'planId', type: 'uint256', indexed: true },
      { name: 'subscriber', type: 'address', indexed: false },
      { name: 'token', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'processedAt', type: 'uint256', indexed: false }
    ]
  },
  {
    name: 'RevenueWithdrawn',
    type: 'event',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'recipient', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'token', type: 'address', indexed: false }
    ]
  }
] as const

// TypeScript 接口定义
export interface SubscriptionPlan {
  planId: bigint
  agentId: bigint
  name: string
  description: string
  token: `0x${string}`
  price: bigint
  billingPeriod: number
  maxUsage: bigint
  isActive: boolean
  createdAt: bigint
}

export interface Subscription {
  subscriptionId: bigint
  planId: bigint
  agentId: bigint
  subscriber: `0x${string}`
  status: number
  startDate: bigint
  nextBillingDate: bigint
  endDate: bigint
  currentUsage: bigint
  totalPaid: bigint
  createdAt: bigint
}

export interface SubscriptionStats {
  totalSubscriptions: bigint
  activeSubscriptions: bigint
  totalRevenue: bigint
  monthlyRecurringRevenue: bigint
}

// 订阅状态枚举
export enum SubscriptionStatus {
  Active = 0,
  Cancelled = 1,
  Expired = 2,
  PaymentFailed = 3
}

// 计费周期枚举
export enum BillingPeriod {
  Daily = 0,
  Weekly = 1,
  Monthly = 2,
  Quarterly = 3,
  Yearly = 4
}

interface UseSubscriptionReturn {
  // 订阅计划管理功能（开发者）
  createSubscriptionPlan: (
    agentId: number,
    name: string,
    description: string,
    token: string,
    price: number,
    billingPeriod: BillingPeriod,
    maxUsage: number
  ) => Promise<`0x${string}` | undefined>
  updateSubscriptionPlan: (
    planId: number,
    name: string,
    description: string,
    price: number,
    billingPeriod: BillingPeriod,
    maxUsage: number
  ) => Promise<`0x${string}` | undefined>
  deactivatePlan: (planId: number) => Promise<`0x${string}` | undefined>
  getPlan: (planId: number) => Promise<SubscriptionPlan | null>
  getAgentPlans: (agentId: number) => Promise<SubscriptionPlan[]>
  getPlanSubscriptions: (planId: number) => Promise<Subscription[]>
  getAgentSubscriptionStats: (agentId: number) => Promise<SubscriptionStats | null>
  withdrawSubscriptionRevenue: (agentId: number) => Promise<`0x${string}` | undefined>
  getWithdrawableRevenue: (agentId: number) => Promise<bigint>
  
  // 订阅管理功能（用户）
  subscribe: (planId: number, value?: bigint) => Promise<`0x${string}` | undefined>
  processPayment: (subscriptionId: number) => Promise<`0x${string}` | undefined>
  cancelSubscription: (subscriptionId: number) => Promise<`0x${string}` | undefined>
  recordUsage: (subscriptionId: number, usage: number) => Promise<`0x${string}` | undefined>
  getSubscription: (subscriptionId: number) => Promise<Subscription | null>
  getUserSubscriptions: () => Promise<Subscription[]>
  isSubscriptionActive: (subscriptionId: number) => Promise<boolean>
  
  // 统计功能
  getTotalPlanCount: () => Promise<number>
  getTotalSubscriptionCount: () => Promise<number>
  getDueSubscriptions: () => Promise<number[]>
  
  // 实时数据
  userSubscriptions: Subscription[]
  agentPlans: SubscriptionPlan[]
  planSubscriptions: Subscription[]
  subscriptionStats: SubscriptionStats | null
  totalPlanCount: number
  totalSubscriptionCount: number
  dueSubscriptions: number[]
  withdrawableRevenue: bigint
  
  // 状态
  isCreatingPlan: boolean
  isUpdatingPlan: boolean
  isDeactivatingPlan: boolean
  isSubscribing: boolean
  isProcessingPayment: boolean
  isCancellingSubscription: boolean
  isRecordingUsage: boolean
  isWithdrawingRevenue: boolean
  isLoading: boolean
  error: Error | null
  transactionHash: `0x${string}` | undefined
  isConfirming: boolean
  isConfirmed: boolean
  
  // 工具函数
  refetchData: () => Promise<void>
  resetState: () => void
}

// 类型转换辅助函数
const bigintArrayToNumberArray = (bigintArray: readonly bigint[] | undefined): number[] => {
  if (!bigintArray || !Array.isArray(bigintArray)) {
    return []
  }
  
  return bigintArray.map(item => {
    if (item > BigInt(Number.MAX_SAFE_INTEGER)) {
      console.warn('Bigint value exceeds safe integer range, potential precision loss:', item)
    }
    return Number(item)
  })
}

// 修复：类型转换函数 - 将元组转换为 SubscriptionStats 对象
const tupleToSubscriptionStats = (tuple: readonly [bigint, bigint, bigint, bigint] | undefined): SubscriptionStats | null => {
  if (!tuple || !Array.isArray(tuple) || tuple.length !== 4) {
    return null
  }
  
  return {
    totalSubscriptions: tuple[0],
    activeSubscriptions: tuple[1],
    totalRevenue: tuple[2],
    monthlyRecurringRevenue: tuple[3]
  }
}

export function useSubscription(): UseSubscriptionReturn {
  const { address, isConnected } = useAccount()
  const { data: blockNumber } = useBlockNumber({ watch: true })
  const publicClient = usePublicClient()
  
  const [error, setError] = useState<Error | null>(null)
  const [transactionHash, setTransactionHash] = useState<`0x${string}` | undefined>()
  const [currentAgentIdForPlans, setCurrentAgentIdForPlans] = useState<number | null>(null)
  const [currentPlanIdForSubscriptions, setCurrentPlanIdForSubscriptions] = useState<number | null>(null)
  const [currentAgentIdForStats, setCurrentAgentIdForStats] = useState<number | null>(null)
  const [currentAgentIdForWithdraw, setCurrentAgentIdForWithdraw] = useState<number | null>(null)

  // 修复：使用 publicClient 替代 useReadContract 以避免 ABI 参数不匹配问题
  const [agentPlans, setAgentPlans] = useState<SubscriptionPlan[]>([])
  const [userSubscriptions, setUserSubscriptions] = useState<Subscription[]>([])
  const [planSubscriptions, setPlanSubscriptions] = useState<Subscription[]>([])
  const [subscriptionStats, setSubscriptionStats] = useState<SubscriptionStats | null>(null)
  const [withdrawableRevenue, setWithdrawableRevenue] = useState<bigint>(BigInt(0))

  // 创建订阅计划
  const { 
    writeContractAsync: createPlanAsync,
    isPending: isCreatingPlan,
    error: createPlanError,
    reset: resetCreatePlan
  } = useWriteContract()

  // 更新订阅计划
  const { 
    writeContractAsync: updatePlanAsync,
    isPending: isUpdatingPlan,
    error: updatePlanError,
    reset: resetUpdatePlan
  } = useWriteContract()

  // 停用计划
  const { 
    writeContractAsync: deactivatePlanAsync,
    isPending: isDeactivatingPlan,
    error: deactivatePlanError,
    reset: resetDeactivatePlan
  } = useWriteContract()

  // 订阅
  const { 
    writeContractAsync: subscribeAsync,
    isPending: isSubscribing,
    error: subscribeError,
    reset: resetSubscribe
  } = useWriteContract()

  // 处理支付
  const { 
    writeContractAsync: processPaymentAsync,
    isPending: isProcessingPayment,
    error: processPaymentError,
    reset: resetProcessPayment
  } = useWriteContract()

  // 取消订阅
  const { 
    writeContractAsync: cancelSubscriptionAsync,
    isPending: isCancellingSubscription,
    error: cancelSubscriptionError,
    reset: resetCancelSubscription
  } = useWriteContract()

  // 记录使用量
  const { 
    writeContractAsync: recordUsageAsync,
    isPending: isRecordingUsage,
    error: recordUsageError,
    reset: resetRecordUsage
  } = useWriteContract()

  // 提取收益
  const { 
    writeContractAsync: withdrawRevenueAsync,
    isPending: isWithdrawingRevenue,
    error: withdrawRevenueError,
    reset: resetWithdrawRevenue
  } = useWriteContract()

  // 统一的交易确认状态
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: transactionHash,
  })

  // 获取计划总数
  const { 
    data: totalPlanCountData, 
    refetch: refetchTotalPlanCount,
    error: totalPlanCountError 
  } = useReadContract({
    address: SUBSCRIPTION_MANAGER_ADDRESS,
    abi: SUBSCRIPTION_MANAGER_ABI,
    functionName: 'getTotalPlanCount',
  })

  // 获取订阅总数
  const { 
    data: totalSubscriptionCountData, 
    refetch: refetchTotalSubscriptionCount,
    error: totalSubscriptionCountError 
  } = useReadContract({
    address: SUBSCRIPTION_MANAGER_ADDRESS,
    abi: SUBSCRIPTION_MANAGER_ABI,
    functionName: 'getTotalSubscriptionCount',
  })

  // 获取到期订阅
  const { 
    data: dueSubscriptionsData, 
    refetch: refetchDueSubscriptions,
    error: dueSubscriptionsError 
  } = useReadContract({
    address: SUBSCRIPTION_MANAGER_ADDRESS,
    abi: SUBSCRIPTION_MANAGER_ABI,
    functionName: 'getDueSubscriptions',
  })

  // 错误处理 Effect
  useEffect(() => {
    const currentError = createPlanError || updatePlanError || deactivatePlanError || 
                        subscribeError || processPaymentError || cancelSubscriptionError || 
                        recordUsageError || withdrawRevenueError || totalPlanCountError ||
                        totalSubscriptionCountError || dueSubscriptionsError
    
    if (currentError) {
      setError(currentError)
    }
  }, [
    createPlanError, updatePlanError, deactivatePlanError, subscribeError,
    processPaymentError, cancelSubscriptionError, recordUsageError, withdrawRevenueError,
    totalPlanCountError, totalSubscriptionCountError, dueSubscriptionsError
  ])

  // 数据自动刷新 Effect
  useEffect(() => {
    if (blockNumber) {
      if (currentAgentIdForPlans !== null) {
        loadAgentPlans(currentAgentIdForPlans)
      }
      if (address) {
        loadUserSubscriptions()
      }
      if (currentPlanIdForSubscriptions !== null) {
        loadPlanSubscriptions(currentPlanIdForSubscriptions)
      }
      if (currentAgentIdForStats !== null) {
        loadSubscriptionStats(currentAgentIdForStats)
      }
      if (currentAgentIdForWithdraw !== null) {
        loadWithdrawableRevenue(currentAgentIdForWithdraw)
      }
      refetchTotalPlanCount()
      refetchTotalSubscriptionCount()
      refetchDueSubscriptions()
    }
  }, [
    blockNumber,
    currentAgentIdForPlans,
    address,
    currentPlanIdForSubscriptions,
    currentAgentIdForStats,
    currentAgentIdForWithdraw
  ])

  // 修复：使用 publicClient 加载数据
  const loadAgentPlans = async (agentId: number) => {
    try {
      if (!publicClient) return
      
      const result = await publicClient.readContract({
        address: SUBSCRIPTION_MANAGER_ADDRESS,
        abi: SUBSCRIPTION_MANAGER_ABI,
        functionName: 'getAgentPlans',
        args: [BigInt(agentId)],
      })
      
      setAgentPlans(result as SubscriptionPlan[])
    } catch (err) {
      console.error('Load agent plans error:', err)
      setAgentPlans([])
    }
  }

  const loadUserSubscriptions = async () => {
    try {
      if (!publicClient || !address) return
      
      const result = await publicClient.readContract({
        address: SUBSCRIPTION_MANAGER_ADDRESS,
        abi: SUBSCRIPTION_MANAGER_ABI,
        functionName: 'getUserSubscriptions',
        args: [address],
      })
      
      setUserSubscriptions(result as Subscription[])
    } catch (err) {
      console.error('Load user subscriptions error:', err)
      setUserSubscriptions([])
    }
  }

  const loadPlanSubscriptions = async (planId: number) => {
    try {
      if (!publicClient) return
      
      const result = await publicClient.readContract({
        address: SUBSCRIPTION_MANAGER_ADDRESS,
        abi: SUBSCRIPTION_MANAGER_ABI,
        functionName: 'getPlanSubscriptions',
        args: [BigInt(planId)],
      })
      
      setPlanSubscriptions(result as Subscription[])
    } catch (err) {
      console.error('Load plan subscriptions error:', err)
      setPlanSubscriptions([])
    }
  }

  const loadSubscriptionStats = async (agentId: number) => {
    try {
      if (!publicClient) return
      
      const result = await publicClient.readContract({
        address: SUBSCRIPTION_MANAGER_ADDRESS,
        abi: SUBSCRIPTION_MANAGER_ABI,
        functionName: 'getAgentSubscriptionStats',
        args: [BigInt(agentId)],
      })
      
      // 修复：正确处理元组返回类型
      const stats = tupleToSubscriptionStats(result as readonly [bigint, bigint, bigint, bigint])
      setSubscriptionStats(stats)
    } catch (err) {
      console.error('Load subscription stats error:', err)
      setSubscriptionStats(null)
    }
  }

  const loadWithdrawableRevenue = async (agentId: number) => {
    try {
      if (!publicClient) return
      
      const result = await publicClient.readContract({
        address: SUBSCRIPTION_MANAGER_ADDRESS,
        abi: SUBSCRIPTION_MANAGER_ABI,
        functionName: 'getWithdrawableRevenue',
        args: [BigInt(agentId)],
      })
      
      setWithdrawableRevenue(result as bigint || BigInt(0))
    } catch (err) {
      console.error('Load withdrawable revenue error:', err)
      setWithdrawableRevenue(BigInt(0))
    }
  }

  // 创建订阅计划
  const createSubscriptionPlan = useCallback(async (
    agentId: number,
    name: string,
    description: string,
    token: string,
    price: number,
    billingPeriod: BillingPeriod,
    maxUsage: number
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (!name || name.trim().length === 0) {
        throw new Error('计划名称不能为空')
      }

      if (price <= 0) {
        throw new Error('价格必须大于0')
      }

      if (maxUsage < 0) {
        throw new Error('最大使用量不能为负数')
      }

      setError(null)
      
      const hash = await createPlanAsync({
        address: SUBSCRIPTION_MANAGER_ADDRESS,
        abi: SUBSCRIPTION_MANAGER_ABI,
        functionName: 'createPlan',
        args: [
          BigInt(agentId),
          name,
          description,
          token as `0x${string}`,
          BigInt(price),
          billingPeriod,
          BigInt(maxUsage)
        ]
      })

      setTransactionHash(hash)
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('创建订阅计划失败')
      setError(error)
      console.error('Create subscription plan error:', err)
      return undefined
    }
  }, [isConnected, address, createPlanAsync])

  // 更新订阅计划
  const updateSubscriptionPlan = useCallback(async (
    planId: number,
    name: string,
    description: string,
    price: number,
    billingPeriod: BillingPeriod,
    maxUsage: number
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (!name || name.trim().length === 0) {
        throw new Error('计划名称不能为空')
      }

      if (price <= 0) {
        throw new Error('价格必须大于0')
      }

      if (maxUsage < 0) {
        throw new Error('最大使用量不能为负数')
      }

      setError(null)
      
      const hash = await updatePlanAsync({
        address: SUBSCRIPTION_MANAGER_ADDRESS,
        abi: SUBSCRIPTION_MANAGER_ABI,
        functionName: 'updatePlan',
        args: [
          BigInt(planId),
          name,
          description,
          BigInt(price),
          billingPeriod,
          BigInt(maxUsage)
        ]
      })

      setTransactionHash(hash)
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('更新订阅计划失败')
      setError(error)
      console.error('Update subscription plan error:', err)
      return undefined
    }
  }, [isConnected, address, updatePlanAsync])

  // 停用计划
  const deactivatePlan = useCallback(async (
    planId: number
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (planId <= 0) {
        throw new Error('无效的计划ID')
      }

      setError(null)
      
      const hash = await deactivatePlanAsync({
        address: SUBSCRIPTION_MANAGER_ADDRESS,
        abi: SUBSCRIPTION_MANAGER_ABI,
        functionName: 'deactivatePlan',
        args: [BigInt(planId)]
      })

      setTransactionHash(hash)
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('停用计划失败')
      setError(error)
      console.error('Deactivate plan error:', err)
      return undefined
    }
  }, [isConnected, address, deactivatePlanAsync])

  // 订阅
  const subscribe = useCallback(async (
    planId: number, 
    value?: bigint
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (planId <= 0) {
        throw new Error('无效的计划ID')
      }

      setError(null)
      
      const hash = await subscribeAsync({
        address: SUBSCRIPTION_MANAGER_ADDRESS,
        abi: SUBSCRIPTION_MANAGER_ABI,
        functionName: 'subscribe',
        args: [BigInt(planId)],
        value: value || BigInt(0)
      })

      setTransactionHash(hash)
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('订阅失败')
      setError(error)
      console.error('Subscribe error:', err)
      return undefined
    }
  }, [isConnected, address, subscribeAsync])

  // 处理支付
  const processPayment = useCallback(async (
    subscriptionId: number
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (subscriptionId <= 0) {
        throw new Error('无效的订阅ID')
      }

      setError(null)
      
      const hash = await processPaymentAsync({
        address: SUBSCRIPTION_MANAGER_ADDRESS,
        abi: SUBSCRIPTION_MANAGER_ABI,
        functionName: 'processPayment',
        args: [BigInt(subscriptionId)]
      })

      setTransactionHash(hash)
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('处理支付失败')
      setError(error)
      console.error('Process payment error:', err)
      return undefined
    }
  }, [isConnected, address, processPaymentAsync])

  // 取消订阅
  const cancelSubscription = useCallback(async (
    subscriptionId: number
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (subscriptionId <= 0) {
        throw new Error('无效的订阅ID')
      }

      setError(null)
      
      const hash = await cancelSubscriptionAsync({
        address: SUBSCRIPTION_MANAGER_ADDRESS,
        abi: SUBSCRIPTION_MANAGER_ABI,
        functionName: 'cancelSubscription',
        args: [BigInt(subscriptionId)]
      })

      setTransactionHash(hash)
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('取消订阅失败')
      setError(error)
      console.error('Cancel subscription error:', err)
      return undefined
    }
  }, [isConnected, address, cancelSubscriptionAsync])

  // 记录使用量
  const recordUsage = useCallback(async (
    subscriptionId: number,
    usage: number
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (subscriptionId <= 0) {
        throw new Error('无效的订阅ID')
      }

      if (usage <= 0) {
        throw new Error('使用量必须大于0')
      }

      setError(null)
      
      const hash = await recordUsageAsync({
        address: SUBSCRIPTION_MANAGER_ADDRESS,
        abi: SUBSCRIPTION_MANAGER_ABI,
        functionName: 'recordUsage',
        args: [BigInt(subscriptionId), BigInt(usage)]
      })

      setTransactionHash(hash)
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('记录使用量失败')
      setError(error)
      console.error('Record usage error:', err)
      return undefined
    }
  }, [isConnected, address, recordUsageAsync])

  // 提取订阅收益
  const withdrawSubscriptionRevenue = useCallback(async (
    agentId: number
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (agentId <= 0) {
        throw new Error('无效的Agent ID')
      }

      setError(null)
      
      const hash = await withdrawRevenueAsync({
        address: SUBSCRIPTION_MANAGER_ADDRESS,
        abi: SUBSCRIPTION_MANAGER_ABI,
        functionName: 'withdrawSubscriptionRevenue',
        args: [BigInt(agentId)]
      })

      setTransactionHash(hash)
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('提取订阅收益失败')
      setError(error)
      console.error('Withdraw subscription revenue error:', err)
      return undefined
    }
  }, [isConnected, address, withdrawRevenueAsync])

  // 获取可提取收益
  const getWithdrawableRevenue = useCallback(async (agentId: number): Promise<bigint> => {
    try {
      if (agentId <= 0) {
        return BigInt(0)
      }

      setCurrentAgentIdForWithdraw(agentId)
      await loadWithdrawableRevenue(agentId)
      return withdrawableRevenue
    } catch (err) {
      console.error('Get withdrawable revenue error:', err)
      return BigInt(0)
    }
  }, [withdrawableRevenue])

  // 获取单个计划
  const getPlan = useCallback(async (planId: number): Promise<SubscriptionPlan | null> => {
    try {
      if (planId <= 0) {
        return null
      }

      if (!publicClient) {
        console.error('Public client not available')
        return null
      }

      const result = await publicClient.readContract({
        address: SUBSCRIPTION_MANAGER_ADDRESS,
        abi: SUBSCRIPTION_MANAGER_ABI,
        functionName: 'getPlan',
        args: [BigInt(planId)],
      })

      return result as SubscriptionPlan || null
    } catch (err) {
      console.error('Get plan error:', err)
      return null
    }
  }, [publicClient])

  // 获取单个订阅
  const getSubscription = useCallback(async (subscriptionId: number): Promise<Subscription | null> => {
    try {
      if (subscriptionId <= 0) {
        return null
      }

      if (!publicClient) {
        console.error('Public client not available')
        return null
      }

      const result = await publicClient.readContract({
        address: SUBSCRIPTION_MANAGER_ADDRESS,
        abi: SUBSCRIPTION_MANAGER_ABI,
        functionName: 'getSubscription',
        args: [BigInt(subscriptionId)],
      })

      return result as Subscription || null
    } catch (err) {
      console.error('Get subscription error:', err)
      return null
    }
  }, [publicClient])

  // 获取Agent的所有计划
  const getAgentPlans = useCallback(async (agentId: number): Promise<SubscriptionPlan[]> => {
    try {
      if (agentId <= 0) {
        return []
      }

      setCurrentAgentIdForPlans(agentId)
      await loadAgentPlans(agentId)
      return agentPlans
    } catch (err) {
      console.error('Get agent plans error:', err)
      return []
    }
  }, [publicClient, agentPlans])

  // 获取用户的所有订阅
  const getUserSubscriptions = useCallback(async (): Promise<Subscription[]> => {
    try {
      if (!address) {
        return []
      }

      await loadUserSubscriptions()
      return userSubscriptions
    } catch (err) {
      console.error('Get user subscriptions error:', err)
      return []
    }
  }, [publicClient, address, userSubscriptions])

  // 获取计划的所有订阅
  const getPlanSubscriptions = useCallback(async (planId: number): Promise<Subscription[]> => {
    try {
      if (planId <= 0) {
        return []
      }

      setCurrentPlanIdForSubscriptions(planId)
      await loadPlanSubscriptions(planId)
      return planSubscriptions
    } catch (err) {
      console.error('Get plan subscriptions error:', err)
      return []
    }
  }, [publicClient, planSubscriptions])

  // 检查订阅是否活跃
  const isSubscriptionActive = useCallback(async (subscriptionId: number): Promise<boolean> => {
    try {
      if (subscriptionId <= 0) {
        return false
      }

      if (!publicClient) {
        console.error('Public client not available')
        return false
      }

      const result = await publicClient.readContract({
        address: SUBSCRIPTION_MANAGER_ADDRESS,
        abi: SUBSCRIPTION_MANAGER_ABI,
        functionName: 'isSubscriptionActive',
        args: [BigInt(subscriptionId)],
      })

      return result as boolean || false
    } catch (err) {
      console.error('Check subscription active error:', err)
      return false
    }
  }, [publicClient])

  // 获取Agent订阅统计
  const getAgentSubscriptionStats = useCallback(async (agentId: number): Promise<SubscriptionStats | null> => {
    try {
      if (agentId <= 0) {
        return null
      }

      setCurrentAgentIdForStats(agentId)
      await loadSubscriptionStats(agentId)
      return subscriptionStats
    } catch (err) {
      console.error('Get agent subscription stats error:', err)
      return null
    }
  }, [publicClient, subscriptionStats])

  // 获取计划总数
  const getTotalPlanCount = useCallback(async (): Promise<number> => {
    try {
      const result = await refetchTotalPlanCount()
      return result.data ? Number(result.data) : 0
    } catch (err) {
      console.error('Get total plan count error:', err)
      return 0
    }
  }, [refetchTotalPlanCount])

  // 获取订阅总数
  const getTotalSubscriptionCount = useCallback(async (): Promise<number> => {
    try {
      const result = await refetchTotalSubscriptionCount()
      return result.data ? Number(result.data) : 0
    } catch (err) {
      console.error('Get total subscription count error:', err)
      return 0
    }
  }, [refetchTotalSubscriptionCount])

  // 获取到期订阅
  const getDueSubscriptions = useCallback(async (): Promise<number[]> => {
    try {
      const result = await refetchDueSubscriptions()
      return bigintArrayToNumberArray(result.data as readonly bigint[] | undefined)
    } catch (err) {
      console.error('Get due subscriptions error:', err)
      return []
    }
  }, [refetchDueSubscriptions])

  // 重新获取所有数据
  const refetchData = useCallback(async (): Promise<void> => {
    try {
      await Promise.all([
        refetchTotalPlanCount(),
        refetchTotalSubscriptionCount(),
        refetchDueSubscriptions(),
        currentAgentIdForPlans !== null && loadAgentPlans(currentAgentIdForPlans),
        address && loadUserSubscriptions(),
        currentPlanIdForSubscriptions !== null && loadPlanSubscriptions(currentPlanIdForSubscriptions),
        currentAgentIdForStats !== null && loadSubscriptionStats(currentAgentIdForStats),
        currentAgentIdForWithdraw !== null && loadWithdrawableRevenue(currentAgentIdForWithdraw)
      ].filter(Boolean))
    } catch (err) {
      console.error('Refetch data error:', err)
    }
  }, [
    currentAgentIdForPlans,
    address,
    currentPlanIdForSubscriptions,
    currentAgentIdForStats,
    currentAgentIdForWithdraw
  ])

  // 重置状态
  const resetState = useCallback((): void => {
    setError(null)
    setTransactionHash(undefined)
    setCurrentAgentIdForPlans(null)
    setCurrentPlanIdForSubscriptions(null)
    setCurrentAgentIdForStats(null)
    setCurrentAgentIdForWithdraw(null)
    resetCreatePlan()
    resetUpdatePlan()
    resetDeactivatePlan()
    resetSubscribe()
    resetProcessPayment()
    resetCancelSubscription()
    resetRecordUsage()
    resetWithdrawRevenue()
  }, [
    resetCreatePlan,
    resetUpdatePlan,
    resetDeactivatePlan,
    resetSubscribe,
    resetProcessPayment,
    resetCancelSubscription,
    resetRecordUsage,
    resetWithdrawRevenue
  ])

  // 计算状态
  const isLoading = useMemo(() => 
    isCreatingPlan || isUpdatingPlan || isDeactivatingPlan || isSubscribing || 
    isProcessingPayment || isCancellingSubscription || isRecordingUsage || isWithdrawingRevenue,
    [
      isCreatingPlan, isUpdatingPlan, isDeactivatingPlan, isSubscribing,
      isProcessingPayment, isCancellingSubscription, isRecordingUsage, isWithdrawingRevenue
    ]
  )

  // 实时数据
  const totalPlanCount = useMemo(() => 
    totalPlanCountData ? Number(totalPlanCountData) : 0, 
    [totalPlanCountData]
  )

  const totalSubscriptionCount = useMemo(() => 
    totalSubscriptionCountData ? Number(totalSubscriptionCountData) : 0, 
    [totalSubscriptionCountData]
  )

  const dueSubscriptions = useMemo(() => 
    bigintArrayToNumberArray(dueSubscriptionsData as readonly bigint[] | undefined), 
    [dueSubscriptionsData]
  )

  return {
    // 订阅计划管理功能（开发者）
    createSubscriptionPlan,
    updateSubscriptionPlan,
    deactivatePlan,
    getPlan,
    getAgentPlans,
    getPlanSubscriptions,
    getAgentSubscriptionStats,
    withdrawSubscriptionRevenue,
    getWithdrawableRevenue,
    
    // 订阅管理功能（用户）
    subscribe,
    processPayment,
    cancelSubscription,
    recordUsage,
    getSubscription,
    getUserSubscriptions,
    isSubscriptionActive,
    
    // 统计功能
    getTotalPlanCount,
    getTotalSubscriptionCount,
    getDueSubscriptions,
    
    // 实时数据
    userSubscriptions,
    agentPlans,
    planSubscriptions,
    subscriptionStats,
    totalPlanCount,
    totalSubscriptionCount,
    dueSubscriptions,
    withdrawableRevenue,
    
    // 状态
    isCreatingPlan,
    isUpdatingPlan,
    isDeactivatingPlan,
    isSubscribing,
    isProcessingPayment,
    isCancellingSubscription,
    isRecordingUsage,
    isWithdrawingRevenue,
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

