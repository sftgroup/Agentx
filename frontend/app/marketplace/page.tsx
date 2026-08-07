// app/marketplace/page.tsx — Glassmorphism Dark
'use client'

import { AppLayout } from '@/components/layout/AppLayout'
import { useAgentRegistry } from '@/hooks/aimarket/useAgentRegistry'
import { useAgentSearch } from '@/hooks/aimarket/useAgentSearch'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Brain, Search, Sparkles, Tag, ArrowRight, Star, Filter, X, ChevronDown, Wrench } from 'lucide-react'
import Link from 'next/link'

export default function MarketplacePage() {
  const { t } = useTranslation()
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 12

  const { agents, isLoading, totalAgents, loadedCount, refetch } = useAgentRegistry(pageSize * currentPage)
  const { filteredAgents, availableTags, availableCategories, filters, setQuery, setTags, setCategory, setSortBy, resetFilters, hasActiveFilters, resultStats } = useAgentSearch(agents)

  const [searchText, setSearchText] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  const CATEGORY_LABELS: Record<string, string> = {
    operations: '运营', 'customer-service': '客服', sales: '销售',
    'personal-assistant': '个人助理', coding: '写代码', 'server-monitoring': '服务器监控',
    airdrop: '空投', 'quant-trading': '量化', 'data-analysis': '数据分析',
    content: '内容', security: '安全', finance: '金融', other: '其他',
  }

  const handleSearch = (v: string) => { setSearchText(v); setQuery(v) }
  const toggleTag = (tag: string) => {
    const next = selectedTags.includes(tag) ? selectedTags.filter(t => t !== tag) : [...selectedTags, tag]
    setSelectedTags(next); setTags(next)
  }
  const handleReset = () => {
    setSearchText('')
    setSelectedTags([])
    resetFilters()
  }

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto py-8 px-6 space-y-8">
        {/* Hero */}
        <div className="text-center py-8">
          <div className="flex items-center justify-center gap-4 mb-4">
            <Link href="/marketplace/skills"
              className="btn-secondary text-sm flex items-center gap-2">
              <Wrench className="w-4 h-4" /> Skills Marketplace
            </Link>
          </div>
          <h1 className="heading-lg mb-3">{t('marketplace.title')} <span className="gradient-text">{t('marketplace.titleHighlight')}</span></h1>
          <p className="body text-text-secondary max-w-lg mx-auto">
            {t('marketplace.desc')}
          </p>
        </div>

        {/* Search bar */}
        <div className="relative max-w-2xl mx-auto">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
          <input
            type="text" value={searchText} onChange={e => handleSearch(e.target.value)}
            placeholder={t('common.search')}
            className="w-full pl-12 pr-4 py-3.5 bg-white/5 border border-white/5 rounded-2xl text-sm focus:outline-none focus:border-accent-purple/40 focus:bg-white/8 transition-all placeholder:text-text-muted"
          />
        </div>

        {/* Application category tabs */}
        <div className="flex flex-wrap items-center gap-2 justify-center">
          <button onClick={() => setCategory('')}
            className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${!filters.category ? 'bg-accent-purple/20 text-accent-purple border-accent-purple/30' : 'bg-white/3 border-white/5 text-text-muted hover:text-text-secondary hover:border-white/10'}`}>
            全部应用
          </button>
          {availableCategories.map(cat => (
            <button key={cat} onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${filters.category === cat ? 'bg-accent-purple/20 text-accent-purple border-accent-purple/30' : 'bg-white/3 border-white/5 text-text-muted hover:text-text-secondary hover:border-white/10'}`}>
              {CATEGORY_LABELS[cat] || cat}
            </button>
          ))}
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
              <button onClick={handleReset} className="px-3 py-1.5 rounded-full text-xs border border-red-400/20 text-red-400/80 hover:text-red-400 transition-colors flex items-center gap-1">
                <X className="w-3 h-3" /> {t('common.clear')}
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
            <h3 className="font-semibold mb-1">{t('common.noAgents')}</h3>
            <p className="body text-text-muted">{hasActiveFilters ? t('common.noAgentsFilterHint') : t('common.noAgentsHint')}</p>
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
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/8 text-text-secondary">
                      {CATEGORY_LABELS[agent.metadata?.category || 'other'] || agent.metadata?.category || '其他'}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      agent.metadata?.pricing?.type === 'subscription' ? 'bg-accent-cyan/10 text-accent-cyan' : 'bg-accent-purple/10 text-accent-purple'
                    }`}>
                      {agent.metadata?.pricing?.type === 'subscription' ? t('common.subscription') : t('common.payPerUse')}
                    </span>
                  </div>
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
                    {agent.metadata?.pricing?.amount ? `${agent.metadata.pricing.amount} ETH` : t('common.free')}
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
