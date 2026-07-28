// components/agent/dashboard/SkillConfigForm.tsx
// 技能配置弹窗
'use client'

import { Plus, XCircle, DollarSign, AlertCircle } from 'lucide-react'
import type { A2ASkill } from '../../hooks/useA2AProtocol'

interface SkillConfigData {
  skillId: number
  skillEndpoint: string
  version: string
  price: number
  priceToken: string
}

interface SkillConfigFormProps {
  isEditing: boolean
  selectedSkill: A2ASkill | null
  configData: SkillConfigData
  setConfigData: React.Dispatch<React.SetStateAction<SkillConfigData>>
  isLoading: boolean
  onSubmit: (e: React.FormEvent) => Promise<void>
  onCancel: () => void
}

export function SkillConfigForm({
  isEditing, selectedSkill, configData, setConfigData,
  isLoading, onSubmit, onCancel,
}: SkillConfigFormProps) {
  if (!selectedSkill) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-semibold text-gray-900">
              {isEditing ? '编辑技能配置' : '配置技能端点'} - {selectedSkill.name}
            </h3>
            <button onClick={onCancel} className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
              <XCircle className="w-6 h-6" />
            </button>
          </div>

          {/* 说明信息 */}
          <div className="mb-6 space-y-3">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-blue-800">技能配置说明</p>
                  <p className="text-sm text-blue-700 mt-1">
                    此技能使用系统预定义的输入输出格式，您只需配置服务端点即可让Agent使用此技能。
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
              <div className="flex items-start gap-3">
                <DollarSign className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-800">价格设置说明</p>
                  <p className="text-sm text-green-700 mt-1">
                    价格设为0表示免费，非0值表示每次调用费用<br />
                    如需使用ERC20代币，请填写代币合约地址
                  </p>
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">技能名称</label>
                <input type="text" value={selectedSkill.name} readOnly
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">技能描述</label>
                <textarea value={selectedSkill.description} rows={3} readOnly
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">服务端点 *</label>
                <input
                  type="text" value={configData.skillEndpoint}
                  onChange={(e) => setConfigData(prev => ({ ...prev, skillEndpoint: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="https://api.example.com/skills/endpoint" required disabled={isLoading}
                />
                <p className="text-xs text-gray-500 mt-2">此技能的服务调用端点URL</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">版本</label>
                  <input type="text" value={configData.version}
                    onChange={(e) => setConfigData(prev => ({ ...prev, version: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    placeholder="1.0.0" disabled={isLoading} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">单次调用价格 (ETH)</label>
                  <input type="number" step="0.001" min="0" value={configData.price}
                    onChange={(e) => setConfigData(prev => ({ ...prev, price: parseFloat(e.target.value) }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    placeholder="0" disabled={isLoading} />
                  <p className="text-xs text-gray-500 mt-1">设为0表示免费服务</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">代币支付地址（可选）</label>
                <input type="text" value={configData.priceToken}
                  onChange={(e) => setConfigData(prev => ({ ...prev, priceToken: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors font-mono text-sm"
                  placeholder="0x0000000000000000000000000000000000000000" disabled={isLoading} />
                <p className="text-xs text-gray-500 mt-2">留空或使用零地址表示使用ETH支付</p>
              </div>
            </div>

            {/* 技能规格信息 */}
            <div className="border-t pt-6">
              <h4 className="text-lg font-medium text-gray-900 mb-4">技能规格</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-500">输入格式:</span>
                  <div className="mt-1 p-2 bg-gray-50 rounded border font-mono text-xs overflow-x-auto">
                    {selectedSkill.inputSchema}
                  </div>
                </div>
                <div>
                  <span className="font-medium text-gray-500">输出格式:</span>
                  <div className="mt-1 p-2 bg-gray-50 rounded border font-mono text-xs overflow-x-auto">
                    {selectedSkill.outputSchema}
                  </div>
                </div>
              </div>

              {selectedSkill.requiredCapabilities.length > 0 && (
                <div className="mt-4">
                  <span className="font-medium text-gray-500 text-sm">所需能力:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedSkill.requiredCapabilities.map((capability, index) => (
                      <span key={index} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">{capability}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4">
                <span className="font-medium text-gray-500 text-sm">复杂度:</span>
                <span className="ml-2 text-gray-900">{selectedSkill.complexity.toString()}/10</span>
              </div>
            </div>

            {/* 表单操作 */}
            <div className="flex justify-end gap-4 pt-6 border-t border-gray-200">
              <button type="button" onClick={onCancel}
                className="px-6 py-3 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors font-medium"
                disabled={isLoading}>取消</button>
              <button type="submit"
                disabled={isLoading || !configData.skillEndpoint.trim()}
                className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium">
                {isLoading ? (
                  <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />{isEditing ? '更新中...' : '配置中...'}</>
                ) : (
                  <><Plus className="w-5 h-5" />{isEditing ? '更新技能配置' : '配置技能端点'}</>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
