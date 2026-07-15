// app/marketplace/agent/[id]/page.tsx — Agent Detail with Skills + Reviews
'use client'

import { useParams } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { useAgentDetail } from '@/hooks/aimarket/useAgentRegistry'
import { useAgentReputation, useReputation } from '@/components/agent/hooks/useReputation'
import { useSubscription, BillingPeriod } from '@/components/agent/hooks/useSubscription'
import { useHasActiveSubscription } from '@/components/guard/SubscriptionGuard'
import { useAccount } from 'wagmi'
import {
  Brain, Star, Zap, MessageSquare, ExternalLink, ArrowLeft, Sparkles,
  CheckCircle, Loader2, AlertCircle, Terminal, Code2, ThumbsUp, Send
} from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

const starLabels = ['Terrible', 'Bad', 'OK', 'Good', 'Excellent']

export default function AgentDetailPage() {
  const params = useParams()
  const agentId = Number(params.id)
  const { address, isConnected } = useAccount()

  const { data: agentDetail, isLoading: isLoadingAgent } = useAgentDetail(agentId)
  const { data: reputationData } = useAgentReputation(agentId)
  const { giveFeedback, isGivingFeedback } = useReputation()
  const { getAgentPlans, agentPlans, subscribe, isSubscribing, isConfirming, getUserSubscriptions } = useSubscription()
  const { isValid: hasActiveSub, isLoading: isCheckingSub } = useHasActiveSubscription(agentId)

  const [activeTab, setActiveTab] = useState<'overview' | 'skills' | 'reviews' | 'pricing'>('overview')
  const [subscribingPlanId, setSubscribingPlanId] = useState<number | null>(null)
  const [subscribeError, setSubscribeError] = useState<string | null>(null)
  const [subscribeSuccess, setSubscribeSuccess] = useState(false)

  // Review state
  const [reviewRating, setReviewRating] = useState(0)
  const [reviewHover, setReviewHover] = useState(0)
  const [reviewText, setReviewText] = useState('')
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [reviewDone, setReviewDone] = useState(false)

  useEffect(() => { if (agentId) { getAgentPlans(agentId); if (address) getUserSubscriptions() } }, [agentId, address])

  const handleSubscribe = useCallback(async (planId: number) => {
    if (!isConnected) return
    if (isSubscribing || isConfirming) return
    setSubscribeError(null); setSubscribeSuccess(false); setSubscribingPlanId(planId)
    try {
      const plan = agentPlans.find((p: any) => Number(p.planId) === planId)
      if (!plan) return
      await subscribe(planId, plan.price > BigInt(0) ? plan.price : undefined)
      setSubscribeSuccess(true)
      setTimeout(() => { getAgentPlans(agentId); getUserSubscriptions() }, 2000)
    } catch (e: any) { setSubscribeError(e.message || 'Subscription failed') }
    finally { setTimeout(() => setSubscribingPlanId(null), 2000) }
  }, [isConnected, isSubscribing, isConfirming, agentPlans, subscribe, getAgentPlans, getUserSubscriptions, agentId])

  const handleSubmitReview = async () => {
    if (reviewRating < 1) return
    setReviewSubmitting(true)
    try {
      await giveFeedback(agentId, reviewRating, 'quality', 'utility', '', '', '')
      setReviewDone(true)
    } catch (e: any) { /* */ }
    finally { setReviewSubmitting(false) }
  }

  if (isLoadingAgent) return <AppLayout><div className="flex items-center justify-center py-32"><Brain className="w-8 h-8 text-text-muted animate-spin" /></div></AppLayout>
  if (!agentDetail) return <AppLayout><div className="max-w-4xl mx-auto text-center py-20"><Brain className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-30" /><h2 className="heading-md mb-3">Agent Not Found</h2><Link href="/marketplace" className="btn-primary text-sm inline-block">Back to Marketplace</Link></div></AppLayout>

  const meta = (agentDetail.metadata || {}) as any
  const tags = (meta.tags || []) as string[]
  const price = meta.pricing
  const skills = (meta.skills || []) as any[]
  const rating = (reputationData as any)?.average || 4.8
  const count = (reputationData as any)?.count || 0

  const subCta = hasActiveSub ? (
    <Link href={`/user/chat/${agentId}`} className="btn-primary text-sm px-6 py-2.5 flex items-center gap-2">
      <CheckCircle className="w-4 h-4" /> Chat with Agent
    </Link>
  ) : isCheckingSub ? (
    <button disabled className="btn-primary text-sm px-6 py-2.5 opacity-60 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Checking...</button>
  ) : (
    <button onClick={() => setActiveTab('pricing')} className="btn-primary text-sm px-6 py-2.5 flex items-center gap-2"><Sparkles className="w-4 h-4" /> Subscribe</button>
  )

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto py-8 px-6 space-y-8">
        <Link href="/marketplace" className="flex items-center gap-2 text-sm text-text-muted hover:text-text-secondary transition-colors w-fit"><ArrowLeft className="w-4 h-4" /> Back to Marketplace</Link>

        {/* Hero */}
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
                {hasActiveSub && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-400/10 text-green-400"><CheckCircle className="w-3 h-3" /> Subscribed</span>}
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:self-start flex-shrink-0">
              {subCta}
              <Link href={`/user/chat/${agentId}`} className="btn-secondary text-sm px-6 py-2.5 flex items-center gap-2"><Zap className="w-4 h-4" /> Try Demo</Link>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-white/3 rounded-xl w-fit flex-wrap">
          {[
            { id: 'overview' as const, label: 'Overview' },
            { id: 'skills' as const, label: `Skills${skills?.length ? ` (${skills.length})` : ''}` },
            { id: 'reviews' as const, label: 'Reviews' },
            { id: 'pricing' as const, label: hasActiveSub ? 'Pricing ✓' : 'Pricing' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${activeTab === tab.id ? 'bg-white/10 text-text-primary' : 'text-text-muted hover:text-text-secondary'}`}>
              {tab.label}
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

        {/* Skills tab (new — P1 #10) */}
        {activeTab === 'skills' && (
          <div className="space-y-4">
            {!skills || skills.length === 0 ? (
              <div className="glass-card p-8 text-center">
                <Terminal className="w-10 h-10 text-text-muted mx-auto mb-3 opacity-30" />
                <h3 className="font-semibold mb-1">No Skills Listed</h3>
                <p className="text-sm text-text-muted">This agent hasn&apos;t published any skill schemas yet.</p>
              </div>
            ) : (
              skills.map((skill: any, i: number) => (
                <div key={i} className="glass-card p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Code2 className="w-4 h-4 text-accent-cyan" />
                    <span className="font-semibold text-sm">{skill.name || `Skill #${i + 1}`}</span>
                  </div>
                  {skill.description && <p className="text-sm text-text-secondary mb-3">{skill.description}</p>}
                  {(skill.inputSchema || skill.outputSchema) && (
                    <div className="grid sm:grid-cols-2 gap-3 mt-3">
                      {skill.inputSchema && (
                        <details className="text-xs" open>
                          <summary className="cursor-pointer font-medium text-text-muted mb-2 hover:text-text-secondary">📥 Input Schema</summary>
                          <pre className="p-3 rounded-lg bg-white/3 border border-white/5 text-xs overflow-auto max-h-48">{JSON.stringify(skill.inputSchema, null, 2)}</pre>
                        </details>
                      )}
                      {skill.outputSchema && (
                        <details className="text-xs">
                          <summary className="cursor-pointer font-medium text-text-muted mb-2 hover:text-text-secondary">📤 Output Schema</summary>
                          <pre className="p-3 rounded-lg bg-white/3 border border-white/5 text-xs overflow-auto max-h-48">{JSON.stringify(skill.outputSchema, null, 2)}</pre>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Reviews tab (new — P1 #11) */}
        {activeTab === 'reviews' && (
          <div className="space-y-6">
            {/* Submit review */}
            {hasActiveSub && !reviewDone && (
              <div className="glass-card p-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2"><ThumbsUp className="w-4 h-4 text-yellow-400" /> Rate this Agent</h3>
                <div className="flex gap-1 mb-3">
                  {[1,2,3,4,5].map(n => (
                    <button key={n} onClick={() => setReviewRating(n)} onMouseEnter={() => setReviewHover(n)} onMouseLeave={() => setReviewHover(0)}
                      className="transition-transform hover:scale-110">
                      <Star className={`w-7 h-7 ${(reviewHover || reviewRating) >= n ? 'text-yellow-400 fill-yellow-400' : 'text-text-muted'}`} />
                    </button>
                  ))}
                  <span className="text-sm text-text-muted ml-2 self-center">{starLabels[(reviewHover || reviewRating) - 1] || ''}</span>
                </div>
                <textarea value={reviewText} onChange={e => setReviewText(e.target.value)} placeholder="Share your experience... (optional)"
                  rows={2} className="w-full px-4 py-2.5 bg-white/5 border border-white/5 rounded-xl text-sm focus:outline-none focus:border-accent-purple/40 resize-none mb-3" />
                <button onClick={handleSubmitReview} disabled={reviewRating < 1 || reviewSubmitting}
                  className="btn-primary text-sm py-2 px-4 disabled:opacity-40">
                  {reviewSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</> : <><Send className="w-4 h-4" /> Submit Review</>}
                </button>
              </div>
            )}
            {reviewDone && (
              <div className="p-4 rounded-xl bg-green-400/5 border border-green-400/10 text-sm text-green-400 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" /> Review submitted! Thanks for your feedback.
              </div>
            )}
            {/* Rating summary */}
            <div className="glass-card p-6 text-center">
              <div className="text-4xl font-bold mb-1">⭐ {rating}</div>
              <div className="text-sm text-text-muted">{count} total reviews</div>
            </div>
          </div>
        )}

        {/* Pricing */}
        {activeTab === 'pricing' && (
          <div className="space-y-6">
            {hasActiveSub && (
              <div className="p-5 rounded-xl bg-green-400/5 border border-green-400/10 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <div><p className="text-sm font-medium text-green-400">You&apos;re subscribed!</p><p className="text-xs text-text-muted mt-0.5"><Link href={`/user/chat/${agentId}`} className="text-accent-cyan hover:underline">Start chatting →</Link></p></div>
              </div>
            )}
            {subscribeError && <div className="p-4 rounded-xl bg-red-400/5 border border-red-400/10 text-sm text-red-400 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {subscribeError}</div>}
            {subscribeSuccess && <div className="p-4 rounded-xl bg-green-400/5 border border-green-400/10 text-sm text-green-400 flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Subscription successful!</div>}
            <div className="grid md:grid-cols-2 gap-4">
              {agentPlans?.length > 0 ? agentPlans.map((plan: any) => {
                const planId = Number(plan.planId)
                const isLoading = (isSubscribing || isConfirming) && planId === subscribingPlanId
                const label = hasActiveSub ? 'Already Subscribed' : isLoading ? 'Confirming...' : !isConnected ? 'Connect Wallet' : 'Subscribe'
                return (
                  <div key={planId} className="glass-card glass-card-hover p-6">
                    <h3 className="font-semibold mb-2">{plan.name || `${BillingPeriod[plan.billingPeriod]}`}</h3>
                    <div className="text-3xl font-bold mb-1">{Number(plan.price) / 1e18} ETH</div>
                    <div className="text-xs text-text-muted mb-4">per {BillingPeriod[plan.billingPeriod]?.toLowerCase() || 'period'}</div>
                    <button onClick={() => handleSubscribe(planId)} disabled={hasActiveSub || isLoading || !isConnected}
                      className={`w-full py-2 text-sm rounded-xl transition-colors disabled:opacity-40 ${hasActiveSub ? 'bg-green-400/20 border border-green-400/20 text-green-400' : 'btn-primary'}`}>
                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> : null}{label}
                    </button>
                  </div>
                )
              }) : <div className="md:col-span-2 glass-card p-8 text-center"><p className="text-text-muted">No subscription plans available yet.</p></div>}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
