// app/user/subscriptions/[subscriptionId]/page.tsx — Subscription Detail (Glassmorphism Dark)
'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { useAccount } from 'wagmi'
import { Loader2, AlertCircle, CheckCircle, Clock, CreditCard, ArrowLeft, Brain } from 'lucide-react'
import Link from 'next/link'

export default function SubscriptionDetailPage() {
  const params = useParams(); const router = useRouter()
  const { isConnected } = useAccount()
  const subscriptionId = Number(params.subscriptionId)

  // Note: useSubscriptionDetail from ERC8004 is preserved, we mount via dynamic import
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (!mounted) return <AppLayout><div className="flex items-center justify-center py-32"><Loader2 className="w-8 h-8 text-text-muted animate-spin" /></div></AppLayout>

  return (
    <AppLayout>
      <SubscriptionContent subscriptionId={subscriptionId} isConnected={isConnected} />
    </AppLayout>
  )
}

function SubscriptionContent({ subscriptionId, isConnected }: { subscriptionId: number; isConnected: boolean }) {
  const { useSubscriptionDetail } = require('@/hooks/user/useUserSubscriptions')
  const { useAgentDetail } = require('@/hooks/aimarket/useAgentRegistry')
  const { processPayment, cancelSubscription } = require('@/hooks/user/useUserSubscriptions')

  const { data: subscription, isLoading, refetch } = useSubscriptionDetail ? useSubscriptionDetail(subscriptionId) : { data: null, isLoading: false }
  const { data: agent } = useAgentDetail(subscription ? Number(subscription.agentId) : 0)

  const [isProcessing, setIsProcessing] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => { if (subscriptionId && isConnected) refetch?.() }, [subscriptionId, isConnected])

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

        {message && <div className={`p-3 rounded-lg text-sm mb-4 ${message.includes('fail') ? 'bg-red-400/5 border border-red-400/10 text-red-400' : 'bg-green-400/5 border border-green-400/10 text-green-400'}`}>{message}</div>}

        <div className="flex gap-3">
          {isActive && (
            <button onClick={async () => { setIsProcessing(true); try { await processPayment(Number(subscription.subscriptionId)); setMessage('Renewed!'); refetch?.() } catch(e: any) { setMessage(`Failed: ${e.message}`) } finally { setIsProcessing(false) } }} disabled={isProcessing} className="btn-primary text-sm px-6 py-2 disabled:opacity-40">{isProcessing ? 'Processing...' : 'Renew'}</button>
          )}
          {isActive && (
            <button onClick={async () => { if (!confirm('Cancel this subscription?')) return; setIsCancelling(true); try { await cancelSubscription(Number(subscription.subscriptionId)); setMessage('Cancelled'); refetch?.() } catch(e: any) { setMessage(`Failed: ${e.message}`) } finally { setIsCancelling(false) } }} disabled={isCancelling} className="btn-secondary text-sm px-6 py-2 disabled:opacity-40 text-red-400/80">{isCancelling ? 'Cancelling...' : 'Cancel'}</button>
          )}
          <Link href={`/user/chat/${subscription.agentId}`} className="btn-secondary text-sm px-6 py-2">Chat</Link>
        </div>
      </div>
    </div>
  )
}
