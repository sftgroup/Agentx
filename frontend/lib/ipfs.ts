// lib/ipfs.ts
// IPFS 工具函数 — 统一走服务端代理路由（app/api/ipfs/upload-json、app/api/ipfs/upload）。
// Pinata JWT 由服务端持有（PINATA_JWT），浏览器端不再接触任何密钥。

export interface IpfsUploadResponse {
  IpfsHash: string
  PinSize: number
  Timestamp: string
}

const UPLOAD_JSON_URL = '/api/ipfs/upload-json'
const UPLOAD_FILE_URL = '/api/ipfs/upload'

async function parseUpload(res: Response): Promise<string> {
  if (!res.ok) {
    let msg = `IPFS 上传失败 (HTTP ${res.status})`
    try {
      const body = (await res.json()) as { error?: string }
      if (body?.error) msg = body.error
    } catch { /* non-JSON */ }
    throw new Error(msg)
  }
  const data = (await res.json()) as IpfsUploadResponse
  if (!data.IpfsHash) throw new Error('IPFS 返回数据缺少 CID')
  return data.IpfsHash
}

/**
 * 检查 IPFS 配置状态。
 * 客户端不再持有 JWT（服务端 PINATA_JWT 管理），代理路由挂载即视为就绪；
 * 配置的真实有效性由每次上传校验。
 */
export function checkPinataConfig(): { isValid: boolean; message: string } {
  return { isValid: true, message: 'IPFS 代理已就绪（JWT 由服务端管理）' }
}

/**
 * 上传文件到 IPFS（经服务端代理，含大小/类型校验）。
 * @returns CID
 */
export async function uploadToIPFS(file: File): Promise<string> {
  if (!isValidFileSize(file)) throw new Error(`文件大小超过限制: ${file.size} bytes`)
  if (!isValidFileType(file)) throw new Error(`不支持的文件类型: ${file.type}`)

  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(UPLOAD_FILE_URL, { method: 'POST', body: formData })
  return parseUpload(res)
}

/**
 * 上传 JSON 数据到 IPFS（经服务端代理）。
 * @returns CID
 */
export async function uploadJSONToIPFS(metadata: unknown): Promise<string> {
  const res = await fetch(UPLOAD_JSON_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata),
  })
  return parseUpload(res)
}

/**
 * 从 IPFS 获取数据（公共 gateway，无需 JWT）。
 */
export async function getFromIPFS(cid: string): Promise<unknown> {
  const res = await fetch(getIPFSUrl(cid))
  if (!res.ok) throw new Error(`从 IPFS 获取失败: HTTP ${res.status}`)
  return res.json()
}

/**
 * 测试服务端 IPFS 代理（真实上传一个小 JSON，验证 PINATA_JWT 已配置）。
 */
export async function testPinataConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const cid = await uploadJSONToIPFS({ test: 'connection', ts: Date.now() })
    return { success: true, message: `IPFS 代理正常 - CID: ${cid}` }
  } catch (error) {
    return { success: false, message: `IPFS 代理错误: ${error instanceof Error ? error.message : '未知错误'}` }
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
