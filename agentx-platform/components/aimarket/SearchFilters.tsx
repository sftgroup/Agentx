// components/aimarket/SearchFilters.tsx
'use client'

import { useState, useMemo } from 'react'
import { Search, Filter, X, ChevronDown, SlidersHorizontal } from 'lucide-react'
import { SearchFilters as SearchFiltersType } from '@/hooks/aimarket/useAgentSearch'

interface SearchFiltersProps {
  filters: SearchFiltersType
  availableTags: string[]
  availablePricingTypes: Array<'subscription' | 'pay_per_use'>
  onQueryChange: (query: string) => void
  onTagsChange: (tags: string[]) => void
  onPricingTypeChange: (type: SearchFiltersType['pricingType']) => void
  onSortByChange: (sortBy: SearchFiltersType['sortBy']) => void
  onReset: () => void
  hasActiveFilters: boolean
  resultStats: {
    total: number
    filtered: number
    visible: number
  }
}

export function SearchFilters({
  filters,
  availableTags,
  availablePricingTypes,
  onQueryChange,
  onTagsChange,
  onPricingTypeChange,
  onSortByChange,
  onReset,
  hasActiveFilters,
  resultStats
}: SearchFiltersProps) {
  const [showFilters, setShowFilters] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>(filters.tags)

  const handleTagToggle = (tag: string) => {
    const newTags = selectedTags.includes(tag)
      ? selectedTags.filter(t => t !== tag)
      : [...selectedTags, tag]
    
    setSelectedTags(newTags)
    onTagsChange(newTags)
  }

  const clearAllFilters = () => {
    setSelectedTags([])
    onReset()
    setShowFilters(false)
  }

  const sortOptions = [
    { value: 'newest', label: '最新发布' },
    { value: 'oldest', label: '最早发布' },
    { value: 'name', label: '名称 A-Z' },
    { value: 'name_desc', label: '名称 Z-A' }
  ]

  const pricingTypeOptions = [
    { value: 'all', label: '所有类型' },
    { value: 'subscription', label: '订阅制' },
    { value: 'pay_per_use', label: '按次付费' }
  ]

  // 结果统计文本
  const resultsText = useMemo(() => {
    if (resultStats.filtered === resultStats.total) {
      return `显示全部 ${resultStats.total} 个 Agent`
    } else {
      return `显示 ${resultStats.filtered} 个结果（共 ${resultStats.total} 个）`
    }
  }, [resultStats])

  return (
    <div className="space-y-4">
      {/* 搜索栏和操作栏 */}
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
        <div className="flex-1 w-full lg:max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="搜索 AI Agent 名称、描述或标签..."
              value={filters.query}
              onChange={(e) => onQueryChange(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            />
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          {/* 排序选择 */}
          <div className="relative">
            <select
              value={filters.sortBy}
              onChange={(e) => onSortByChange(e.target.value as SearchFiltersType['sortBy'])}
              className="w-full lg:w-48 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-white pr-10"
            >
              {sortOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
          </div>

          {/* 过滤器按钮 */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center justify-center gap-2 px-4 py-3 border rounded-lg transition-colors ${
              showFilters || hasActiveFilters
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>筛选</span>
            {hasActiveFilters && (
              <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
            )}
          </button>

          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="flex items-center justify-center gap-2 px-4 py-3 text-gray-600 hover:text-gray-800 hover:bg-gray-50 border border-gray-300 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
              <span>清除</span>
            </button>
          )}
        </div>
      </div>

      {/* 结果统计 */}
      <div className="text-sm text-gray-600">
        {resultsText}
        {resultStats.visible < resultStats.filtered && (
          <span className="text-gray-400 ml-2">
            （显示前 {resultStats.visible} 个）
          </span>
        )}
      </div>

      {/* 扩展过滤器 */}
      {showFilters && (
        <div className="card p-6 space-y-6 animate-in fade-in duration-200">
          {/* 价格类型过滤 */}
          <div>
            <h4 className="font-medium text-gray-900 mb-3">价格类型</h4>
            <div className="flex flex-wrap gap-3">
              {pricingTypeOptions.map((type) => (
                <button
                  key={type.value}
                  onClick={() => onPricingTypeChange(type.value as SearchFiltersType['pricingType'])}
                  className={`px-4 py-2 rounded-lg border transition-colors text-sm font-medium ${
                    filters.pricingType === type.value
                      ? 'bg-blue-50 border-blue-200 text-blue-700'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* 标签过滤 */}
          {availableTags.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-gray-900">标签</h4>
                {selectedTags.length > 0 && (
                  <button
                    onClick={() => {
                      setSelectedTags([])
                      onTagsChange([])
                    }}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    清除选择
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1">
                {availableTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => handleTagToggle(tag)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                      selectedTags.includes(tag)
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
              {availableTags.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">
                  暂无可用标签
                </p>
              )}
            </div>
          )}

          {/* 可用价格类型提示 */}
          {availablePricingTypes.length > 0 && (
            <div className="text-xs text-gray-500">
              当前可用的价格类型: {availablePricingTypes.map(type => 
                type === 'subscription' ? '订阅制' : '按次付费'
              ).join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
