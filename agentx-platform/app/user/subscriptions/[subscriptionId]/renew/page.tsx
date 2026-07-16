// app/user/subscriptions/[subscriptionId]/renew/page.tsx — Renew (Glassmorphism Dark)
'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { useAccount } from 'wagmi'
import { useSubscriptionDetail, useUserSubscriptions } from '@/hooks/user/useUserSubscriptions'
import { useAgentRegistry } from '@/hooks/aimarket/useAgentRegistry'
import { CreditCard, AlertCircle, CheckCircle, Clock, ArrowLeft, Sparkles, Loader2 } from 'lucide-react'
import Link from 'next/link'

export default function RenewPage() {
  const { isConnected } = useAccount()
  const params = useParams(); const router = useRouter()
  const subscriptionId = Number(params.subscriptionId)

  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return <AppLayout><div className="flex items-center justify-center py-32"><Loader2 className="w-8 h-8 text-text-muted animate-spin" /></div></AppLayout>

  return <AppLayout><RenewContent subscriptionId={subscriptionId} isConnected={isConnected} router={router} /></AppLayout>
}

function RenewContent({ subscriptionId, isConnected, router }: { subscriptionId: number; isConnected: boolean; router: any }) {
  const { useSubscriptionDetail: useSD } = require('@/hooks/user/useUserSubscriptions')
  const { useAgentRegistry: useAR } = require('@/hooks/aimarket/useAgentRegistry')

  const { data: subscription, isLoading } = useSD ? useSD(subscriptionId) : { data: null, isLoading: false }
  const { agents: allAgents } = useAR ? useAR(100) : { agents: [] }
  const { processPayment } = useUserSubscriptions ? useUserSubscriptions() : { processPayment: null } as any

  const agent = allAgents?.find((a: any) => a.id === Number(subscription?.agentId))
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  if (!isConnected) {
    return <div className="max-w-2xl mx-auto text-center py-20"><AlertCircle className="w-16 h-16 text-accent-purple/40 mx-auto mb-4" /><h2 className="heading-md mb-3">Connect Wallet</h2><Link href="/user/dashboard" className="btn-primary text-sm inline-block">Go to Dashboard</Link></div>
  }
  if (isLoading) return <div className="flex items-center justify-center py-32"><Loader2 className="w-8 h-8 text-text-muted animate-spin" /></div>

  const price = subscription?.price ? Number(subscription.price) / 1e18 : 0
  const endDate = subscription?.endDate ? new Date(Number(subscription.endDate) * 1000) : null

  const handleRenew = async () => {
    setIsProcessing(true); setError(null)
    try { await processPayment(subscriptionId); setSuccess(true); setTimeout(() => router.push('/user/dashboard'), 2000) }
    catch (e: any) { setError(e.message || 'Renewal failed') }
    finally { setIsProcessing(false) }
  }

  if (success) {
    return <div className="max-w-2xl mx-auto text-center py-20"><CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" /><h2 className="heading-md mb-2">Renewed!</h2><p className="body text-text-secondary">Redirecting to dashboard...</p></div>
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-6 space-y-6">
      <Link href="/user/dashboard" className="flex items-center gap-2 text-sm text-text-muted hover:text-text-secondary w-fit"><ArrowLeft className="w-4 h-4" /> Back</Link>

      <div className="glass-card p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-accent-purple/10 flex items-center justify-center mx-auto mb-4"><CreditCard className="w-8 h-8 text-accent-purple" /></div>
        <h1 className="heading-md mb-2">Renew Subscription</h1>
        <p className="body text-text-secondary mb-2">{agent?.metadata?.name || `Agent #${subscription?.agentId}`}</p>
        {endDate && <p className="text-sm text-text-muted mb-6">Current subscription expires {endDate.toLocaleDateString()}</p>}

        <div className="p-5 rounded-xl bg-white/3 border border-white/5 mb-6">
          <div className="text-3xl font-bold mb-1">{price} ETH</div>
          <div className="text-xs text-text-muted">Renewal price</div>
        </div>

        {error && <div className="p-3 rounded-lg bg-red-400/5 border border-red-400/10 text-sm text-red-400 mb-4">{error}</div>}

        <button onClick={handleRenew} disabled={isProcessing} className="btn-primary px-8 py-3 disabled:opacity-40">
          {isProcessing ? 'Processing...' : <><Sparkles className="w-4 h-4" /> Renew Now</>}
        </button>
      </div>
    </div>
  )
}
