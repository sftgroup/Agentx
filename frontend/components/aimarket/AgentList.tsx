// components/aimarket/AgentList.tsx
'use client'

import { AgentInfo } from '@/hooks/aimarket/useAgentRegistry'
import { AgentCard } from './AgentCard'
import { RefreshCw, AlertCircle, Info } from 'lucide-react'

interface AgentListProps {
  agents: AgentInfo[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  totalAgents: number
  loadedCount: number
  errorCount: number
  onRetry?: () => void
}

export function AgentList({ 
  agents, 
  isLoading, 
  isError, 
  error, 
  totalAgents, 
  loadedCount, 
  errorCount,
  onRetry 
}: AgentListProps) {
  // 错误状态
  if (isError) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-red-600" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          加载 Agent 数据失败
        </h3>
        <p className="text-gray-600 mb-4 max-w-md mx-auto">
          {error?.message || '无法连接到区块链网络，请检查网络连接和合约配置'}
        </p>
        <button
          onClick={onRetry}
          className="btn-primary flex items-center gap-2 mx-auto"
        >
          <RefreshCw className="w-4 h-4" />
          重试加载
        </button>
      </div>
    )
  }

  // 加载状态
  if (isLoading && agents.length === 0) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, index) => (
            <div key={index} className="card p-6 animate-pulse">
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
          ))}
        </div>
        
        <div className="text-center py-4">
          <div className="flex items-center justify-center gap-2 text-gray-500">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>正在从区块链加载 Agent 数据...</span>
          </div>
        </div>
      </div>
    )
  }

  // 空状态
  if (agents.length === 0 && !isLoading) {
    return (
      <div className="text-center py-12">
        <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Info className="w-10 h-10 text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          暂无 AI Agent
        </h3>
        <p className="text-gray-600 max-w-md mx-auto mb-6">
          当前市场上还没有注册的 AI Agent。成为第一个创建者，或者稍后再来查看。
        </p>
        <div className="flex gap-3 justify-center">
          <button className="btn-primary">
            创建第一个 Agent
          </button>
          <button 
            onClick={onRetry}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            刷新
          </button>
        </div>
      </div>
    )
  }

  const loadedAgents = agents.filter(agent => agent.isLoaded)
  const loadingAgents = agents.filter(agent => !agent.isLoaded && !agent.hasError)
  const errorAgents = agents.filter(agent => agent.hasError)

  return (
    <div className="space-y-6">
      {/* 统计信息 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            AI Agent 市场
          </h2>
          <div className="flex flex-wrap items-center gap-4 mt-1 text-sm text-gray-600">
            <span>显示 {loadedAgents.length} 个 Agent</span>
            {totalAgents > 0 && (
              <span>（共 {totalAgents} 个注册）</span>
            )}
            {errorCount > 0 && (
              <span className="text-red-600">（{errorCount} 个加载失败）</span>
            )}
          </div>
        </div>
        
        {/* 状态指示器 */}
        <div className="flex flex-wrap gap-2">
          {loadingAgents.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>加载中 {loadingAgents.length} 个</span>
            </div>
          )}
          
          {errorCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1 bg-red-50 text-red-700 rounded-full text-sm">
              <AlertCircle className="w-3 h-3" />
              <span>{errorCount} 个失败</span>
            </div>
          )}
        </div>
      </div>

      {/* Agent 网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loadedAgents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
        
        {/* 显示正在加载的卡片 */}
        {loadingAgents.map((agent) => (
          <div key={agent.id} className="card p-6 animate-pulse">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gray-200 rounded-lg"></div>
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-24"></div>
                  <div className="h-3 bg-gray-200 rounded w-32"></div>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-3 bg-gray-200 rounded w-full"></div>
              <div className="h-3 bg-gray-200 rounded w-3/4"></div>
            </div>
            <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-200">
              <div className="h-4 bg-gray-200 rounded w-20"></div>
              <div className="h-4 bg-gray-200 rounded w-16"></div>
            </div>
          </div>
        ))}
      </div>

      {/* 加载更多提示 */}
      {loadedCount < totalAgents && (
        <div className="text-center py-8">
          <div className="flex items-center justify-center gap-3 text-gray-600 mb-4">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>正在加载更多 Agent...</span>
          </div>
          <p className="text-sm text-gray-500">
            已加载 {loadedCount} 个，共 {totalAgents} 个 Agent
          </p>
        </div>
      )}

      {/* 没有更多内容的提示 */}
      {loadedCount > 0 && loadedCount === totalAgents && totalAgents > 0 && (
        <div className="text-center py-8 text-gray-500 border-t border-gray-200">
          <Info className="w-5 h-5 inline-block mr-2" />
          已显示所有 {totalAgents} 个 Agent
        </div>
      )}

      {/* 错误 Agent 汇总 */}
      {errorCount > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-yellow-600" />
            <h4 className="font-medium text-yellow-800">
              部分 Agent 加载失败
            </h4>
          </div>
          <p className="text-sm text-yellow-700 mb-2">
            有 {errorCount} 个 Agent 无法正确加载，可能是网络问题或元数据配置错误。
          </p>
          <button 
            onClick={onRetry}
            className="text-sm text-yellow-800 hover:text-yellow-900 font-medium flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            重试加载失败的 Agent
          </button>
        </div>
      )}
    </div>
  )
}
