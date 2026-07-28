// components/agent/dashboard/AgentCardManager.tsx
// 卡片管理 — 协调器组件，逻辑见 hooks/useAgentCards.ts
'use client'

import { RefreshCw, Plus, AlertCircle, CheckCircle, XCircle } from 'lucide-react'
import { useAgentCards } from './hooks/useAgentCards'
import { AgentCardForm } from './AgentCardForm'
import { AgentCardList } from './AgentCardList'
import { SkillConfigForm } from './SkillConfigForm'

export function AgentCardManager() {
  const ctx = useAgentCards()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">卡片管理</h2>
          <p className="text-gray-600 mt-1">管理您的Agent服务卡片和技能配置</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => ctx.selectedAgentId && ctx.loadAgentData(ctx.selectedAgentId)}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50 transition-colors"
            disabled={!ctx.selectedAgentId || ctx.isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${ctx.isLoading ? 'animate-spin' : ''}`} />刷新数据
          </button>

          <button
            onClick={() => ctx.setShowForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 transition-colors font-medium"
            disabled={!ctx.selectedAgentId || !ctx.isConnected}
          >
            <Plus className="w-4 h-4" />创建卡片
          </button>
        </div>
      </div>

      {/* 状态提示 */}
      {!ctx.isConnected && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
          <div className="flex items-center gap-2 text-yellow-800">
            <AlertCircle className="w-5 h-5" />
            <span>请先连接钱包以管理Agent卡片和技能</span>
          </div>
        </div>
      )}

      {ctx.successMessage && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
          <div className="flex items-center gap-2 text-green-800">
            <CheckCircle className="w-5 h-5" />
            <span>{ctx.successMessage}</span>
          </div>
        </div>
      )}

      {/* 主要内容区域 */}
      <div className="bg-white rounded-xl border border-gray-200">
        {/* Agent选择 */}
        <div className="p-6 border-b border-gray-200">
          <label className="block text-sm font-medium text-gray-700 mb-3">选择Agent</label>
          <select
            value={ctx.selectedAgentId || ''}
            onChange={(e) => ctx.setSelectedAgentId(e.target.value ? Number(e.target.value) : null)}
            className="w-full max-w-md px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            disabled={!ctx.isConnected}
          >
            <option value="">请选择要管理的Agent</option>
            {ctx.userAgents.map((agentId) => (
              <option key={agentId} value={agentId}>Agent #{agentId}</option>
            ))}
          </select>
        </div>

        {/* 列表区域（统计 + Tabs + 卡片/技能） */}
        <AgentCardList
          selectedAgentId={ctx.selectedAgentId}
          isConnected={ctx.isConnected}
          isLoading={ctx.isLoading}
          agentCard={ctx.agentCard}
          agentSkills={ctx.agentSkills}
          allSkills={ctx.allSkills}
          activeTab={ctx.activeTab}
          setActiveTab={ctx.setActiveTab}
          onEditCard={ctx.handleEditCard}
          onConfigureSkill={ctx.handleConfigureSkill}
          onEditConfiguredSkill={ctx.handleEditConfiguredSkill}
          onCreateNew={() => ctx.setShowForm(true)}
          formatTimestamp={ctx.formatTimestamp}
          copyToClipboard={ctx.copyToClipboard}
        />
      </div>

      {/* 创建/编辑卡片弹窗 */}
      {ctx.showForm && (
        <AgentCardForm
          editingCard={ctx.editingCard}
          formData={ctx.formData}
          setFormData={ctx.setFormData}
          currentCapability={ctx.currentCapability}
          setCurrentCapability={ctx.setCurrentCapability}
          currentTask={ctx.currentTask}
          setCurrentTask={ctx.setCurrentTask}
          validation={ctx.validation}
          isUploading={ctx.isUploading}
          isFormLoading={ctx.isFormLoading}
          isFormDisabled={ctx.isFormDisabled}
          onSubmit={ctx.handleSubmit}
          onCancel={ctx.handleCancelForm}
          onUploadToIPFS={ctx.handleUploadToIPFS}
          onAddCapability={ctx.handleAddCapability}
          onRemoveCapability={ctx.handleRemoveCapability}
          onAddTask={ctx.handleAddTask}
          onRemoveTask={ctx.handleRemoveTask}
        />
      )}

      {/* 技能配置弹窗 */}
      {ctx.showSkillConfig && ctx.selectedSkill && (
        <SkillConfigForm
          isEditing={ctx.isEditingSkill}
          selectedSkill={ctx.selectedSkill}
          configData={ctx.skillConfigData}
          setConfigData={ctx.setSkillConfigData}
          isLoading={ctx.isLoading}
          onSubmit={ctx.handleSubmitSkillConfig}
          onCancel={ctx.handleCancelSkillConfig}
        />
      )}

      {/* 错误显示 */}
      {ctx.error && (
        <div className="fixed bottom-4 right-4 p-4 bg-red-50 border border-red-200 rounded-lg shadow-lg max-w-md">
          <div className="flex items-center gap-2 text-red-700">
            <XCircle className="w-5 h-5 flex-shrink-0" />
            <div>
              <span className="font-medium">操作失败:</span>
              <span className="ml-1">{ctx.error.message || '未知错误'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
