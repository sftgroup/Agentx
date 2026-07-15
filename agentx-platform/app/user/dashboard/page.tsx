// app/user/dashboard/page.tsx — User Dashboard (Glassmorphism Dark)
'use client'

import { useState, useEffect } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { useAccount } from 'wagmi'
import { useUserSubscriptions } from '@/hooks/user/useUserSubscriptions'
import { useAgentRegistry } from '@/hooks/aimarket/useAgentRegistry'
import { Brain, CreditCard, BarChart3, MessageSquare, RefreshCw, AlertCircle, CheckCircle, Clock, Settings, Sparkles } from 'lucide-react'
import Link from 'next/link'

interface SubscriptionStats {
  totalSubscriptions: number
  activeSubscriptions: number
  totalSpent: number
  usageThisMonth: number
}

export default function UserDashboard() {
  const { address, isConnected } = useAccount()
  const [activeTab, setActiveTab] = useState<'active' | 'expired' | 'all'>('active')
  const [stats, setStats] = useState<SubscriptionStats>({
    totalSubscriptions: 0,
    activeSubscriptions: 0,
    totalSpent: 0,
    usageThisMonth: 0
  })

  const { subscriptions, isLoading, isError, error, refetch: refetchSubscriptions } = useUserSubscriptions()
  const { agents: allAgents } = useAgentRegistry(100)

  useEffect(() => {
    if (subscriptions && allAgents) {
      const now = Date.now()
      const statsData = subscriptions.reduce((acc, sub) => {
        const isActive = sub.isActive === true
        const usageThisMonth = Number(sub.currentUsage) || 0
        const totalPaid = Number(sub.totalPaid || 0)
        return {
          totalSubscriptions: acc.totalSubscriptions + 1,
          activeSubscriptions: acc.activeSubscriptions + (isActive ? 1 : 0),
          totalSpent: acc.totalSpent + totalPaid,
          usageThisMonth: acc.usageThisMonth + usageThisMonth
        }
      }, { totalSubscriptions: 0, activeSubscriptions: 0, totalSpent: 0, usageThisMonth: 0 })
      setStats(statsData)
    }
  }, [subscriptions, allAgents])

  const filteredSubscriptions = subscriptions?.filter(sub => {
    switch (activeTab) {
      case 'active': return sub.isActive === true
      case 'expired': return sub.isActive === false
      default: return true
    }
  }) || []

  const statCards = [
    { icon: CreditCard, label: 'Total Subscriptions', value: stats.totalSubscriptions, color: 'accent-purple' },
    { icon: CheckCircle, label: 'Active', value: stats.activeSubscriptions, color: 'accent-cyan' },
    { icon: BarChart3, label: 'Total Usage', value: stats.usageThisMonth, color: 'accent-blue' },
    { icon: Brain, label: 'Total Spent', value: `$${(stats.totalSpent / 1e18).toFixed(2)}`, color: 'accent-pink' },
  ]

  if (!isConnected) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto text-center py-20">
          <AlertCircle className="w-16 h-16 text-accent-purple/40 mx-auto mb-4" />
          <h2 className="heading-md mb-3">Connect Your Wallet</h2>
          <p className="body text-text-muted">Connect your wallet to view subscriptions and usage.</p>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="heading-md">User Dashboard</h1>
            <p className="body text-text-secondary mt-1">Manage your Agent subscriptions and usage</p>
          </div>
          <div className="flex gap-3">
            <Link href="/user/settings" className="btn-primary text-sm py-2">
              <Settings className="w-4 h-4" /> API Config
            </Link>
            <Link href="/marketplace" className="btn-secondary text-sm py-2">
              <Sparkles className="w-4 h-4" /> Explore
            </Link>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((s) => (
            <div key={s.label} className="glass-card p-5">
              <div className={`w-9 h-9 rounded-lg bg-${s.color}/10 flex items-center justify-center mb-3`}>
                <s.icon className={`w-4.5 h-4.5 text-${s.color}`} />
              </div>
              <div className="text-xs text-text-muted mb-1">{s.label}</div>
              <div className="text-2xl font-bold">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Subscriptions */}
        <div className="glass-card">
          <div className="p-6 border-b border-white/5 flex justify-between items-center">
            <h2 className="text-lg font-semibold">My Subscriptions</h2>
            <button onClick={() => refetchSubscriptions()} disabled={isLoading} className="text-text-muted hover:text-text-secondary transition-colors">
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-6 px-6 py-3 border-b border-white/5 text-sm">
            {[
              { key: 'active' as const, label: 'Active' },
              { key: 'expired' as const, label: 'Expired' },
              { key: 'all' as const, label: 'All' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`pb-2 px-1 border-b-2 transition-colors ${
                  activeTab === tab.key ? 'border-accent-purple text-text-primary' : 'border-transparent text-text-muted hover:text-text-secondary'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="p-6">
            {isLoading ? (
              <div className="text-center py-12">
                <RefreshCw className="w-8 h-8 text-text-muted animate-spin mx-auto mb-3" />
              </div>
            ) : filteredSubscriptions.length === 0 ? (
              <div className="text-center py-12">
                <Brain className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-30" />
                <p className="text-text-secondary">No subscriptions found</p>
                <Link href="/marketplace" className="inline-block mt-4 btn-primary text-sm">
                  Browse Agents
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredSubscriptions.map((subscription) => {
                  const agent = allAgents.find(a => a.id === Number(subscription.agentId))
                  const isActive = subscription.isActive === true
                  const endDate = new Date(Number(subscription.endDate) * 1000)
                  const usageCount = Number(subscription.currentUsage) || 0

                  return (
                    <div key={subscription.subscriptionId.toString()} className="glass-card-hover p-5 rounded-xl border border-white/5">
                      <div className="flex items-start justify-between">
                        <div className="flex gap-4 flex-1">
                          {agent?.metadata?.image ? (
                            <img src={agent.metadata.image} alt="" className="w-12 h-12 rounded-xl object-cover" />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-accent-purple/10 flex items-center justify-center">
                              <Brain className="w-6 h-6 text-accent-purple" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold truncate">{agent?.metadata?.name || `Agent #${subscription.agentId}`}</h3>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                isActive ? 'bg-green-400/10 text-green-400' : 'bg-text-muted/10 text-text-muted'
                              }`}>
                                {isActive ? 'Active' : 'Expired'}
                              </span>
                            </div>
                            <p className="text-sm text-text-muted line-clamp-1">{agent?.metadata?.description}</p>
                            <div className="flex flex-wrap gap-3 text-xs text-text-muted mt-2">
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Since {new Date(Number(subscription.startDate) * 1000).toLocaleDateString()}</span>
                              <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3" /> {usageCount} calls</span>
                              <span className="flex items-center gap-1"><CreditCard className="w-3 h-3" /> Ξ{(Number(subscription.totalPaid || 0) / 1e18).toFixed(4)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <Link href={`/user/chat/${subscription.agentId}`} className="btn-primary text-xs py-1.5 px-3"><MessageSquare className="w-3.5 h-3.5" /> Chat</Link>
                          {isActive && (
                            <Link href={`/user/subscriptions/${subscription.subscriptionId}`} className="btn-secondary text-xs py-1.5 px-3"><CreditCard className="w-3.5 h-3.5" /> Manage</Link>
                          )}
                        </div>
                      </div>
                      {isActive && subscription.endDate > 0 && (
                        <div className="mt-4 p-3 rounded-lg bg-yellow-400/5 border border-yellow-400/10 text-sm text-yellow-400/80 flex justify-between">
                          <span>Expires {endDate.toLocaleDateString()}</span>
                          <Link href={`/user/subscriptions/${subscription.subscriptionId}`} className="font-medium hover:text-yellow-400 transition-colors">Renew</Link>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
