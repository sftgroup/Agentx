// components/agent/dashboard/AgentCardForm.tsx
// 卡片创建/编辑弹窗
'use client'

import { Plus, Upload, AlertCircle, ArrowLeft } from 'lucide-react'

interface AgentCardFormData {
  name: string
  description: string
  version: string
  capabilities: string[]
  supportedTasks: string[]
  communicationProtocol: string
  authenticationMethod: string
  cardURI: string
}

interface ValidationResult {
  isValid: boolean
  message: string
}

interface AgentCardFormProps {
  editingCard: { name: string } | null
  formData: AgentCardFormData
  setFormData: React.Dispatch<React.SetStateAction<AgentCardFormData>>
  currentCapability: string
  setCurrentCapability: (v: string) => void
  currentTask: string
  setCurrentTask: (v: string) => void
  validation: ValidationResult
  isUploading: boolean
  isFormLoading: boolean
  isFormDisabled: boolean
  onSubmit: (e: React.FormEvent) => Promise<void>
  onCancel: () => void
  onUploadToIPFS: () => Promise<void>
  onAddCapability: () => void
  onRemoveCapability: (index: number) => void
  onAddTask: () => void
  onRemoveTask: (index: number) => void
}

export function AgentCardForm({
  editingCard, formData, setFormData, currentCapability, setCurrentCapability,
  currentTask, setCurrentTask, validation, isUploading, isFormLoading,
  isFormDisabled, onSubmit, onCancel, onUploadToIPFS,
  onAddCapability, onRemoveCapability, onAddTask, onRemoveTask,
}: AgentCardFormProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-semibold text-gray-900">
              {editingCard ? '编辑Agent卡片' : '创建Agent卡片'}
            </h3>
          </div>

          <form onSubmit={onSubmit} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 基础信息 */}
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">卡片名称 *</label>
                  <input
                    type="text" value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    placeholder="例如：智能客服Agent" required disabled={isFormLoading}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">描述 *</label>
                  <textarea
                    value={formData.description} rows={4}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    placeholder="详细描述Agent的功能和服务范围" required disabled={isFormLoading}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">版本</label>
                    <input
                      type="text" value={formData.version}
                      onChange={(e) => setFormData(prev => ({ ...prev, version: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      placeholder="1.0.0" disabled={isFormLoading}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">通信协议</label>
                    <select
                      value={formData.communicationProtocol}
                      onChange={(e) => setFormData(prev => ({ ...prev, communicationProtocol: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      disabled={isFormLoading}
                    >
                      <option value="HTTP">HTTP REST API</option>
                      <option value="WebSocket">WebSocket</option>
                      <option value="gRPC">gRPC</option>
                      <option value="A2A">A2A Protocol</option>
                      <option value="Custom">自定义协议</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">认证方式</label>
                  <select
                    value={formData.authenticationMethod}
                    onChange={(e) => setFormData(prev => ({ ...prev, authenticationMethod: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    disabled={isFormLoading}
                  >
                    <option value="API Key">API密钥</option>
                    <option value="OAuth">OAuth 2.0</option>
                    <option value="JWT">JWT令牌</option>
                    <option value="Wallet">钱包签名</option>
                    <option value="None">无认证</option>
                  </select>
                </div>
              </div>

              {/* 能力配置 */}
              <div className="space-y-6">
                {/* 能力标签 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">能力标签</label>
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text" value={currentCapability}
                      onChange={(e) => setCurrentCapability(e.target.value)}
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      placeholder="例如：文本生成、图像处理、数据分析" disabled={isFormLoading}
                      onKeyPress={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAddCapability() } }}
                    />
                    <button type="button" onClick={onAddCapability}
                      className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
                      disabled={isFormLoading || !currentCapability.trim()}>添加</button>
                  </div>
                  <div className="flex flex-wrap gap-2 min-h-12">
                    {formData.capabilities.map((capability, index) => (
                      <span key={index} className="inline-flex items-center gap-2 px-3 py-2 bg-blue-100 text-blue-800 rounded-lg text-sm font-medium">
                        {capability}
                        <button type="button" onClick={() => onRemoveCapability(index)}
                          className="text-blue-600 hover:text-blue-800 transition-colors" disabled={isFormLoading}>×</button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* 支持任务 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">支持任务</label>
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text" value={currentTask}
                      onChange={(e) => setCurrentTask(e.target.value)}
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      placeholder="例如：聊天对话、内容总结、语言翻译" disabled={isFormLoading}
                      onKeyPress={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAddTask() } }}
                    />
                    <button type="button" onClick={onAddTask}
                      className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors font-medium"
                      disabled={isFormLoading || !currentTask.trim()}>添加</button>
                  </div>
                  <div className="flex flex-wrap gap-2 min-h-12">
                    {formData.supportedTasks.map((task, index) => (
                      <span key={index} className="inline-flex items-center gap-2 px-3 py-2 bg-green-100 text-green-800 rounded-lg text-sm font-medium">
                        {task}
                        <button type="button" onClick={() => onRemoveTask(index)}
                          className="text-green-600 hover:text-green-800 transition-colors" disabled={isFormLoading}>×</button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* IPFS上传 */}
                <div className="border-t pt-6">
                  <div className="flex justify-between items-center mb-3">
                    <label className="block text-sm font-medium text-gray-700">卡片URI（IPFS CID）*</label>
                    <button type="button" onClick={onUploadToIPFS}
                      disabled={isUploading || !formData.name || !formData.description || isFormLoading}
                      className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors text-sm font-medium">
                      <Upload className="w-4 h-4" />{isUploading ? '上传中...' : '上传到IPFS'}
                    </button>
                  </div>
                  <input
                    type="text" value={formData.cardURI}
                    onChange={(e) => setFormData(prev => ({ ...prev, cardURI: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors font-mono text-sm"
                    placeholder="ipfs://... 或 https://..." required disabled={isFormLoading}
                  />
                  <p className="text-xs text-gray-500 mt-2">点击"上传到IPFS"自动生成IPFS URI，或手动输入现有URI。</p>
                </div>
              </div>
            </div>

            {/* 验证错误 */}
            {!validation.isValid && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2 text-red-700">
                  <AlertCircle className="w-5 h-5" />
                  <span className="font-medium">{validation.message}</span>
                </div>
              </div>
            )}

            {/* 表单操作 */}
            <div className="flex justify-end gap-4 pt-6 border-t border-gray-200">
              <button type="button" onClick={onCancel}
                className="px-6 py-3 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors font-medium"
                disabled={isFormLoading}>取消</button>
              <button type="submit" disabled={isFormDisabled}
                className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium">
                {isFormLoading ? (
                  <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />保存中...</>
                ) : (
                  <><Plus className="w-5 h-5" />{editingCard ? '更新卡片' : '创建卡片'}</>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
