
// components/agent/hooks/usePaymentGateway.ts
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

const PAYMENT_GATEWAY_ADDRESS = validateAddress(process.env.NEXT_PUBLIC_PAYMENT_GATEWAY_ADDRESS)

// 完整的 ABI 定义，与智能合约完全匹配
const PAYMENT_GATEWAY_ABI = [
  // 支付操作
  {
    name: 'createPayment',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'serviceDescription', type: 'string' },
      { name: 'useEscrow', type: 'bool' }
    ],
    outputs: [{ name: 'paymentId', type: 'uint256' }],
    stateMutability: 'payable'
  },
  {
    name: 'completePayment',
    type: 'function',
    inputs: [{ name: 'paymentId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    name: 'releaseEscrow',
    type: 'function',
    inputs: [{ name: 'paymentId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    name: 'raiseDispute',
    type: 'function',
    inputs: [
      { name: 'paymentId', type: 'uint256' },
      { name: 'reason', type: 'string' }
    ],
    outputs: [{ name: 'disputeId', type: 'uint256' }],
    stateMutability: 'nonpayable'
  },
  {
    name: 'resolveDispute',
    type: 'function',
    inputs: [
      { name: 'disputeId', type: 'uint256' },
      { name: 'refundApproved', type: 'bool' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  
  // 查询函数 - 修复：确保所有函数都有正确的参数
  {
    name: 'getPayment',
    type: 'function',
    inputs: [{ name: 'paymentId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'paymentId', type: 'uint256' },
          { name: 'agentId', type: 'uint256' },
          { name: 'client', type: 'address' },
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'serviceDescription', type: 'string' },
          { name: 'status', type: 'uint8' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'completedAt', type: 'uint256' },
          { name: 'escrowReleaseTime', type: 'uint256' },
          { name: 'isEscrowed', type: 'bool' },
          { name: 'escrowHolder', type: 'address' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  {
    name: 'getAgentPayments',
    type: 'function',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'paymentId', type: 'uint256' },
          { name: 'agentId', type: 'uint256' },
          { name: 'client', type: 'address' },
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'serviceDescription', type: 'string' },
          { name: 'status', type: 'uint8' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'completedAt', type: 'uint256' },
          { name: 'escrowReleaseTime', type: 'uint256' },
          { name: 'isEscrowed', type: 'bool' },
          { name: 'escrowHolder', type: 'address' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  {
    name: 'getClientPayments',
    type: 'function',
    inputs: [{ name: 'client', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'paymentId', type: 'uint256' },
          { name: 'agentId', type: 'uint256' },
          { name: 'client', type: 'address' },
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'serviceDescription', type: 'string' },
          { name: 'status', type: 'uint8' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'completedAt', type: 'uint256' },
          { name: 'escrowReleaseTime', type: 'uint256' },
          { name: 'isEscrowed', type: 'bool' },
          { name: 'escrowHolder', type: 'address' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  {
    name: 'getAgentEarnings',
    type: 'function',
    inputs: [{ name: 'agentOwner', type: 'address' }],
    outputs: [{ name: 'totalEarnings', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    name: 'getTotalPaymentCount',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    name: 'getDispute',
    type: 'function',
    inputs: [{ name: 'disputeId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'paymentId', type: 'uint256' },
          { name: 'raisedBy', type: 'address' },
          { name: 'reason', type: 'string' },
          { name: 'raisedAt', type: 'uint256' },
          { name: 'resolved', type: 'bool' },
          { name: 'resolver', type: 'address' },
          { name: 'resolvedAt', type: 'uint256' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  
  // 管理函数
  {
    name: 'setPlatformFee',
    type: 'function',
    inputs: [{ name: 'newFee', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    name: 'setFeeCollector',
    type: 'function',
    inputs: [{ name: 'newCollector', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    name: 'setEscrowPeriod',
    type: 'function',
    inputs: [{ name: 'newPeriod', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  
  // 事件定义
  {
    name: 'PaymentCreated',
    type: 'event',
    inputs: [
      { name: 'paymentId', type: 'uint256', indexed: true },
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'client', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'serviceDescription', type: 'string', indexed: false },
      { name: 'isEscrowed', type: 'bool', indexed: false }
    ]
  },
  {
    name: 'PaymentCompleted',
    type: 'event',
    inputs: [
      { name: 'paymentId', type: 'uint256', indexed: true },
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'client', type: 'address', indexed: false },
      { name: 'token', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'completedAt', type: 'uint256', indexed: false }
    ]
  },
  {
    name: 'PaymentRefunded',
    type: 'event',
    inputs: [
      { name: 'paymentId', type: 'uint256', indexed: true },
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'client', type: 'address', indexed: false },
      { name: 'token', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'refundedAt', type: 'uint256', indexed: false }
    ]
  },
  {
    name: 'DisputeRaised',
    type: 'event',
    inputs: [
      { name: 'disputeId', type: 'uint256', indexed: true },
      { name: 'paymentId', type: 'uint256', indexed: true },
      { name: 'raisedBy', type: 'address', indexed: false },
      { name: 'reason', type: 'string', indexed: false },
      { name: 'raisedAt', type: 'uint256', indexed: false }
    ]
  },
  {
    name: 'DisputeResolved',
    type: 'event',
    inputs: [
      { name: 'disputeId', type: 'uint256', indexed: true },
      { name: 'paymentId', type: 'uint256', indexed: true },
      { name: 'resolver', type: 'address', indexed: false },
      { name: 'refundApproved', type: 'bool', indexed: false },
      { name: 'resolvedAt', type: 'uint256', indexed: false }
    ]
  },
  {
    name: 'EscrowReleased',
    type: 'event',
    inputs: [
      { name: 'paymentId', type: 'uint256', indexed: true },
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'token', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'releasedAt', type: 'uint256', indexed: false }
    ]
  }
] as const

// TypeScript 接口定义
export enum PaymentStatus {
  Pending = 0,
  Completed = 1,
  Refunded = 2,
  Disputed = 3,
  Cancelled = 4
}

export interface Payment {
  paymentId: bigint
  agentId: bigint
  client: `0x${string}`
  token: `0x${string}`
  amount: bigint
  serviceDescription: string
  status: PaymentStatus
  createdAt: bigint
  completedAt: bigint
  escrowReleaseTime: bigint
  isEscrowed: boolean
  escrowHolder: `0x${string}`
}

interface Dispute {
  paymentId: bigint
  raisedBy: `0x${string}`
  reason: string
  raisedAt: bigint
  resolved: boolean
  resolver: `0x${string}`
  resolvedAt: bigint
}

interface UsePaymentGatewayReturn {
  // 支付操作
  createPayment: (
    agentId: number,
    token: string,
    amount: number,
    serviceDescription: string,
    useEscrow: boolean,
    value?: bigint
  ) => Promise<`0x${string}` | undefined>
  completePayment: (paymentId: number) => Promise<`0x${string}` | undefined>
  releaseEscrow: (paymentId: number) => Promise<`0x${string}` | undefined>
  raiseDispute: (paymentId: number, reason: string) => Promise<`0x${string}` | undefined>
  resolveDispute: (disputeId: number, refundApproved: boolean) => Promise<`0x${string}` | undefined>
  
  // 查询功能
  getPayment: (paymentId: number) => Promise<Payment | null>
  getAgentPayments: (agentId: number) => Promise<Payment[]>
  getClientPayments: () => Promise<Payment[]>
  getAgentEarnings: (agentOwner?: string) => Promise<number>
  getTotalPaymentCount: () => Promise<number>
  getDispute: (disputeId: number) => Promise<Dispute | null>
  
  // 管理功能
  setPlatformFee: (newFee: number) => Promise<`0x${string}` | undefined>
  setFeeCollector: (newCollector: string) => Promise<`0x${string}` | undefined>
  setEscrowPeriod: (newPeriod: number) => Promise<`0x${string}` | undefined>
  
  // 实时数据
  agentPayments: Payment[]
  clientPayments: Payment[]
  agentEarnings: number
  totalPaymentCount: number
  
  // 状态
  isCreatingPayment: boolean
  isCompletingPayment: boolean
  isReleasingEscrow: boolean
  isRaisingDispute: boolean
  isResolvingDispute: boolean
  isSettingPlatformFee: boolean
  isSettingFeeCollector: boolean
  isSettingEscrowPeriod: boolean
  isLoading: boolean
  error: Error | null
  transactionHash: `0x${string}` | undefined
  isConfirming: boolean
  isConfirmed: boolean
  
  // 工具函数
  refetchData: () => Promise<void>
  resetState: () => void
}

export function usePaymentGateway(): UsePaymentGatewayReturn {
  const { address, isConnected } = useAccount()
  const { data: blockNumber } = useBlockNumber({ watch: true })
  const publicClient = usePublicClient()
  
  const [error, setError] = useState<Error | null>(null)
  const [transactionHash, setTransactionHash] = useState<`0x${string}` | undefined>()
  const [forceRefresh, setForceRefresh] = useState<number>(0)

  // 创建支付
  const { 
    writeContractAsync: createPaymentAsync,
    isPending: isCreatingPayment,
    error: createPaymentError,
    reset: resetCreatePayment
  } = useWriteContract()

  // 完成支付
  const { 
    writeContractAsync: completePaymentAsync,
    isPending: isCompletingPayment,
    error: completePaymentError,
    reset: resetCompletePayment
  } = useWriteContract()

  // 释放托管
  const { 
    writeContractAsync: releaseEscrowAsync,
    isPending: isReleasingEscrow,
    error: releaseEscrowError,
    reset: resetReleaseEscrow
  } = useWriteContract()

  // 提出争议
  const { 
    writeContractAsync: raiseDisputeAsync,
    isPending: isRaisingDispute,
    error: raiseDisputeError,
    reset: resetRaiseDispute
  } = useWriteContract()

  // 解决争议
  const { 
    writeContractAsync: resolveDisputeAsync,
    isPending: isResolvingDispute,
    error: resolveDisputeError,
    reset: resetResolveDispute
  } = useWriteContract()

  // 管理函数
  const { 
    writeContractAsync: setPlatformFeeAsync,
    isPending: isSettingPlatformFee,
    error: setPlatformFeeError,
    reset: resetSetPlatformFee
  } = useWriteContract()

  const { 
    writeContractAsync: setFeeCollectorAsync,
    isPending: isSettingFeeCollector,
    error: setFeeCollectorError,
    reset: resetSetFeeCollector
  } = useWriteContract()

  const { 
    writeContractAsync: setEscrowPeriodAsync,
    isPending: isSettingEscrowPeriod,
    error: setEscrowPeriodError,
    reset: resetSetEscrowPeriod
  } = useWriteContract()

  // 统一的交易确认状态
  const { 
    isLoading: isConfirming, 
    isSuccess: isConfirmed,
    data: receipt
  } = useWaitForTransactionReceipt({
    hash: transactionHash,
  })

  // 修复：获取所有Agent的支付记录 - 使用publicClient直接调用
  const [agentPayments, setAgentPayments] = useState<Payment[]>([])

  // 获取客户支付记录
  const { 
    data: clientPaymentsData, 
    refetch: refetchClientPayments,
    error: clientPaymentsError 
  } = useReadContract({
    address: PAYMENT_GATEWAY_ADDRESS,
    abi: PAYMENT_GATEWAY_ABI,
    functionName: 'getClientPayments',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && isConnected,
      staleTime: 0, // 立即过期，确保每次都会重新获取
    },
  })

  // 获取Agent收益 - 修复：确保有正确的参数
  const { 
    data: agentEarningsData, 
    refetch: refetchAgentEarnings,
    error: agentEarningsError 
  } = useReadContract({
    address: PAYMENT_GATEWAY_ADDRESS,
    abi: PAYMENT_GATEWAY_ABI,
    functionName: 'getAgentEarnings',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && isConnected,
      staleTime: 0, // 立即过期，确保每次都会重新获取
    },
  })

  // 获取支付总数
  const { 
    data: totalPaymentCountData, 
    refetch: refetchTotalPaymentCount,
    error: totalPaymentCountError 
  } = useReadContract({
    address: PAYMENT_GATEWAY_ADDRESS,
    abi: PAYMENT_GATEWAY_ABI,
    functionName: 'getTotalPaymentCount',
    query: {
      enabled: true,
      staleTime: 0, // 立即过期，确保每次都会重新获取
    },
  })

  // 错误处理 Effect
  useEffect(() => {
    const currentError = createPaymentError || completePaymentError || releaseEscrowError || 
                        raiseDisputeError || resolveDisputeError || setPlatformFeeError ||
                        setFeeCollectorError || setEscrowPeriodError || clientPaymentsError ||
                        agentEarningsError || totalPaymentCountError
    
    if (currentError) {
      console.error('Payment Gateway Error:', currentError)
      setError(currentError)
    }
  }, [
    createPaymentError, completePaymentError, releaseEscrowError, raiseDisputeError,
    resolveDisputeError, setPlatformFeeError, setFeeCollectorError, setEscrowPeriodError,
    clientPaymentsError, agentEarningsError, totalPaymentCountError
  ])

  // 修复：监听交易确认，强制刷新数据
  useEffect(() => {
    if (isConfirmed && receipt) {
      console.log('🎉 支付交易确认成功，强制刷新收益数据')
      
      // 强制刷新所有数据
      setForceRefresh(prev => prev + 1)
      
      // 立即重新获取数据
      setTimeout(() => {
        console.log('🔄 立即重新获取收益数据...')
        refetchClientPayments()
        refetchAgentEarnings()
        refetchTotalPaymentCount()
      }, 1000)
    }
  }, [isConfirmed, receipt, refetchClientPayments, refetchAgentEarnings, refetchTotalPaymentCount])

  // 修复：监听区块高度变化，自动刷新数据
  useEffect(() => {
    if (blockNumber) {
      console.log('📦 新区块:', blockNumber, '触发收益数据刷新')
      // 每次新区块都强制刷新数据
      setForceRefresh(prev => prev + 1)
    }
  }, [blockNumber])

  // 修复：数据同步 Effect
  useEffect(() => {
    if (clientPaymentsData) {
      try {
        console.log('🔄 更新客户支付数据:', clientPaymentsData)
      } catch (err) {
        console.error('Error processing client payments data:', err)
      }
    }
  }, [clientPaymentsData, forceRefresh])

  // 修复：Agent收益数据同步 Effect
  useEffect(() => {
    if (agentEarningsData !== undefined) {
      try {
        const newEarnings = Number(agentEarningsData)
        console.log('🔄 更新Agent收益数据:', newEarnings)
      } catch (err) {
        console.error('Error processing agent earnings data:', err)
      }
    }
  }, [agentEarningsData, forceRefresh])

  // 修复：获取所有Agent的支付记录
  const fetchAllAgentPayments = useCallback(async (agentIds: number[]): Promise<void> => {
    if (!publicClient || !agentIds.length) {
      setAgentPayments([])
      return
    }

    try {
      console.log('🔄 开始获取所有Agent的支付记录...', agentIds)
      const allPayments: Payment[] = []

      // 并行获取所有Agent的支付记录
      const paymentPromises = agentIds.map(async (agentId) => {
        try {
          const result = await publicClient.readContract({
            address: PAYMENT_GATEWAY_ADDRESS,
            abi: PAYMENT_GATEWAY_ABI,
            functionName: 'getAgentPayments',
            args: [BigInt(agentId)],
          })
          return result as Payment[] || []
        } catch (err) {
          console.error(`获取Agent ${agentId} 支付记录失败:`, err)
          return []
        }
      })

      const results = await Promise.all(paymentPromises)
      results.forEach(payments => {
        allPayments.push(...payments)
      })

      console.log('✅ 获取到所有Agent支付记录:', allPayments.length)
      setAgentPayments(allPayments)
    } catch (err) {
      console.error('获取所有Agent支付记录失败:', err)
      setAgentPayments([])
    }
  }, [publicClient])

  // 创建支付
  const createPayment = useCallback(async (
    agentId: number,
    token: string,
    amount: number,
    serviceDescription: string,
    useEscrow: boolean,
    value?: bigint
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (agentId <= 0) {
        throw new Error('无效的Agent ID')
      }

      if (!token || token.length === 0) {
        throw new Error('代币地址不能为空')
      }

      if (amount <= 0) {
        throw new Error('金额必须大于0')
      }

      if (!serviceDescription || serviceDescription.trim().length === 0) {
        throw new Error('服务描述不能为空')
      }

      setError(null)
      
      console.log('🔄 开始创建支付...', {
        agentId,
        token,
        amount,
        serviceDescription,
        useEscrow,
        value
      })
      
      const hash = await createPaymentAsync({
        address: PAYMENT_GATEWAY_ADDRESS,
        abi: PAYMENT_GATEWAY_ABI,
        functionName: 'createPayment',
        args: [
          BigInt(agentId),
          token as `0x${string}`,
          BigInt(amount),
          serviceDescription,
          useEscrow
        ],
        value: value || BigInt(0)
      })

      console.log('✅ 创建支付交易提交成功，哈希:', hash)
      setTransactionHash(hash)
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('创建支付失败')
      setError(error)
      console.error('❌ Create payment error:', err)
      return undefined
    }
  }, [isConnected, address, createPaymentAsync])

  // 完成支付
  const completePayment = useCallback(async (
    paymentId: number
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (paymentId <= 0) {
        throw new Error('无效的支付ID')
      }

      setError(null)
      
      const hash = await completePaymentAsync({
        address: PAYMENT_GATEWAY_ADDRESS,
        abi: PAYMENT_GATEWAY_ABI,
        functionName: 'completePayment',
        args: [BigInt(paymentId)]
      })

      setTransactionHash(hash)
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('完成支付失败')
      setError(error)
      console.error('Complete payment error:', err)
      return undefined
    }
  }, [isConnected, address, completePaymentAsync])

  // 释放托管
  const releaseEscrow = useCallback(async (
    paymentId: number
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (paymentId <= 0) {
        throw new Error('无效的支付ID')
      }

      setError(null)
      
      const hash = await releaseEscrowAsync({
        address: PAYMENT_GATEWAY_ADDRESS,
        abi: PAYMENT_GATEWAY_ABI,
        functionName: 'releaseEscrow',
        args: [BigInt(paymentId)]
      })

      setTransactionHash(hash)
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('释放托管失败')
      setError(error)
      console.error('Release escrow error:', err)
      return undefined
    }
  }, [isConnected, address, releaseEscrowAsync])

  // 提出争议
  const raiseDispute = useCallback(async (
    paymentId: number,
    reason: string
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (paymentId <= 0) {
        throw new Error('无效的支付ID')
      }

      if (!reason || reason.trim().length === 0) {
        throw new Error('争议原因不能为空')
      }

      setError(null)
      
      const hash = await raiseDisputeAsync({
        address: PAYMENT_GATEWAY_ADDRESS,
        abi: PAYMENT_GATEWAY_ABI,
        functionName: 'raiseDispute',
        args: [BigInt(paymentId), reason]
      })

      setTransactionHash(hash)
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('提出争议失败')
      setError(error)
      console.error('Raise dispute error:', err)
      return undefined
    }
  }, [isConnected, address, raiseDisputeAsync])

  // 解决争议
  const resolveDispute = useCallback(async (
    disputeId: number,
    refundApproved: boolean
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (disputeId <= 0) {
        throw new Error('无效的争议ID')
      }

      setError(null)
      
      const hash = await resolveDisputeAsync({
        address: PAYMENT_GATEWAY_ADDRESS,
        abi: PAYMENT_GATEWAY_ABI,
        functionName: 'resolveDispute',
        args: [BigInt(disputeId), refundApproved]
      })

      setTransactionHash(hash)
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('解决争议失败')
      setError(error)
      console.error('Resolve dispute error:', err)
      return undefined
    }
  }, [isConnected, address, resolveDisputeAsync])

  // 设置平台费用
  const setPlatformFee = useCallback(async (
    newFee: number
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (newFee < 0 || newFee > 10000) {
        throw new Error('平台费用必须在0-10000基点之间')
      }

      setError(null)
      
      const hash = await setPlatformFeeAsync({
        address: PAYMENT_GATEWAY_ADDRESS,
        abi: PAYMENT_GATEWAY_ABI,
        functionName: 'setPlatformFee',
        args: [BigInt(newFee)]
      })

      setTransactionHash(hash)
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('设置平台费用失败')
      setError(error)
      console.error('Set platform fee error:', err)
      return undefined
    }
  }, [isConnected, address, setPlatformFeeAsync])

  // 设置费用收集器
  const setFeeCollector = useCallback(async (
    newCollector: string
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (!newCollector || !newCollector.startsWith('0x') || newCollector.length !== 42) {
        throw new Error('无效的费用收集器地址')
      }

      setError(null)
      
      const hash = await setFeeCollectorAsync({
        address: PAYMENT_GATEWAY_ADDRESS,
        abi: PAYMENT_GATEWAY_ABI,
        functionName: 'setFeeCollector',
        args: [newCollector as `0x${string}`]
      })

      setTransactionHash(hash)
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('设置费用收集器失败')
      setError(error)
      console.error('Set fee collector error:', err)
      return undefined
    }
  }, [isConnected, address, setFeeCollectorAsync])

  // 设置托管周期
  const setEscrowPeriod = useCallback(async (
    newPeriod: number
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (newPeriod <= 0) {
        throw new Error('托管周期必须大于0')
      }

      setError(null)
      
      const hash = await setEscrowPeriodAsync({
        address: PAYMENT_GATEWAY_ADDRESS,
        abi: PAYMENT_GATEWAY_ABI,
        functionName: 'setEscrowPeriod',
        args: [BigInt(newPeriod)]
      })

      setTransactionHash(hash)
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('设置托管周期失败')
      setError(error)
      console.error('Set escrow period error:', err)
      return undefined
    }
  }, [isConnected, address, setEscrowPeriodAsync])

  // 获取支付详情
  const getPayment = useCallback(async (paymentId: number): Promise<Payment | null> => {
    try {
      if (paymentId <= 0) {
        return null
      }

      if (!publicClient) {
        console.error('Public client not available')
        return null
      }

      const result = await publicClient.readContract({
        address: PAYMENT_GATEWAY_ADDRESS,
        abi: PAYMENT_GATEWAY_ABI,
        functionName: 'getPayment',
        args: [BigInt(paymentId)],
      })

      return result as Payment || null
    } catch (err) {
      console.error('Get payment error:', err)
      return null
    }
  }, [publicClient])

  // 获取Agent的支付记录
  const getAgentPayments = useCallback(async (agentId: number): Promise<Payment[]> => {
    try {
      if (agentId <= 0) {
        return []
      }

      if (!publicClient) {
        console.error('Public client not available')
        return []
      }

      const result = await publicClient.readContract({
        address: PAYMENT_GATEWAY_ADDRESS,
        abi: PAYMENT_GATEWAY_ABI,
        functionName: 'getAgentPayments',
        args: [BigInt(agentId)],
      })

      return (result as Payment[]) || []
    } catch (err) {
      console.error('Get agent payments error:', err)
      return []
    }
  }, [publicClient])

  // 获取客户的支付记录
  const getClientPayments = useCallback(async (): Promise<Payment[]> => {
    try {
      const result = await refetchClientPayments()
      return (result.data as Payment[]) || []
    } catch (err) {
      console.error('Get client payments error:', err)
      return []
    }
  }, [refetchClientPayments])

  // 获取Agent收益
  const getAgentEarnings = useCallback(async (agentOwner?: string): Promise<number> => {
    try {
      const result = await refetchAgentEarnings()
      return result.data ? Number(result.data) : 0
    } catch (err) {
      console.error('Get agent earnings error:', err)
      return 0
    }
  }, [refetchAgentEarnings])

  // 获取支付总数
  const getTotalPaymentCount = useCallback(async (): Promise<number> => {
    try {
      const result = await refetchTotalPaymentCount()
      return result.data ? Number(result.data) : 0
    } catch (err) {
      console.error('Get total payment count error:', err)
      return 0
    }
  }, [refetchTotalPaymentCount])

  // 获取争议详情
  const getDispute = useCallback(async (disputeId: number): Promise<Dispute | null> => {
    try {
      if (disputeId <= 0) {
        return null
      }

      if (!publicClient) {
        console.error('Public client not available')
        return null
      }

      const result = await publicClient.readContract({
        address: PAYMENT_GATEWAY_ADDRESS,
        abi: PAYMENT_GATEWAY_ABI,
        functionName: 'getDispute',
        args: [BigInt(disputeId)],
      })

      return result as Dispute || null
    } catch (err) {
      console.error('Get dispute error:', err)
      return null
    }
  }, [publicClient])

  // 重新获取所有数据
  const refetchData = useCallback(async (): Promise<void> => {
    try {
      console.log('🔄 重新获取所有收益数据...')
      await Promise.all([
        refetchClientPayments(),
        refetchAgentEarnings(),
        refetchTotalPaymentCount()
      ])
      console.log('✅ 重新获取收益数据完成')
    } catch (err) {
      console.error('Refetch data error:', err)
    }
  }, [
    refetchClientPayments,
    refetchAgentEarnings,
    refetchTotalPaymentCount
  ])

  // 重置状态
  const resetState = useCallback((): void => {
    setError(null)
    setTransactionHash(undefined)
    resetCreatePayment()
    resetCompletePayment()
    resetReleaseEscrow()
    resetRaiseDispute()
    resetResolveDispute()
    resetSetPlatformFee()
    resetSetFeeCollector()
    resetSetEscrowPeriod()
  }, [
    resetCreatePayment,
    resetCompletePayment,
    resetReleaseEscrow,
    resetRaiseDispute,
    resetResolveDispute,
    resetSetPlatformFee,
    resetSetFeeCollector,
    resetSetEscrowPeriod
  ])

  // 计算状态
  const isLoading = useMemo(() => 
    isCreatingPayment || isCompletingPayment || isReleasingEscrow || isRaisingDispute || 
    isResolvingDispute || isSettingPlatformFee || isSettingFeeCollector || isSettingEscrowPeriod,
    [
      isCreatingPayment, isCompletingPayment, isReleasingEscrow, isRaisingDispute,
      isResolvingDispute, isSettingPlatformFee, isSettingFeeCollector, isSettingEscrowPeriod
    ]
  )

  // 实时数据
  const clientPayments = useMemo(() => 
    (clientPaymentsData as Payment[]) || [], 
    [clientPaymentsData, forceRefresh]
  )

  const agentEarnings = useMemo(() => 
    agentEarningsData ? Number(agentEarningsData) : 0, 
    [agentEarningsData, forceRefresh]
  )

  const totalPaymentCount = useMemo(() => 
    totalPaymentCountData ? Number(totalPaymentCountData) : 0, 
    [totalPaymentCountData, forceRefresh]
  )

  return {
    // 支付操作
    createPayment,
    completePayment,
    releaseEscrow,
    raiseDispute,
    resolveDispute,
    
    // 查询功能
    getPayment,
    getAgentPayments,
    getClientPayments,
    getAgentEarnings,
    getTotalPaymentCount,
    getDispute,
    
    // 管理功能
    setPlatformFee,
    setFeeCollector,
    setEscrowPeriod,
    
    // 实时数据
    agentPayments,
    clientPayments,
    agentEarnings,
    totalPaymentCount,
    
    // 状态
    isCreatingPayment,
    isCompletingPayment,
    isReleasingEscrow,
    isRaisingDispute,
    isResolvingDispute,
    isSettingPlatformFee,
    isSettingFeeCollector,
    isSettingEscrowPeriod,
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
