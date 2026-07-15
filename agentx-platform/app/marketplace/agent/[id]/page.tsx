// app/marketplace/agent/[id]/page.tsx — Agent Detail (Glassmorphism Dark)
'use client'

import { useParams } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { useAgentDetail } from '@/hooks/aimarket/useAgentRegistry'
import { useAgentReputation, useReputation } from '@/components/agent/hooks/useReputation'
import { useSubscription, BillingPeriod } from '@/components/agent/hooks/useSubscription'
import { useAccount } from 'wagmi'
import { Brain, Star, Users, Zap, Clock, MessageSquare, Shield, ExternalLink, Tag, ArrowLeft, Sparkles } from 'lucide-react'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { Address } from 'viem'

interface IPFSMetadata { name: string; description: string; image?: string; tags?: string[]; capabilities?: string[]; website?: string; github?: string; pricing?: { type: string; amount: string; currency: string; period?: string }; attributes?: Record<string, any> }

export default function AgentDetailPage() {
  const params = useParams()
  const agentId = Number(params.id)
  const { address, isConnected } = useAccount()

  const { data: agentDetail, isLoading: isLoadingAgent } = useAgentDetail(agentId)
  const { data: reputationData } = useAgentReputation(agentId)
  const { giveFeedback, isGivingFeedback } = useReputation()
  const { getAgentPlans, agentPlans, subscribe, isSubscribing, isConfirming, getUserSubscriptions, userSubscriptions } = useSubscription()

  const [activeTab, setActiveTab] = useState<'overview' | 'pricing'>('overview')
  const [isUserSubscribed, setIsUserSubscribed] = useState(false)
  const [subscribingPlanId, setSubscribingPlanId] = useState<number | null>(null)
  const [subscribeError, setSubscribeError] = useState<string | null>(null)

  useEffect(() => { if (agentId) { getAgentPlans(agentId); if (address) getUserSubscriptions() } }, [agentId, address])
  useEffect(() => {
    if (userSubscriptions?.length > 0 && agentPlans?.length > 0) {
      setIsUserSubscribed(userSubscriptions.some((sub: any) => agentPlans.some((p: any) => Number(p.planId) === Number(sub.planId) && sub.status === 0)))
    }
  }, [userSubscriptions, agentPlans])

  const handleSubscribe = async (planId: number) => {
    if (!isConnected) return
    if (isSubscribing || isConfirming) return
    setSubscribeError(null); setSubscribingPlanId(planId)
    try {
      const plan = agentPlans.find((p: any) => Number(p.planId) === planId)
      if (!plan) return
      await subscribe(planId, plan.price > BigInt(0) ? plan.price : undefined)
      setTimeout(() => { getAgentPlans(agentId); getUserSubscriptions() }, 2000)
    } catch (e: any) { setSubscribeError(e.message || 'Subscription failed') }
    finally { setTimeout(() => setSubscribingPlanId(null), 2000) }
  }

  if (isLoadingAgent) return <AppLayout><div className="flex items-center justify-center py-32"><Brain className="w-8 h-8 text-text-muted animate-spin" /></div></AppLayout>
  if (!agentDetail) return <AppLayout><div className="max-w-4xl mx-auto text-center py-20"><Brain className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-30" /><h2 className="heading-md mb-3">Agent Not Found</h2><Link href="/marketplace" className="btn-primary text-sm inline-block">Back to Marketplace</Link></div></AppLayout>

  const meta = (agentDetail.metadata || {}) as any
  const tags = (meta.tags || []) as string[]
  const price = meta.pricing
  const rating = (reputationData as any)?.average || 4.8
  const count = (reputationData as any)?.count || 0

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto py-8 px-6 space-y-8">
        {/* Back nav */}
        <Link href="/marketplace" className="flex items-center gap-2 text-sm text-text-muted hover:text-text-secondary transition-colors w-fit">
          <ArrowLeft className="w-4 h-4" /> Back to Marketplace
        </Link>

        {/* Hero card */}
        <div className="glass-card p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-accent-purple/5 blur-[80px] rounded-full" />
          <div className="relative flex flex-col sm:flex-row gap-6">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent-purple/20 to-accent-cyan/10 border border-white/10 flex items-center justify-center flex-shrink-0">
              <Brain className="w-10 h-10 text-accent-purple" />
            </div>
            <div className="flex-1">
              <h1 className="heading-md mb-2">{meta.name || `Agent #${agentId}`}</h1>
              <p className="body text-text-secondary mb-4">{meta.description || 'No description'}</p>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="flex items-center gap-1 text-yellow-400"><Star className="w-3.5 h-3.5 fill-current" /> {rating} ({count} reviews)</span>
                {price && <span className="px-2 py-0.5 rounded-full bg-accent-cyan/10 text-accent-cyan">{price.amount} {price.currency || 'ETH'}{price.type === 'subscription' ? '/mo' : '/use'}</span>}
                {tags.slice(0, 5).map((t: string) => <span key={t} className="px-2 py-0.5 rounded-full bg-white/5 text-text-muted">{t}</span>)}
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:self-start flex-shrink-0">
              {isUserSubscribed ? (
                <Link href={`/user/chat/${agentId}`} className="btn-primary text-sm px-6 py-2.5"><MessageSquare className="w-4 h-4" /> Chat with Agent</Link>
              ) : (
                <button onClick={() => setActiveTab('pricing')} className="btn-primary text-sm px-6 py-2.5"><Sparkles className="w-4 h-4" /> Subscribe</button>
              )}
              <Link href={`/user/chat/${agentId}`} className="btn-secondary text-sm px-6 py-2.5"><Zap className="w-4 h-4" /> Try Demo</Link>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-white/3 rounded-xl w-fit">
          {['overview', 'pricing'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${activeTab === tab ? 'bg-white/10 text-text-primary' : 'text-text-muted hover:text-text-secondary'}`}>
              {tab === 'overview' ? 'Overview' : 'Pricing'}
            </button>
          ))}
        </div>

        {/* Overview */}
        {activeTab === 'overview' && (
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
              <div className="glass-card p-6">
                <h2 className="text-lg font-semibold mb-4">Description</h2>
                <p className="text-sm text-text-secondary leading-relaxed">{meta.description || 'No description provided.'}</p>
              </div>
              {tags.length > 0 && (
                <div className="glass-card p-6">
                  <h2 className="text-lg font-semibold mb-3">Tags</h2>
                  <div className="flex flex-wrap gap-2">{tags.map((t: string) => <span key={t} className="px-3 py-1 rounded-full bg-white/5 text-sm text-text-secondary">{t}</span>)}</div>
                </div>
              )}
            </div>
            <div className="space-y-4">
              <div className="glass-card p-5 text-center">
                <div className="text-3xl font-bold mb-1">⭐ {rating}</div>
                <div className="text-xs text-text-muted">{count} reviews</div>
              </div>
              {meta.website && (
                <a href={meta.website} target="_blank" className="glass-card glass-card-hover p-4 flex items-center gap-3 text-sm">
                  <ExternalLink className="w-4 h-4 text-accent-cyan" /> {meta.website.replace(/^https?:\/\//, '')}
                </a>
              )}
              {meta.github && (
                <a href={meta.github} target="_blank" className="glass-card glass-card-hover p-4 flex items-center gap-3 text-sm">
                  <ExternalLink className="w-4 h-4 text-accent-purple" /> GitHub
                </a>
              )}
            </div>
          </div>
        )}

        {/* Pricing */}
        {activeTab === 'pricing' && (
          <div className="grid md:grid-cols-2 gap-4">
            {agentPlans?.length > 0 ? agentPlans.map((plan: any) => (
              <div key={plan.planId.toString()} className="glass-card glass-card-hover p-6">
                <h3 className="font-semibold mb-2">{plan.name || `${BillingPeriod[plan.billingPeriod]}`}</h3>
                <div className="text-3xl font-bold mb-1">{Number(plan.price) / 1e18} ETH</div>
                <div className="text-xs text-text-muted mb-4">per {BillingPeriod[plan.billingPeriod]?.toLowerCase() || 'period'}</div>
                <button onClick={() => handleSubscribe(Number(plan.planId))}
                  disabled={isSubscribing || isConfirming || Number(plan.planId) === subscribingPlanId}
                  className="w-full btn-primary py-2 text-sm disabled:opacity-40">
                  {Number(plan.planId) === subscribingPlanId ? 'Confirming...' : isUserSubscribed ? 'Already Subscribed' : 'Subscribe'}
                </button>
                {subscribeError && <p className="text-xs text-red-400 mt-2 text-center">{subscribeError}</p>}
              </div>
            )) : (
              <div className="md:col-span-2 glass-card p-8 text-center">
                <p className="text-text-muted">No subscription plans available yet.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
