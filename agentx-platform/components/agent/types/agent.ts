// components/agent/types/agent.ts
// Agent Dashboard 类型定义

export interface Agent {
  id: number
  name: string
  description: string
  image?: string
  capabilities: string[]
  supportedTrust: string[]
  endpoints: AgentEndpoint[]
  createdAt: number
  owner: string
  tokenURI?: string
}

export interface AgentEndpoint {
  name: string
  endpoint: string
  version: string
  capabilities?: Record<string, any>
}

export interface AgentCard {
  cardId: number
  agentId: number
  name: string
  description: string
  version: string
  capabilities: string[]
  supportedTasks: string[]
  communicationProtocol: string
  authenticationMethod: string
  cardURI: string
  isActive: boolean
  createdAt: number
  updatedAt: number
  createdBy: string
}

export interface A2ASkill {
  skillId: number
  name: string
  description: string
  inputSchema: string
  outputSchema: string
  requiredCapabilities: string[]
  complexity: number
  isActive: boolean
  createdAt: number
}

export interface A2ATask {
  taskId: number
  agentId: number
  taskType: string
  inputData: string
  outputData: string
  status: number
  clientAddress: string
  createdAt: number
  completedAt: number
  taskHash: string
}

export interface Endpoint {
  endpointId: number
  agentId: number
  name: string
  endpointType: string
  protocol: string
  url: string
  description: string
  isActive: boolean
  createdAt: number
  updatedAt: number
  createdBy: string
}

export interface ConfigEntry {
  configId: number
  agentId: number
  configKey: string
  configValue: string
  dataType: string
  description: string
  isActive: boolean
  createdAt: number
  updatedAt: number
  createdBy: string
}

export interface SubscriptionPlan {
  planId: number
  agentId: number
  name: string
  description: string
  price: number
  billingPeriod: number
  token: string
  isActive: boolean
  createdAt: number
  updatedAt: number
}

export interface Subscription {
  subscriptionId: number
  planId: number
  agentId: number
  subscriber: string
  status: number
  startDate: number
  nextBillingDate: number
  endDate: number
  currentUsage: number
  totalPaid: number
  createdAt: number
}

export interface Payment {
  paymentId: number
  agentId: number
  client: string
  token: string
  amount: number
  serviceDescription: string
  status: number
  createdAt: number
  completedAt: number
  escrowReleaseTime: number
  isEscrowed: boolean
  escrowHolder: string
}

export interface AgentStats {
  totalAgents: number
  activeSubscriptions: number
  totalRevenue: string
  pendingTasks: number
  activeEndpoints: number
  totalSkills: number
}

export interface Transaction {
  transactionId: number
  agentId: number
  token: string
  amount: number
  from: string
  to: string
  description: string
  timestamp: number
  isIncoming: boolean
}

// 合约交互错误类型
export interface ContractError {
  message: string
  code?: number
  data?: any
}

// 表单数据类型 - 修复：image应该是File | null
export interface AgentFormData {
  name: string
  description: string
  image: File | null
  capabilities: string[]
  supportedTrust: string[]
  endpoints: AgentEndpoint[]
}

export interface AgentCardForm {
  name: string
  description: string
  version: string
  capabilities: string[]
  supportedTasks: string[]
  communicationProtocol: string
  authenticationMethod: string
  cardURI: string
}

export interface ConfigFormData {
  configKey: string
  configValue: string
  dataType: string
  description: string
}

export interface SubscriptionFormData {
  name: string
  description: string
  price: number
  billingPeriod: number
  token: string
  maxUsage: number
}

// API响应类型
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

// 分页类型
export interface PaginationParams {
  page: number
  limit: number
  total: number
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: PaginationParams
}

// IPFS上传响应 - 新增
export interface IpfsUploadResponse {
  success: boolean
  IpfsHash: string
  PinSize: number
  Timestamp: string
  error?: string
}

export interface IpfsImageUploadResponse {
  success: boolean
  IpfsHash: string
  PinSize: number
  Timestamp: string
  error?: string
}

// 钱包连接状态
export interface WalletState {
  isConnected: boolean
  address?: string
  chainId?: number
  isConnecting: boolean
  error?: string
}

// 网络状态
export interface NetworkState {
  chainId: number
  name: string
  isSupported: boolean
  blockExplorer?: string
}

// 事件监听器类型
export interface ContractEvent {
  event: string
  args: any
  blockNumber: number
  transactionHash: string
}

// 加载状态 - 新增上传状态
export interface LoadingState {
  isLoading: boolean
  message?: string
  progress?: number
  isUploading?: boolean
  uploadProgress?: number
}

// 通知类型
export interface Notification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message: string
  timestamp: number
  duration?: number
}

// 验证状态
export interface ValidationStatus {
  isValid: boolean
  message?: string
  errors?: string[]
}

// 价格数据
export interface PriceData {
  price: number
  timestamp: number
  confidence: number
  source: string
}

// 代币配置
export interface TokenConfig {
  token: string
  symbol: string
  decimals: number
  isActive: boolean
  lastUpdate: number
}

// IPFS元数据类型 - 新增
export interface AgentIPFSMetadata {
  name: string
  description: string
  image: string
  external_url?: string
  attributes: Array<{
    trait_type: string
    value: any
  }>
}

export interface AgentCardIPFSMetadata {
  name: string
  description: string
  version: string
  capabilities: string[]
  supportedTasks: string[]
  communicationProtocol: string
  authenticationMethod: string
  attributes: Array<{
    trait_type: string
    value: any
  }>
}

// 上传状态类型 - 新增
export interface UploadState {
  isUploading: boolean
  progress: number
  currentStep: string
  error?: string
}

// 环境配置类型 - 新增
export interface EnvironmentConfig {
  pinataJwt: string
  ipfsGateway: string
  defaultChainId: number
  supportedChains: number[]
}

// 导出所有类型 - 修复：移除重复的导出声明
// 注意：所有接口已经在定义时使用 export 关键字导出
// 因此不需要额外的导出语句，删除以下代码以避免冲突

/*
// 删除以下重复导出代码，因为它们会导致导出声明冲突
export type {
  Agent,
  AgentCard,
  A2ASkill,
  A2ATask,
  Endpoint,
  ConfigEntry,
  SubscriptionPlan,
  Subscription,
  Payment,
  AgentStats,
  Transaction,
  ContractError,
  AgentFormData,
  AgentCardForm,
  ConfigFormData,
  SubscriptionFormData,
  ApiResponse,
  PaginationParams,
  PaginatedResponse,
  IpfsUploadResponse,
  IpfsImageUploadResponse,
  WalletState,
  NetworkState,
  ContractEvent,
  LoadingState,
  Notification,
  ValidationStatus,
  PriceData,
  TokenConfig,
  AgentIPFSMetadata,
  AgentCardIPFSMetadata,
  UploadState,
  EnvironmentConfig
}
*/
