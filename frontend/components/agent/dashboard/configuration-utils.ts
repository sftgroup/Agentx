// components/agent/dashboard/configuration-utils.ts
// R7 拆分：ConfigurationManager 的类型、常量与纯函数（供主组件与子组件引用）
import { ConfigDataType } from '../hooks/useConfiguration'

export interface ConfigFormData {
  configKey: string
  configValue: string
  dataType: ConfigDataType
  description: string
}

export interface ValidationResult {
  isValid: boolean
  message: string
}

export const CONFIG_EXAMPLES = [
  {
    key: 'api_key',
    value: 'your_api_key_here',
    type: ConfigDataType.String,
    description: 'API访问密钥',
    example: 'sk-1234567890abcdef'
  },
  {
    key: 'service_endpoint',
    value: 'https://api.example.com/v1',
    type: ConfigDataType.String,
    description: '服务端点地址',
    example: 'https://api.openai.com/v1'
  },
  {
    key: 'timeout_ms',
    value: '5000',
    type: ConfigDataType.Number,
    description: '请求超时时间（毫秒）',
    example: '30000'
  },
  {
    key: 'max_retries',
    value: '3',
    type: ConfigDataType.Number,
    description: '最大重试次数',
    example: '5'
  },
  {
    key: 'debug_mode',
    value: 'false',
    type: ConfigDataType.Boolean,
    description: '调试模式开关',
    example: 'true'
  },
  {
    key: 'allowed_domains',
    value: '["example.com", "api.com"]',
    type: ConfigDataType.Array,
    description: '允许访问的域名列表',
    example: '["openai.com", "github.com"]'
  },
  {
    key: 'request_headers',
    value: '{"Content-Type": "application/json"}',
    type: ConfigDataType.Object,
    description: '请求头配置',
    example: '{"Authorization": "Bearer token", "User-Agent": "MyApp/1.0"}'
  }
]

export const DATA_TYPES = [
  { value: ConfigDataType.String, label: '字符串' },
  { value: ConfigDataType.Number, label: '数字' },
  { value: ConfigDataType.Boolean, label: '布尔值' },
  { value: ConfigDataType.Array, label: '数组' },
  { value: ConfigDataType.Object, label: '对象' }
]

export const validateForm = (
  formData: ConfigFormData,
  validateConfigValue: (value: string, type: ConfigDataType) => boolean
): ValidationResult => {
  if (!formData.configKey.trim()) {
    return { isValid: false, message: '配置键不能为空' }
  }

  if (!formData.configValue.trim()) {
    return { isValid: false, message: '配置值不能为空' }
  }

  if (!validateConfigValue(formData.configValue, formData.dataType)) {
    switch (formData.dataType) {
      case ConfigDataType.Number:
        return { isValid: false, message: '配置值必须为有效数字' }
      case ConfigDataType.Boolean:
        return { isValid: false, message: '配置值必须为 true 或 false' }
      case ConfigDataType.Array:
        return { isValid: false, message: '配置值必须为有效的 JSON 数组' }
      case ConfigDataType.Object:
        return { isValid: false, message: '配置值必须为有效的 JSON 对象' }
      default:
        return { isValid: false, message: '配置值格式不正确' }
    }
  }

  return { isValid: true, message: '' }
}

export const isSensitiveConfigKey = (configKey: string): boolean => {
  return configKey.toLowerCase().includes('key') ||
         configKey.toLowerCase().includes('secret') ||
         configKey.toLowerCase().includes('password') ||
         configKey.toLowerCase().includes('token')
}

export const getDataTypeLabel = (dataType: ConfigDataType): string => {
  const type = DATA_TYPES.find(t => t.value === dataType)
  return type ? type.label : dataType
}

export const formatConfigValue = (value: string, dataType: ConfigDataType): string => {
  try {
    switch (dataType) {
      case ConfigDataType.Array:
      case ConfigDataType.Object:
        return JSON.stringify(JSON.parse(value), null, 2)
      case ConfigDataType.Boolean:
        return value === 'true' ? '是' : '否'
      case ConfigDataType.Number:
        return Number(value).toLocaleString()
      default:
        return value
    }
  } catch {
    return value
  }
}

export const getConfigValuePreview = (value: string, dataType: ConfigDataType, configKey: string, isValueVisible: boolean): string => {
  const isSensitive = isSensitiveConfigKey(configKey)

  if (isSensitive && !isValueVisible) {
    return '••••••••'
  }

  try {
    switch (dataType) {
      case ConfigDataType.Array:
        const arr = JSON.parse(value)
        return `数组 [${arr.length} 项]`
      case ConfigDataType.Object:
        const obj = JSON.parse(value)
        return `对象 {${Object.keys(obj).length} 属性}`
      case ConfigDataType.Boolean:
        return value === 'true' ? '是' : '否'
      case ConfigDataType.Number:
        return Number(value).toLocaleString()
      default:
        return value.length > 50 ? `${value.substring(0, 50)}...` : value
    }
  } catch {
    return value
  }
}
