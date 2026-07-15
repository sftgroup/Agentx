// lib/ipfs.ts
// IPFS工具函数 - 使用正确的 Pinata SDK 链式调用

import { PinataSDK } from 'pinata'

// 初始化 Pinata SDK
let pinata: PinataSDK | null = null

function getPinata(): PinataSDK {
  if (!pinata) {
    // 使用 NEXT_PUBLIC_ 前缀的环境变量
    const pinataJwt = process.env.NEXT_PUBLIC_PINATA_JWT
    const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || process.env.NEXT_PUBLIC_IPFS_GATEWAY
    
    if (!pinataJwt) {
      throw new Error('Pinata JWT 未配置')
    }
    
    pinata = new PinataSDK({
      pinataJwt,
      pinataGateway: gatewayUrl
    })
  }
  return pinata
}

export interface IpfsUploadResponse {
  IpfsHash: string
  PinSize: number
  Timestamp: string
}

export interface IpfsImageUploadResponse {
  IpfsHash: string
  PinSize: number
  Timestamp: string
}

/**
 * 检查 Pinata 配置
 */
export function checkPinataConfig(): { isValid: boolean; message: string } {
  // 使用 NEXT_PUBLIC_ 前缀的环境变量
  const pinataJwt = process.env.NEXT_PUBLIC_PINATA_JWT
  const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || process.env.NEXT_PUBLIC_IPFS_GATEWAY

  if (!pinataJwt) {
    return {
      isValid: false,
      message: 'Pinata JWT 未配置'
    }
  }

  if (!gatewayUrl) {
    return {
      isValid: false,
      message: 'Gateway URL 未配置'
    }
  }

  return {
    isValid: true,
    message: 'Pinata 配置正常'
  }
}

/**
 * 上传文件到IPFS - 使用正确的链式调用
 */
export async function uploadToIPFS(file: File): Promise<string> {
  try {
    console.log('🔄 开始上传文件到 IPFS...', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type
    })

    // 检查文件大小
    if (!isValidFileSize(file)) {
      throw new Error(`文件大小超过限制: ${file.size} bytes`)
    }

    // 检查文件类型
    if (!isValidFileType(file)) {
      throw new Error(`不支持的文件类型: ${file.type}`)
    }

    console.log('🔑 检查 Pinata 配置...')
    const configCheck = checkPinataConfig()
    if (!configCheck.isValid) {
      throw new Error(`Pinata 配置错误: ${configCheck.message}`)
    }

    const pinata = getPinata()

    console.log('📤 使用 Pinata SDK 上传文件...')
    
    // 将 File 对象转换为 Blob
    const blob = new Blob([file], { type: file.type })
    
    // 创建新的 File 对象
    const uploadFile = new File([blob], file.name, { type: file.type })

    // 使用正确的链式调用上传文件
    const upload = await pinata.upload.public
      .file(uploadFile)
      .name(`agent-asset-${Date.now()}`)
      .keyvalues({
        type: 'agent-asset',
        timestamp: Date.now().toString(),
        originalName: file.name
      })

    console.log('✅ IPFS 上传成功:', upload)

    if (!upload.cid) {
      throw new Error('Pinata SDK 返回数据格式错误: 缺少 CID')
    }

    return upload.cid

  } catch (error) {
    console.error('❌ IPFS上传失败:', error)
    throw new Error(`IPFS上传失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}

/**
 * 上传JSON数据到IPFS - 使用正确的链式调用
 */
export async function uploadJSONToIPFS(metadata: any): Promise<string> {
  try {
    console.log('🔄 开始上传 JSON 到 IPFS...', {
      metadataType: typeof metadata,
      metadataKeys: Object.keys(metadata)
    })

    // 检查 Pinata 配置
    console.log('🔑 检查 Pinata 配置...')
    const configCheck = checkPinataConfig()
    if (!configCheck.isValid) {
      throw new Error(`Pinata 配置错误: ${configCheck.message}`)
    }

    const pinata = getPinata()

    console.log('📤 使用 Pinata SDK 上传 JSON...')
    
    // 使用正确的链式调用上传 JSON
    const upload = await pinata.upload.public
      .json(metadata)
      .name(`agent-metadata-${Date.now()}`)
      .keyvalues({
        type: 'agent-metadata',
        timestamp: Date.now().toString(),
        source: 'agent-registry'
      })

    console.log('✅ IPFS JSON 上传成功:', upload)

    if (!upload.cid) {
      throw new Error('Pinata SDK 返回数据格式错误: 缺少 CID')
    }

    return upload.cid

  } catch (error) {
    console.error('❌ IPFS JSON上传失败:', error)
    throw new Error(`IPFS JSON上传失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}

/**
 * 从 IPFS 获取文件
 */
export async function getFromIPFS(cid: string): Promise<any> {
  try {
    console.log('🔄 从 IPFS 获取文件...', { cid })
    
    const pinata = getPinata()
    const result = await pinata.gateways.public.get(cid)
    
    console.log('✅ 获取文件成功')
    return result.data
    
  } catch (error) {
    console.error('❌ 获取文件失败:', error)
    throw new Error(`获取文件失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}

/**
 * 构建IPFS URL
 */
export function getIPFSUrl(cid: string): string {
  const gateway = process.env.NEXT_PUBLIC_GATEWAY_URL || process.env.NEXT_PUBLIC_IPFS_GATEWAY || 'https://gateway.pinata.cloud'
  return `${gateway}/ipfs/${cid}`
}

/**
 * 构建IPFS协议URL
 */
export function getIPFSProtocolUrl(cid: string): string {
  return `ipfs://${cid}`
}

/**
 * 从IPFS URL提取CID
 */
export function extractCIDFromUrl(ipfsUrl: string): string | null {
  if (ipfsUrl.startsWith('ipfs://')) {
    return ipfsUrl.replace('ipfs://', '')
  }
  
  const match = ipfsUrl.match(/ipfs\/([a-zA-Z0-9]+)/)
  return match ? match[1] : null
}

/**
 * 验证CID格式
 */
export function isValidCID(cid: string): boolean {
  // 基本的CID验证（Qm... 或 bafy...）
  return /^[Qm][1-9A-Za-z]{44}$/.test(cid) || /^bafy[a-zA-Z0-9]+$/.test(cid)
}

/**
 * 获取文件大小限制
 */
export function getFileSizeLimit(): number {
  return 100 * 1024 * 1024 // 100MB
}

/**
 * 验证文件类型
 */
export function isValidFileType(file: File, allowedTypes: string[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']): boolean {
  return allowedTypes.includes(file.type)
}

/**
 * 验证文件大小
 */
export function isValidFileSize(file: File, maxSize: number = getFileSizeLimit()): boolean {
  return file.size <= maxSize
}

/**
 * 测试 Pinata 连接
 */
export async function testPinataConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const pinata = getPinata()
    
    // 使用链式调用测试连接
    const testBlob = new Blob(['test connection'], { type: 'text/plain' })
    const testFile = new File([testBlob], 'test-connection.txt')
    
    const result = await pinata.upload.public
      .file(testFile)
      .name('connection-test')
      .keyvalues({
        test: 'true'
      })
    
    return { 
      success: true, 
      message: `Pinata 连接正常 - CID: ${result.cid}` 
    }
    
  } catch (error) {
    return {
      success: false,
      message: `Pinata 连接错误: ${error instanceof Error ? error.message : '未知错误'}`
    }
  }
}
