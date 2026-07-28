// components/agent/dashboard/MetadataEditForm.tsx
// 元数据编辑弹窗
'use client'

import { Plus, XCircle, Info, FileText, RefreshCw } from 'lucide-react'
import type { MetadataEntry } from './hooks/useAgentRegistration'

interface ValidationResult {
  isValid: boolean
  message: string
}

interface AgentMetadataState {
  agentId: number
  metadata: MetadataEntry[]
  existingMetadata: MetadataEntry[]
}

interface MetadataEditFormProps {
  selectedAgentId: number | null
  currentMetadata: MetadataEntry
  setCurrentMetadata: React.Dispatch<React.SetStateAction<MetadataEntry>>
  agentMetadata: AgentMetadataState
  validation: ValidationResult
  isSettingMetadata: boolean
  isConfirming: boolean
  isLoadingMetadata: boolean
  transactionHash: string | undefined
  onSubmit: (e: React.FormEvent) => Promise<void>
  onCancel: () => void
  onAddMetadata: () => void
  onRemoveMetadata: (index: number) => void
  onEditExisting: (index: number) => void
  onRemoveExisting: (index: number) => void
}

export function MetadataEditForm({
  selectedAgentId, currentMetadata, setCurrentMetadata, agentMetadata,
  validation, isSettingMetadata, isConfirming, isLoadingMetadata, transactionHash,
  onSubmit, onCancel, onAddMetadata, onRemoveMetadata, onEditExisting, onRemoveExisting,
}: MetadataEditFormProps) {
  const isBusy = isSettingMetadata || isConfirming

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-semibold text-gray-900">编辑 Agent #{selectedAgentId} 元数据</h3>
            <button onClick={onCancel} disabled={isBusy}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
              <XCircle className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={onSubmit} className="space-y-6">
            <div className="bg-blue-50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-blue-800 mb-2">
                <Info className="w-4 h-4" /><span className="text-sm font-medium">元数据说明</span>
              </div>
              <p className="text-sm text-blue-700">
                元数据用于存储 Agent 的附加信息，如名称、描述、版本等。这些信息将永久存储在区块链上。
                <strong className="block mt-1">注意：Token URI 是 ERC721 标准的一部分，无法通过此界面修改。</strong>
              </p>
            </div>

            {/* 现有元数据 */}
            {agentMetadata.existingMetadata.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">现有元数据</label>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {agentMetadata.existingMetadata.map((meta, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                      <div className="flex-1 grid grid-cols-2 gap-3">
                        <div className="text-sm font-medium text-gray-900 bg-white px-2 py-1 rounded border">{meta.key}</div>
                        <div className="text-sm text-gray-600 bg-white px-2 py-1 rounded border">{meta.value}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => onEditExisting(index)}
                          className="p-1 text-blue-400 hover:text-blue-600 transition-colors" title="编辑" disabled={isBusy}>
                          <FileText className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => onRemoveExisting(index)}
                          className="p-1 text-red-400 hover:text-red-600 transition-colors" title="删除" disabled={isBusy}>
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 加载中 */}
            {isLoadingMetadata && (
              <div className="flex items-center justify-center py-4">
                <div className="flex items-center gap-2 text-gray-600">
                  <RefreshCw className="w-4 h-4 animate-spin" />加载现有元数据中...
                </div>
              </div>
            )}

            {/* 添加/修改 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                {currentMetadata.key ? '修改元数据' : '添加新元数据'}
              </label>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <input type="text" value={currentMetadata.key}
                  onChange={(e) => setCurrentMetadata(prev => ({ ...prev, key: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  placeholder="键名 (例如: name, description, tag, version, prompt)" disabled={isBusy} />
                <div className="flex gap-2">
                  <input type="text" value={currentMetadata.value}
                    onChange={(e) => setCurrentMetadata(prev => ({ ...prev, value: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="值" disabled={isBusy} />
                  <button type="button" onClick={onAddMetadata}
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    disabled={isBusy || !currentMetadata.key.trim() || !currentMetadata.value.trim()}>
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 待保存列表 */}
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {agentMetadata.metadata.map((meta, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                    <div className="flex-1 grid grid-cols-2 gap-3">
                      <div className="text-sm font-medium text-gray-900 bg-white px-2 py-1 rounded border">{meta.key}</div>
                      <div className="text-sm text-gray-600 bg-white px-2 py-1 rounded border">{meta.value}</div>
                    </div>
                    <button type="button" onClick={() => onRemoveMetadata(index)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors" disabled={isBusy}>
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {agentMetadata.metadata.length === 0 && (
                <div className="text-center py-4 border-2 border-dashed border-gray-300 rounded-lg">
                  <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">暂无待保存的元数据</p>
                </div>
              )}
            </div>

            {/* 交易状态 */}
            {(isSettingMetadata || isConfirming || transactionHash) && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  {(isConfirming || isSettingMetadata) && (
                    <><div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-blue-800">{isConfirming ? '交易确认中...' : '提交交易中...'}</p>
                        <p className="text-xs text-blue-600">{isConfirming ? '请等待交易在区块链上确认' : '正在向区块链提交元数据更新请求'}</p>
                      </div></>
                  )}
                </div>
                {transactionHash && (
                  <div className="mt-2"><p className="text-xs text-blue-600 font-mono break-all">交易哈希: {transactionHash}</p></div>
                )}
              </div>
            )}

            {/* 验证错误 */}
            {!validation.isValid && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2 text-red-700">
                  <XCircle className="w-4 h-4" /><span className="text-sm">{validation.message}</span>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button type="button" onClick={onCancel}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                disabled={isBusy}>取消</button>
              <button type="submit" disabled={isBusy}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium">
                {isBusy ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{isConfirming ? '确认中...' : '保存中...'}</>
                ) : (
                  <><FileText className="w-4 h-4" />保存元数据</>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
