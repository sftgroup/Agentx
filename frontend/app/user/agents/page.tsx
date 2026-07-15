// app/user/agents/page.tsx — My Agents Management
'use client'

import { AppLayout } from '@/components/layout/AppLayout'
import { useAccount } from 'wagmi'
import { useAgentRegistry } from '@/hooks/aimarket/useAgentRegistry'
import { useState, useMemo } from 'react'
import {
  Brain, Plus, RefreshCw, ExternalLink, Edit3, Eye, Users,
  Loader2, AlertCircle, Activity
} from 'lucide-react'
import Link from 'next/link'

export default function MyAgentsPage() {
  const { address, isConnected } = useAccount()
  const { agents: allAgents, isLoading: loadingAgents } = useAgentRegistry(100)

  const myAgents = useMemo(() =>
    allAgents.filter(a => a.owner?.toLowerCase() === address?.toLowerCase()),
    [allAgents, address]
  )

  if (!isConnected) {
    return (
      <AppLayout><div className="max-w-4xl mx-auto text-center py-20">
        <AlertCircle className="w-16 h-16 text-accent-purple/40 mx-auto mb-4" />
        <h2 className="heading-md mb-3">Connect Your Wallet</h2>
        <p className="body text-text-muted">Connect to view your agents.</p>
      </div></AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto py-8 px-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="heading-md flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-accent-purple/10 flex items-center justify-center"><Brain className="w-5 h-5 text-accent-purple" /></div>
              My Agents
            </h1>
            <p className="body text-text-secondary mt-1">Agents you&apos;ve created and deployed on-chain</p>
          </div>
          <Link href="/studio" className="btn-primary text-sm py-2"><Plus className="w-4 h-4" /> Create Agent</Link>
        </div>

        {loadingAgents ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-text-muted animate-spin" /></div>
        ) : myAgents.length === 0 ? (
          <div className="text-center py-16 glass-card">
            <div className="w-16 h-16 rounded-2xl bg-accent-purple/10 flex items-center justify-center mx-auto mb-4">
              <Brain className="w-8 h-8 text-accent-purple/40" />
            </div>
            <h3 className="font-semibold mb-1">No Agents Yet</h3>
            <p className="body text-text-muted mb-4 max-w-md mx-auto">
              Create your first AI Agent and publish it on-chain. Subscribers will pay to access your Agent&apos;s skills.
            </p>
            <Link href="/studio" className="btn-primary text-sm inline-block"><Plus className="w-4 h-4" /> Create Your First Agent</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {myAgents.map(agent => (
              <div key={agent.id} className="glass-card glass-card-hover p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex gap-4 flex-1 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent-purple/20 to-accent-cyan/10 border border-white/10 flex items-center justify-center flex-shrink-0">
                      <Brain className="w-6 h-6 text-accent-purple" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{agent.metadata?.name || `Agent #${agent.id}`}</h3>
                      <p className="text-sm text-text-muted line-clamp-1 mt-0.5">{agent.metadata?.description}</p>
                      <div className="flex flex-wrap gap-3 text-xs text-text-muted mt-2">
                        <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> ID #{agent.id}</span>
                        {agent.metadata?.pricing && (
                          <span className="flex items-center gap-1">
                            <span className="text-accent-cyan">{agent.metadata.pricing.amount} {agent.metadata.pricing.currency}</span>
                          </span>
                        )}
                        <span className="px-1.5 py-0.5 rounded bg-white/5 text-text-muted">
                          {agent.metadata?.pricing?.type || 'subscription'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Link href={`/marketplace/agent/${agent.id}`} className="btn-secondary text-xs py-1.5 px-3"><Eye className="w-3.5 h-3.5" /> View</Link>
                    <Link href={`/user/chat/${agent.id}`} className="btn-primary text-xs py-1.5 px-3"><Edit3 className="w-3.5 h-3.5" /> Chat</Link>
                  </div>
                </div>
                {(agent.metadata?.tags) && (
                  <div className="flex gap-1 mt-3">
                    {(agent.metadata.tags as string[]).slice(0, 5).map((t: string) => (
                      <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-text-muted">{t}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
