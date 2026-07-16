// components/aimarket/AgentCard.tsx
'use client'

import Link from 'next/link'
import { AgentInfo } from '@/hooks/aimarket/useAgentRegistry'
import { useAgentReputation } from '@/components/agent/hooks/useReputation'
import { Brain, Star, Users, Zap, AlertCircle, ExternalLink, Calendar, Tag, Code } from 'lucide-react'
import { useState, useEffect } from 'react'

interface AgentCardProps {
  agent: AgentInfo
}

// 定义 IPFS 元数据接口 - 根据实际数据结构调整
interface IPFSMetadata {
  name: string
  description: string
  image?: string
  tags?: string[]
  capabilities?: string[]
  website?: string
  github?: string
  pricing?: {
    type: 'subscription' | 'pay_per_use'
    amount: string
    currency: string
    period?: string
  }
  attributes?: Record<string, any>
  created?: string
  version?: string
}

export function AgentCard({ agent }: AgentCardProps) {
  const { id, metadata, isLoaded, hasError, errorMessage, hasSubscriptionPlans } = agent
  const { data: reputationData } = useAgentReputation(id)
  const [isClickable, setIsClickable] = useState<boolean>(true)

  // 如果agent还没有加载完成，禁用点击
  useEffect(() => {
    setIsClickable(isLoaded && !hasError)
  }, [isLoaded, hasError])

  // 处理错误状态
  if (hasError) {
    return (
      <div className="card p-6 border-red-200 bg-red-50">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-lg">
                Agent #{id}
              </h3>
              <p className="text-sm text-gray-500">加载失败</p>
            </div>
          </div>
        </div>
        
        <div className="text-sm text-red-700 bg-red-100 p-3 rounded-lg">
          <p className="font-medium mb-1">无法加载此 Agent</p>
          <p className="text-xs opacity-75">{errorMessage || '未知错误'}</p>
        </div>
        
        <div className="flex justify-between items-center mt-4 pt-4 border-t border-red-200">
          <span className="text-xs text-red-600">ID: #{id}</span>
          <button 
            onClick={() => window.location.reload()}
            className="text-xs text-red-600 hover:text-red-800 font-medium"
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  // 处理加载状态
  if (!isLoaded) {
    return (
      <div className="card p-6 animate-pulse">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gray-200 rounded-lg"></div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded w-24"></div>
              <div className="h-3 bg-gray-200 rounded w-32"></div>
            </div>
          </div>
          <div className="h-4 bg-gray-200 rounded w-16"></div>
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-gray-200 rounded w-full"></div>
          <div className="h-3 bg-gray-200 rounded w-3/4"></div>
        </div>
        <div className="flex gap-2 mt-4">
          <div className="h-6 bg-gray-200 rounded w-16"></div>
          <div className="h-6 bg-gray-200 rounded w-20"></div>
        </div>
        <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-200">
          <div className="h-4 bg-gray-200 rounded w-20"></div>
          <div className="h-4 bg-gray-200 rounded w-16"></div>
        </div>
      </div>
    )
  }

  // 处理没有元数据的情况
  if (!metadata) {
    return (
      <div className="card p-6 border-yellow-200 bg-yellow-50">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Brain className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-lg">
                Agent #{id}
              </h3>
              <p className="text-sm text-gray-500">无元数据</p>
            </div>
          </div>
        </div>
        
        <p className="text-sm text-yellow-700 mb-4">
          此 Agent 没有配置元数据信息
        </p>
        
        <div className="flex justify-between items-center mt-4 pt-4 border-t border-yellow-200">
          <span className="text-xs text-yellow-600">ID: #{id}</span>
          <Link 
            href={`/marketplace/agent/${id}`}
            className="text-xs text-yellow-600 hover:text-yellow-800 font-medium flex items-center gap-1"
          >
            查看详情 <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>
    )
  }

  // 解析 IPFS 元数据 - 根据实际数据结构调整
  const parseIPFSMetadata = (metadata: any): IPFSMetadata => {
    // 如果存在 attributes 字段，优先使用其中的数据
    if (metadata.attributes) {
      const attributes = metadata.attributes
      
      // 从 attributes 中提取标签（排除已知的特定字段）
      const excludedKeys = ['name', 'description', 'image', 'website', 'github', 'created', 'version', 'prompt']
      const tags = Object.keys(attributes)
        .filter(key => !excludedKeys.includes(key))
        .slice(0, 5)
      
      // 从 attributes 中提取能力信息
      const capabilities = Object.entries(attributes)
        .filter(([key, value]) => 
          typeof value === 'string' && 
          value.length < 100 && // 限制长度
          !['name', 'description', 'prompt'].includes(key)
        )
        .slice(0, 3)
        .map(([key, value]) => `${key}: ${value}`)
      
      return {
        // 优先使用 attributes 中的 name 和 description
        name: attributes.name || metadata.name || `Agent #${id}`,
        description: attributes.description || metadata.description || 'AI Agent 服务',
        image: metadata.image,
        tags: metadata.tags || tags,
        capabilities: metadata.capabilities || capabilities,
        website: metadata.website,
        github: metadata.github,
        pricing: metadata.pricing,
        attributes: attributes,
        created: metadata.created,
        version: metadata.version
      }
    }
    
    // 如果没有 attributes 字段，使用默认解析
    return {
      name: metadata.name || `Agent #${id}`,
      description: metadata.description || 'AI Agent 服务',
      image: metadata.image,
      tags: metadata.tags || [],
      capabilities: metadata.capabilities || [],
      website: metadata.website,
      github: metadata.github,
      pricing: metadata.pricing,
      attributes: metadata.attributes || {},
      created: metadata.created,
      version: metadata.version
    }
  }

  const parsedMetadata = parseIPFSMetadata(metadata)
  const { 
    name, 
    description, 
    image, 
    tags, 
    pricing, 
    capabilities, 
    website, 
    github,
    attributes,
    created,
    version
  } = parsedMetadata

  // 计算评分和评论数
  const rating = reputationData?.rating || 0
  const reviewCount = reputationData?.reviewCount || 0
  const displayRating = rating > 0 ? (rating / 20).toFixed(1) : '0.0'
  const displayReviewCount = reviewCount > 0 ? reviewCount : 0

  // 确定订阅状态显示
  const getSubscriptionStatus = () => {
    if (hasSubscriptionPlans === true) {
      return { text: "可订阅", title: "提供订阅计划" }
    }
    
    if (pricing) {
      return { text: "可订阅", title: "提供付费计划" }
    }
    
    return { text: "免费", title: "暂无订阅计划" }
  }

  const subscriptionStatus = getSubscriptionStatus()

  // 格式化创建时间
  const formatCreatedTime = (created: string) => {
    try {
      return new Date(created).toLocaleDateString('zh-CN')
    } catch {
      return '未知时间'
    }
  }

  const CardContent = () => (
    <div className="card p-6 hover:shadow-md transition-all duration-200 hover:border-blue-200 group">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
            {image ? (
              <img 
                src={image} 
                alt={name}
                className="w-12 h-12 rounded-lg object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.style.display = 'none'
                }}
              />
            ) : null}
            {!image && <Brain className="w-6 h-6 text-white" />}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-gray-900 text-lg truncate" title={name}>
              {name}
            </h3>
            <p className="text-sm text-gray-500 truncate">ID: #{id}</p>
          </div>
        </div>
        
        {/* Pricing Badge */}
        {pricing && (
          <div className="flex flex-col items-end flex-shrink-0 ml-2">
            <span className="text-sm font-medium text-gray-900 whitespace-nowrap">
              {pricing.amount} {pricing.currency}
            </span>
            <span className="text-xs text-gray-500 capitalize whitespace-nowrap">
              {pricing.type === 'subscription' ? (pricing.period || '订阅') : '按次付费'}
            </span>
          </div>
        )}
      </div>

      {/* Description */}
      <p className="text-gray-600 text-sm mb-4 line-clamp-2 min-h-[2.5rem]" title={description}>
        {description}
      </p>

      {/* 元数据信息 */}
      <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
        {/* 版本号 */}
        {version && (
          <div className="flex items-center gap-1" title={`版本 ${version}`}>
            <Code className="w-3 h-3" />
            <span>v{version}</span>
          </div>
        )}
        
        {/* 创建时间 */}
        {created && (
          <div className="flex items-center gap-1" title={`创建于 ${formatCreatedTime(created)}`}>
            <Calendar className="w-3 h-3" />
            <span>{formatCreatedTime(created)}</span>
          </div>
        )}
        
        {/* 标签数量 */}
        {tags && tags.length > 0 && (
          <div className="flex items-center gap-1" title={`${tags.length} 个标签`}>
            <Tag className="w-3 h-3" />
            <span>{tags.length}</span>
          </div>
        )}
      </div>

      {/* Tags - 从 attributes 中提取的标签 */}
      {tags && tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {tags.slice(0, 3).map((tag: string, index: number) => (
            <span
              key={index}
              className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-md font-medium whitespace-nowrap"
            >
              {tag}
            </span>
          ))}
          {tags.length > 3 && (
            <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md whitespace-nowrap">
              +{tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Capabilities - 从 attributes 中提取的能力 */}
      {capabilities && capabilities.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
          <div className="flex items-center gap-1">
            <Zap className="w-3 h-3" />
            <span>{capabilities.length} 个能力</span>
          </div>
        </div>
      )}

      {/* 显示重要的 attributes 信息 */}
      {attributes && (
        <div className="space-y-2 mb-4">
          {/* 显示 prompt 如果存在 */}
          {attributes.prompt && (
            <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
              <div className="font-medium mb-1">提示词:</div>
              <div className="line-clamp-2">{attributes.prompt}</div>
            </div>
          )}
        </div>
      )}

      {/* External Links */}
      {(website || github) && (
        <div className="flex gap-3 mb-4">
          {website && (
            <a 
              href={website} 
              target="_blank" 
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              网站
            </a>
          )}
          {github && (
            <a 
              href={github} 
              target="_blank" 
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-gray-600 hover:text-gray-800 flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              GitHub
            </a>
          )}
        </div>
      )}

      {/* Footer Stats */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
        <div className="flex items-center gap-4 text-xs text-gray-500">
          {/* 订阅计划状态 */}
          <div className="flex items-center gap-1" title={subscriptionStatus.title}>
            <Users className="w-3 h-3" />
            <span>{subscriptionStatus.text}</span>
          </div>
          
          {/* 评分 */}
          <div className="flex items-center gap-1" title={`评分: ${displayRating} (${displayReviewCount} 条评论)`}>
            <Star className="w-3 h-3" />
            <span>{displayRating}</span>
            {displayReviewCount > 0 && (
              <span className="text-gray-400">({displayReviewCount})</span>
            )}
          </div>
        </div>
        
        <div className="text-xs text-blue-600 font-medium group-hover:text-blue-700 flex items-center gap-1">
          查看详情 <ExternalLink className="w-3 h-3" />
        </div>
      </div>
    </div>
  )

  // 根据是否可点击返回不同的包装
  if (isClickable) {
    return (
      <Link href={`/marketplace/agent/${id}`} className="block">
        <CardContent />
      </Link>
    )
  }

  // 如果不可点击，直接显示内容
  return <CardContent />
}

