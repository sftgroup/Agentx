// components/agent/hooks/usePaymentGatewayWrites.ts
// 代码审查 C2：从 usePaymentGateway 拆出的交易类逻辑（8 个合约写操作 + 确认状态）。
'use client'

import {
  useWriteContract,
  useAccount,
  useWaitForTransactionReceipt,
} from 'wagmi'
import { useState, useCallback } from 'react'

import { PAYMENT_GATEWAY_ADDRESS } from './payment-gateway-types'
import { PAYMENT_GATEWAY_ABI } from '@/abis/PaymentGateway'

type Hash = `0x${string}`

export interface PaymentGatewayWrites {
  writes: {
    createPayment: (
      agentId: number,
      token: string,
      amount: number,
      serviceDescription: string,
      useEscrow: boolean,
      value?: bigint
    ) => Promise<Hash | undefined>
    completePayment: (paymentId: number) => Promise<Hash | undefined>
    releaseEscrow: (paymentId: number) => Promise<Hash | undefined>
    raiseDispute: (paymentId: number, reason: string) => Promise<Hash | undefined>
    resolveDispute: (disputeId: number, refundApproved: boolean) => Promise<Hash | undefined>
    setPlatformFee: (newFee: number) => Promise<Hash | undefined>
    setFeeCollector: (newCollector: string) => Promise<Hash | undefined>
    setEscrowPeriod: (newPeriod: number) => Promise<Hash | undefined>
  }
  status: {
    transactionHash: Hash | undefined
    isConfirming: boolean
    isConfirmed: boolean
  }
  pending: {
    isCreatingPayment: boolean
    isCompletingPayment: boolean
    isReleasingEscrow: boolean
    isRaisingDispute: boolean
    isResolvingDispute: boolean
    isSettingPlatformFee: boolean
    isSettingFeeCollector: boolean
    isSettingEscrowPeriod: boolean
  }
  errors: {
    createPaymentError: Error | null
    completePaymentError: Error | null
    releaseEscrowError: Error | null
    raiseDisputeError: Error | null
    resolveDisputeError: Error | null
    setPlatformFeeError: Error | null
    setFeeCollectorError: Error | null
    setEscrowPeriodError: Error | null
  }
  resetAll: () => void
}

/**
 * 交易类支付逻辑：创建/完成/释放托管/争议/管理函数 + 统一交易确认状态。
 * @param onError 错误回调（由宿主 hook 注入，用于统一 error 状态）
 */
