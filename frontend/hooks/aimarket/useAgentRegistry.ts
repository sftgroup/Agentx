// hooks/aimarket/useAgentRegistry.ts
'use client'

import { useReadContract, useAccount, usePublicClient } from 'wagmi'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, useRef } from 'react'
import { ipfsDataFetcher, AgentMetadata } from '@/lib/aimarket/ipfsDataFetcher'

const AGENT_REGISTRY_ABI = [
  {
    "inputs": [],
    "name": "getCurrentAgentId",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "tokenId", "type": "uint256"}],
    "name": "tokenURI",
    "outputs": [{"internalType": "string", "name": "", "type": "string"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "tokenId", "type": "uint256"}],
    "name": "ownerOf",
    "outputs": [{"internalType": "address", "name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address", "name": "owner", "type": "address"}],
    "name": "getAgentsByOwner",
    "outputs": [{"internalType": "uint256[]", "name": "", "type": "uint256[]"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "agentId", "type": "uint256"}],
    "name": "agentExists",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  }
] as const

export interface AgentInfo {
  id: number
  owner: string
  tokenURI: string
  metadata?: AgentMetadata
  cid?: string
  isLoaded: boolean
  hasError: boolean
  errorMessage?: string
  status?: 'success' | 'no-metadata' | 'metadata-failed' | 'error'
  lastUpdated?: number
  hasSubscriptionPlans?: boolean
}

