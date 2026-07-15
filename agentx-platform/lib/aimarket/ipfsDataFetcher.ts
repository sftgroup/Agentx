// lib/aimarket/ipfsDataFetcher.ts

export interface AgentMetadata {
  name: string
  description: string
  image?: string
  tags?: string[]
  version?: string
  capabilities?: string[]
  website?: string
  github?: string
  pricing?: {
    type: 'subscription' | 'pay_per_use'
    amount: string
    currency: string
    period?: string
  }
  createdAt?: string
  updatedAt?: string
  attributes?: Record<string, any>
}

export interface IPFSFetchResult {
  metadata: AgentMetadata | null
  error?: string
  cid: string
}

export interface ConnectionTestResult {
  success: boolean;
  error?: string;
}

export interface ConfigStatus {
  hasGateway: boolean;
  environment: string;
}

export class IPFSDataFetcher {
  private cache = new Map<string, AgentMetadata>()
  private failedCIDs = new Set<string>()
  private pendingRequests = new Map<string, Promise<AgentMetadata | null>>()
  private gateway: string = 'ipfs.io'

  constructor() {
    console.log('🔧 IPFSDataFetcher initialized with public gateway');
  }

  // 从 IPFS CID 获取 Agent 元数据
  async fetchAgentMetadata(cid: string): Promise<IPFSFetchResult> {
    // 检查缓存
    if (this.cache.has(cid)) {
      return { metadata: this.cache.get(cid)!, cid }
    }

    // 检查是否已经失败过
    if (this.failedCIDs.has(cid)) {
      return { metadata: null, error: 'CID previously failed', cid }
    }

    // 检查是否有正在进行的请求
    if (this.pendingRequests.has(cid)) {
      const metadata = await this.pendingRequests.get(cid)!
      return { metadata, cid }
    }

    try {
      // 验证 CID 格式
      if (!this.isValidCID(cid)) {
        this.failedCIDs.add(cid)
        return { metadata: null, error: 'Invalid CID format', cid }
      }

      // 创建请求 Promise 并存储
      const requestPromise = this.executeIPFSRequest(cid)
      this.pendingRequests.set(cid, requestPromise)

      const metadata = await requestPromise

      // 清理 pending 状态
      this.pendingRequests.delete(cid)

      if (metadata) {
        this.cache.set(cid, metadata)
        return { metadata, cid }
      } else {
        this.failedCIDs.add(cid)
        return { metadata: null, error: 'Failed to fetch metadata', cid }
      }

    } catch (error) {
      this.pendingRequests.delete(cid)
      this.failedCIDs.add(cid)

      console.error(`Failed to fetch IPFS metadata for CID ${cid}:`, error)
      return {
        metadata: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        cid
      }
    }
  }

  // 批量获取多个 Agent 的元数据
  async fetchMultipleAgentMetadata(cids: string[]): Promise<Map<string, AgentMetadata>> {
    const results = new Map<string, AgentMetadata>()

    const uniqueCIDs = Array.from(new Set(cids)).filter(cid =>
      !this.failedCIDs.has(cid) && !this.pendingRequests.has(cid) && this.isValidCID(cid)
    )

    if (uniqueCIDs.length === 0) {
      return results
    }

    console.log(`Starting batch fetch for ${uniqueCIDs.length} CIDs using public gateway`)

    // 使用保守的并发设置
    const batchSize = 5
    for (let i = 0; i < uniqueCIDs.length; i += batchSize) {
      const batch = uniqueCIDs.slice(i, i + batchSize)

      const batchPromises = batch.map(async (cid) => {
        try {
          const result = await this.fetchAgentMetadata(cid)
          if (result.metadata) {
            results.set(cid, result.metadata)
            console.log(`✅ Successfully fetched metadata for CID: ${cid}`)
          } else {
            console.warn(`⚠️ Failed to fetch metadata for CID: ${cid}, error: ${result.error}`)

            // 对于失败的 CID，创建一个基础元数据对象
            const fallbackMetadata: AgentMetadata = {
              name: `Agent ${cid.slice(0, 8)}...`,
              description: '元数据加载失败',
              tags: ['metadata-failed'],
              capabilities: []
            }
            results.set(cid, fallbackMetadata)
          }
          return result
        } catch (error) {
          console.error(`❌ Batch fetch failed for CID ${cid}:`, error)

          // 即使失败也创建基础元数据
          const fallbackMetadata: AgentMetadata = {
            name: `Agent ${cid.slice(0, 8)}...`,
            description: '元数据加载异常',
            tags: ['metadata-error'],
            capabilities: []
          }
          results.set(cid, fallbackMetadata)

          return { metadata: fallbackMetadata, error: 'Batch fetch failed', cid }
        }
      })

      await Promise.allSettled(batchPromises)

      // 增加延迟避免请求过快
      if (i + batchSize < uniqueCIDs.length) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }

    console.log(`Batch fetch completed: ${results.size} successful out of ${uniqueCIDs.length} CIDs`)
    return results
  }

