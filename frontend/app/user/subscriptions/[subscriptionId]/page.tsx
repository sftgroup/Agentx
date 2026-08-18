// app/user/subscriptions/[subscriptionId]/page.tsx — Subscription Detail (Glassmorphism Dark)
// Multi-rail renewal: chain (wallet) / fiat (Stripe card) / x402 (native-token period payment).
'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { useAccount, useWalletClient, usePublicClient } from 'wagmi'
import { Loader2, AlertCircle, CheckCircle, Clock, CreditCard, ArrowLeft, Brain, Wallet, Zap } from 'lucide-react'
import Link from 'next/link'
import { SubscriptionManager, SubscriptionPayments } from '@agentxv2/sdk'
import { GATEWAY_URL } from '@/lib/gateway'
import { ZERO_ADDRESS } from '@/components/agent/hooks/contract-address'
import { AutoRenewCard } from '@/components/user/AutoRenewCard'

const SUBSCRIPTION_MANAGER_ADDRESS = (process.env.NEXT_PUBLIC_SUBSCRIPTION_MANAGER_ADDRESS || ZERO_ADDRESS) as `0x${string}`

type PayMethod = 'chain' | 'fiat' | 'x402'
type Period = 'day' | 'week' | 'month' | 'year'
const PERIODS: readonly string[] = ['day', 'week', 'month', 'year']
const resolvePeriod = (p: string): Period => (PERIODS.includes(p) ? (p as Period) : 'month')

export default function SubscriptionDetailPage() {
  const params = useParams()
  const { isConnected, address } = useAccount()
  const subscriptionId = Number(params.subscriptionId)

  // Note: useSubscriptionDetail from ERC8004 is preserved, we mount via dynamic import
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (!mounted) return <AppLayout><div className="flex items-center justify-center py-32"><Loader2 className="w-8 h-8 text-text-muted animate-spin" /></div></AppLayout>

  return (
    <AppLayout>
      <SubscriptionContent subscriptionId={subscriptionId} isConnected={isConnected} address={address} />
    </AppLayout>
  )
}

