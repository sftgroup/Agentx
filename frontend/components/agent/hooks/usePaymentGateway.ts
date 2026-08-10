
// components/agent/hooks/usePaymentGateway.ts
// 代码审查 C2：由交易类（usePaymentGatewayWrites）与查询类（usePaymentGatewayReads）
// 两个子 hook 组合而成，对外 API（UsePaymentGatewayReturn）保持不变。
'use client'

import { useEffect, useMemo, useCallback, useState } from 'react'

import { usePaymentGatewayWrites } from './usePaymentGatewayWrites'
import { usePaymentGatewayReads } from './usePaymentGatewayReads'

// R7 拆分：类型、常量与合约地址移入独立模块
import type { Payment, Dispute, UsePaymentGatewayReturn } from './payment-gateway-types'

// 保持对外 API 兼容（外部消费方从本文件导入类型）
export { PaymentStatus } from './payment-gateway-types'
export type { Payment, Dispute, UsePaymentGatewayReturn } from './payment-gateway-types'

export function usePaymentGateway(): UsePaymentGatewayReturn {
  const [error, setError] = useState<Error | null>(null)

  const writes = usePaymentGatewayWrites(setError)
  const reads = usePaymentGatewayReads({ isConfirmed: writes.status.isConfirmed })

  // 错误处理 Effect：合并写操作与读操作的错误
  useEffect(() => {
    const currentError = writes.errors.createPaymentError || writes.errors.completePaymentError ||
                        writes.errors.releaseEscrowError || writes.errors.raiseDisputeError ||
                        writes.errors.resolveDisputeError || writes.errors.setPlatformFeeError ||
                        writes.errors.setFeeCollectorError || writes.errors.setEscrowPeriodError ||
                        reads.errors.clientPaymentsError || reads.errors.agentEarningsError ||
                        reads.errors.totalPaymentCountError

    if (currentError) {
      console.error('Payment Gateway Error:', currentError)
      setError(currentError)
    }
  }, [
    writes.errors.createPaymentError, writes.errors.completePaymentError,
    writes.errors.releaseEscrowError, writes.errors.raiseDisputeError,
    writes.errors.resolveDisputeError, writes.errors.setPlatformFeeError,
    writes.errors.setFeeCollectorError, writes.errors.setEscrowPeriodError,
    reads.errors.clientPaymentsError, reads.errors.agentEarningsError,
    reads.errors.totalPaymentCountError,
  ])

  // 计算状态
  const isLoading = useMemo(() =>
    writes.pending.isCreatingPayment || writes.pending.isCompletingPayment ||
    writes.pending.isReleasingEscrow || writes.pending.isRaisingDispute ||
    writes.pending.isResolvingDispute || writes.pending.isSettingPlatformFee ||
    writes.pending.isSettingFeeCollector || writes.pending.isSettingEscrowPeriod,
    [
      writes.pending.isCreatingPayment, writes.pending.isCompletingPayment,
      writes.pending.isReleasingEscrow, writes.pending.isRaisingDispute,
      writes.pending.isResolvingDispute, writes.pending.isSettingPlatformFee,
      writes.pending.isSettingFeeCollector, writes.pending.isSettingEscrowPeriod,
    ]
  )

  // 重置状态
  const resetState = useCallback((): void => {
    writes.resetAll()
    setError(null)
  }, [writes.resetAll])

  return {
    // 支付操作
    createPayment: writes.writes.createPayment,
    completePayment: writes.writes.completePayment,
    releaseEscrow: writes.writes.releaseEscrow,
    raiseDispute: writes.writes.raiseDispute,
    resolveDispute: writes.writes.resolveDispute,

    // 查询功能
    getPayment: reads.reads.getPayment,
    getAgentPayments: reads.reads.getAgentPayments,
    getClientPayments: reads.reads.getClientPayments,
    getAgentEarnings: reads.reads.getAgentEarnings,
    getTotalPaymentCount: reads.reads.getTotalPaymentCount,
    getDispute: reads.reads.getDispute,

    // 管理功能
    setPlatformFee: writes.writes.setPlatformFee,
    setFeeCollector: writes.writes.setFeeCollector,
    setEscrowPeriod: writes.writes.setEscrowPeriod,

    // 实时数据
    agentPayments: reads.data.agentPayments,
    clientPayments: reads.data.clientPayments,
    agentEarnings: reads.data.agentEarnings,
    totalPaymentCount: reads.data.totalPaymentCount,

    // 状态
    isCreatingPayment: writes.pending.isCreatingPayment,
    isCompletingPayment: writes.pending.isCompletingPayment,
    isReleasingEscrow: writes.pending.isReleasingEscrow,
    isRaisingDispute: writes.pending.isRaisingDispute,
    isResolvingDispute: writes.pending.isResolvingDispute,
    isSettingPlatformFee: writes.pending.isSettingPlatformFee,
    isSettingFeeCollector: writes.pending.isSettingFeeCollector,
    isSettingEscrowPeriod: writes.pending.isSettingEscrowPeriod,
    isLoading,
    error,
    transactionHash: writes.status.transactionHash,
    isConfirming: writes.status.isConfirming,
    isConfirmed: writes.status.isConfirmed,

    // 工具函数
    refetchData: reads.reads.refetchData,
    resetState,
  }
}