  // 使用公共 IPFS 网关获取数据
  private async executeIPFSRequest(cid: string): Promise<AgentMetadata | null> {
    console.log(`🔍 Fetching metadata for CID: ${cid} using public gateway`)

    try {
      const url = `https://${this.gateway}/ipfs/${cid}`;
      console.log(`🌐 Request URL: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000) // 10秒超时
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`📥 Response for CID ${cid}:`, data);

      return this.parseAgentMetadata(data, cid);

    } catch (error) {
      console.error(`❌ Public gateway request failed for CID ${cid}:`, error);

      // 尝试备用网关
      console.log(`🔄 Trying alternative gateway for CID: ${cid}`);
      return await this.tryAlternativeGateway(cid);
    }
  }

  // 备用网关方法
  private async tryAlternativeGateway(cid: string): Promise<AgentMetadata | null> {
    const alternativeGateways = [
      'gateway.pinata.cloud',
      'dweb.link',
      'cf-ipfs.com'
    ];

    for (const gateway of alternativeGateways) {
      try {
        console.log(`🔄 Trying alternative gateway: ${gateway} for CID: ${cid}`);

        const url = `https://${gateway}/ipfs/${cid}`;
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(8000)
        });

        if (!response.ok) {
          continue; // 尝试下一个网关
        }

        const data = await response.json();
        console.log(`✅ Success with gateway ${gateway} for CID ${cid}`);

        return this.parseAgentMetadata(data, cid);

      } catch (error) {
        console.warn(`❌ Gateway ${gateway} failed for CID ${cid}:`, error);
        // 继续尝试下一个网关
      }
    }

    console.error(`❌ All gateways failed for CID ${cid}`);
    throw new Error('All IPFS gateways failed');
  }

  // 安全地解析 Agent 元数据 - 修改此方法以正确处理 attributes 字段
  private parseAgentMetadata(rawData: unknown, cid: string): AgentMetadata {
    // 基础验证
    if (typeof rawData !== 'object' || rawData === null) {
      throw new Error('Invalid metadata format: expected object');
    }

    const data = rawData as Record<string, unknown>;

    // 检查是否存在 attributes 字段
    const hasAttributes = data.attributes && typeof data.attributes === 'object' && data.attributes !== null;
    const attributes = hasAttributes ? data.attributes as Record<string, unknown> : null;

    // 创建基础元数据对象 - 优先使用 attributes 中的 name 和 description
    const metadata: AgentMetadata = {
      name: this.getRequiredStringValue([
        attributes?.name,  // 优先级1: attributes.name
        data.name,         // 优先级2: 根级别的name
        `Agent ${cid.slice(0, 8)}...` // 默认值
      ]),
      description: this.getRequiredStringValue([
        attributes?.description,  // 优先级1: attributes.description
        data.description,         // 优先级2: 根级别的description
        '这个 Agent 没有提供描述信息' // 默认值
      ]),
    };

    // 可选字段处理 - 优先使用 attributes 中的值
    metadata.image = this.getOptionalStringValue([attributes?.image, data.image]);
    metadata.version = this.getOptionalStringValue([attributes?.version, data.version]);
    metadata.website = this.getOptionalStringValue([attributes?.website, data.website]);
    metadata.github = this.getOptionalStringValue([attributes?.github, data.github]);
    metadata.createdAt = this.getOptionalStringValue([attributes?.createdAt, data.createdAt, attributes?.created, data.created]);
    metadata.updatedAt = this.getOptionalStringValue([attributes?.updatedAt, data.updatedAt]);

    // 修复：数组字段处理 - 使用类型安全的过滤方法
    metadata.tags = this.parseStringArray([attributes?.tags, data.tags]);
    metadata.capabilities = this.parseStringArray([attributes?.capabilities, data.capabilities]);

    // 定价信息处理
    if ((data.pricing && typeof data.pricing === 'object') || (attributes?.pricing && typeof attributes.pricing === 'object')) {
      const pricing = (attributes?.pricing || data.pricing) as Record<string, unknown>;
      metadata.pricing = {
        type: pricing.type === 'subscription' || pricing.type === 'pay_per_use' ? pricing.type : 'subscription',
        amount: typeof pricing.amount === 'string' ? pricing.amount : '0',
        currency: typeof pricing.currency === 'string' ? pricing.currency : 'ETH',
        period: typeof pricing.period === 'string' ? pricing.period : undefined
      };
    }

    // 保存完整的 attributes 对象（如果存在）
    if (hasAttributes) {
      metadata.attributes = attributes as Record<string, any>;
    }

    console.log(`✅ Successfully parsed metadata for CID: ${cid}`, metadata);
    return metadata;
  }

  // 辅助方法：从候选值列表中选择第一个有效的字符串值（必需字段）
  private getRequiredStringValue(candidates: unknown[]): string {
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim() !== '') {
        return candidate;
      }
    }
    // 如果所有候选值都无效，返回最后一个作为默认值
    return candidates[candidates.length - 1] as string;
  }

  // 辅助方法：从候选值列表中选择第一个有效的字符串值（可选字段）
  private getOptionalStringValue(candidates: unknown[]): string | undefined {
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim() !== '') {
        return candidate;
      }
    }
    return undefined;
  }

  // 辅助方法：安全地解析字符串数组
  private parseStringArray(candidates: unknown[]): string[] | undefined {
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        // 安全地过滤出字符串元素
        const stringArray: string[] = [];
        for (const item of candidate) {
          if (typeof item === 'string' && item.trim() !== '') {
            stringArray.push(item);
          }
        }
        if (stringArray.length > 0) {
          return stringArray;
        }
      }
    }
    return undefined;
  }

  // 测试连接
  async testConnection(): Promise<ConnectionTestResult> {
    console.log('🧪 Testing IPFS connection with public gateway...');

    try {
      // 测试获取一个已知的测试 CID
      const testCid = 'bafkreib4pqtikzdjlj4zigobmd63lig7u6oxlug24snlr6atjlmlza45dq';

      console.log(`🧪 Testing with CID: ${testCid}`);

      const url = `https://${this.gateway}/ipfs/${testCid}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(8000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('🧪 Connection test response:', data);

      return { success: true };

    } catch (error) {
      console.error('❌ IPFS connection test failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // 验证 CID 格式
  private isValidCID(cid: string): boolean {
    if (!cid || typeof cid !== 'string') return false;

    // 移除可能的协议前缀
    const cleanCid = cid.replace(/^ipfs:\/\//, '').replace(/^https?:\/\/[^/]+\/ipfs\//, '');

    // CID 应该是一串字母数字字符，长度通常在 40 以上
    return /^[a-zA-Z0-9]{40,}$/.test(cleanCid);
  }

  // 清理 CID - 从完整的 IPFS URL 中提取纯 CID
  cleanCID(input: string): string {
    if (!input) return input;

    // 处理 ipfs:// 格式
    if (input.startsWith('ipfs://')) {
      return input.replace('ipfs://', '');
    }

    // 处理 https://ipfs.io/ipfs/ 格式
    const ipfsIoMatch = input.match(/ipfs\.io\/ipfs\/([^/]+)/);
    if (ipfsIoMatch) {
      return ipfsIoMatch[1];
    }

    // 处理其他网关格式
    const gatewayMatch = input.match(/\/ipfs\/([^/?]+)/);
    if (gatewayMatch) {
      return gatewayMatch[1];
    }

    // 处理子域格式：bafybei...ipfs.nftstorage.link
    const subdomainMatch = input.match(/([a-zA-Z0-9]+)\.ipfs\.[^/]+/);
    if (subdomainMatch) {
      return subdomainMatch[1];
    }

    // 如果已经是纯 CID，直接返回
    return input;
  }

  // 测试完整连接
  async testFullConnection(): Promise<{
    connectionTest: ConnectionTestResult
    config: ConfigStatus
  }> {
    console.log('🧪 Starting comprehensive connection test...');

    const config = this.getConfigStatus();
    const connectionTest = await this.testConnection();

    console.log('🧪 Comprehensive test results:', { config, connectionTest });

    return {
      connectionTest,
      config
    };
  }

  // 清空缓存
  clearCache(): void {
    this.cache.clear();
    this.failedCIDs.clear();
    this.pendingRequests.clear();
  }

  // 获取缓存统计
  getCacheStats(): { cached: number; failed: number; pending: number } {
    return {
      cached: this.cache.size,
      failed: this.failedCIDs.size,
      pending: this.pendingRequests.size
    };
  }

  // 获取配置状态
  getConfigStatus(): ConfigStatus {
    return {
      hasGateway: true,
      environment: process.env.NODE_ENV || 'development'
    };
  }

  // 转换 CID 为完整 URL
  convertCIDToURL(cid: string): string {
    return `https://${this.gateway}/ipfs/${cid}`;
  }

  // 直接获取文件内容（用于调试）
  async getRawFileContent(cid: string): Promise<{ data: any } | null> {
    try {
      const url = `https://${this.gateway}/ipfs/${cid}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(8000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return { data };

    } catch (error) {
      console.error(`Failed to get raw file content for CID ${cid}:`, error);
      return null;
    }
  }
}

// 创建全局实例
export const ipfsDataFetcher = new IPFSDataFetcher();

// 测试函数
export const testConnection = async () => {
  console.log('🧪 Starting connection test...');

  const config = ipfsDataFetcher.getConfigStatus();
  console.log('🔧 Current Config:', config);

  const testResult = await ipfsDataFetcher.testFullConnection();
  console.log('🧪 Connection Test Result:', testResult);

  return testResult;
};

// 专门测试 CID 解析的函数
export const testCIDResolution = async (cid: string) => {
  console.log(`🧪 Testing CID resolution for: ${cid}`);

  const cleanCid = ipfsDataFetcher.cleanCID(cid);
  console.log(`🧪 Cleaned CID: ${cleanCid}`);

  const result = await ipfsDataFetcher.fetchAgentMetadata(cleanCid);
  console.log('🧪 CID Resolution Result:', result);

  return result;
};

// 获取原始文件内容（调试用）
export const getRawContent = async (cid: string) => {
  console.log(`🧪 Getting raw content for: ${cid}`);

  const cleanCid = ipfsDataFetcher.cleanCID(cid);
  const result = await ipfsDataFetcher.getRawFileContent(cleanCid);
  console.log('🧪 Raw Content Result:', result);

  return result;
};

// 转换 CID 为 URL
export const convertToURL = (cid: string) => {
  console.log(`🧪 Converting CID to URL: ${cid}`);

  const cleanCid = ipfsDataFetcher.cleanCID(cid);
  const url = ipfsDataFetcher.convertCIDToURL(cleanCid);
  console.log('🧪 Converted URL:', url);

  return url;
};
