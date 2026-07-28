// components/agent/dashboard/AgentRegistration.tsx
// Agent 注册 — 协调器组件，逻辑见 hooks/useAgentRegistration.ts
'use client'

import { Plus, RefreshCw, CheckCircle, Key, Server, User, Settings, FileText, XCircle } from 'lucide-react'
import { useAgentRegistration } from './hooks/useAgentRegistration'
import { AgentRegistrationForm } from './AgentRegistrationForm'
import { MetadataEditForm } from './MetadataEditForm'

export function AgentRegistration() {
  const ctx = useAgentRegistration()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Agent 注册</h2>
          <p className="text-gray-600 mt-1">注册新的 Agent 来开始提供服务</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={ctx.handleManualRefresh}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50 transition-colors"
            disabled={!ctx.isConnected}>
            <RefreshCw className="w-4 h-4" />刷新列表
          </button>
          <button onClick={() => ctx.setShowRegistrationForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 transition-colors font-medium"
            disabled={!ctx.isConnected}>
            <Plus className="w-4 h-4" />注册新 Agent
          </button>
        </div>
      </div>

      {/* 连接提示 */}
      {!ctx.isConnected && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
          <div className="flex items-center gap-2 text-yellow-800">
            <Key className="w-4 h-4" /><span>请先连接钱包以注册 Agent</span>
          </div>
        </div>
      )}

      {/* 成功消息 */}
      {ctx.successMessage && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
          <div className="flex items-center gap-2 text-green-800">
            <CheckCircle className="w-4 h-4" /><span>{ctx.successMessage}</span>
          </div>
          {ctx.transactionHash && (
            <p className="text-xs text-green-600 mt-1 font-mono break-all">交易哈希: {ctx.transactionHash}</p>
          )}
        </div>
      )}

      {/* 统计卡片 */}
      {ctx.isConnected && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center">
              <Server className="w-8 h-8 text-blue-600 mr-4" />
              <div>
                <p className="text-sm font-medium text-gray-600">已注册 Agents</p>
                <p className="text-2xl font-bold text-gray-900">{ctx.uniqueUserAgents.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center">
              <User className="w-8 h-8 text-green-600 mr-4" />
              <div>
                <p className="text-sm font-medium text-gray-600">当前 Agent ID</p>
                <p className="text-2xl font-bold text-gray-900">
                  {ctx.currentAgentId > 0 ? ctx.formatAgentId(ctx.currentAgentId) : '无'}
                </p>
                <p className="text-xs text-gray-500 mt-1">最新注册的 Agent ID</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center">
              <Settings className="w-8 h-8 text-purple-600 mr-4" />
              <div>
                <p className="text-sm font-medium text-gray-600">注册状态</p>
                <p className="text-2xl font-bold text-gray-900">
                  {ctx.isRegistering ? '注册中...' : ctx.isConfirming ? '确认中...' : '就绪'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Agent 列表 */}
      {ctx.isConnected && ctx.uniqueUserAgents.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-6 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">我的 Agents</h3>
            <div className="text-sm text-gray-500">共 {ctx.uniqueUserAgents.length} 个 Agent</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agent ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {ctx.uniqueUserAgents.map((agentId) => (
                  <tr key={agentId}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {ctx.formatAgentId(agentId)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">已注册</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <button onClick={() => ctx.handleEditMetadata(agentId)}
                          className="text-blue-600 hover:text-blue-900 flex items-center gap-1 px-3 py-1 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">
                          <FileText className="w-4 h-4" />编辑元数据
                        </button>
                        <button onClick={ctx.handleManualRefresh}
                          className="text-gray-600 hover:text-gray-900 flex items-center gap-1 px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 空状态 */}
      {ctx.isConnected && ctx.uniqueUserAgents.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
          <Server className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-2">暂无注册的 Agent</p>
          <p className="text-sm text-gray-500 mb-4">注册您的第一个 Agent 来开始提供服务</p>
          <button onClick={() => ctx.setShowRegistrationForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
            注册第一个 Agent
          </button>
        </div>
      )}

      {/* 注册表单弹窗 */}
      {ctx.showRegistrationForm && (
        <AgentRegistrationForm
          formData={ctx.registrationForm}
          setFormData={ctx.setRegistrationForm}
          currentMetadata={ctx.currentMetadata}
          setCurrentMetadata={ctx.setCurrentMetadata}
          validation={ctx.validation}
          isUploading={ctx.isUploading}
          uploadProgress={ctx.uploadProgress}
          pinataStatus={ctx.pinataStatus}
          isFormLoading={ctx.isFormLoading}
          isFormDisabled={ctx.isFormDisabled}
          transactionHash={ctx.transactionHash}
          isRegistering={ctx.isRegistering}
          isConfirming={ctx.isConfirming}
          onSubmit={ctx.handleSubmit}
          onCancel={ctx.handleCancel}
          onAddMetadata={ctx.handleAddMetadata}
          onRemoveMetadata={ctx.handleRemoveMetadata}
          onFileUpload={ctx.handleFileUpload}
          onMetadataUpload={ctx.handleMetadataUpload}
        />
      )}

      {/* 元数据编辑弹窗 */}
      {ctx.showMetadataForm && (
        <MetadataEditForm
          selectedAgentId={ctx.selectedAgentId}
          currentMetadata={ctx.currentMetadata}
          setCurrentMetadata={ctx.setCurrentMetadata}
          agentMetadata={ctx.agentMetadata}
          validation={ctx.validation}
          isSettingMetadata={ctx.isSettingMetadata}
          isConfirming={ctx.isConfirming}
          isLoadingMetadata={ctx.isLoadingMetadata}
          transactionHash={ctx.transactionHash}
          onSubmit={ctx.handleMetadataSubmit}
          onCancel={ctx.handleMetadataCancel}
          onAddMetadata={ctx.handleAddAgentMetadata}
          onRemoveMetadata={ctx.handleRemoveAgentMetadata}
          onEditExisting={ctx.handleEditExistingMetadata}
          onRemoveExisting={ctx.handleRemoveExistingMetadata}
        />
      )}

      {/* 错误显示 */}
      {ctx.error && !ctx.showRegistrationForm && !ctx.showMetadataForm && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-center gap-2 text-red-700">
            <XCircle className="w-4 h-4" /><span>操作失败: {ctx.error.message}</span>
          </div>
        </div>
      )}
    </div>
  )
}
