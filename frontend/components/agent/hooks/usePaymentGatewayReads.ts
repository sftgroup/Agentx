// components/agent/hooks/usePaymentGatewayReads.ts
// 代码审查 C2：从 usePaymentGateway 拆出的查询类逻辑（合约读操作 + 实时数据 + 自动刷新）。
'use client'

import {
  useReadContract,
  useBlockNumber,
  usePublicClient,
  useAccount,
} from 'wagmi'
import { useState, useEffect, useCallback, useMemo } from 'react'

import { PAYMENT_GATEWAY_ADDRESS } from './payment-gateway-types'
import type { Payment, Dispute } from './payment-gateway-types'
import { PAYMENT_GATEWAY_ABI } from '@/abis/PaymentGateway'

export interface PaymentGatewayReads {
  reads: {
    getPayment: (paymentId: number) => Promise<Payment | null>
    getAgentPayments: (agentId: number) => Promise<Payment[]>
    getClientPayments: () => Promise<Payment[]>
    getAgentEarnings: (agentOwner?: string) => Promise<number>
    getTotalPaymentCount: () => Promise<number>
    getDispute: (disputeId: number) => Promise<Dispute | null>
    fetchAllAgentPayments: (agentIds: number[]) => Promise<void>
    refetchData: () => Promise<void>
  }
  data: {
    clientPayments: Payment[]
    agentEarnings: number
    totalPaymentCount: number
    agentPayments: Payment[]
  }
  errors: {
    clientPaymentsError: Error | null
    agentEarningsError: Error | null
    totalPaymentCountError: Error | null
  }
}

/**
 * 查询类支付逻辑：useReadContract 实时数据 + 手动合约读方法 + 区块/交易确认自动刷新。
 * @param opts.isConfirmed 交易确认信号（由宿主 hook 传入，确认后自动刷新读数据）
 */
export function usePaymentGatewayReads(opts: { isConfirmed: boolean }): PaymentGatewayReads {
  const { address, isConnected } = useAccount()
  const { data: blockNumber } = useBlockNumber({ watch: true })
  const publicClient = usePublicClient()

  const [forceRefresh, setForceRefresh] = useState<number>(0)

  // 获取所有 Agent 的支付记录（publicClient 直接调用）
  const [agentPayments, setAgentPayments] = useState<Payment[]>([])

  // 获取客户支付记录
  const {
    data: clientPaymentsData,
    refetch: refetchClientPayments,
    error: clientPaymentsError,
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

  // 获取 Agent 收益
  const {
    data: agentEarningsData,
    refetch: refetchAgentEarnings,
    error: agentEarningsError,
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
    error: totalPaymentCountError,
  } = useReadContract({
    address: PAYMENT_GATEWAY_ADDRESS,
    abi: PAYMENT_GATEWAY_ABI,
    functionName: 'getTotalPaymentCount',
    query: {
      enabled: true,
      staleTime: 0, // 立即过期，确保每次都会重新获取
    },
  })

  // 监听交易确认，强制刷新数据
  useEffect(() => {
    if (opts.isConfirmed) {
      setForceRefresh(prev => prev + 1)

      // 立即重新获取数据
      setTimeout(() => {
        refetchClientPayments()
        refetchAgentEarnings()
        refetchTotalPaymentCount()
      }, 1000)
    }
  }, [opts.isConfirmed, refetchClientPayments, refetchAgentEarnings, refetchTotalPaymentCount])

  // 监听区块高度变化，自动刷新数据
  useEffect(() => {
    if (blockNumber) {
      setForceRefresh(prev => prev + 1)
    }
  }, [blockNumber])

  // 获取所有 Agent 的支付记录
  const fetchAllAgentPayments = useCallback(async (agentIds: number[]): Promise<void> => {
    if (!publicClient || !agentIds.length) {
      setAgentPayments([])
      return
    }

    try {
      const allPayments: Payment[] = []

      // 并行获取所有 Agent 的支付记录
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

      setAgentPayments(allPayments)
    } catch (err) {
      console.error('获取所有Agent支付记录失败:', err)
      setAgentPayments([])
    }
  }, [publicClient])

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

  // 获取 Agent 的支付记录
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

  // 获取 Agent 收益
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
      await Promise.all([
        refetchClientPayments(),
        refetchAgentEarnings(),
        refetchTotalPaymentCount()
      ])
    } catch (err) {
      console.error('Refetch data error:', err)
    }
  }, [
    refetchClientPayments,
    refetchAgentEarnings,
    refetchTotalPaymentCount
  ])

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
    reads: {
      getPayment,
      getAgentPayments,
      getClientPayments,
      getAgentEarnings,
      getTotalPaymentCount,
      getDispute,
      fetchAllAgentPayments,
      refetchData,
    },
    data: {
      clientPayments,
      agentEarnings,
      totalPaymentCount,
      agentPayments,
    },
    errors: {
      clientPaymentsError,
      agentEarningsError,
      totalPaymentCountError,
    },
  }
}
