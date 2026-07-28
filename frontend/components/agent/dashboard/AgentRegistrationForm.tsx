// components/agent/dashboard/AgentRegistrationForm.tsx
// Agent 注册弹窗
'use client'

import { Plus, Upload, CheckCircle, XCircle, AlertCircle, Info, Link, FileText, ArrowLeft } from 'lucide-react'
import type { MetadataEntry } from './hooks/useAgentRegistration'

interface PinataStatus {
  checked: boolean
  working: boolean
  message: string
}

interface ValidationResult {
  isValid: boolean
  message: string
}

interface RegistrationFormData {
  tokenURI: string
  metadata: MetadataEntry[]
}

interface AgentRegistrationFormProps {
  formData: RegistrationFormData
  setFormData: React.Dispatch<React.SetStateAction<RegistrationFormData>>
  currentMetadata: MetadataEntry
  setCurrentMetadata: React.Dispatch<React.SetStateAction<MetadataEntry>>
  validation: ValidationResult
  isUploading: boolean
  uploadProgress: number
  pinataStatus: PinataStatus
  isFormLoading: boolean
  isFormDisabled: boolean
  transactionHash: string | undefined
  isRegistering: boolean
  isConfirming: boolean
  onSubmit: (e: React.FormEvent) => Promise<void>
  onCancel: () => void
  onAddMetadata: () => void
  onRemoveMetadata: (index: number) => void
  onFileUpload: () => Promise<void>
  onMetadataUpload: () => Promise<void>
}

