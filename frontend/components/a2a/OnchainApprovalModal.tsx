// ---------------------------------------------------------------------------
// AgentX — OnchainApprovalModal Component
// ---------------------------------------------------------------------------
// Rail: onchain. The agent requested an auditable / settled A2A delegation in
// the conversation; the USER's own wallet must create the task on-chain (they
// pay the gas and become the on-chain client — the contract records
// clientAddress = msg.sender). The gateway never signs.
//
// Flow: 确认上链 → wagmi createTask (user wallet) → receipt → parse taskId
//        from the TaskCreated event log → subscribe gateway task SSE stream
//        (fallback: poll) for processing status.
//
// awaiting_payment (status=4): the worker suspended the task because the
// delegation fee exceeds the x402 balance. The modal shows a payment card —
// 充值并付款 (send the missing native token to payTo → /x402/verify → resume)
// or 改为订阅 (jump to the agent marketplace to subscribe instead).
// ---------------------------------------------------------------------------

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useWalletClient } from 'wagmi'
import { Loader2, Check, AlertCircle, ExternalLink, Zap, Wallet, ArrowRight } from 'lucide-react'
import { A2A_CREATE_TASK_ABI } from '@/abis/A2AProtocol'
import type { OnChainApprovalPayload } from '@/hooks/useAgentChat'
import Link from 'next/link'

const A2A_REGISTRY = (process.env.NEXT_PUBLIC_A2A_PROTOCOL_ADDRESS || '0x7F42a7dC4A0F3C107664C3750bE1B5B6fa6BEb86') as `0x${string}`

// InfraXEscrow.deposit()（payable，无参，emit Deposited 事件）— 金库充值调用。
const ESCROW_DEPOSIT_ABI = [
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'payable',
    inputs: [],
    outputs: [],
  },
] as const

type TaskStatus = {
  status: number
  output_data?: string
  error_message?: string
  payment_amount_wei?: string
  payment_pay_to?: string
  payment_target_agent_id?: number
}

interface OnchainApprovalModalProps {
  approval: OnChainApprovalPayload
  gatewayUrl: string
  onClose: () => void
}

const STATUS_LABEL: Record<number, string> = {
  0: 'pending', 1: 'processing', 2: 'completed', 3: 'failed', 4: 'awaiting_payment',
}

function weiToToken(wei: string): string {
  const n = Number(wei || 0) / 1e18
  return n >= 1000 ? n.toFixed(0) : n >= 1 ? n.toFixed(3) : n.toFixed(6)
}