export interface UseAgentRegistryReturn {
  agents: AgentInfo[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  totalAgents: number
  loadedCount: number
  errorCount: number
  refetch: () => void
  fetchMore: (count: number) => Promise<void>
}

// 从 tokenURI 中提取 CID
function extractCIDFromTokenURI(tokenURI: string): string | null {
  if (!tokenURI || tokenURI.trim() === '') return null
  
  if (tokenURI.startsWith('ipfs://')) {
    return tokenURI.replace('ipfs://', '').split('/')[0]
  }
  
  const ipfsIoMatch = tokenURI.match(/ipfs\.io\/ipfs\/([^/?#]+)/)
  if (ipfsIoMatch) {
    return ipfsIoMatch[1]
  }
  
  const gatewayMatch = tokenURI.match(/\/ipfs\/([^/?#]+)/)
  if (gatewayMatch) {
    return gatewayMatch[1]
  }
  
  if (/^[a-zA-Z0-9]{46,}$/.test(tokenURI)) {
    return tokenURI
  }
  
  return null
}

// 修复 BigInt 序列化问题
const sanitizeDataForReactQuery = <T,>(data: T): T => {
  if (data === null || data === undefined) {
    return data
  }
  
  if (typeof data === 'bigint') {
    return Number(data) as unknown as T
  }
  
  if (Array.isArray(data)) {
    return data.map(sanitizeDataForReactQuery) as unknown as T
  }
  
  if (typeof data === 'object') {
    const result: any = {}
    for (const [key, value] of Object.entries(data)) {
      result[key] = sanitizeDataForReactQuery(value)
    }
    return result
  }
  
  return data
}

// 获取合约地址
const getContractAddress = (): `0x${string}` | undefined => {
  const address = process.env.NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS || 
                  process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS;
  
  if (!address) {
    console.error('No contract address found in environment variables');
    return undefined;
  }
  
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    console.error('Invalid contract address format:', address);
    return undefined;
  }
  
  return address as `0x${string}`;
}

// 本地缓存管理 - 使用更稳定的缓存策略
class AgentCacheManager {
  private static readonly CACHE_KEY = 'agent-registry-cache-v2'; // 更新缓存key
  private static readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时缓存
  
  static getCache(): Map<number, AgentInfo> {
    if (typeof window === 'undefined') return new Map();
    
    try {
      const cached = localStorage.getItem(this.CACHE_KEY);
      if (!cached) return new Map();
      
      const parsed = JSON.parse(cached);
      const cacheData = parsed.data;
      const timestamp = parsed.timestamp;
      
      // 检查缓存是否过期
      if (Date.now() - timestamp > this.CACHE_TTL) {
        localStorage.removeItem(this.CACHE_KEY);
        return new Map();
      }
      
      // 确保缓存数据格式正确
      const cacheMap = new Map<number, AgentInfo>();
      cacheData.forEach(([key, value]: [string, any]) => {
        // 修复：确保metadata字段正确恢复
        if (value && typeof value === 'object') {
          cacheMap.set(Number(key), {
            ...value,
            // 确保metadata存在且格式正确
            metadata: value.metadata || undefined
          });
        }
      });
      
      return cacheMap;
    } catch (error) {
      console.error('Failed to read agent cache:', error);
      return new Map();
    }
  }
  
  static setCache(cache: Map<number, AgentInfo>): void {
    if (typeof window === 'undefined') return;
    
    try {
      const cacheData = Array.from(cache.entries()).map(([key, value]) => {
        // 修复：确保metadata正确序列化
        return [key, {
          ...value,
          // 确保metadata被正确保存
          metadata: value.metadata ? { ...value.metadata } : undefined
        }];
      });
      
      const cacheObject = {
        data: cacheData,
        timestamp: Date.now()
      };
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(cacheObject));
    } catch (error) {
      console.error('Failed to save agent cache:', error);
    }
  }
  
  static clearCache(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(this.CACHE_KEY);
  }
}

export function useAgentRegistry(batchSize: number = 12): UseAgentRegistryReturn {
  const { address, isConnected } = useAccount()
  const queryClient = useQueryClient()
  const publicClient = usePublicClient()
  const [localAgents, setLocalAgents] = useState<AgentInfo[]>([])
  const [agentCache] = useState(() => AgentCacheManager.getCache())
  const [isRefreshing, setIsRefreshing] = useState(false)
  const initialLoadRef = useRef(false)

  // 获取合约地址
  const contractAddress = getContractAddress()

  // 获取当前最大 Agent ID - 移除区块监听
  const { 
    data: currentAgentId, 
    isLoading: isLoadingCount,
    isError: isCountError,
    error: countError,
    refetch: refetchCount
  } = useReadContract({
    address: contractAddress,
    abi: AGENT_REGISTRY_ABI,
    functionName: 'getCurrentAgentId',
    query: {
      enabled: !!contractAddress,
      staleTime: 60 * 60 * 1000, // 1小时
    }
  })

  // 合约调用函数
  const fetchTokenURIFromContract = async (agentId: number): Promise<string> => {
    if (!publicClient || !contractAddress) {
      throw new Error('Public client or contract address not available')
    }

    try {
      const tokenURI = await publicClient.readContract({
        address: contractAddress,
        abi: AGENT_REGISTRY_ABI,
        functionName: 'tokenURI',
        args: [BigInt(agentId)]
      })
      
      return tokenURI as string
    } catch (error) {
      console.error(`Failed to fetch tokenURI for agent ${agentId}:`, error)
      return ''
    }
  }

  const fetchOwnerFromContract = async (agentId: number): Promise<string> => {
    if (!publicClient || !contractAddress) {
      throw new Error('Public client or contract address not available')
    }

    try {
      const owner = await publicClient.readContract({
        address: contractAddress,
        abi: AGENT_REGISTRY_ABI,
        functionName: 'ownerOf',
        args: [BigInt(agentId)]
      })
      
      return owner as string
    } catch (error) {
      console.error(`Failed to fetch owner for agent ${agentId}:`, error)
      return '0x0000000000000000000000000000000000000000'
    }
  }

  const checkAgentExists = async (agentId: number): Promise<boolean> => {
    if (!publicClient || !contractAddress) {
      return false
    }

    try {
      const exists = await publicClient.readContract({
        address: contractAddress,
        abi: AGENT_REGISTRY_ABI,
        functionName: 'agentExists',
        args: [BigInt(agentId)]
      })
      
      return exists as boolean
    } catch (error) {
      console.error(`Failed to check existence for agent ${agentId}:`, error)
      return true
    }
  }

  // 获取单个Agent的完整数据
  const fetchAgentData = async (agentId: number): Promise<AgentInfo> => {
    // 首先检查缓存
    if (agentCache.has(agentId)) {
      const cachedAgent = agentCache.get(agentId)!
      if (cachedAgent.lastUpdated && Date.now() - cachedAgent.lastUpdated < 24 * 60 * 60 * 1000) {
        console.log(`Using cached data for agent ${agentId}`)
        return cachedAgent
      }
    }

    try {
      // 检查 agent 是否存在
      const exists = await checkAgentExists(agentId)
      if (!exists) {
        throw new Error(`Agent ${agentId} does not exist`)
      }

      // 获取链上数据
      const [tokenURI, owner] = await Promise.all([
        fetchTokenURIFromContract(agentId),
        fetchOwnerFromContract(agentId)
      ])
      
      const cid = extractCIDFromTokenURI(tokenURI)
      
      const agentInfo: AgentInfo = {
        id: agentId,
        owner,
        tokenURI,
        cid: cid || undefined,
        isLoaded: false,
        hasError: false,
        status: 'no-metadata',
        lastUpdated: Date.now(),
        hasSubscriptionPlans: false
      }

      // 获取IPFS元数据
      if (cid) {
        const result = await ipfsDataFetcher.fetchAgentMetadata(cid)
        if (result.metadata) {
          agentInfo.metadata = result.metadata
          agentInfo.isLoaded = true
          agentInfo.status = 'success'
          
          // 检查是否有订阅机制 - 修复逻辑
          if (result.metadata.pricing) {
            agentInfo.hasSubscriptionPlans = true
          }
          
          // 修复：使用 agentInfo.cid 而不是 agent.cid
          console.log(`Loaded metadata for agent ${agentId} from CID: ${agentInfo.cid}`)
        } else {
          // IPFS 获取失败
          agentInfo.metadata = {
            name: `Agent ${agentId}`,
            description: '元数据获取失败',
            tags: ['metadata-failed'],
            capabilities: []
          }
          agentInfo.isLoaded = true
          agentInfo.hasError = true
          agentInfo.status = 'metadata-failed'
          agentInfo.errorMessage = result.error
        }
      } else {
        // 没有 CID
        agentInfo.metadata = {
          name: `Agent ${agentId}`,
          description: '此 Agent 没有配置 IPFS 元数据',
          tags: ['no-metadata'],
          capabilities: []
        }
        agentInfo.isLoaded = true
        agentInfo.status = 'no-metadata'
      }

      // 更新缓存
      agentCache.set(agentId, agentInfo)
      AgentCacheManager.setCache(agentCache)

      return agentInfo
    } catch (error) {
      console.error(`Failed to fetch agent ${agentId}:`, error)
      const errorAgent: AgentInfo = {
        id: agentId,
        owner: '',
        tokenURI: '',
        isLoaded: false,
        hasError: true,
        errorMessage: error instanceof Error ? error.message : 'Contract call failed',
        status: 'error',
        lastUpdated: Date.now(),
        hasSubscriptionPlans: false
      }
      return errorAgent
    }
  }

  // 获取指定范围的 Agent 数据
  const fetchAgentsInRange = async (startId: number, endId: number): Promise<AgentInfo[]> => {
    const agents: AgentInfo[] = []
    
    for (let agentId = startId; agentId <= endId; agentId++) {
      const agent = await fetchAgentData(agentId)
      agents.push(agent)
    }

    console.log(`Agent loading completed: ${agents.length} agents processed`)
    
    return sanitizeDataForReactQuery(agents)
  }

  // 主查询：获取 Agent 数据 - 使用更稳定的缓存策略
  const {
    data: initialAgents = [],
    isLoading: isLoadingAgents,
    isError: isAgentsError,
    error: agentsError,
    refetch: refetchAgents
  } = useQuery({
    queryKey: ['agents', 'market', 'initial', batchSize],
    queryFn: async (): Promise<AgentInfo[]> => {
      if (!currentAgentId || Number(currentAgentId) === 0) {
        console.log('No agents found in contract')
        return []
      }

      const totalAgents = Number(currentAgentId)
      if (totalAgents === 0) {
        console.log('Total agents is 0')
        return []
      }

      const agentsToLoad = Math.min(totalAgents, batchSize)
      console.log(`Fetching ${agentsToLoad} agents from contract...`)

      return await fetchAgentsInRange(1, agentsToLoad)
    },
    enabled: !!currentAgentId && Number(currentAgentId) > 0 && !!publicClient && !!contractAddress,
    staleTime: 60 * 60 * 1000, // 1小时
    gcTime: 24 * 60 * 60 * 1000, // 24小时
    retry: 1,
  })

  // 合并 agents - 使用更稳定的状态管理
  useEffect(() => {
    if (initialAgents.length > 0 && !initialLoadRef.current) {
      initialLoadRef.current = true
      setLocalAgents(prev => {
        const agentMap = new Map<number, AgentInfo>()
        
        // 首先添加现有的 agents
        prev.forEach(agent => agentMap.set(agent.id, agent))
        
        // 然后添加新的 agents
        initialAgents.forEach(agent => agentMap.set(agent.id, agent))
        
        // 按 ID 排序返回
        return Array.from(agentMap.values()).sort((a, b) => b.id - a.id)
      })
    }
  }, [initialAgents])

  // 加载更多数据
  const handleFetchMore = async (count: number): Promise<void> => {
    if (!currentAgentId || !publicClient || !contractAddress) {
      console.error('Cannot fetch more: missing dependencies')
      return
    }

    const totalAgents = Number(currentAgentId)
    const currentCount = localAgents.length
    const startId = currentCount + 1
    const endId = Math.min(totalAgents, currentCount + count)

    if (startId > totalAgents) {
      console.log('No more agents to load')
      return
    }

    console.log(`Fetching more agents: ${startId} to ${endId}`)
    
    try {
      const newAgents = await fetchAgentsInRange(startId, endId)
      setLocalAgents(prev => {
        const agentMap = new Map<number, AgentInfo>()
        prev.forEach(agent => agentMap.set(agent.id, agent))
        newAgents.forEach(agent => agentMap.set(agent.id, agent))
        return Array.from(agentMap.values()).sort((a, b) => b.id - a.id)
      })
    } catch (error) {
      console.error('Failed to fetch more agents:', error)
      throw error
    }
  }

  // 组合状态
  const isLoading = isLoadingCount || isLoadingAgents || isRefreshing
  const isError = isCountError || isAgentsError
  const error = countError || agentsError
  
  const loadedCount = localAgents.filter(agent => agent.isLoaded).length
  const errorCount = localAgents.filter(agent => agent.hasError).length

  // 重新获取数据
  const refetch = async () => {
    console.log('Manual refetch triggered')
    setIsRefreshing(true)
    initialLoadRef.current = false
    
    try {
      // 清除缓存强制重新获取
      AgentCacheManager.clearCache()
      await Promise.all([
        refetchCount(),
        refetchAgents()
      ])
    } finally {
      setIsRefreshing(false)
    }
  }

  return {
    agents: localAgents,
    isLoading,
    isError,
    error,
    totalAgents: currentAgentId ? Number(currentAgentId) : 0,
    loadedCount,
    errorCount,
    refetch,
    fetchMore: handleFetchMore
  }
}

// 获取单个 Agent 的详细信息
export function useAgentDetail(agentId: number) {
  const publicClient = usePublicClient()
  const contractAddress = getContractAddress()

  const fetchTokenURIFromContract = async (agentId: number): Promise<string> => {
    if (!publicClient || !contractAddress) {
      throw new Error('Public client or contract address not available')
    }

    try {
      const tokenURI = await publicClient.readContract({
        address: contractAddress,
        abi: AGENT_REGISTRY_ABI,
        functionName: 'tokenURI',
        args: [BigInt(agentId)]
      })
      
      return tokenURI as string
    } catch (error) {
      console.error(`Failed to fetch tokenURI for agent ${agentId}:`, error)
      return ''
    }
  }

  const fetchOwnerFromContract = async (agentId: number): Promise<string> => {
    if (!publicClient || !contractAddress) {
      throw new Error('Public client or contract address not available')
    }

    try {
      const owner = await publicClient.readContract({
        address: contractAddress,
        abi: AGENT_REGISTRY_ABI,
        functionName: 'ownerOf',
        args: [BigInt(agentId)]
      })
      
      return owner as string
    } catch (error) {
      console.error(`Failed to fetch owner for agent ${agentId}:`, error)
      return '0x0000000000000000000000000000000000000000'
    }
  }

  return useQuery({
    queryKey: ['agent', 'detail', agentId],
    queryFn: async (): Promise<AgentInfo | null> => {
      if (!agentId || agentId <= 0) return null

      // 检查缓存
      const cache = AgentCacheManager.getCache()
      if (cache.has(agentId)) {
        const cachedAgent = cache.get(agentId)!
        if (cachedAgent.lastUpdated && Date.now() - cachedAgent.lastUpdated < 24 * 60 * 60 * 1000) {
          console.log(`Using cached data for agent detail ${agentId}`)
          return cachedAgent
        }
      }

      try {
        const [tokenURI, owner] = await Promise.all([
          fetchTokenURIFromContract(agentId),
          fetchOwnerFromContract(agentId)
        ])
        
        const cid = extractCIDFromTokenURI(tokenURI)
        
        const agentInfo: AgentInfo = {
          id: agentId,
          owner,
          tokenURI,
          cid: cid || undefined,
          isLoaded: false,
          hasError: false,
          status: 'no-metadata',
          lastUpdated: Date.now(),
          hasSubscriptionPlans: false
        }

        if (cid) {
          const result = await ipfsDataFetcher.fetchAgentMetadata(cid)
          if (result.metadata) {
            agentInfo.metadata = result.metadata
            agentInfo.isLoaded = true
            agentInfo.status = 'success'
            
            // 检查是否有订阅机制 - 修复逻辑
            if (result.metadata.pricing) {
              agentInfo.hasSubscriptionPlans = true
            }
          } else {
            agentInfo.metadata = {
              name: `Agent ${agentId}`,
              description: '元数据获取失败',
              tags: ['metadata-failed'],
              capabilities: []
            }
            agentInfo.isLoaded = true
            agentInfo.hasError = true
            agentInfo.status = 'metadata-failed'
            agentInfo.errorMessage = result.error
          }
        } else {
          agentInfo.metadata = {
            name: `Agent ${agentId}`,
            description: '此 Agent 没有配置 IPFS 元数据',
            tags: ['no-metadata'],
            capabilities: []
          }
          agentInfo.isLoaded = true
          agentInfo.status = 'no-metadata'
        }

        // 更新缓存
        cache.set(agentId, agentInfo)
        AgentCacheManager.setCache(cache)

        return sanitizeDataForReactQuery(agentInfo)
      } catch (error) {
        console.error(`Failed to fetch agent detail ${agentId}:`, error)
        return sanitizeDataForReactQuery({
          id: agentId,
          owner: '',
          tokenURI: '',
          isLoaded: false,
          hasError: true,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          status: 'error',
          lastUpdated: Date.now(),
          hasSubscriptionPlans: false
        })
      }
    },
    enabled: !!agentId && agentId > 0 && !!publicClient && !!contractAddress,
    staleTime: 60 * 60 * 1000, // 1小时
    retry: 1,
  })
}
