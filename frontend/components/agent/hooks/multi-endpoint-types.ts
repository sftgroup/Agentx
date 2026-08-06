// components/agent/hooks/multi-endpoint-types.ts
// R7 拆分：useMultiEndpoint 的类型、常量、纯工具函数（供 hook 与外部消费方引用）

// 生产级环境变量验证
const validateAddress = (address: string | undefined): `0x${string}` => {
  if (!address || !address.startsWith('0x') || address.length !== 42) {
    console.error('Invalid contract address:', address)
    return '0x0000000000000000000000000000000000000000'
  }
  return address as `0x${string}`
}

export const MULTI_ENDPOINT_ADDRESS = validateAddress(process.env.NEXT_PUBLIC_MULTI_ENDPOINT_ADDRESS)

// TypeScript 接口定义
export interface Endpoint {
  endpointId: bigint
  agentId: bigint
  name: string
  endpointType: string
  protocol: string
  url: string
  description: string
  isActive: boolean
  createdAt: bigint
  updatedAt: bigint
  createdBy: `0x${string}`
}

export interface ProtocolConfig {
  protocol: string
  isSupported: boolean
  maxEndpointsPerAgent: bigint
  requiredParams: string[]
}

export interface EndpointStats {
  totalEndpoints: bigint
  activeEndpoints: bigint
  httpEndpoints: bigint
  websocketEndpoints: bigint
  grpcEndpoints: bigint
}

// 类型守卫函数 - 检查是否为 EndpointStats 类型
export const isEndpointStats = (data: unknown): data is EndpointStats => {
  if (typeof data !== 'object' || data === null) return false
  const stats = data as Record<string, unknown>
  return (
    typeof stats.totalEndpoints === 'bigint' &&
    typeof stats.activeEndpoints === 'bigint' &&
    typeof stats.httpEndpoints === 'bigint' &&
    typeof stats.websocketEndpoints === 'bigint' &&
    typeof stats.grpcEndpoints === 'bigint'
  )
}

// 类型转换函数 - 将元组转换为 EndpointStats 对象
export const tupleToEndpointStats = (tuple: readonly [bigint, bigint, bigint, bigint, bigint] | undefined): EndpointStats | null => {
  if (!tuple || !Array.isArray(tuple) || tuple.length !== 5) {
    return null
  }
  
  return {
    totalEndpoints: tuple[0],
    activeEndpoints: tuple[1],
    httpEndpoints: tuple[2],
    websocketEndpoints: tuple[3],
    grpcEndpoints: tuple[4]
  }
}

export interface UseMultiEndpointReturn {
  // 端点操作
  createEndpoint: (
    agentId: number,
    name: string,
    endpointType: string,
    protocol: string,
    url: string,
    description: string
  ) => Promise<`0x${string}` | undefined>
  updateEndpoint: (
    endpointId: number,
    name: string,
    endpointType: string,
    protocol: string,
    url: string,
    description: string
  ) => Promise<`0x${string}` | undefined>
  deactivateEndpoint: (endpointId: number) => Promise<`0x${string}` | undefined>
  addProtocolSupport: (
    protocol: string,
    maxEndpointsPerAgent: number,
    requiredParams: string[]
  ) => Promise<`0x${string}` | undefined>
  
  // 查询功能
  getEndpoint: (endpointId: number) => Promise<Endpoint | null>
  getAgentEndpoints: (agentId: number) => Promise<Endpoint[]>
  getActiveAgentEndpoints: (agentId: number) => Promise<Endpoint[]>
  getEndpointsByProtocol: (protocol: string) => Promise<Endpoint[]>
  getSupportedProtocols: () => Promise<string[]>
  getProtocolConfig: (protocol: string) => Promise<ProtocolConfig | null>
  isProtocolSupported: (protocol: string) => Promise<boolean>
  getAgentEndpointStats: (agentId: number) => Promise<EndpointStats | null>
  searchEndpoints: (endpointType: string, protocol: string) => Promise<Endpoint[]>
  
  // 实时数据
  agentEndpoints: Endpoint[]
  activeAgentEndpoints: Endpoint[]
  endpointsByProtocol: Endpoint[]
  supportedProtocols: string[]
  protocolConfig: ProtocolConfig | null
  endpointStats: EndpointStats | null
  searchResults: Endpoint[]
  
  // 状态
  isCreatingEndpoint: boolean
  isUpdatingEndpoint: boolean
  isDeactivatingEndpoint: boolean
  isAddingProtocolSupport: boolean
  isLoading: boolean
  error: Error | null
  transactionHash: `0x${string}` | undefined
  isConfirming: boolean
  isConfirmed: boolean
  
  // 工具函数
  refetchData: () => Promise<void>
  resetState: () => void
}
