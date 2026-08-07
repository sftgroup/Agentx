// components/agent/hooks/payment-gateway-types.ts
// R7 拆分：usePaymentGateway 的类型、常量与合约地址（供 hook 与外部消费方引用）

import { validateAddress } from './contract-address'

export const PAYMENT_GATEWAY_ADDRESS = validateAddress(process.env.NEXT_PUBLIC_PAYMENT_GATEWAY_ADDRESS)

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

export interface Dispute {
  paymentId: bigint
  raisedBy: `0x${string}`
  reason: string
  raisedAt: bigint
  resolved: boolean
  resolver: `0x${string}`
  resolvedAt: bigint
}

export interface UsePaymentGatewayReturn {
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