function SubscriptionContent({ subscriptionId, isConnected, address }: { subscriptionId: number; isConnected: boolean; address?: `0x${string}` }) {
  const { useSubscriptionDetail } = require('@/hooks/user/useUserSubscriptions')
  const { useAgentDetail } = require('@/hooks/aimarket/useAgentRegistry')
  const { processPayment, cancelSubscription, getPlanDetails } = require('@/hooks/user/useUserSubscriptions')
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()

  const { data: subscription, isLoading, refetch } = useSubscriptionDetail ? useSubscriptionDetail(subscriptionId) : { data: null, isLoading: false }
  const { data: agent } = useAgentDetail(subscription ? Number(subscription.agentId) : 0)

  const [payMethod, setPayMethod] = useState<PayMethod>('chain')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [message, setMessage] = useState('')
  const [planPriceWei, setPlanPriceWei] = useState('')
  const [planPeriod, setPlanPeriod] = useState(2) // BillingPeriod: 0 Daily … 4 Yearly

  useEffect(() => { if (subscriptionId && isConnected) refetch?.() }, [subscriptionId, isConnected])

  // 加载计划价格（自动续订的 session 限额需要）
  useEffect(() => {
    if (!subscription) return
    getPlanDetails(Number(subscription.planId))
      .then((p: any) => {
        if (p && p.price > BigInt(0)) {
          setPlanPriceWei(p.price.toString())
          setPlanPeriod(Number(p.billingPeriod))
        }
      })
      .catch(() => {})
  }, [subscription?.planId])

  if (!isConnected) {
    return <div className="max-w-4xl mx-auto text-center py-20"><AlertCircle className="w-16 h-16 text-accent-purple/40 mx-auto mb-4" /><h2 className="heading-md mb-3">Connect Wallet</h2><p className="body text-text-muted">Connect to view subscription details.</p></div>
  }
  if (isLoading) return <div className="flex items-center justify-center py-32"><Loader2 className="w-8 h-8 text-text-muted animate-spin" /></div>
  if (!subscription) {
    return <div className="max-w-4xl mx-auto text-center py-20"><AlertCircle className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-30" /><h2 className="heading-md mb-3">Not Found</h2><Link href="/user/dashboard" className="btn-primary text-sm inline-block">Back to Dashboard</Link></div>
  }

  const isActive = subscription.isActive === true
  const endDate = new Date(Number(subscription.endDate) * 1000)
  const startDate = new Date(Number(subscription.startDate) * 1000)
  const isErrorMsg = /fail|error|not connected|not configured|失败/i.test(message)

  // Renew via the selected payment rail.
  const handleRenew = async () => {
    if (!address) { setMessage('Please connect your wallet first'); return }
    if (!walletClient || !publicClient) { setMessage('Wallet client not ready — reconnect your wallet'); return }
    setIsProcessing(true); setMessage('')
    try {
      const agentId = Number(subscription.agentId)
      const planId = Number(subscription.planId)

      // Chain rail — renew the existing subscription via the contract (wagmi).
      if (payMethod === 'chain') {
        const plan = await getPlanDetails(planId)
        const hash = await processPayment(Number(subscription.subscriptionId), plan ?? undefined)
        setMessage(hash ? 'Renewal submitted — awaiting confirmation' : 'Renewal failed (see console)')
        setTimeout(() => refetch?.(), 5000)
        return
      }

      // Fiat / x402 rails — the unified SDK payment client (chain OR fiat/x402 access).
      const sm = new SubscriptionManager({
        contractAddress: SUBSCRIPTION_MANAGER_ADDRESS,
        publicClient,
        walletClient,
      })
      const plan = await sm.getPlan(planId)
      const period = resolvePeriod(plan.period)
      const payments = new SubscriptionPayments({
        gatewayUrl: GATEWAY_URL,
        subscriptionManager: sm,
        walletClient,
        chain: 'oxachain',
      })

      if (payMethod === 'fiat') {
        const result = await payments.pay({ method: 'fiat', subscriber: address, agentId, planId, period })
        if (result.method === 'fiat' && result.sessionUrl) window.location.assign(result.sessionUrl)
        return
      }

      // x402 — native-token period payment, verified by the Gateway.
      const result = await payments.pay({ method: 'x402', subscriber: address, agentId, planId, period })
      if (result.method === 'x402') {
        setMessage(`x402 payment verified (tx ${result.txHash.slice(0, 12)}…) — subscription extended`)
        setTimeout(() => refetch?.(), 3000)
      }
    } catch (e: any) {
      setMessage(`Failed: ${e?.message ?? e}`)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-6 space-y-6">
      <Link href="/user/dashboard" className="flex items-center gap-2 text-sm text-text-muted hover:text-text-secondary transition-colors w-fit"><ArrowLeft className="w-4 h-4" /> Back to Dashboard</Link>

      <div className="glass-card p-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-accent-purple/10 flex items-center justify-center"><Brain className="w-7 h-7 text-accent-purple" /></div>
          <div>
            <h1 className="heading-md">{agent?.metadata?.name || `Agent #${subscription.agentId}`}</h1>
            <div className={`text-xs font-medium mt-1 ${isActive ? 'text-green-400' : 'text-text-muted'}`}>{isActive ? '● Active' : '○ Expired'}</div>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Status', value: isActive ? 'Active' : 'Expired', icon: isActive ? CheckCircle : AlertCircle, color: isActive ? 'text-green-400' : 'text-text-muted' },
            { label: 'Started', value: startDate.toLocaleDateString(), icon: Clock, color: 'text-text-secondary' },
            { label: isActive ? 'Expires' : 'Expired', value: endDate.toLocaleDateString(), icon: CreditCard, color: 'text-text-secondary' },
          ].map(s => (
            <div key={s.label} className="p-4 rounded-xl bg-white/3 border border-white/5">
              <s.icon className={`w-4 h-4 ${s.color} mb-2`} />
              <div className="text-xs text-text-muted">{s.label}</div>
              <div className="text-sm font-semibold mt-0.5">{s.value}</div>
            </div>
          ))}
        </div>

        {message && <div className={`p-3 rounded-lg text-sm mb-4 ${isErrorMsg ? 'bg-red-400/5 border border-red-400/10 text-red-400' : 'bg-green-400/5 border border-green-400/10 text-green-400'}`}>{message}</div>}

        {isActive && (
          <div className="mb-5">
            <div className="text-sm font-medium text-text-secondary mb-2">Renew with</div>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 'chain', label: 'Wallet', icon: Wallet, hint: 'On-chain OXA / ERC20' },
                { id: 'fiat', label: 'Card', icon: CreditCard, hint: 'Stripe (fiat)' },
                { id: 'x402', label: 'x402', icon: Zap, hint: 'Native token' },
              ] as const).map(m => (
                <button key={m.id} onClick={() => setPayMethod(m.id)}
                  className={`p-3 rounded-xl border text-left transition-colors ${payMethod === m.id ? 'border-accent-purple bg-accent-purple/10' : 'border-white/5 bg-white/3 hover:bg-white/5'}`}>
                  <m.icon className={`w-4 h-4 mb-1.5 ${payMethod === m.id ? 'text-accent-purple' : 'text-text-muted'}`} />
                  <div className="text-sm font-medium">{m.label}</div>
                  <div className="text-xs text-text-muted mt-0.5">{m.hint}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          {isActive && (
            <button onClick={handleRenew} disabled={isProcessing} className="btn-primary text-sm px-6 py-2 disabled:opacity-40">
              {isProcessing ? 'Processing...' : payMethod === 'chain' ? 'Renew (Wallet)' : payMethod === 'fiat' ? 'Renew (Card)' : 'Renew (x402)'}
            </button>
          )}
          {isActive && (
            <button onClick={async () => { if (!confirm('Cancel this subscription?')) return; setIsCancelling(true); try { await cancelSubscription(Number(subscription.subscriptionId)); setMessage('Cancelled'); refetch?.() } catch(e: any) { setMessage(`Failed: ${e.message}`) } finally { setIsCancelling(false) } }} disabled={isCancelling} className="btn-secondary text-sm px-6 py-2 disabled:opacity-40 text-red-400/80">{isCancelling ? 'Cancelling...' : 'Cancel'}</button>
          )}
          <Link href={`/user/chat/${subscription.agentId}`} className="btn-secondary text-sm px-6 py-2">Chat</Link>
        </div>
      </div>

      {isActive && planPriceWei && (
        <AutoRenewCard
          agentId={Number(subscription.agentId)}
          planId={Number(subscription.planId)}
          subscriptionId={Number(subscription.subscriptionId)}
          planPriceWei={planPriceWei}
          priceDisplay={`${(Number(planPriceWei) / 1e18).toFixed(4)} OXA / ${['day', 'week', 'month', 'quarter', 'year'][planPeriod] ?? 'period'}`}
          isActive={isActive}
          expiresAt={subscription.endDate}
        />
      )}
    </div>
  )
}
