// components/agent/hooks/useConfiguration.ts
'use client'

import { 
  useWriteContract, 
  useReadContract, 
  useAccount, 
  useWaitForTransactionReceipt,
  usePublicClient 
} from 'wagmi'
import { useState, useEffect, useCallback, useMemo } from 'react'

// 生产级环境变量验证
const validateAddress = (address: string | undefined): `0x${string}` => {
  if (!address || !address.startsWith('0x') || address.length !== 42) {
    console.error('Invalid contract address:', address)
    return '0x0000000000000000000000000000000000000000'
  }
  return address as `0x${string}`
}

const CONFIGURATION_REGISTRY_ADDRESS = validateAddress(process.env.NEXT_PUBLIC_CONFIGURATION_REGISTRY_ADDRESS)

// 完整的 ABI 定义，与智能合约完全匹配
const CONFIGURATION_REGISTRY_ABI = [
  // 配置管理函数
  {
    name: 'setConfig',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'configKey', type: 'string' },
      { name: 'configValue', type: 'string' },
      { name: 'dataType', type: 'string' },
      { name: 'description', type: 'string' }
    ],
    outputs: [{ name: 'configId', type: 'uint256' }],
    stateMutability: 'nonpayable'
  },
  {
    name: 'setConfigsBulk',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'configKeys', type: 'string[]' },
      { name: 'configValues', type: 'string[]' },
      { name: 'dataTypes', type: 'string[]' },
      { name: 'descriptions', type: 'string[]' }
    ],
    outputs: [{ name: 'configIds', type: 'uint256[]' }],
    stateMutability: 'nonpayable'
  },
  {
    name: 'removeConfig',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'configKey', type: 'string' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  
  // 查询函数
  {
    name: 'getConfig',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'configKey', type: 'string' }
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'configId', type: 'uint256' },
          { name: 'agentId', type: 'uint256' },
          { name: 'configKey', type: 'string' },
          { name: 'configValue', type: 'string' },
          { name: 'dataType', type: 'string' },
          { name: 'description', type: 'string' },
          { name: 'isActive', type: 'bool' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'updatedAt', type: 'uint256' },
          { name: 'createdBy', type: 'address' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  {
    name: 'getAgentConfigs',
    type: 'function',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'configId', type: 'uint256' },
          { name: 'agentId', type: 'uint256' },
          { name: 'configKey', type: 'string' },
          { name: 'configValue', type: 'string' },
          { name: 'dataType', type: 'string' },
          { name: 'description', type: 'string' },
          { name: 'isActive', type: 'bool' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'updatedAt', type: 'uint256' },
          { name: 'createdBy', type: 'address' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  {
    name: 'getConfigKeys',
    type: 'function',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{ name: '', type: 'string[]' }],
    stateMutability: 'view'
  },
  {
    name: 'getConfigCount',
    type: 'function',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    name: 'configExists',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'configKey', type: 'string' }
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view'
  },
  {
    name: 'getConfigCounter',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  
  // 事件定义
  {
    name: 'ConfigSet',
    type: 'event',
    inputs: [
      { name: 'configId', type: 'uint256', indexed: true },
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'configKey', type: 'string', indexed: true },
      { name: 'configValue', type: 'string', indexed: false },
      { name: 'dataType', type: 'string', indexed: false },
      { name: 'createdBy', type: 'address', indexed: false }
    ]
  },
  {
    name: 'ConfigUpdated',
    type: 'event',
    inputs: [
      { name: 'configId', type: 'uint256', indexed: true },
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'configKey', type: 'string', indexed: false },
      { name: 'configValue', type: 'string', indexed: false },
      { name: 'updatedAt', type: 'uint256', indexed: false }
    ]
  },
  {
    name: 'ConfigRemoved',
    type: 'event',
    inputs: [
      { name: 'configId', type: 'uint256', indexed: true },
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'configKey', type: 'string', indexed: false }
    ]
  }
] as const

