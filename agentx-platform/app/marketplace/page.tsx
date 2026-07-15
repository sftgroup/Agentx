// app/marketplace/page.tsx — Glassmorphism Dark
'use client'

import { AppLayout } from '@/components/layout/AppLayout'
import { useAgentRegistry } from '@/hooks/aimarket/useAgentRegistry'
import { useAgentSearch } from '@/hooks/aimarket/useAgentSearch'
import { useAccount, useChainId } from 'wagmi'
import { useState, useEffect, useCallback } from 'react'
import { Brain, Search, Sparkles, Tag, ArrowRight, Star, Filter, X, ChevronDown } from 'lucide-react'
import Link from 'next/link'

export default function MarketplacePage() {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 12

  const { agents, isLoading, totalAgents, loadedCount, refetch } = useAgentRegistry(pageSize * currentPage)
  const { filteredAgents, availableTags, setQuery, setTags, setSortBy, resetFilters, hasActiveFilters, resultStats } = useAgentSearch(agents)

  const [searchText, setSearchText] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  const handleSearch = (v: string) => { setSearchText(v); setQuery(v) }
  const toggleTag = (tag: string) => {
    const next = selectedTags.includes(tag) ? selectedTags.filter(t => t !== tag) : [...selectedTags, tag]
    setSelectedTags(next); setTags(next)
  }

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto py-8 px-6 space-y-8">
        {/* Hero */}
        <div className="text-center py-8">
          <h1 className="heading-lg mb-3">Agent <span className="gradient-text">Marketplace</span></h1>
          <p className="body text-text-secondary max-w-lg mx-auto">
            Discover, subscribe to, and run AI agents created by developers worldwide. All powered by on-chain ownership.
          </p>
        </div>

        {/* Search bar */}
        <div className="relative max-w-2xl mx-auto">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
          <input
            type="text" value={searchText} onChange={e => handleSearch(e.target.value)}
            placeholder="Search agents by name, description, or tags..."
            className="w-full pl-12 pr-4 py-3.5 bg-white/5 border border-white/5 rounded-2xl text-sm focus:outline-none focus:border-accent-purple/40 focus:bg-white/8 transition-all placeholder:text-text-muted"
          />
        </div>

        {/* Filter tags */}
        {availableTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 justify-center">
            {availableTags.slice(0, 12).map(tag => (
              <button key={tag} onClick={() => toggleTag(tag)}
                className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                  selectedTags.includes(tag) ? 'bg-accent-purple/15 text-accent-purple border-accent-purple/20' : 'bg-white/3 border-white/5 text-text-muted hover:text-text-secondary hover:border-white/10'
                }`}>
                {tag}
              </button>
            ))}
            {hasActiveFilters && (
              <button onClick={resetFilters} className="px-3 py-1.5 rounded-full text-xs border border-red-400/20 text-red-400/80 hover:text-red-400 transition-colors flex items-center gap-1">
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
        )}

        {/* Agent grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="glass-card p-6 animate-pulse">
                <div className="w-12 h-12 rounded-xl bg-white/5 mb-4" />
                <div className="h-5 w-2/3 bg-white/5 rounded mb-2" />
                <div className="h-4 w-full bg-white/5 rounded mb-3" />
                <div className="flex gap-2 mb-4">
                  <div className="h-5 w-16 bg-white/5 rounded-full" />
                  <div className="h-5 w-12 bg-white/5 rounded-full" />
                </div>
                <div className="flex justify-between"><div className="h-4 w-20 bg-white/5 rounded" /><div className="h-4 w-16 bg-white/5 rounded" /></div>
              </div>
            ))}
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-accent-purple/10 flex items-center justify-center mx-auto mb-4"><Brain className="w-8 h-8 text-accent-purple/30" /></div>
            <h3 className="font-semibold mb-1">No Agents Found</h3>
            <p className="body text-text-muted">{hasActiveFilters ? 'Try adjusting your filters.' : 'Be the first to create one.'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAgents.map(agent => (
              <Link key={agent.id.toString()} href={`/marketplace/agent/${agent.id}`}
                className="glass-card glass-card-hover p-6 group block">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent-purple/20 to-accent-cyan/10 border border-white/5 flex items-center justify-center">
                    <Brain className="w-6 h-6 text-accent-purple" />
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    agent.metadata?.pricing?.type === 'subscription' ? 'bg-accent-cyan/10 text-accent-cyan' : 'bg-accent-purple/10 text-accent-purple'
                  }`}>
                    {agent.metadata?.pricing?.type === 'subscription' ? 'Subscription' : 'Pay-per-use'}
                  </span>
                </div>
                <h3 className="font-semibold mb-1.5 group-hover:text-accent-purple transition-colors truncate">
                  {agent.metadata?.name || `Agent #${agent.id}`}
                </h3>
                <p className="text-sm text-text-secondary line-clamp-2 mb-4 min-h-[40px]">
                  {agent.metadata?.description || 'No description'}
                </p>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {(agent.metadata?.tags || []).slice(0, 4).map((t: string) => (
                    <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-text-muted">{t}</span>
                  ))}
                </div>
                <div className="flex items-center justify-between text-xs text-text-muted pt-3 border-t border-white/5">
                  <span className="flex items-center gap-1"><Star className="w-3 h-3 text-yellow-400/70" /> 4.8</span>
                  <span className="flex items-center gap-1">
                    {agent.metadata?.pricing?.amount ? `${agent.metadata.pricing.amount} ETH` : 'Free'}
                    <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
