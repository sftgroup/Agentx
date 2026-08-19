// ---------------------------------------------------------------------------
// AgentX Gateway — infraX aa-relay 客户端 + AA SDK 基础设施
// ---------------------------------------------------------------------------
// 自动续订（ERC-4337）所有模块共用的低层能力：
//   - @0xinfrax/aa-sdk 动态加载（ESM-only，gateway 为 CJS）
//   - oxachain Kernel v3 AA 链配置（getAaChainConfig）
//   - aa-relay HTTP 调用（relayRequest，X-API-Key 鉴权）
//   - EIP-1559 fee 估算（estimateFees，失败兜底）
//   - session policy 编解码（parsePolicy / stringifyPolicy）
// 本模块为纯工具层，不触碰 DB / 不承载业务状态，供 aa-account /
// aa-session / aa-renewal 复用。
// ---------------------------------------------------------------------------

import { createPublicClient, http, toFunctionSelector, type Address, type Hex } from 'viem'
import { config } from '../config'

/** aa-relay 服务维度标识（session store / 计费按 product 隔离） */
export const AA_RELAY_PRODUCT = 'agentx-auto-renew'

/** SubscriptionManager.subscribe(uint256) selector（会话策略 target 与续订 UserOp 共用） */
export const SUBSCRIBE_SELECTOR: Hex = toFunctionSelector('subscribe(uint256)')

/** 固定 gas 上限（Kernel v3 ENABLE-mode 验证阶段安装模块，预留余量；EntryPoint 按实际用量结算，未用部分退还） */
export const AA_GAS = {
  callGasLimit: 1_500_000n,
  verificationGasLimit: 800_000n,
  preVerificationGas: 60_000n,
}

/** fee 估算失败兜底（1 gwei tip / 3 gwei cap，避免 0 被 bundler 拒绝） */
export const DEFAULT_FEE = { maxFeePerGas: 3_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n }

// @0xinfrax/aa-sdk 为 ESM-only（gateway 为 CJS），动态 import 一次并缓存
let aaModule: any = null
export async function loadAaSdk(): Promise<any> {
  if (!aaModule) aaModule = await import('@0xinfrax/aa-sdk')
  return aaModule
}

export function isAutoRenewEnabled(): boolean {
  return config.aaAutoRenewEnabled && Boolean(config.aaRelayUrl && config.aaRelayApiKey)
}

/** oxachain Kernel v3 AA 栈（生产地址来自 infraX AA_SDK_TECH_DESIGN §8.3） */
export function getAaChainConfig(): any {
  return {
    network: 'evm',
    chainId: config.chainIdOxaChain,
    entryPointVersion: '0.7',
    entryPoint: config.aaEntryPointOxaChain as Address,
    rpcUrl: config.rpcUrlOxaChain,
    kernelVersion: '0.3.0-beta', // 链上实现为 Kernel v3.0-beta（initialize 4 参数 0x12af322c，eth_call 实证；0.3.1 的 5 参数编码会 revert）
    kernelFactory: config.aaKernelFactoryOxaChain as Address,
    kernelImplementation: config.aaKernelImplementationOxaChain as Address,
    sessionModule: config.aaSessionModuleOxaChain as Address,
    validatorAddress: config.aaEcdsaValidatorOxaChain as Address,
    bundlers: [],
  }
}

export function aaPublicClient() {
  return createPublicClient({ transport: http(config.rpcUrlOxaChain) })
}

/** aa-relay 统一调用（X-API-Key 鉴权；code!==0 或非 2xx 抛错）。
 *  timeoutMs：默认 30s；/v1/userops(wait:true) 需覆盖 relay 的
 *  charge（escrow 上链 ~12s）+ bundler 模拟/收据轮询（≤120s）总耗时 → 150s。 */
export async function relayRequest(path: string, body?: unknown, timeoutMs = 30_000): Promise<any> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${config.aaRelayUrl.replace(/\/+$/, '')}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': config.aaRelayApiKey },
      body: body === undefined ? undefined : JSON.stringify(body, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
      signal: ctrl.signal,
    })
    const json = (await res.json().catch(() => null)) as { code?: number; message?: string; data?: any } | null
    if (!res.ok || !json || json.code !== 0) {
      throw new Error(`aa-relay ${path} failed: ${res.status} ${json?.message ?? JSON.stringify(json) ?? res.statusText}`)
    }
    return json.data
  } finally {
    clearTimeout(timer)
  }
}

/** EIP-1559 fee 估算（失败用兜底，不阻断流程） */
export async function estimateFees(): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
  try {
    const aa = await loadAaSdk()
    return await aa.estimateFeesPerGas(getAaChainConfig())
  } catch {
    return { ...DEFAULT_FEE }
  }
}

/** policy_json（bigint 已字符串化）→ 还原为 aa-sdk 需要的 SessionPolicy。
 *  pg 会把 jsonb 列自动解析为 JS 对象，此处兼容 string 与 object 两种形态。 */
export function parsePolicy(raw: string | any): any {
  const p = typeof raw === 'string' ? JSON.parse(raw) : raw
  p.validAfter = BigInt(p.validAfter ?? '0')
  p.validUntil = BigInt(p.validUntil)
  p.permissions = (p.permissions ?? []).map((perm: any) => ({
    ...perm,
    valueLimit: perm.valueLimit !== undefined ? BigInt(perm.valueLimit) : undefined,
    dailyLimit: perm.dailyLimit !== undefined ? BigInt(perm.dailyLimit) : undefined,
    tokenLimits: (perm.tokenLimits ?? []).map((tl: any) => ({
      ...tl,
      maxPerTx: BigInt(tl.maxPerTx),
      maxDaily: BigInt(tl.maxDaily),
    })),
  }))
  return p
}

/** 序列化 policy（bigint → 字符串，JSONB 可存） */
export function stringifyPolicy(policy: any): string {
  return JSON.stringify(policy, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
}