// TypeScript 接口定义
export enum ConfigDataType {
  String = 'string',
  Number = 'number',
  Boolean = 'boolean',
  Array = 'array',
  Object = 'object'
}

export interface ConfigEntry {
  configId: bigint
  agentId: bigint
  configKey: string
  configValue: string
  dataType: ConfigDataType
  description: string
  isActive: boolean
  createdAt: bigint
  updatedAt: bigint
  createdBy: `0x${string}`
}

// 修复：导出 BulkConfigInput 接口
export interface BulkConfigInput {
  configKey: string
  configValue: string
  dataType: ConfigDataType
  description: string
}

interface UseConfigurationReturn {
  // 配置操作
  setConfig: (
    agentId: number,
    configKey: string,
    configValue: string,
    dataType: ConfigDataType,
    description: string
  ) => Promise<`0x${string}` | undefined>
  setConfigsBulk: (
    agentId: number,
    configs: BulkConfigInput[]
  ) => Promise<`0x${string}` | undefined>
  removeConfig: (agentId: number, configKey: string) => Promise<`0x${string}` | undefined>
  
  // 查询功能
  getConfig: (agentId: number, configKey: string) => Promise<ConfigEntry | null>
  getAgentConfigs: (agentId: number) => Promise<ConfigEntry[]>
  getConfigKeys: (agentId: number) => Promise<string[]>
  getConfigCount: (agentId: number) => Promise<number>
  configExists: (agentId: number, configKey: string) => Promise<boolean>
  getConfigCounter: () => Promise<number>
  
  // 验证功能
  validateConfigValue: (value: string, dataType: ConfigDataType) => boolean
  getSupportedDataTypes: () => ConfigDataType[]
  
  // 实时数据
  agentConfigs: ConfigEntry[]
  configKeys: string[]
  configCount: number
  
  // 状态
  isSettingConfig: boolean
  isSettingConfigsBulk: boolean
  isRemovingConfig: boolean
  isLoading: boolean
  error: Error | null
  transactionHash: `0x${string}` | undefined
  isConfirming: boolean
  isConfirmed: boolean
  
  // 工具函数
  refetchData: (agentId: number) => Promise<void>
  resetState: () => void
}

