// app/user/subscriptions/page.tsx — My Subscriptions Manager
'use client'

import { AppLayout } from '@/components/layout/AppLayout'
import { useAccount } from 'wagmi'
import { useUserSubscriptions } from '@/hooks/user/useUserSubscriptions'
import { useAgentRegistry } from '@/hooks/aimarket/useAgentRegistry'
import { useState, useMemo } from 'react'
import {
  CreditCard, Clock, AlertTriangle, CheckCircle, XCircle,
  MessageSquare, RefreshCw, BarChart3, Loader2, Brain, ExternalLink
} from 'lucide-react'
import Link from 'next/link'

type TabFilter = 'active' | 'expiring' | 'expired'

export default function SubscriptionsPage() {
  const { address, isConnected } = useAccount()
  const { subscriptions, isLoading, refetch } = useUserSubscriptions()
  const { agents: allAgents } = useAgentRegistry(100)

  const [filter, setFilter] = useState<TabFilter>('active')
  const now = Date.now()
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000

  const filtered = useMemo(() => {
    if (!subscriptions) return []
    return subscriptions.filter(sub => {
      const endMs = Number(sub.endDate) * 1000
      const isActive = sub.isActive === true
      const expiringSoon = isActive && endMs > 0 && endMs - now < THIRTY_DAYS
      if (filter === 'active') return isActive
      if (filter === 'expiring') return expiringSoon
      if (filter === 'expired') return !isActive
      return true
    })
  }, [subscriptions, filter, now])

  if (!isConnected) {
    return (
      <AppLayout><div className="max-w-4xl mx-auto text-center py-20">
        <AlertTriangle className="w-16 h-16 text-accent-purple/40 mx-auto mb-4" />
        <h2 className="heading-md mb-3">Connect Your Wallet</h2>
        <p className="body text-text-muted">Connect to view your subscriptions.</p>
      </div></AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto py-8 px-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="heading-md flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-accent-purple/10 flex items-center justify-center"><CreditCard className="w-5 h-5 text-accent-purple" /></div>
              My Subscriptions
            </h1>
            <p className="body text-text-secondary mt-1">Manage your agent subscriptions</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => refetch()} disabled={isLoading} className="btn-secondary text-sm py-2 px-3">
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <Link href="/marketplace" className="btn-primary text-sm py-2"><Brain className="w-4 h-4" /> Browse</Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-white/3 rounded-xl w-fit">
          {[
            { key: 'active' as TabFilter, label: 'Active' },
            { key: 'expiring' as TabFilter, label: 'Expiring Soon' },
            { key: 'expired' as TabFilter, label: 'Expired' },
          ].map(tab => (
            <button key={tab.key} onClick={() => setFilter(tab.key)}
              className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${
                filter === tab.key ? 'bg-white/10 text-text-primary' : 'text-text-muted hover:text-text-secondary'
              }`}>{tab.label}</button>
          ))}
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-text-muted animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 glass-card">
            <Brain className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-30" />
            <h3 className="font-semibold mb-1">No {filter} subscriptions</h3>
            <p className="body text-text-muted mb-4">
              {filter === 'active' ? 'Subscribe to agents from the marketplace.' :
               filter === 'expiring' ? 'No subscriptions expiring within 30 days.' :
               'No expired subscriptions.'}
            </p>
            <Link href="/marketplace" className="btn-primary text-sm inline-block"><Brain className="w-4 h-4" /> Browse Marketplace</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(sub => {
              const agent = allAgents.find(a => a.id === Number(sub.agentId))
              const isActive = sub.isActive === true
              const endMs = Number(sub.endDate) * 1000
              const daysLeft = endMs > 0 ? Math.ceil((endMs - now) / (24 * 60 * 60 * 1000)) : 0
              const expiringSoon = isActive && daysLeft > 0 && daysLeft < 30

              return (
                <div key={sub.subscriptionId.toString()} className="glass-card glass-card-hover p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-4 flex-1 min-w-0">
                      <div className="w-12 h-12 rounded-xl bg-accent-purple/10 flex items-center justify-center flex-shrink-0">
                        <Brain className="w-6 h-6 text-accent-purple" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold truncate">{agent?.metadata?.name || `Agent #${sub.agentId}`}</h3>
                          <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${
                            isActive ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'
                          }`}>
                            {isActive ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            {isActive ? 'Active' : 'Expired'}
                          </span>
                        </div>
                        <p className="text-sm text-text-muted line-clamp-1">{agent?.metadata?.description}</p>
                        <div className="flex flex-wrap gap-3 text-xs text-text-muted mt-2">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Started {new Date(Number(sub.startDate) * 1000).toLocaleDateString()}</span>
                          {isActive && endMs > 0 && (
                            <span className={`flex items-center gap-1 ${expiringSoon ? 'text-yellow-400' : ''}`}>
                              <Clock className="w-3 h-3" />
                              {expiringSoon ? '⏰' : ''} {daysLeft}d left
                            </span>
                          )}
                          <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3" /> {Number(sub.currentUsage) || 0} calls</span>
                          <span className="flex items-center gap-1"><CreditCard className="w-3 h-3" /> Ξ{(Number(sub.totalPaid || 0) / 1e18).toFixed(4)} spent</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Link href={`/user/chat/${sub.agentId}`} className="btn-primary text-xs py-1.5 px-3">
                        <MessageSquare className="w-3.5 h-3.5" /> Chat
                      </Link>
                      <Link href={`/user/subscriptions/${sub.subscriptionId}`} className="btn-secondary text-xs py-1.5 px-3">
                        <ExternalLink className="w-3.5 h-3.5" /> Details
                      </Link>
                    </div>
                  </div>
                  {/* Expiration warning */}
                  {expiringSoon && (
                    <div className="mt-4 p-3 rounded-lg bg-yellow-400/5 border border-yellow-400/10 text-sm text-yellow-400/80 flex items-center justify-between">
                      <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Expires in {daysLeft} days — {new Date(endMs).toLocaleDateString()}</span>
                      <Link href={`/user/subscriptions/${sub.subscriptionId}`} className="font-medium hover:text-yellow-400 transition-colors">Renew →</Link>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
