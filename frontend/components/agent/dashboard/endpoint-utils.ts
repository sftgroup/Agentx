// components/agent/dashboard/endpoint-utils.ts
// R7 拆分：EndpointManager 的类型、常量与纯函数（供主组件与子组件引用）
import { Server, Zap, Globe, Shield, type LucideIcon } from 'lucide-react'

export interface EndpointFormData {
  name: string
  endpointType: string
  protocol: string
  url: string
  description: string
}

export interface EndpointTestResult {
  success: boolean
  responseTime?: number
  statusCode?: number
  error?: string
}

export interface ValidationResult {
  isValid: boolean
  message: string
}

export const ENDPOINT_TYPES: { value: string; label: string; icon: LucideIcon }[] = [
  { value: 'API', label: 'API端点', icon: Server },
  { value: 'WebSocket', label: 'WebSocket', icon: Zap },
  { value: 'gRPC', label: 'gRPC', icon: Globe },
  { value: 'A2A', label: 'A2A协议', icon: Shield }
]

export const PROTOCOLS: { value: string; label: string }[] = [
  { value: 'HTTP', label: 'HTTP' },
  { value: 'HTTPS', label: 'HTTPS' },
  { value: 'WebSocket', label: 'WebSocket' },
  { value: 'gRPC', label: 'gRPC' },
  { value: 'IPFS', label: 'IPFS' }
]

export const validateForm = (formData: EndpointFormData): ValidationResult => {
  if (!formData.name.trim()) {
    return { isValid: false, message: '端点名称不能为空' }
  }

  if (!formData.endpointType.trim()) {
    return { isValid: false, message: '端点类型不能为空' }
  }

  if (!formData.protocol.trim()) {
    return { isValid: false, message: '协议不能为空' }
  }

  if (!formData.url.trim()) {
    return { isValid: false, message: 'URL不能为空' }
  }

  try {
    new URL(formData.url)
  } catch {
    return { isValid: false, message: '无效的URL格式' }
  }

  return { isValid: true, message: '' }
}

export const formatTimestamp = (timestamp: bigint): string => {
  return new Date(Number(timestamp) * 1000).toLocaleDateString('zh-CN')
}

export const getEndpointTypeIcon = (type: string): LucideIcon => {
  const endpointType = ENDPOINT_TYPES.find(t => t.value === type)
  return endpointType ? endpointType.icon : Globe
}