export function useConfiguration(): UseConfigurationReturn {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  
  const [error, setError] = useState<Error | null>(null)
  const [transactionHash, setTransactionHash] = useState<`0x${string}` | undefined>()
  const [currentAgentId, setCurrentAgentId] = useState<number | null>(null)
  const [agentConfigs, setAgentConfigs] = useState<ConfigEntry[]>([])
  const [configKeys, setConfigKeys] = useState<string[]>([])
  const [configCount, setConfigCount] = useState<number>(0)

  // 修复：使用 writeContractAsync 并确保参数正确传递
  const { 
    writeContractAsync: setConfigAsync,
    isPending: isSettingConfig,
    error: setConfigError,
    reset: resetSetConfig
  } = useWriteContract()

  const { 
    writeContractAsync: setConfigsBulkAsync,
    isPending: isSettingConfigsBulk,
    error: setConfigsBulkError,
    reset: resetSetConfigsBulk
  } = useWriteContract()

  const { 
    writeContractAsync: removeConfigAsync,
    isPending: isRemovingConfig,
    error: removeConfigError,
    reset: resetRemoveConfig
  } = useWriteContract()

  // 统一的交易确认状态
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: transactionHash,
  })

  // 修复：在交易确认后手动刷新数据，而不是依赖自动刷新
  useEffect(() => {
    if (isConfirmed && currentAgentId) {
      refetchData(currentAgentId)
    }
  }, [isConfirmed, currentAgentId])

  // 错误处理 Effect
  useEffect(() => {
    const currentError = setConfigError || setConfigsBulkError || removeConfigError
    
    if (currentError) {
      console.error('Configuration hook error:', currentError)
      setError(currentError)
    }
  }, [
    setConfigError, 
    setConfigsBulkError, 
    removeConfigError
  ])

  // 验证配置值
  const validateConfigValue = useCallback((value: string, dataType: ConfigDataType): boolean => {
    try {
      switch (dataType) {
        case ConfigDataType.String:
          return typeof value === 'string' && value.length > 0
        
        case ConfigDataType.Number:
          return !isNaN(Number(value)) && isFinite(Number(value))
        
        case ConfigDataType.Boolean:
          return value === 'true' || value === 'false'
        
        case ConfigDataType.Array:
          try {
            const parsed = JSON.parse(value)
            return Array.isArray(parsed)
          } catch {
            return false
          }
        
        case ConfigDataType.Object:
          try {
            const parsed = JSON.parse(value)
            return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
          } catch {
            return false
          }
        
        default:
          return false
      }
    } catch {
      return false
    }
  }, [])

  // 获取支持的数据类型
  const getSupportedDataTypes = useCallback((): ConfigDataType[] => {
    return [
      ConfigDataType.String,
      ConfigDataType.Number,
      ConfigDataType.Boolean,
      ConfigDataType.Array,
      ConfigDataType.Object
    ]
  }, [])

  // 设置配置
  const setConfig = useCallback(async (
    agentId: number,
    configKey: string,
    configValue: string,
    dataType: ConfigDataType,
    description: string
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (agentId <= 0) {
        throw new Error('无效的Agent ID')
      }

      if (!configKey || configKey.trim().length === 0) {
        throw new Error('配置键不能为空')
      }

      if (!configValue || configValue.trim().length === 0) {
        throw new Error('配置值不能为空')
      }

      if (!dataType || !getSupportedDataTypes().includes(dataType)) {
        throw new Error('无效的数据类型')
      }

      // 验证配置值
      if (!validateConfigValue(configValue, dataType)) {
        throw new Error(`配置值不符合数据类型 ${dataType} 的要求`)
      }

      setError(null)
      
      const hash = await setConfigAsync({
        address: CONFIGURATION_REGISTRY_ADDRESS,
        abi: CONFIGURATION_REGISTRY_ABI,
        functionName: 'setConfig',
        args: [
          BigInt(agentId),
          configKey.trim(),
          configValue.trim(),
          dataType,
          (description || '').trim()
        ]
      })

      setTransactionHash(hash)
      setCurrentAgentId(agentId)
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('设置配置失败')
      setError(error)
      console.error('Set config error:', err)
      return undefined
    }
  }, [isConnected, address, setConfigAsync, validateConfigValue, getSupportedDataTypes])

  // 批量设置配置
  const setConfigsBulk = useCallback(async (
    agentId: number,
    configs: BulkConfigInput[]
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (agentId <= 0) {
        throw new Error('无效的Agent ID')
      }

      if (!configs || configs.length === 0) {
        throw new Error('配置列表不能为空')
      }

      if (configs.length > 50) {
        throw new Error('批量配置数量不能超过50个')
      }

      // 验证所有配置
      const configKeys: string[] = []
      const configValues: string[] = []
      const dataTypes: string[] = []
      const descriptions: string[] = []

      for (const config of configs) {
        if (!config.configKey || config.configKey.trim().length === 0) {
          throw new Error('配置键不能为空')
        }

        if (!config.configValue || config.configValue.trim().length === 0) {
          throw new Error('配置值不能为空')
        }

        if (!config.dataType || !getSupportedDataTypes().includes(config.dataType)) {
          throw new Error(`无效的数据类型: ${config.dataType}`)
        }

        if (!validateConfigValue(config.configValue, config.dataType)) {
          throw new Error(`配置值 ${config.configKey} 不符合数据类型 ${config.dataType} 的要求`)
        }

        configKeys.push(config.configKey.trim())
        configValues.push(config.configValue.trim())
        dataTypes.push(config.dataType)
        descriptions.push((config.description || '').trim())
      }

      setError(null)
      
      const hash = await setConfigsBulkAsync({
        address: CONFIGURATION_REGISTRY_ADDRESS,
        abi: CONFIGURATION_REGISTRY_ABI,
        functionName: 'setConfigsBulk',
        args: [
          BigInt(agentId),
          configKeys,
          configValues,
          dataTypes,
          descriptions
        ]
      })

      setTransactionHash(hash)
      setCurrentAgentId(agentId)
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('批量设置配置失败')
      setError(error)
      console.error('Set configs bulk error:', err)
      return undefined
    }
  }, [isConnected, address, setConfigsBulkAsync, validateConfigValue, getSupportedDataTypes])

  // 删除配置
  const removeConfig = useCallback(async (
    agentId: number,
    configKey: string
  ): Promise<`0x${string}` | undefined> => {
    try {
      if (!isConnected || !address) {
        throw new Error('请先连接钱包')
      }

      if (agentId <= 0) {
        throw new Error('无效的Agent ID')
      }

      if (!configKey || configKey.trim().length === 0) {
        throw new Error('配置键不能为空')
      }

      setError(null)
      
      const hash = await removeConfigAsync({
        address: CONFIGURATION_REGISTRY_ADDRESS,
        abi: CONFIGURATION_REGISTRY_ABI,
        functionName: 'removeConfig',
        args: [BigInt(agentId), configKey.trim()]
      })

      setTransactionHash(hash)
      setCurrentAgentId(agentId)
      return hash
    } catch (err) {
      const error = err instanceof Error ? err : new Error('删除配置失败')
      setError(error)
      console.error('Remove config error:', err)
      return undefined
    }
  }, [isConnected, address, removeConfigAsync])

  // 获取配置详情 - 使用 publicClient 手动调用
  const getConfig = useCallback(async (agentId: number, configKey: string): Promise<ConfigEntry | null> => {
    try {
      if (agentId <= 0) {
        return null
      }

      if (!configKey || configKey.trim().length === 0) {
        return null
      }

      if (!publicClient) {
        console.error('Public client not available')
        return null
      }

      const result = await publicClient.readContract({
        address: CONFIGURATION_REGISTRY_ADDRESS,
        abi: CONFIGURATION_REGISTRY_ABI,
        functionName: 'getConfig',
        args: [BigInt(agentId), configKey.trim()],
      })

      return result as ConfigEntry || null
    } catch (err) {
      console.error('Get config error:', err)
      return null
    }
  }, [publicClient])

  // 获取Agent的所有配置 - 修复：使用 publicClient 手动调用
  const getAgentConfigs = useCallback(async (agentId: number): Promise<ConfigEntry[]> => {
    try {
      if (agentId <= 0) {
        return []
      }

      if (!publicClient) {
        console.error('Public client not available')
        return []
      }

      const result = await publicClient.readContract({
        address: CONFIGURATION_REGISTRY_ADDRESS,
        abi: CONFIGURATION_REGISTRY_ABI,
        functionName: 'getAgentConfigs',
        args: [BigInt(agentId)],
      })

      const configs = (result as ConfigEntry[]) || []
      setAgentConfigs(configs)
      setCurrentAgentId(agentId)
      return configs
    } catch (err) {
      console.error('Get agent configs error:', err)
      return []
    }
  }, [publicClient])

  // 获取Agent的配置键列表 - 修复：使用 publicClient 手动调用
  const getConfigKeys = useCallback(async (agentId: number): Promise<string[]> => {
    try {
      if (agentId <= 0) {
        return []
      }

      if (!publicClient) {
        console.error('Public client not available')
        return []
      }

      const result = await publicClient.readContract({
        address: CONFIGURATION_REGISTRY_ADDRESS,
        abi: CONFIGURATION_REGISTRY_ABI,
        functionName: 'getConfigKeys',
        args: [BigInt(agentId)],
      })

      const keys = (result as string[]) || []
      setConfigKeys(keys)
      return keys
    } catch (err) {
      console.error('Get config keys error:', err)
      return []
    }
  }, [publicClient])

  // 获取配置数量 - 修复：使用 publicClient 手动调用
  const getConfigCount = useCallback(async (agentId: number): Promise<number> => {
    try {
      if (agentId <= 0) {
        return 0
      }

      if (!publicClient) {
        console.error('Public client not available')
        return 0
      }

      const result = await publicClient.readContract({
        address: CONFIGURATION_REGISTRY_ADDRESS,
        abi: CONFIGURATION_REGISTRY_ABI,
        functionName: 'getConfigCount',
        args: [BigInt(agentId)],
      })

      const count = result ? Number(result) : 0
      setConfigCount(count)
      return count
    } catch (err) {
      console.error('Get config count error:', err)
      return 0
    }
  }, [publicClient])

  // 检查配置是否存在 - 使用 publicClient 手动调用
  const configExists = useCallback(async (agentId: number, configKey: string): Promise<boolean> => {
    try {
      if (agentId <= 0) {
        return false
      }

      if (!configKey || configKey.trim().length === 0) {
        return false
      }

      if (!publicClient) {
        return false
      }

      const result = await publicClient.readContract({
        address: CONFIGURATION_REGISTRY_ADDRESS,
        abi: CONFIGURATION_REGISTRY_ABI,
        functionName: 'configExists',
        args: [BigInt(agentId), configKey.trim()],
      })

      return result as boolean || false
    } catch (err) {
      console.error('Check config exists error:', err)
      return false
    }
  }, [publicClient])

  // 获取配置计数器 - 使用 publicClient 手动调用
  const getConfigCounter = useCallback(async (): Promise<number> => {
    try {
      if (!publicClient) {
        return 0
      }

      const result = await publicClient.readContract({
        address: CONFIGURATION_REGISTRY_ADDRESS,
        abi: CONFIGURATION_REGISTRY_ABI,
        functionName: 'getConfigCounter',
      })

      return result ? Number(result) : 0
    } catch (err) {
      console.error('Get config counter error:', err)
      return 0
    }
  }, [publicClient])

  // 重新获取所有数据 - 修复：手动调用所有数据获取函数
  const refetchData = useCallback(async (agentId: number): Promise<void> => {
    try {
      if (agentId <= 0) {
        return
      }

      await Promise.all([
        getAgentConfigs(agentId),
        getConfigKeys(agentId),
        getConfigCount(agentId)
      ])
    } catch (err) {
      console.error('Refetch data error:', err)
    }
  }, [getAgentConfigs, getConfigKeys, getConfigCount])

  // 重置状态
  const resetState = useCallback((): void => {
    setError(null)
    setTransactionHash(undefined)
    setCurrentAgentId(null)
    setAgentConfigs([])
    setConfigKeys([])
    setConfigCount(0)
    resetSetConfig()
    resetSetConfigsBulk()
    resetRemoveConfig()
  }, [
    resetSetConfig,
    resetSetConfigsBulk,
    resetRemoveConfig
  ])

  // 计算状态
  const isLoading = useMemo(() => 
    isSettingConfig || isSettingConfigsBulk || isRemovingConfig,
    [isSettingConfig, isSettingConfigsBulk, isRemovingConfig]
  )

  return {
    // 配置操作
    setConfig,
    setConfigsBulk,
    removeConfig,
    
    // 查询功能
    getConfig,
    getAgentConfigs,
    getConfigKeys,
    getConfigCount,
    configExists,
    getConfigCounter,
    
    // 验证功能
    validateConfigValue,
    getSupportedDataTypes,
    
    // 实时数据
    agentConfigs,
    configKeys,
    configCount,
    
    // 状态
    isSettingConfig,
    isSettingConfigsBulk,
    isRemovingConfig,
    isLoading,
    error,
    transactionHash,
    isConfirming,
    isConfirmed,
    
    // 工具函数
    refetchData,
    resetState
  }
}
