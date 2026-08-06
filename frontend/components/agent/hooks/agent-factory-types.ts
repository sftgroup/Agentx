// components/agent/hooks/agent-factory-types.ts
// R7 拆分：useAgentFactory 的类型、常量与合约地址（供 hook 与外部消费方引用）

import { validateAddress } from './contract-address'

export const AGENT_FACTORY_ADDRESS = validateAddress(process.env.NEXT_PUBLIC_AGENT_FACTORY_ADDRESS)

// TypeScript 接口定义
export interface AgentTemplate {
  templateId: number
  name: string
  description: string
  baseURI: string
  endpointTypes: string[]
  endpointURIs: string[]
  protocols: string[]
  endpointNames: string[]
  capabilities?: string[]
  supportedTasks?: string[]
  configKeys: string[]
  configValues: string[]
  dataTypes: string[]
  isActive: boolean
  createdAt: number
  createdBy: string
}

export interface TemplateCreationData {
  name: string
  description: string
  baseURI: string
  endpointTypes: string[]
  endpointURIs: string[]
  protocols: string[]
  endpointNames: string[]
  configKeys: string[]
  configValues: string[]
  dataTypes: string[]
}

export interface BatchCreationResult {
  agentIds: number[]
  transactionHash: `0x${string}`
}

export interface UseAgentFactoryReturn {
  // 模板管理功能（管理员）
  createTemplate: (templateData: TemplateCreationData) => Promise<`0x${string}` | undefined>
  updateTemplate: (templateId: number, templateData: TemplateCreationData) => Promise<`0x${string}` | undefined>
  setTemplateActive: (templateId: number, isActive: boolean) => Promise<`0x${string}` | undefined>
  
  // Agent 创建功能（用户）
  createAgentFromTemplate: (templateId: number) => Promise<`0x${string}` | undefined>
  createAgentsFromTemplate: (templateId: number, count: number) => Promise<`0x${string}` | undefined>
  
  // 查询功能
  getTemplate: (templateId: number) => Promise<AgentTemplate | null>
  getAllTemplates: () => Promise<AgentTemplate[]>
  getAgentTemplates: (agentId: number) => Promise<number[]>
  getTotalTemplates: () => Promise<number>
  templateExists: (templateId: number) => Promise<boolean>
  
  // 实时数据
  templates: AgentTemplate[]
  totalTemplates: number
  agentTemplates: Record<number, number[]>
  
  // 状态
  isCreatingTemplate: boolean
  isUpdatingTemplate: boolean
  isSettingTemplateActive: boolean
  isCreatingAgent: boolean
  isCreatingAgents: boolean
  isConfirming: boolean
  isConfirmed: boolean
  isLoadingTemplates: boolean
  error: Error | null
  hash: `0x${string}` | undefined
  
  // 工具函数
  refetchTemplates: () => Promise<void>
  refetchAllData: () => Promise<void>
  resetState: () => void
}
