// hooks/aimarket/useAgentSearch.ts
'use client'

import { useState, useMemo, useCallback } from 'react'
import { AgentInfo } from './useAgentRegistry'

export interface SearchFilters {
  query: string
  tags: string[]
  pricingType: 'all' | 'subscription' | 'pay_per_use'
  sortBy: 'newest' | 'oldest' | 'name' | 'name_desc'
}

export interface UseAgentSearchReturn {
  filteredAgents: AgentInfo[]
  filters: SearchFilters
  availableTags: string[]
  availablePricingTypes: Array<'subscription' | 'pay_per_use'>
  setQuery: (query: string) => void
  setTags: (tags: string[]) => void
  setPricingType: (type: SearchFilters['pricingType']) => void
  setSortBy: (sortBy: SearchFilters['sortBy']) => void
  resetFilters: () => void
  hasActiveFilters: boolean
  resultStats: {
    total: number
    filtered: number
    visible: number
  }
}

export function useAgentSearch(agents: AgentInfo[]): UseAgentSearchReturn {
  const [filters, setFilters] = useState<SearchFilters>({
    query: '',
    tags: [],
    pricingType: 'all',
    sortBy: 'newest'
  })

  // 过滤和搜索逻辑 - 修复：显示所有已加载的Agent，包括没有元数据的
  const filteredAgents = useMemo(() => {
    if (!agents.length) return []

    return agents
      .filter(agent => {
        // 只显示已加载完成且没有错误的 Agent
        // 修复：允许没有元数据的Agent显示
        if (!agent.isLoaded || agent.hasError) return false

        const { query, tags, pricingType } = filters
        const metadata = agent.metadata

        // 文本搜索 - 修复：允许通过ID搜索没有元数据的Agent
        if (query.trim()) {
          const searchText = query.toLowerCase().trim()
          
          // 如果没有元数据，只能通过ID搜索
          if (!metadata) {
            return agent.id.toString().includes(searchText)
          }

          const nameMatch = metadata.name.toLowerCase().includes(searchText)
          const descMatch = metadata.description.toLowerCase().includes(searchText)
          const tagMatch = metadata.tags?.some(tag => 
            tag.toLowerCase().includes(searchText)
          )
          const idMatch = agent.id.toString().includes(searchText)
          
          if (!nameMatch && !descMatch && !tagMatch && !idMatch) {
            return false
          }
        }

        // 标签过滤 - 修复：没有元数据的Agent不参与标签过滤
        if (tags.length > 0) {
          if (!metadata) return false // 没有元数据的Agent没有标签
          const hasAllTags = tags.every(tag => 
            metadata.tags?.includes(tag)
          )
          if (!hasAllTags) return false
        }

        // 价格类型过滤 - 修复：没有元数据的Agent不参与价格过滤
        if (pricingType !== 'all') {
          if (!metadata || !metadata.pricing) return false
          if (metadata.pricing.type !== pricingType) {
            return false
          }
        }

        return true
      })
      .sort((a, b) => {
        const metadataA = a.metadata
        const metadataB = b.metadata

        // 如果没有元数据，排到最后
        if (!metadataA && !metadataB) return 0
        if (!metadataA) return 1
        if (!metadataB) return -1

        switch (filters.sortBy) {
          case 'name':
            return (metadataA.name || '').localeCompare(metadataB.name || '')
          
          case 'name_desc':
            return (metadataB.name || '').localeCompare(metadataA.name || '')
          
          case 'oldest':
            return a.id - b.id
          
          case 'newest':
          default:
            return b.id - a.id
        }
      })
  }, [agents, filters])

  // 获取所有可用的标签 - 修复：只从有元数据的Agent获取
  const availableTags = useMemo(() => {
    const tags = new Set<string>()
    agents.forEach(agent => {
      if (agent.metadata?.tags) {
        agent.metadata.tags.forEach(tag => tags.add(tag))
      }
    })
    return Array.from(tags).sort()
  }, [agents])

  // 获取所有可用的价格类型 - 修复：只从有元数据的Agent获取
  const availablePricingTypes = useMemo(() => {
    const types = new Set<'subscription' | 'pay_per_use'>()
    agents.forEach(agent => {
      if (agent.metadata?.pricing?.type) {
        types.add(agent.metadata.pricing.type)
      }
    })
    return Array.from(types)
  }, [agents])

  // 更新搜索查询
  const setQuery = useCallback((query: string) => {
    setFilters(prev => ({ ...prev, query }))
  }, [])

  // 更新标签过滤
  const setTags = useCallback((tags: string[]) => {
    setFilters(prev => ({ ...prev, tags }))
  }, [])

  // 更新价格类型过滤
  const setPricingType = useCallback((pricingType: SearchFilters['pricingType']) => {
    setFilters(prev => ({ ...prev, pricingType }))
  }, [])

  // 更新排序方式
  const setSortBy = useCallback((sortBy: SearchFilters['sortBy']) => {
    setFilters(prev => ({ ...prev, sortBy }))
  }, [])

  // 重置所有过滤器
  const resetFilters = useCallback(() => {
    setFilters({
      query: '',
      tags: [],
      pricingType: 'all',
      sortBy: 'newest'
    })
  }, [])

  // 检查是否有活跃的过滤器
  const hasActiveFilters = useMemo(() => {
    return filters.query !== '' || 
           filters.tags.length > 0 || 
           filters.pricingType !== 'all'
  }, [filters])

  // 结果统计 - 修复：统计所有已加载的Agent
  const resultStats = useMemo(() => {
    const total = agents.filter(agent => agent.isLoaded && !agent.hasError).length
    const filtered = filteredAgents.length
    const visible = Math.min(filtered, 100) // 限制显示数量
    
    return { total, filtered, visible }
  }, [agents, filteredAgents])

  return {
    filteredAgents: filteredAgents.slice(0, 100), // 限制显示数量
    filters,
    availableTags,
    availablePricingTypes,
    setQuery,
    setTags,
    setPricingType,
    setSortBy,
    resetFilters,
    hasActiveFilters,
    resultStats
  }
}
