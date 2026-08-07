// ---------------------------------------------------------------------------
// AgentX — OnchainApprovalModal Component
// ---------------------------------------------------------------------------
// Rail: onchain. The agent requested an auditable / settled A2A delegation in
// the conversation; the USER's own wallet must create the task on-chain (they
// pay the gas and become the on-chain client — the contract records
// clientAddress = msg.sender). The gateway never signs.
//
// Flow: 确认上链 → wagmi createTask (user wallet) → receipt → parse taskId
//        from the TaskCreated event log → poll gateway task-result for status.
// ---------------------------------------------------------------------------

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { Loader2, Check, AlertCircle, ExternalLink, Zap } from 'lucide-react'
import { A2A_CREATE_TASK_ABI } from '@/abis/A2AProtocol'
import type { OnChainApprovalPayload } from '@/hooks/useAgentChat'

const A2A_REGISTRY = (process.env.NEXT_PUBLIC_A2A_PROTOCOL_ADDRESS || '0x7F42a7dC4A0F3C107664C3750bE1B5B6fa6BEb86') as `0x${string}`

type TaskStatus = { status: number; output_data?: string; error_message?: string }

interface OnchainApprovalModalProps {
  approval: OnChainApprovalPayload
  gatewayUrl: string
  onClose: () => void
}

const STATUS_LABEL: Record<number, string> = { 0: 'pending', 1: 'processing', 2: 'completed', 3: 'failed' }

export function OnchainApprovalModal({ approval, gatewayUrl, onClose }: OnchainApprovalModalProps) {
  const { address, isConnected } = useAccount()
  const { writeContractAsync, isPending: isSigning } = useWriteContract()

  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [taskId, setTaskId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [agentName, setAgentName] = useState<string | null>(null)
  const [gwStatus, setGwStatus] = useState<TaskStatus | null>(null)

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

  // Poll the gateway for the async processing result once we have a taskId.
  useEffect(() => {
    if (!taskId) return
    let cancelled = false
    const timer = setInterval(async () => {
      try {
        const r = await fetch(`${gatewayUrl}/api/v1/a2a/task-result/${taskId}`)
        if (r.ok) {
          const data = await r.json()
          if (!cancelled) {
            setGwStatus(data)
            if (data.status === 2 || data.status === 3) clearInterval(timer)
          }
        }
      } catch { /* transient */ }
    }, 5000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [taskId, gatewayUrl])

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
                    : `正在异步处理中… ${gwStatus ? STATUS_LABEL[gwStatus.status] : '等待 worker'}`}
                </p>
              </div>
            </div>
            {gwStatus?.status === 2 && gwStatus.output_data && (
              <div className="p-2 rounded-lg bg-white/5 border border-white/5 text-xs max-h-24 overflow-y-auto break-words">{gwStatus.output_data}</div>
            )}
            {gwStatus?.status === 3 && (
              <div className="p-2 rounded-lg bg-red-400/5 text-xs text-red-400">{gwStatus.error_message || '处理失败'}</div>
            )}
            <div className="flex gap-3">
              <button onClick={onClose} className="btn-secondary text-sm py-2 flex-1">关闭</button>
              <a href="/a2a" className="btn-primary text-sm py-2 flex-1 flex items-center justify-center gap-2">
                <ExternalLink className="w-4 h-4" />查看 A2A 任务
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
