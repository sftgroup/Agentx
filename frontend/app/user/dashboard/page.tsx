// app/user/dashboard/page.tsx — Dashboard with Stats, Agents, Income
'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { useAccount } from 'wagmi'
import { useUserSubscriptions } from '@/hooks/user/useUserSubscriptions'
import { useAgentRegistry } from '@/hooks/aimarket/useAgentRegistry'
import {
  Brain, CreditCard, BarChart3, MessageSquare, RefreshCw, AlertCircle,
  CheckCircle, Clock, Settings, Sparkles, TrendingUp, Activity,
  Loader2, Wallet, Users
} from 'lucide-react'
import Link from 'next/link'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'

const publicClient = createPublicClient({ chain: sepolia, transport: http() })
const IDENTITY_REGISTRY = process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS as `0x${string}`

export default function UserDashboard() {
  const { address, isConnected } = useAccount()
  const [activeTab, setActiveTab] = useState<'active' | 'expired' | 'all'>('active')

  const { subscriptions, isLoading, refetch: refetchSubscriptions } = useUserSubscriptions()
  const { agents: allAgents, isLoading: loadingAgents } = useAgentRegistry(100)
  const [mintedCount, setMintedCount] = useState(0)
  const [loadingOnchain, setLoadingOnchain] = useState(false)

  // My agents (agents minted by current user)
  const myAgents = allAgents.filter(a => 
    a.owner?.toLowerCase() === address?.toLowerCase()
  )

  // Fetch minted agent count from chain
  const fetchOnchainData = useCallback(async () => {
    if (!address) return
    setLoadingOnchain(true)
    try {
      // Count agents where current user is owner
      let count = 0
      for (let i = 1; i <= 20; i++) {
        try {
          const owner = await publicClient.readContract({
            address: IDENTITY_REGISTRY,
            abi: [{ inputs: [{ name: 'tokenId', type: 'uint256' }], name: 'ownerOf', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' }],
            functionName: 'ownerOf', args: [BigInt(i)],
          })
          if (owner.toLowerCase() === address.toLowerCase()) count++
        } catch { break }
      }
      setMintedCount(count)
    } catch { /* chain read may fail */ }
    finally { setLoadingOnchain(false) }
  }, [address])

  useEffect(() => { if (isConnected) fetchOnchainData() }, [isConnected, fetchOnchainData])

  // Stats
  const activeCount = subscriptions?.filter(s => s.isActive).length ?? 0
  const totalSpent = subscriptions?.reduce((acc, s) => acc + Number(s.totalPaid || 0), 0) ?? 0
  const totalUsage = subscriptions?.reduce((acc, s) => acc + Number(s.currentUsage || 0), 0) ?? 0

  const statCards = [
    { icon: Wallet, label: 'My Agents', value: myAgents.length, color: 'text-accent-purple', bg: 'bg-accent-purple/10' },
    { icon: CheckCircle, label: 'Active Subs', value: activeCount, color: 'text-green-400', bg: 'bg-green-400/10' },
    { icon: Activity, label: 'Total Calls', value: totalUsage, color: 'text-accent-cyan', bg: 'bg-accent-cyan/10' },
    { icon: TrendingUp, label: 'Total Spent', value: `Ξ${(totalSpent / 1e18).toFixed(4)}`, color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  ]

  const filteredSubscriptions = subscriptions?.filter(sub => {
    if (activeTab === 'active') return sub.isActive === true
    if (activeTab === 'expired') return sub.isActive === false
    return true
  }) || []

  if (!isConnected) {
    return (
      <AppLayout><div className="max-w-4xl mx-auto text-center py-20">
        <AlertCircle className="w-16 h-16 text-accent-purple/40 mx-auto mb-4" />
        <h2 className="heading-md mb-3">Connect Your Wallet</h2>
        <p className="body text-text-muted">Connect to view your dashboard.</p>
      </div></AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto py-8 px-6 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="heading-md">Dashboard</h1>
            <p className="body text-text-secondary mt-1">Your agent ecosystem at a glance</p>
          </div>
          <div className="flex gap-3">
            <Link href="/user/settings" className="btn-secondary text-sm py-2"><Settings className="w-4 h-4" /> Settings</Link>
            <Link href="/marketplace" className="btn-primary text-sm py-2"><Sparkles className="w-4 h-4" /> Explore</Link>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map(s => (
            <div key={s.label} className="glass-card p-5">
              <div className={`w-9 h-9 rounded-lg ${s.bg} flex items-center justify-center mb-3`}>
                <s.icon className={`w-4.5 h-4.5 ${s.color}`} />
              </div>
              <div className="text-xs text-text-muted mb-1">{s.label}</div>
              <div className="text-2xl font-bold">{s.value}</div>
            </div>
          ))}
        </div>

        {/* My Agents Row */}
        {myAgents.length > 0 && (
          <div className="glass-card p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Brain className="w-5 h-5 text-accent-purple" /> My Agents</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {myAgents.slice(0, 6).map(agent => (
                <Link key={agent.id} href={`/marketplace/agent/${agent.id}`} className="p-4 rounded-xl bg-white/3 border border-white/5 hover:bg-white/5 transition-colors">
                  <div className="font-medium text-sm truncate">{agent.metadata?.name || `Agent #${agent.id}`}</div>
                  <p className="text-xs text-text-muted line-clamp-1 mt-0.5">{agent.metadata?.description}</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Subscriptions */}
        <div className="glass-card">
          <div className="p-6 border-b border-white/5 flex justify-between items-center">
            <h2 className="text-lg font-semibold">My Subscriptions</h2>
            <button onClick={() => refetchSubscriptions()} disabled={isLoading} className="text-text-muted hover:text-text-secondary">
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="flex gap-6 px-6 py-3 border-b border-white/5 text-sm">
            {(['active', 'expired', 'all'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`pb-2 px-1 border-b-2 capitalize transition-colors ${
                  activeTab === tab ? 'border-accent-purple text-text-primary' : 'border-transparent text-text-muted hover:text-text-secondary'
                }`}>{tab}</button>
            ))}
          </div>
          <div className="p-6">
            {isLoading ? (
              <div className="text-center py-12"><RefreshCw className="w-8 h-8 text-text-muted animate-spin mx-auto mb-3" /></div>
            ) : filteredSubscriptions.length === 0 ? (
              <div className="text-center py-12">
                <Brain className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-30" />
                <p className="text-text-secondary">No subscriptions found</p>
                <Link href="/marketplace" className="inline-block mt-4 btn-primary text-sm">Browse Agents</Link>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredSubscriptions.map(sub => {
                  const agent = allAgents.find(a => a.id === Number(sub.agentId))
                  const isActive = sub.isActive === true
                  return (
                    <div key={sub.subscriptionId.toString()} className="glass-card-hover p-5 rounded-xl border border-white/5">
                      <div className="flex items-start justify-between">
                        <div className="flex gap-4 flex-1">
                          <div className="w-12 h-12 rounded-xl bg-accent-purple/10 flex items-center justify-center flex-shrink-0">
                            <Brain className="w-6 h-6 text-accent-purple" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold truncate">{agent?.metadata?.name || `Agent #${sub.agentId}`}</h3>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${isActive ? 'bg-green-400/10 text-green-400' : 'bg-text-muted/10 text-text-muted'}`}>
                                {isActive ? 'Active' : 'Expired'}
                              </span>
                            </div>
                            <p className="text-sm text-text-muted line-clamp-1">{agent?.metadata?.description}</p>
                            <div className="flex flex-wrap gap-3 text-xs text-text-muted mt-2">
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(Number(sub.startDate) * 1000).toLocaleDateString()}</span>
                              <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> {Number(sub.currentUsage) || 0} calls</span>
                              <span className="flex items-center gap-1"><CreditCard className="w-3 h-3" /> Ξ{(Number(sub.totalPaid || 0) / 1e18).toFixed(4)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4 flex-shrink-0">
                          <Link href={`/user/chat/${sub.agentId}`} className="btn-primary text-xs py-1.5 px-3"><MessageSquare className="w-3.5 h-3.5" /> Chat</Link>
                        </div>
                      </div>
                      {isActive && sub.endDate > 0 && (
                        <div className="mt-4 p-3 rounded-lg bg-yellow-400/5 border border-yellow-400/10 text-sm text-yellow-400/80 flex justify-between">
                          <span>Expires {new Date(Number(sub.endDate) * 1000).toLocaleDateString()}</span>
                          <Link href={`/user/subscriptions/${sub.subscriptionId}`} className="font-medium hover:text-yellow-400">Renew</Link>
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