export function AgentRegistrationForm({
  formData, setFormData, currentMetadata, setCurrentMetadata, validation,
  isUploading, uploadProgress, pinataStatus, isFormLoading, isFormDisabled,
  transactionHash, isRegistering, isConfirming,
  onSubmit, onCancel, onAddMetadata, onRemoveMetadata, onFileUpload, onMetadataUpload,
}: AgentRegistrationFormProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-semibold text-gray-900">注册新 Agent</h3>
          </div>

          <form onSubmit={onSubmit} className="space-y-6">
            {/* Pinata 状态 */}
            <div className={`p-4 rounded-xl border ${!pinataStatus.checked ? 'bg-blue-50 border-blue-200' : pinataStatus.working ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center gap-3">
                {!pinataStatus.checked ? (
                  <><div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse" /><span className="text-sm text-blue-800">{pinataStatus.message}</span></>
                ) : pinataStatus.working ? (
                  <><CheckCircle className="w-4 h-4 text-green-600" /><span className="text-sm text-green-800">{pinataStatus.message}</span></>
                ) : (
                  <><AlertCircle className="w-4 h-4 text-red-600" /><span className="text-sm text-red-800">{pinataStatus.message}</span></>
                )}
              </div>
            </div>

            {/* Token URI */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Token URI *</label>
              <div className="flex gap-2">
                <input type="text" value={formData.tokenURI}
                  onChange={(e) => setFormData(prev => ({ ...prev, tokenURI: e.target.value }))}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                  placeholder="https://gateway.pinata.cloud/ipfs/Qm..." disabled={isFormLoading} />
                <button type="button" onClick={onFileUpload}
                  className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2 text-sm disabled:opacity-50 transition-colors"
                  disabled={isFormLoading || !pinataStatus.working}>
                  <Upload className="w-4 h-4" />{isUploading ? '上传中...' : '上传文件'}
                </button>
              </div>
              <div className="flex items-center gap-1 mt-2">
                <Info className="w-3 h-3 text-gray-400" />
                <p className="text-xs text-gray-500">输入 Token 元数据的 URI 地址，或点击上传按钮上传文件到 IPFS</p>
              </div>
              {isUploading && uploadProgress > 0 && (
                <div className="mt-3">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <p className="text-xs text-gray-600 mt-1 text-center">上传进度: {uploadProgress}%</p>
                </div>
              )}
            </div>

            {/* 元数据 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">元数据</label>
              <div className="bg-blue-50 rounded-xl p-4 mb-4">
                <div className="flex items-center gap-2 text-blue-800 mb-2">
                  <Info className="w-4 h-4" /><span className="text-sm font-medium">元数据字段说明</span>
                </div>
                <div className="text-sm text-blue-700 space-y-1">
                  <p><strong>必填项:</strong></p>
                  <ul className="list-disc list-inside ml-2">
                    <li><strong>name</strong> - Agent 名称</li>
                    <li><strong>description</strong> - Agent 描述</li>
                  </ul>
                  <p className="mt-2"><strong>选填项:</strong></p>
                  <ul className="list-disc list-inside ml-2">
                    <li><strong>tag</strong> - 标签</li>
                    <li><strong>version</strong> - 版本号</li>
                    <li><strong>prompt</strong> - 提示词</li>
                  </ul>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <input type="text" value={currentMetadata.key}
                  onChange={(e) => setCurrentMetadata(prev => ({ ...prev, key: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  placeholder="键名（如：name、description、tag等）" disabled={isFormLoading} />
                <div className="flex gap-2">
                  <input type="text" value={currentMetadata.value}
                    onChange={(e) => setCurrentMetadata(prev => ({ ...prev, value: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="值" disabled={isFormLoading} />
                  <button type="button" onClick={onAddMetadata}
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    disabled={isFormLoading || !currentMetadata.key.trim() || !currentMetadata.value.trim()}>
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-40 overflow-y-auto">
                {formData.metadata.map((meta, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1 grid grid-cols-2 gap-3">
                      <div className={`text-sm font-medium px-2 py-1 rounded border ${['name', 'description'].includes(meta.key) ? 'bg-red-50 text-red-900 border-red-200' : 'bg-white text-gray-900 border-gray-200'}`}>
                        {meta.key}{['name', 'description'].includes(meta.key) && <span className="text-xs text-red-600 ml-1">*</span>}
                      </div>
                      <div className="text-sm text-gray-600 bg-white px-2 py-1 rounded border border-gray-200">{meta.value}</div>
                    </div>
                    <button type="button" onClick={() => onRemoveMetadata(index)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors" disabled={isFormLoading}>
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {formData.metadata.length === 0 && (
                <div className="text-center py-4 border-2 border-dashed border-gray-300 rounded-lg">
                  <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">暂无元数据</p>
                  <p className="text-xs text-gray-400 mt-1">请添加必填的 name 和 description 字段</p>
                </div>
              )}

              {formData.metadata.length > 0 && (
                <div className="mt-4">
                  <button type="button" onClick={onMetadataUpload}
                    className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                    disabled={isFormLoading || !pinataStatus.working}>
                    <Upload className="w-4 h-4" />{isUploading ? '上传元数据中...' : '上传元数据到 IPFS'}
                  </button>
                  <div className="flex items-center gap-1 mt-2">
                    <Info className="w-3 h-3 text-gray-400" />
                    <p className="text-xs text-gray-500">将元数据上传到 IPFS 并自动填充 Token URI</p>
                  </div>
                </div>
              )}
            </div>

            {/* 费用信息 */}
            <div className="bg-blue-50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-blue-800 mb-2">
                <Link className="w-4 h-4" /><span className="text-sm font-medium">注册费用</span>
              </div>
              <p className="text-sm text-blue-700">注册 Agent 需要支付 0.001 ETH 作为网络费用。此费用用于确保网络安全和防止垃圾注册。</p>
            </div>

            {/* 交易状态 */}
            {(isRegistering || isConfirming || transactionHash) && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  {(isConfirming || isRegistering) && (
                    <><div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-blue-800">{isConfirming ? '交易确认中...' : '提交交易中...'}</p>
                        <p className="text-xs text-blue-600">{isConfirming ? '请等待交易在区块链上确认' : '正在向区块链提交注册请求'}</p>
                      </div></>
                  )}
                </div>
                {transactionHash && (
                  <div className="mt-2"><p className="text-xs text-blue-600 font-mono break-all">交易哈希: {transactionHash}</p></div>
                )}
              </div>
            )}

            {/* 验证 */}
            {!validation.isValid && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2 text-red-700">
                  <XCircle className="w-4 h-4" /><span className="text-sm">{validation.message}</span>
                </div>
              </div>
            )}
            {validation.isValid && validation.message && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle className="w-4 h-4" /><span className="text-sm">{validation.message}</span>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button type="button" onClick={onCancel}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                disabled={isFormLoading}>取消</button>
              <button type="submit" disabled={isFormDisabled || !pinataStatus.working}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium">
                {isFormLoading ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{isConfirming ? '确认中...' : isUploading ? '上传中...' : '注册中...'}</>
                ) : (
                  <><Plus className="w-4 h-4" />注册 Agent</>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
