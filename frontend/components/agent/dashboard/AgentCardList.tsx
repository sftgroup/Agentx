// components/agent/dashboard/AgentCardList.tsx
// Agent卡片展示 + 技能管理
'use client'

import { Brain, Zap, Server, ExternalLink, Edit, Plus, DollarSign, Coins } from 'lucide-react'
import type { AgentCard, AgentSkill, A2ASkill } from '../hooks/useA2AProtocol'

interface AgentCardListProps {
  selectedAgentId: number | null
  isConnected: boolean
  isLoading: boolean
  agentCard: AgentCard | null
  agentSkills: AgentSkill[]
  allSkills: A2ASkill[]
  activeTab: 'cards' | 'skills'
  setActiveTab: (tab: 'cards' | 'skills') => void
  onEditCard: (card: AgentCard) => void
  onConfigureSkill: (skill: A2ASkill) => void
  onEditConfiguredSkill: (skill: AgentSkill) => void
  onCreateNew: () => void
  formatTimestamp: (timestamp: bigint) => string
  copyToClipboard: (text: string) => void
}

export function AgentCardList({
  selectedAgentId, isConnected, isLoading, agentCard, agentSkills,
  allSkills, activeTab, setActiveTab, onEditCard, onConfigureSkill,
  onEditConfiguredSkill, onCreateNew, formatTimestamp, copyToClipboard,
}: AgentCardListProps) {
  return (
    <>
      {/* 统计信息 */}
      {selectedAgentId && isConnected && (
        <div className="p-6 border-b border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-blue-50 rounded-xl p-6">
              <div className="flex items-center">
                <Brain className="w-8 h-8 text-blue-600 mr-4" />
                <div>
                  <p className="text-sm font-medium text-blue-600">Agent技能</p>
                  <p className="text-2xl font-bold text-blue-900">{agentSkills.length}</p>
                </div>
              </div>
            </div>
            <div className="bg-green-50 rounded-xl p-6">
              <div className="flex items-center">
                <Zap className="w-8 h-8 text-green-600 mr-4" />
                <div>
                  <p className="text-sm font-medium text-green-600">系统技能</p>
                  <p className="text-2xl font-bold text-green-900">{allSkills.length}</p>
                </div>
              </div>
            </div>
            <div className="bg-purple-50 rounded-xl p-6">
              <div className="flex items-center">
                <Server className="w-8 h-8 text-purple-600 mr-4" />
                <div>
                  <p className="text-sm font-medium text-purple-600">Agent卡片</p>
                  <p className="text-2xl font-bold text-purple-900">{agentCard ? 1 : 0}</p>
                </div>
              </div>
            </div>
            <div className="bg-orange-50 rounded-xl p-6">
              <div className="flex items-center">
                <ExternalLink className="w-8 h-8 text-orange-600 mr-4" />
                <div>
                  <p className="text-sm font-medium text-orange-600">可用能力</p>
                  <p className="text-2xl font-bold text-orange-900">
                    {agentCard ? (agentCard.capabilities?.length || 0) : 0}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 标签页导航 */}
      {selectedAgentId && isConnected && (
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('cards')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'cards'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Agent卡片
            </button>
            <button
              onClick={() => setActiveTab('skills')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'skills'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              技能管理
            </button>
          </nav>
        </div>
      )}

      {/* 标签页内容 */}
      {selectedAgentId && isConnected && (
        <div className="p-6">
          {/* ==================== Cards Tab ==================== */}
          {activeTab === 'cards' && (
            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Agent服务卡片</h3>
                    <p className="text-gray-600 mt-1">管理Agent的服务发现卡片</p>
                  </div>
                  {agentCard && (
                    <div className="flex gap-2">
                      <button
                        className="flex items-center gap-2 px-4 py-2 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                        onClick={() => onEditCard(agentCard)} disabled={isLoading}
                      >
                        <Edit className="w-4 h-4" />编辑
                      </button>
                    </div>
                  )}
                </div>

                {agentCard ? (
                  <div className="bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 p-8">
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <h4 className="text-xl font-bold text-gray-900">{agentCard.name}</h4>
                          <p className="text-gray-600 mt-2 text-lg">{agentCard.description}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                            agentCard.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {agentCard.isActive ? '活跃' : '未激活'}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-6 mb-6">
                        <div className="space-y-4">
                          <div>
                            <span className="text-sm font-medium text-gray-500">版本</span>
                            <p className="text-gray-900 font-mono">{agentCard.version}</p>
                          </div>
                          <div>
                            <span className="text-sm font-medium text-gray-500">通信协议</span>
                            <p className="text-gray-900">{agentCard.communicationProtocol}</p>
                          </div>
                          <div>
                            <span className="text-sm font-medium text-gray-500">卡片ID</span>
                            <p className="text-gray-900 font-mono">#{agentCard.cardId.toString()}</p>
                          </div>
                        </div>
                        <div className="space-y-4">
                          <div>
                            <span className="text-sm font-medium text-gray-500">认证方式</span>
                            <p className="text-gray-900">{agentCard.authenticationMethod}</p>
                          </div>
                          <div>
                            <span className="text-sm font-medium text-gray-500">Agent ID</span>
                            <p className="text-gray-900 font-mono">#{agentCard.agentId.toString()}</p>
                          </div>
                          <div>
                            <span className="text-sm font-medium text-gray-500">创建者</span>
                            <p className="text-gray-900 font-mono text-sm truncate">{agentCard.createdBy}</p>
                          </div>
                        </div>
                      </div>

                      <div className="mb-6">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-medium text-gray-500">卡片URI</span>
                          <button onClick={() => copyToClipboard(agentCard.cardURI)}
                            className="text-blue-600 hover:text-blue-800 text-sm transition-colors">复制</button>
                        </div>
                        <p className="text-gray-900 font-mono text-sm bg-gray-50 p-3 rounded-lg break-all">
                          {agentCard.cardURI}
                        </p>
                      </div>

                      {agentCard.capabilities && agentCard.capabilities.length > 0 && (
                        <div className="mb-6">
                          <span className="text-sm font-medium text-gray-500 mb-3 block">能力标签</span>
                          <div className="flex flex-wrap gap-2">
                            {agentCard.capabilities.map((capability, index) => (
                              <span key={index} className="px-3 py-2 bg-blue-100 text-blue-800 rounded-lg text-sm font-medium">
                                {capability}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {agentCard.supportedTasks && agentCard.supportedTasks.length > 0 && (
                        <div className="mb-6">
                          <span className="text-sm font-medium text-gray-500 mb-3 block">支持任务</span>
                          <div className="flex flex-wrap gap-2">
                            {agentCard.supportedTasks.map((task, index) => (
                              <span key={index} className="px-3 py-2 bg-green-100 text-green-800 rounded-lg text-sm font-medium">
                                {task}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="pt-6 border-t border-gray-200">
                        <div className="grid grid-cols-2 gap-4 text-sm text-gray-500">
                          <div><span className="font-medium">创建时间:</span><p>{formatTimestamp(agentCard.createdAt)}</p></div>
                          <div><span className="font-medium">更新时间:</span><p>{formatTimestamp(agentCard.updatedAt)}</p></div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
                    <Brain className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">暂无Agent卡片</h3>
                    <p className="text-gray-600 mb-6 max-w-md mx-auto">
                      为您的Agent创建服务卡片，让其他Agent可以发现和调用您的服务。卡片包含服务描述、能力和任务信息。
                    </p>
                    <button onClick={onCreateNew}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
                      <Plus className="w-5 h-5" />创建第一个卡片
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==================== Skills Tab ==================== */}
          {activeTab === 'skills' && (
            <div className="space-y-8">
              {/* Agent已配置技能 */}
              <div>
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Agent已配置技能</h3>
                    <p className="text-gray-600 mt-1">当前Agent已启用的技能配置</p>
                  </div>
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                    {agentSkills.length} 个技能
                  </span>
                </div>

                {agentSkills.length === 0 ? (
                  <div className="bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
                    <Zap className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">暂无Agent技能</h3>
                    <p className="text-gray-600 mb-6">为您的Agent配置系统技能端点，扩展其功能范围。</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {agentSkills.map((skill) => {
                      const systemSkill = allSkills.find(s => s.skillId === skill.skillId)
                      return (
                        <div key={skill.skillId.toString()} className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-all duration-300">
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-gray-900 text-lg truncate">
                                {systemSkill ? systemSkill.name : `技能 #${skill.skillId.toString()}`}
                              </h4>
                              {systemSkill && (
                                <p className="text-gray-600 text-sm mt-1 line-clamp-2">{systemSkill.description}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 self-start sm:self-auto">
                              <button onClick={() => onEditConfiguredSkill(skill)}
                                className="flex items-center gap-1 px-3 py-1.5 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors text-sm whitespace-nowrap"
                                disabled={isLoading}>
                                <Edit className="w-3 h-3 flex-shrink-0" />编辑
                              </button>
                              <span className={`px-2 py-1 text-xs rounded-full whitespace-nowrap flex-shrink-0 ${
                                skill.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                              }`}>
                                {skill.isActive ? '活跃' : '未激活'}
                              </span>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div>
                              <span className="text-sm font-medium text-gray-500">服务端点</span>
                              <p className="text-gray-900 text-sm font-mono truncate" title={skill.skillEndpoint}>{skill.skillEndpoint}</p>
                            </div>
                            <div>
                              <span className="text-sm font-medium text-gray-500">版本</span>
                              <p className="text-gray-900">{skill.version}</p>
                            </div>
                            {skill.price > 0 && (
                              <div className="flex items-center gap-2">
                                <DollarSign className="w-4 h-4 text-green-600 flex-shrink-0" />
                                <div className="min-w-0">
                                  <span className="text-sm font-medium text-gray-500">调用价格</span>
                                  <p className="text-gray-900 truncate">{Number(skill.price) / 1e18} ETH</p>
                                </div>
                              </div>
                            )}
                            {skill.priceToken !== '0x0000000000000000000000000000000000000000' && (
                              <div className="flex items-center gap-2">
                                <Coins className="w-4 h-4 text-yellow-600 flex-shrink-0" />
                                <div className="min-w-0">
                                  <span className="text-sm font-medium text-gray-500">代币地址</span>
                                  <p className="text-gray-900 font-mono text-xs truncate">{skill.priceToken}</p>
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="mt-4 pt-4 border-t border-gray-200">
                            <div className="text-xs text-gray-500">注册时间: {formatTimestamp(skill.registeredAt)}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* 系统可用技能 */}
              <div>
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">系统可用技能</h3>
                    <p className="text-gray-600 mt-1">预定义的技能模板，可以配置端点后添加到您的Agent</p>
                  </div>
                </div>

                {allSkills.length === 0 ? (
                  <div className="bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
                    <Server className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">暂无系统技能</h3>
                    <p className="text-gray-600 mb-6">系统技能库为空</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {allSkills.map((skill) => {
                      const isAdded = agentSkills.some(s => s.skillId === skill.skillId)
                      return (
                        <div key={skill.skillId.toString()} className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-all duration-300">
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-gray-900 text-lg truncate">{skill.name}</h4>
                            </div>
                            <span className={`px-2 py-1 text-xs rounded-full whitespace-nowrap flex-shrink-0 self-start sm:self-auto ${
                              skill.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {skill.isActive ? '可用' : '不可用'}
                            </span>
                          </div>

                          <p className="text-gray-600 mb-4 text-sm leading-relaxed line-clamp-3">{skill.description}</p>

                          <div className="space-y-3 mb-4">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">输入格式:</span>
                              <span className="text-gray-900 font-mono text-xs truncate ml-2">
                                {skill.inputSchema.length > 20 ? skill.inputSchema.substring(0, 20) + '...' : skill.inputSchema}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">输出格式:</span>
                              <span className="text-gray-900 font-mono text-xs truncate ml-2">
                                {skill.outputSchema.length > 20 ? skill.outputSchema.substring(0, 20) + '...' : skill.outputSchema}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">复杂度:</span>
                              <span className="text-gray-900">{skill.complexity.toString()}/10</span>
                            </div>
                          </div>

                          {skill.requiredCapabilities.length > 0 && (
                            <div className="mb-4">
                              <p className="text-xs text-gray-600 mb-2">所需能力:</p>
                              <div className="flex flex-wrap gap-1">
                                {skill.requiredCapabilities.map((capability, index) => (
                                  <span key={index} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs whitespace-nowrap">
                                    {capability}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="flex justify-between items-center pt-4 border-t border-gray-200">
                            <span className="text-xs text-gray-500 whitespace-nowrap">创建: {formatTimestamp(skill.createdAt)}</span>
                            <button onClick={() => onConfigureSkill(skill)} disabled={isLoading || isAdded}
                              className={`px-4 py-2 rounded text-sm font-medium transition-colors whitespace-nowrap ${
                                isAdded ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
                              }`}>
                              {isAdded ? '已配置' : isLoading ? '配置中...' : '配置端点'}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
