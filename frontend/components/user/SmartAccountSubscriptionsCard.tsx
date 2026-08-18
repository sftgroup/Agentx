// ---------------------------------------------------------------------------
// AgentX — SmartAccountSubscriptionsCard
// ---------------------------------------------------------------------------
// Auto-renew 续订产生的链上订阅归属智能账户（Kernel，ERC-4337 msg.sender），
// EOA 的 getUserSubscriptions 查不到。此卡片基于 gateway 的 auto-renew 登记
// （account_address）合并查询智能账户名下的订阅并展示，让用户完整看到
// "EOA 订阅 + 智能账户订阅"。懒认证：仅用户点击"Sign in"时才请求 gateway JWT。
// ---------------------------------------------------------------------------
'use client'

import { useEffect, useState } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { Loader2, ShieldCheck, Wallet } from 'lucide-react'
import { GATEWAY_URL } from '@/lib/gateway'
import { useGatewayAuth } from '@/hooks/useGatewayAuth'
import { listAutoRenew, type AutoRenewRow } from '@/lib/auto-renew'
import { SUBSCRIPTION_MANAGER_V1_ABI } from '@/abis/SubscriptionManagerV1'

interface SmartSub {
  subscriptionId: bigint
  agentId: bigint
  status: number
  endDate: bigint
  isActive: boolean
}

export function SmartAccountSubscriptionsCard() {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { accessToken, isLoading: authLoading, authenticate } = useGatewayAuth(GATEWAY_URL, { lazy: true })

  const [rows, setRows] = useState<AutoRenewRow[] | null>(null)
  const [byAccount, setByAccount] = useState<Record<string, SmartSub[]>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 认证成功后：拉取 auto-renew 登记 → 对每个智能账户链上查订阅
  useEffect(() => {
    if (!accessToken || !address) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const myRows = await listAutoRenew(accessToken)
        if (cancelled) return
        setRows(myRows)
        const accounts = myRows.map(r => r.account_address).filter((a): a is string => !!a)
        const smAddress = process.env.NEXT_PUBLIC_SUBSCRIPTION_MANAGER_ADDRESS
        const results: Record<string, SmartSub[]> = {}
        if (publicClient && smAddress && /^0x[a-fA-F0-9]{40}$/.test(smAddress)) {
          for (const acc of accounts) {
            try {
              const raw = (await publicClient.readContract({
                address: smAddress as `0x${string}`,
                abi: SUBSCRIPTION_MANAGER_V1_ABI,
                functionName: 'getUserSubscriptions',
                args: [acc as `0x${string}`],
              })) as any[]
              const now = BigInt(Math.floor(Date.now() / 1000))
              results[acc] = raw
                .filter((s: any) => s && Number(s.subscriptionId) > 0)
                .map((s: any) => {
                  const status = Number(s.status)
                  const endDate = BigInt(s.endDate?.toString() || '0')
                  const isActive = status === 0 && endDate + BigInt(3 * 24 * 60 * 60) > now
                  return {
                    subscriptionId: BigInt(s.subscriptionId.toString()),
                    agentId: BigInt(s.agentId.toString()),
                    status,
                    endDate,
                    isActive,
                  }
                })
            } catch {
              results[acc] = []
            }
          }
        }
        if (!cancelled) setByAccount(results)
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [accessToken, address, publicClient])

  if (!address) return null

  // 未认证：提示登录（懒，不自动弹签名）
  if (!accessToken && !authLoading) {
    return (
      <div className="glass-card p-4 rounded-2xl space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-text-secondary">
          <ShieldCheck className="w-4 h-4 text-accent-purple" /> Smart account subscriptions
        </div>
        <p className="text-xs text-text-muted leading-relaxed">
          Subscriptions renewed automatically belong to your smart account. Sign in to view them alongside your own.
        </p>
        <button onClick={() => void authenticate()} className="btn-secondary text-sm px-4 py-1.5">
          {authLoading ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</span> : 'Sign in to view'}
        </button>
      </div>
    )
  }

  if (authLoading || loading) {
    return (
      <div className="glass-card p-4 rounded-2xl flex items-center gap-3 text-sm text-text-muted">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading smart account subscriptions…
      </div>
    )
  }

  const accounts = rows?.map(r => r.account_address).filter((a): a is string => !!a) ?? []
  if (accounts.length === 0 && !error) return null
  const totalActive = accounts.reduce((n, a) => n + (byAccount[a]?.filter(s => s.isActive).length ?? 0), 0)

  return (
    <div className="glass-card p-4 rounded-2xl space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-text-secondary">
          <ShieldCheck className="w-4 h-4 text-accent-purple" /> Smart account subscriptions (auto-renew)
        </div>
        <span className="text-xs text-text-muted">{totalActive} active</span>
      </div>
      {error && <div className="text-xs text-red-400/90">⚠ {error}</div>}
      <div className="space-y-2">
        {accounts.map(acc => {
          const subs = byAccount[acc] ?? []
          const active = subs.filter(s => s.isActive)
          return (
            <div key={acc} className="rounded-xl bg-white/5 border border-white/5 p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-xs">
                <Wallet className="w-3.5 h-3.5 text-text-muted shrink-0" />
                <code className="font-mono text-text-secondary break-all flex-1">
                  {acc.slice(0, 10)}…{acc.slice(-6)}
                </code>
                <span className="text-text-muted shrink-0">{subs.length} sub{subs.length === 1 ? '' : 's'} · {active.length} active</span>
              </div>
              {active.map(s => (
                <div key={s.subscriptionId.toString()} className="text-xs text-text-muted flex items-center gap-2 pl-5">
                  <span className="text-green-400">●</span>
                  <span>Agent #{s.agentId.toString()}</span>
                  <span className="text-text-muted/70">ends {new Date(Number(s.endDate) * 1000).toLocaleDateString()}</span>
                </div>
              ))}
              {subs.length > 0 && active.length === 0 && (
                <div className="text-xs text-text-muted/70 pl-5">No active subscription on this account.</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