export function usePaymentGatewayWrites(onError: (e: Error | null) => void): PaymentGatewayWrites {
  const { address, isConnected } = useAccount()

  const [transactionHash, setTransactionHash] = useState<Hash | undefined>()

  // 创建支付
  const {
    writeContractAsync: createPaymentAsync,
    isPending: isCreatingPayment,
    error: createPaymentError,
    reset: resetCreatePayment,
  } = useWriteContract()

  // 完成支付
  const {
    writeContractAsync: completePaymentAsync,
    isPending: isCompletingPayment,
    error: completePaymentError,
    reset: resetCompletePayment,
  } = useWriteContract()

  // 释放托管
  const {
    writeContractAsync: releaseEscrowAsync,
    isPending: isReleasingEscrow,
    error: releaseEscrowError,
    reset: resetReleaseEscrow,
  } = useWriteContract()

  // 提出争议
  const {
    writeContractAsync: raiseDisputeAsync,
    isPending: isRaisingDispute,
    error: raiseDisputeError,
    reset: resetRaiseDispute,
  } = useWriteContract()

  // 解决争议
  const {
    writeContractAsync: resolveDisputeAsync,
    isPending: isResolvingDispute,
    error: resolveDisputeError,
    reset: resetResolveDispute,
  } = useWriteContract()

  // 管理函数
  const {
    writeContractAsync: setPlatformFeeAsync,
    isPending: isSettingPlatformFee,
    error: setPlatformFeeError,
    reset: resetSetPlatformFee,
  } = useWriteContract()

  const {
    writeContractAsync: setFeeCollectorAsync,
    isPending: isSettingFeeCollector,
    error: setFeeCollectorError,
    reset: resetSetFeeCollector,
  } = useWriteContract()

  const {
    writeContractAsync: setEscrowPeriodAsync,
    isPending: isSettingEscrowPeriod,
    error: setEscrowPeriodError,
    reset: resetSetEscrowPeriod,
  } = useWriteContract()

  // 统一的交易确认状态
  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
  } = useWaitForTransactionReceipt({
    hash: transactionHash,
  })

  const guard = useCallback((): void => {
    if (!isConnected || !address) {
      throw new Error('请先连接钱包')
    }
  }, [isConnected, address])

  // 创建支付
  const createPayment = useCallback(async (
    agentId: number,
    token: string,
    amount: number,
    serviceDescription: string,
    useEscrow: boolean,
    value?: bigint
  ): Promise<Hash | undefined> => {
    try {
      guard()

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

      onError(null)

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

      setTransactionHash(hash)
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('创建支付失败')
      onError(error)
      console.error('❌ Create payment error:', err)
      return undefined
    }
  }, [guard, createPaymentAsync, onError])

  // 完成支付
  const completePayment = useCallback(async (
    paymentId: number
  ): Promise<Hash | undefined> => {
    try {
      guard()

      if (paymentId <= 0) {
        throw new Error('无效的支付ID')
      }

      onError(null)

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
      onError(error)
      console.error('Complete payment error:', err)
      return undefined
    }
  }, [guard, completePaymentAsync, onError])

  // 释放托管
  const releaseEscrow = useCallback(async (
    paymentId: number
  ): Promise<Hash | undefined> => {
    try {
      guard()

      if (paymentId <= 0) {
        throw new Error('无效的支付ID')
      }

      onError(null)

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
      onError(error)
      console.error('Release escrow error:', err)
      return undefined
    }
  }, [guard, releaseEscrowAsync, onError])

  // 提出争议
  const raiseDispute = useCallback(async (
    paymentId: number,
    reason: string
  ): Promise<Hash | undefined> => {
    try {
      guard()

      if (paymentId <= 0) {
        throw new Error('无效的支付ID')
      }

      if (!reason || reason.trim().length === 0) {
        throw new Error('争议原因不能为空')
      }

      onError(null)

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
      onError(error)
      console.error('Raise dispute error:', err)
      return undefined
    }
  }, [guard, raiseDisputeAsync, onError])

  // 解决争议
  const resolveDispute = useCallback(async (
    disputeId: number,
    refundApproved: boolean
  ): Promise<Hash | undefined> => {
    try {
      guard()

      if (disputeId <= 0) {
        throw new Error('无效的争议ID')
      }

      onError(null)

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
      onError(error)
      console.error('Resolve dispute error:', err)
      return undefined
    }
  }, [guard, resolveDisputeAsync, onError])

  // 设置平台费用
  const setPlatformFee = useCallback(async (
    newFee: number
  ): Promise<Hash | undefined> => {
    try {
      guard()

      if (newFee < 0 || newFee > 10000) {
        throw new Error('平台费用必须在0-10000基点之间')
      }

      onError(null)

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
      onError(error)
      console.error('Set platform fee error:', err)
      return undefined
    }
  }, [guard, setPlatformFeeAsync, onError])

  // 设置费用收集器
  const setFeeCollector = useCallback(async (
    newCollector: string
  ): Promise<Hash | undefined> => {
    try {
      guard()

      if (!newCollector || !newCollector.startsWith('0x') || newCollector.length !== 42) {
        throw new Error('无效的费用收集器地址')
      }

      onError(null)

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
      onError(error)
      console.error('Set fee collector error:', err)
      return undefined
    }
  }, [guard, setFeeCollectorAsync, onError])

  // 设置托管周期
  const setEscrowPeriod = useCallback(async (
    newPeriod: number
  ): Promise<Hash | undefined> => {
    try {
      guard()

      if (newPeriod <= 0) {
        throw new Error('托管周期必须大于0')
      }

      onError(null)

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
      onError(error)
      console.error('Set escrow period error:', err)
      return undefined
    }
  }, [guard, setEscrowPeriodAsync, onError])

  // 重置所有写操作状态
  const resetAll = useCallback((): void => {
    resetCreatePayment()
    resetCompletePayment()
    resetReleaseEscrow()
    resetRaiseDispute()
    resetResolveDispute()
    resetSetPlatformFee()
    resetSetFeeCollector()
    resetSetEscrowPeriod()
    setTransactionHash(undefined)
  }, [
    resetCreatePayment,
    resetCompletePayment,
    resetReleaseEscrow,
    resetRaiseDispute,
    resetResolveDispute,
    resetSetPlatformFee,
    resetSetFeeCollector,
    resetSetEscrowPeriod,
  ])

  return {
    writes: {
      createPayment,
      completePayment,
      releaseEscrow,
      raiseDispute,
      resolveDispute,
      setPlatformFee,
      setFeeCollector,
      setEscrowPeriod,
    },
    status: {
      transactionHash,
      isConfirming,
      isConfirmed,
    },
    pending: {
      isCreatingPayment,
      isCompletingPayment,
      isReleasingEscrow,
      isRaisingDispute,
      isResolvingDispute,
      isSettingPlatformFee,
      isSettingFeeCollector,
      isSettingEscrowPeriod,
    },
    errors: {
      createPaymentError,
      completePaymentError,
      releaseEscrowError,
      raiseDisputeError,
      resolveDisputeError,
      setPlatformFeeError,
      setFeeCollectorError,
      setEscrowPeriodError,
    },
    resetAll,
  }
}
