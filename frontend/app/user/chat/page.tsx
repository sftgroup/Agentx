// app/user/chat/page.tsx — My Chats: pick an agent you own or have
// subscribed to and start a conversation (orchestration happens in the chat)
'use client'

import { AppLayout } from '@/components/layout/AppLayout'
import { useMyAgentIds } from '@/hooks/user/useMyAgentIds'
import { useAgentRegistry } from '@/hooks/aimarket/useAgentRegistry'
import { useAccount } from 'wagmi'
import { useMemo } from 'react'
import Link from 'next/link'
import { Brain, MessageSquare, Loader2, AlertTriangle, ArrowRight } from 'lucide-react'

export default function MyChatsPage() {
  const { address, isConnected } = useAccount()
  const { myAgentIds, isLoading: loadingIds } = useMyAgentIds()
  const { agents, isLoading: loadingAgents } = useAgentRegistry(200)

  // Agents the user may chat with: owned OR actively subscribed
  const chatAgents = useMemo(() => agents.filter(a => myAgentIds.has(a.id)), [agents, myAgentIds])

  const isLoading = loadingIds || loadingAgents

  if (!isConnected) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto text-center py-20">
          <AlertTriangle className="w-16 h-16 text-accent-purple/40 mx-auto mb-4" />
          <h2 className="heading-md mb-3">Connect Your Wallet</h2>
          <p className="body text-text-muted">Connect to chat with your agents.</p>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto py-8 px-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="heading-md flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-accent-purple/10 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-accent-purple" />
              </div>
              My Chats
            </h1>
            <p className="body text-text-secondary mt-1">Chat with agents you own or have subscribed to</p>
          </div>
          <Link href="/marketplace" className="btn-primary text-sm py-2">
            <Brain className="w-4 h-4" /> Browse Marketplace
          </Link>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-text-muted animate-spin" />
          </div>
        ) : chatAgents.length === 0 ? (
          <div className="text-center py-16 glass-card">
            <Brain className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-30" />
            <h3 className="font-semibold mb-1">No agents to chat with</h3>
            <p className="body text-text-muted mb-4">
              Create your own agent in Studio or subscribe to one from the marketplace.
            </p>
            <Link href="/studio" className="btn-primary text-sm inline-block">Create an Agent</Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {chatAgents.map(a => {
              const isOwned = a.owner?.toLowerCase() === address?.toLowerCase()
              return (
                <Link key={a.id} href={`/user/chat/${a.id}`} className="glass-card-hover p-5 rounded-xl group">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-accent-purple/10 flex items-center justify-center flex-shrink-0">
                      <Brain className="w-5 h-5 text-accent-purple" />
                    </div>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                      isOwned ? 'bg-accent-cyan/10 text-accent-cyan' : 'bg-accent-purple/10 text-accent-purple'
                    }`}>
                      {isOwned ? 'Owned' : 'Subscribed'}
                    </span>
                  </div>
                  <h3 className="font-semibold truncate mb-1">{a.name || `Agent #${a.id}`}</h3>
                  <p className="text-xs text-text-muted mb-4 min-h-[2rem] truncate">
                    {a.description ? (a.description.length > 90 ? `${a.description.slice(0, 90)}…` : a.description) : 'No description'}
                  </p>
                  <div className="flex items-center gap-1 text-xs text-accent-purple group-hover:gap-2 transition-all">
                    Start chatting <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