export function OnchainApprovalModal({ approval, gatewayUrl, onClose }: OnchainApprovalModalProps) {
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const { writeContractAsync, isPending: isSigning } = useWriteContract()

  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [taskId, setTaskId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [agentName, setAgentName] = useState<string | null>(null)
  const [gwStatus, setGwStatus] = useState<TaskStatus | null>(null)

  // ── Payment card state (awaiting_payment) ──────────────────────────────
  const [x402Chain, setX402Chain] = useState<string>('oxachain')
  const [escrowAddress, setEscrowAddress] = useState<string | null>(null)
  const [balance, setBalance] = useState('0')
  const [payBusy, setPayBusy] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  const [payTxHash, setPayTxHash] = useState<string | null>(null)

  const isAwaitingPayment = gwStatus?.status === 4

  // Fetch the target agent's display name (public gateway endpoint).
  useEffect(() => {
    let cancelled = false
    fetch(`${gatewayUrl}/api/v1/agents/${approval.targetAgentId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(a => { if (a && !cancelled) setAgentName(a.name || `Agent #${approval.targetAgentId}`) })
      .catch(() => { /* name is optional */ })
    return () => { cancelled = true }
  }, [gatewayUrl, approval.targetAgentId])

  // Confirm + sign the transaction (the user's wallet pays the gas).
  const handleConfirm = useCallback(async () => {
    setError(null)
    try {
      const hash = await writeContractAsync({
        address: A2A_REGISTRY,
        abi: [A2A_CREATE_TASK_ABI],
        functionName: 'createTask',
        args: [BigInt(approval.targetAgentId), approval.taskType, approval.inputData],
      })
      setTxHash(hash)
    } catch (err: any) {
      const msg = err?.message || String(err)
      if (msg.includes('User rejected') || msg.includes('denied') || msg.includes('rejected')) {
        setError('已在钱包中取消')
      } else if (msg.includes('insufficient funds')) {
        setError('钱包余额不足，无法支付 gas')
      } else {
        setError(msg)
      }
    }
  }, [writeContractAsync, approval])

  const { data: receipt, isSuccess, isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash ?? undefined })

  // Parse taskId from the TaskCreated event log once the tx is mined.
  useEffect(() => {
    if (!isSuccess || !receipt) return
    for (const log of receipt.logs ?? []) {
      if (log.topics && log.topics.length >= 2) {
        try { setTaskId(Number(BigInt(log.topics[1]!))); break } catch { /* keep scanning */ }
      }
    }
  }, [isSuccess, receipt])

  const applyStatus = useCallback((data: TaskStatus) => {
    setGwStatus(prev => {
      // Only forward non-regressions (e.g. a stale poll vs a fresh SSE event).
      if (prev && data.status === 4 && prev.status !== 4) return data
      return data
    })
  }, [])

  // Primary: subscribe to the gateway SSE event stream once we have a taskId.
  useEffect(() => {
    if (!taskId) return
    let es: EventSource | null = null
    try {
      es = new EventSource(`${gatewayUrl}/api/v1/a2a/tasks/${taskId}/events`)
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as TaskStatus
          if (data && typeof data.status === 'number') applyStatus(data)
        } catch { /* malformed */ }
      }
      es.onerror = () => { /* poller fallback below keeps working */ }
    } catch { /* EventSource unsupported → rely on polling */ }
    return () => { es?.close() }
  }, [taskId, gatewayUrl, applyStatus])

  // Fallback: poll the gateway for the async processing result.
  useEffect(() => {
    if (!taskId) return
    const timer = setInterval(async () => {
      try {
        const r = await fetch(`${gatewayUrl}/api/v1/a2a/task-result/${taskId}`)
        if (r.ok) {
          const data = await r.json()
          applyStatus(data)
          if (data.status === 2 || data.status === 3) clearInterval(timer)
        }
      } catch { /* transient */ }
    }, 5000)
    return () => clearInterval(timer)
  }, [taskId, gatewayUrl, applyStatus])

  // ── Payment card: load x402 rail info + balance ────────────────────────
  useEffect(() => {
    if (!isAwaitingPayment || !address) return
    let cancelled = false
    fetch(`${gatewayUrl}/api/v1/x402/info`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d || cancelled) return
        if (d.chain) setX402Chain(d.chain)
        if (d.escrowAddress) setEscrowAddress(d.escrowAddress)
      })
      .catch(() => {})
    fetch(`${gatewayUrl}/api/v1/x402/balance?address=${address}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.balanceWei && !cancelled) setBalance(d.balanceWei) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [isAwaitingPayment, address, gatewayUrl])

  const requiredWei = BigInt(gwStatus?.payment_amount_wei || '0')
  const balanceBig = BigInt(balance || '0')
  const missingWei = requiredWei > balanceBig ? requiredWei - balanceBig : BigInt(0)
  const balanceSufficient = balanceBig >= requiredWei

  const resumeTask = useCallback(async () => {
    setPayBusy(true); setPayError(null)
    try {
      const r = await fetch(`${gatewayUrl}/api/v1/a2a/tasks/${taskId}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-End-User-Id': address ?? '' },
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Resume failed')
      // Worker 下轮重放 → SSE/poll 会推回 processing 状态。
      applyStatus({ status: 1 })
    } catch (e: any) {
      setPayError(e.message || '付款失败')
    } finally {
      setPayBusy(false)
    }
  }, [gatewayUrl, taskId, address, applyStatus])

  // 充值（补足差额）→ verify 入账 → resume。
  const topUpAndPay = useCallback(async () => {
    if (!walletClient || !gwStatus?.payment_pay_to) return
    setPayBusy(true); setPayError(null); setPayTxHash(null)
    try {
      if (missingWei > BigInt(0)) {
        // 充值路径：escrow 金库已配置 → 调 escrow.deposit()（emit Deposited 事件，
        // verify 走金库判定入账）；否则原生币直转 payment_pay_to（EOA）。
        let hash: `0x${string}`
        if (escrowAddress) {
          hash = await walletClient.writeContract({
            address: escrowAddress as `0x${string}`,
            abi: ESCROW_DEPOSIT_ABI,
            functionName: 'deposit',
            value: missingWei,
            account: walletClient.account!,
          })
        } else {
          hash = await walletClient.sendTransaction({
            to: gwStatus.payment_pay_to as `0x${string}`,
            value: missingWei,
            account: walletClient.account!,
          })
        }
        setPayTxHash(hash)
        const vRes = await fetch(`${gatewayUrl}/api/v1/x402/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txHash: hash, chain: x402Chain }),
        })
        const vData = await vRes.json() as { error?: string }
        if (!vRes.ok) throw new Error(vData.error || 'verify failed')
      }
      await resumeTask()
    } catch (e: any) {
      setPayError(e.message || '充值失败')
    } finally {
      setPayBusy(false)
    }
  }, [walletClient, gwStatus, missingWei, gatewayUrl, x402Chain, resumeTask, escrowAddress])

  const confirmed = taskId !== null
  const finished = gwStatus?.status === 2 || gwStatus?.status === 3

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="glass-card p-6 w-full max-w-md mx-4 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold flex items-center gap-2">
          <Zap className="w-4 h-4 text-accent-cyan" /> 链上委派确认
        </h3>

        {!confirmed ? (
          <>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-text-secondary">目标 Agent</span>
                <span className="font-medium">{agentName || `Agent #${approval.targetAgentId}`}</span></div>
              <div className="flex justify-between"><span className="text-text-secondary">任务类型</span>
                <span className="font-medium">{approval.taskType || 'delegate'}</span></div>
              <div><div className="text-text-secondary mb-1">任务内容</div>
                <div className="p-2 rounded-lg bg-white/5 border border-white/5 text-xs max-h-28 overflow-y-auto break-words">{approval.inputData}</div>
              </div>
              <div className="flex justify-between"><span className="text-text-secondary">Gas 支付方</span>
                <span className="font-medium text-accent-cyan">你的钱包（{address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ''}）</span></div>
            </div>

            {!isConnected && (
              <div className="p-2 rounded-lg bg-yellow-400/10 text-xs text-yellow-400 flex items-center gap-2">
                <AlertCircle className="w-3 h-3 shrink-0" /> 请先连接钱包后再确认上链
              </div>
            )}
            {error && (
              <div className="p-2 rounded-lg bg-red-400/5 text-xs text-red-400 flex items-center gap-2">
                <AlertCircle className="w-3 h-3 shrink-0" /> {error}
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={onClose} className="btn-secondary text-sm py-2 flex-1">取消</button>
              <button onClick={handleConfirm} disabled={isSigning || !isConnected || isConfirming || !!txHash}
                className="btn-primary text-sm py-2 flex-1 flex items-center justify-center gap-2">
                {isSigning || isConfirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {isConfirming ? '等待链上确认…' : isSigning ? '钱包确认中…' : '确认并上链'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-green-400/15 text-green-400 flex items-center justify-center">
                {finished && gwStatus?.status === 2 ? <Check className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />}
              </div>
              <div>
                <p className="font-medium text-sm">链上任务 #{taskId} 已创建</p>
                <p className="text-xs text-text-secondary">
                  {finished
                    ? gwStatus?.status === 2 ? '处理完成' : '处理失败'
                    : isAwaitingPayment
                      ? '等待付款后继续处理'
                      : `正在异步处理中… ${gwStatus ? STATUS_LABEL[gwStatus.status] : '等待 worker'}`}
                </p>
              </div>
            </div>

            {/* ── 待付款卡片：余额不足时任务挂起 awaiting_payment ── */}
            {isAwaitingPayment && (
              <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-yellow-300">
                  <Wallet className="w-4 h-4" /> 需要付款才能继续
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-black/30 p-2">
                    <div className="text-text-muted">应付金额</div>
                    <div className="font-mono text-yellow-300 mt-0.5">{weiToToken(String(requiredWei))} OXA</div>
                  </div>
                  <div className="rounded-lg bg-black/30 p-2">
                    <div className="text-text-muted">当前余额</div>
                    <div className={`font-mono mt-0.5 ${balanceSufficient ? 'text-green-400' : 'text-text-primary'}`}>{weiToToken(balance)} OXA</div>
                  </div>
                </div>
                <div className="text-[11px] text-text-muted break-all">
                  收款钱包：<span className="font-mono text-accent-cyan">{gwStatus.payment_pay_to}</span>
                </div>

                {payError && (
                  <div className="rounded-lg bg-red-400/10 text-xs text-red-400 p-2 flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {payError}
                  </div>
                )}
                {payTxHash && (
                  <div className="rounded-lg bg-green-400/10 text-xs text-green-400 p-2">
                    充值成功：{payTxHash.slice(0, 10)}…（已入账，正在恢复任务）
                  </div>
                )}

                <div className="flex gap-2">
                  {balanceSufficient ? (
                    <button onClick={resumeTask} disabled={payBusy}
                      className="btn-primary text-sm py-2 flex-1 flex items-center justify-center gap-2 disabled:opacity-50">
                      {payBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                      直接付款 {weiToToken(String(requiredWei))} OXA
                    </button>
                  ) : (
                    <button onClick={topUpAndPay} disabled={payBusy || !walletClient}
                      className="btn-primary text-sm py-2 flex-1 flex items-center justify-center gap-2 disabled:opacity-50">
                      {payBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                      充值并付款（补 {weiToToken(String(missingWei))} OXA）
                    </button>
                  )}
                </div>
                <Link href={`/marketplace/agent/${gwStatus.payment_target_agent_id || approval.targetAgentId}`}
                  onClick={onClose}
                  className="flex items-center justify-center gap-1 text-xs text-accent-cyan hover:text-accent-cyan/80">
                  改为订阅该 Agent <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            )}

            {finished && gwStatus?.status === 2 && gwStatus.output_data && (
              <div className="p-2 rounded-lg bg-white/5 border border-white/5 text-xs max-h-24 overflow-y-auto break-words">{gwStatus.output_data}</div>
            )}
            {finished && gwStatus?.status === 3 && (
              <div className="p-2 rounded-lg bg-red-400/5 text-xs text-red-400">{gwStatus.error_message || '处理失败'}</div>
            )}
            {!isAwaitingPayment && (
              <div className="flex gap-3">
                <button onClick={onClose} className="btn-secondary text-sm py-2 flex-1">关闭</button>
                <a href="/a2a" className="btn-primary text-sm py-2 flex-1 flex items-center justify-center gap-2">
                  <ExternalLink className="w-4 h-4" />查看 A2A 任务
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
