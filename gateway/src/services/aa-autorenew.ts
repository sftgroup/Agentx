// ---------------------------------------------------------------------------
// AgentX Gateway — ERC-4337 Auto-Renew Orchestration (t9)
// ---------------------------------------------------------------------------
// 用户对某个链上订阅开启自动续订：网关经 infraX aa-relay 创建 ERC-4337 Session
// Key（Kernel v3 智能账户 + Session Module）。用户 EOA 一次授权（ENABLE-mode
// UserOp，eth_sign 裸 ECDSA digest）后，服务端在订阅到期前用 session key 签发
// UserOp 调用 SubscriptionManager.subscribe(planId) 自动续订，用户自付 gas
// （智能账户预存 OXA；Kernel receive() 会把转入账户地址的 ETH 自动转为
// EntryPoint deposit 用于支付 UserOp gas）。
//
// 依赖 infraX 能力（AA_SDK_TECH_DESIGN §8.3 oxachain 生产栈）：
//   - @0xinfrax/aa-sdk@0.1.1（Kernel v3 + ENABLE-mode session enable）
//   - aa-relay :9131（POST /v1/session 创建 session、POST /v1/userops 广播）
//   - 配置 AA_AUTO_RENEW_ENABLED=true + AA_RELAY_URL/AA_RELAY_API_KEY
//     + AA_DEPLOYER_PRIVATE_KEY（Kernel 账户部署 gas，平台代付一次性）
//
// 流程：
//   1. enable：校验订阅归属 → aa-relay 创建 session（生成 session key + 策略落库）
//      → 平台代付部署智能账户（digest 依赖已部署账户 currentNonce=1）→ 构造
//      ENABLE draft 得 digest → 登记 aa_auto_renew(pending) → 返回 digest 给前端
//   2. confirm：前端 eth_sign(digest) 后提交 → 网关重建 draft + 服务端 session key
//      签 userOpHash → 经 aa-relay 上链（ENABLE-mode 一次交易完成模块安装+授权）
//      → 状态置 enabled
//   3. 续订 cron：扫描 enabled 行中即将到期（窗口内）的订阅 → 链下策略预检 →
//      资金预检（EP deposit）→ session key 签 UserOp → aa-relay 广播 → 收据落库
// ---------------------------------------------------------------------------

import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  parseAbi,
  toFunctionSelector,
  type Address,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { getPool } from '../lib/db'
import { config } from '../config'
import { encryptApiKey, decryptApiKey } from '../lib/crypto'
import { log } from './chain-data-reader'

const AA_RELAY_PRODUCT = 'agentx-auto-renew'
/** 零地址（ETH 计费计划 pay_token = 0x0 才支持自动续订） */
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
/** SubscriptionManager.subscribe(uint256) selector（每订阅一个独立 session 的策略 target） */
const SUBSCRIBE_SELECTOR: Hex = toFunctionSelector('subscribe(uint256)')

/** 固定 gas 上限（Kernel v3 ENABLE-mode 验证阶段安装模块，预留余量；EntryPoint 按实际用量结算，未用部分退还） */
const AA_GAS = {
  callGasLimit: 1_500_000n,
  verificationGasLimit: 800_000n,
  preVerificationGas: 60_000n,
}
/** fee 估算失败兜底（1 gwei tip / 3 gwei cap，避免 0 被 bundler 拒绝） */
const DEFAULT_FEE = { maxFeePerGas: 3_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n }
/** 续订提交冷却（ms）：防止收据确认前 / indexer 指针前移前对同一期重复提交 */
const RENEW_COOLDOWN_MS = 10 * 60_000

// @0xinfrax/aa-sdk 为 ESM-only（gateway 为 CJS），动态 import 一次并缓存
let aaModule: any = null
async function loadAaSdk(): Promise<any> {
  if (!aaModule) aaModule = await import('@0xinfrax/aa-sdk')
  return aaModule
}

// 进程内扫描防重（pm2 fork 单进程；跨进程由 DB last_renew_at 冷却兜底）
const inFlight = new Set<string>()

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
    kernelVersion: '0.3.1', // 生产 relay 默认 0.3.1（initialize 5 参数 0x3c3b752b）；0.3.0-beta 会算出不同账户地址
    kernelFactory: config.aaKernelFactoryOxaChain as Address,
    kernelImplementation: config.aaKernelImplementationOxaChain as Address,
    sessionModule: config.aaSessionModuleOxaChain as Address,
    validatorAddress: config.aaEcdsaValidatorOxaChain as Address,
    bundlers: [],
  }
}

function aaPublicClient() {
  return createPublicClient({ transport: http(config.rpcUrlOxaChain) })
}

/** aa-relay 统一调用（X-API-Key 鉴权；code!==0 或非 2xx 抛错） */
async function relayRequest(path: string, body?: unknown): Promise<any> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30_000)
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
async function estimateFees(): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
  try {
    const aa = await loadAaSdk()
    return await aa.estimateFeesPerGas(getAaChainConfig())
  } catch {
    return { ...DEFAULT_FEE }
  }
}

/** policy_json（bigint 已字符串化）→ 还原为 aa-sdk 需要的 SessionPolicy */
function parsePolicy(raw: string): any {
  const p = JSON.parse(raw)
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
function stringifyPolicy(policy: any): string {
  return JSON.stringify(policy, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
}

/**
 * 部署 Kernel 智能账户（平台代付 gas，一次性；digest 依赖已部署账户 currentNonce）。
 * 用与 aa-relay 相同输入（owner、salt=0、kernel cfg.kernelVersion）复算 factoryData 并
 * 校验预测地址与 relay 返回一致，防止部署错账户。
 */
export async function ensureAccountDeployed(accountAddress: Address, ownerAddress: Address): Promise<boolean> {
  const aa = await loadAaSdk()
  const cfg = getAaChainConfig()
  if (await aa.isAccountDeployed(cfg, accountAddress)) return true
  if (!config.aaDeployerPrivateKey) {
    throw new Error('AA_DEPLOYER_PRIVATE_KEY not configured — cannot deploy smart account')
  }
  const { factory, factoryData } = aa.encodeKernelFactoryData(cfg, ownerAddress, 0n, cfg.kernelVersion)
  const predicted = await aa.predictWithFactoryGetAddress(cfg, factoryData)
  if (!predicted || predicted.toLowerCase() !== accountAddress.toLowerCase()) {
    throw new Error(`account address mismatch (relay=${accountAddress}, predicted=${predicted ?? 'n/a'})`)
  }
  const chainObj = {
    id: config.chainIdOxaChain,
    name: 'OxaChain',
    nativeCurrency: { name: 'OXA', symbol: 'OXA', decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrlOxaChain] } },
  }
  const deployer = privateKeyToAccount(config.aaDeployerPrivateKey as Hex)
  const walletClient = createWalletClient({ chain: chainObj as any, transport: http(config.rpcUrlOxaChain) })
  const tx = await walletClient.sendTransaction({
    chain: chainObj as any,
    account: deployer,
    to: factory,
    data: factoryData,
    value: 0n,
  })
  await aaPublicClient().waitForTransactionReceipt({ hash: tx })
  const deployed = await aa.isAccountDeployed(cfg, accountAddress)
  if (!deployed) throw new Error(`account deployment failed (tx=${tx})`)
  log.info(`[aa-autorenew] smart account deployed: ${accountAddress} (tx=${tx})`)
  return true
}

/** 智能账户资金视图（gas 自付预检：EntryPoint deposit + 账户 native 余额） */
export async function getAccountFunding(accountAddress: string): Promise<{ nativeWei: bigint; epDepositWei: bigint }> {
  const client = aaPublicClient()
  const cfg = getAaChainConfig()
  const [nativeWei, epDepositWei] = await Promise.all([
    client.getBalance({ address: accountAddress as Address }).catch(() => 0n),
    client
      .readContract({
        address: cfg.entryPoint,
        abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
        functionName: 'balanceOf',
        args: [accountAddress as Address],
      })
      .catch(() => 0n),
  ])
  return { nativeWei, epDepositWei }
}

// ============================================================================
// 用户操作：enable / confirm / disable / status
// ============================================================================

export interface CreateAutoRenewParams {
  /** 用户 EOA（session owner） */
  subscriber: string
  agentId: number
  planId: number
  /** 当前生效订阅（开启自动续订的对象） */
  subscriptionId: number
  planPriceWei: string
}

/**
 * enable：创建 session + 部署账户 + 计算授权 digest（用户 eth_sign 后走 confirm）。
 * 返回 digest 前不产生任何用户侧链上操作。
 */
export async function createAutoRenew(p: CreateAutoRenewParams): Promise<{
  accountAddress: string
  accountDeployed: boolean
  sessionId: string
  sessionSigner: string
  digest: string
  validUntil: string
}> {
  if (!isAutoRenewEnabled()) throw new Error('Auto-renew (ERC-4337) not enabled on this gateway')
  const pool = getPool()

  // ① 校验订阅归属 + 计划一致性
  const subRes = await pool.query(
    `SELECT subscription_id, agent_id, subscriber, status, amount_wei FROM chain_subscriptions WHERE subscription_id = $1`,
    [p.subscriptionId],
  )
  const sub = subRes.rows[0]
  if (!sub) throw new Error(`subscription #${p.subscriptionId} not found`)
  if (String(sub.subscriber).toLowerCase() !== p.subscriber.toLowerCase()) {
    throw new Error('subscription does not belong to this wallet')
  }
  if (Number(sub.status) !== 1) throw new Error('subscription is not active')
  if (sub.amount_wei !== p.planPriceWei) throw new Error('plan price mismatch (subscription vs provided)')
  const planRes = await pool.query(
    `SELECT plan_id, agent_id, price, active, pay_token FROM subscription_plans WHERE plan_id = $1`,
    [p.planId],
  )
  const plan = planRes.rows[0]
  if (!plan || Number(plan.agent_id) !== p.agentId) throw new Error('plan not found for agent')
  if (!plan.active) throw new Error('plan is inactive')
  if (plan.price !== p.planPriceWei) throw new Error('plan price mismatch (plan vs provided)')
  // 自动续订仅支持 ETH 计费：ERC20 计划链上 subscribe() 要求 msg.value==0，
  // 而 session 策略以 value 支付订阅费，ERC20 续订必然 revert（见测试用例 L2）。
  if (plan.pay_token && String(plan.pay_token).toLowerCase() !== ZERO_ADDRESS) {
    const err = new Error('auto-renew only supports ETH plans (pay_token must be zero address)') as Error & { status?: number }
    err.status = 422
    throw err
  }

  // ② aa-relay 创建 session（生成 session key + 策略落库 + 预测账户地址）
  const now = Math.floor(Date.now() / 1000)
  const validUntil = now + config.aaAutoRenewSessionDays * 86400
  const priceWei = BigInt(p.planPriceWei)
  const permissions = [
    {
      targets: [config.subscriptionManagerOxaChain],
      selectors: [SUBSCRIBE_SELECTOR],
      valueLimit: priceWei, // 单笔限额 = 订阅价
      countLimit: config.aaAutoRenewMaxCount, // 总调用上限（2 年窗口保护）
      dailyLimit: priceWei, // 每天最多续订一次
    },
  ]
  const relay = await relayRequest('/v1/session', {
    chain: config.aaRelayChain,
    product: AA_RELAY_PRODUCT,
    owner: p.subscriber,
    permissions,
    validUntil,
  })
  const accountAddress = relay.accountAddress as string
  const sessionId = relay.sessionId as string
  const sessionSigner = relay.signer as string
  const sessionKey = relay.sessionKey as string

  // ③ 部署智能账户（digest 依赖已部署账户的 currentNonce）
  const accountDeployed = await ensureAccountDeployed(accountAddress as Address, p.subscriber as Address)

  // ④ 重建 policy + 构造 ENABLE draft → digest（owner 需签名）
  const aa = await loadAaSdk()
  const cfg = getAaChainConfig()
  const policy = {
    network: 'evm',
    sessionId,
    signer: sessionSigner as Address,
    validAfter: 0n,
    validUntil: BigInt(validUntil),
    permissions,
  }
  const draft = await aa.buildEnableSessionUserOp({
    client: aaPublicClient(),
    chainConfig: cfg,
    account: accountAddress as Address,
    policy,
    gas: { ...AA_GAS, ...(await estimateFees()) },
  })

  // ⑤ 登记 aa_auto_renew（pending，待用户签名确认；重复开启时覆盖为最新 session）
  const encKey = encryptApiKey(sessionKey, config.masterEncryptionKey)
  await pool.query(
    `INSERT INTO aa_auto_renew
       (subscriber, agent_id, plan_id, account_address, current_subscription_id,
        session_id, session_signer, session_key_enc, policy_json, renew_status, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,'pending',NOW())
     ON CONFLICT (subscriber, agent_id, plan_id) DO UPDATE SET
       account_address = EXCLUDED.account_address,
       current_subscription_id = EXCLUDED.current_subscription_id,
       session_id = EXCLUDED.session_id,
       session_signer = EXCLUDED.session_signer,
       session_key_enc = EXCLUDED.session_key_enc,
       policy_json = EXCLUDED.policy_json,
       renew_status = 'pending',
       last_renew_err = NULL,
       disabled_at = NULL,
       updated_at = NOW()`,
    [
      p.subscriber.toLowerCase(),
      p.agentId,
      p.planId,
      accountAddress.toLowerCase(),
      p.subscriptionId,
      sessionId,
      sessionSigner.toLowerCase(),
      encKey,
      stringifyPolicy(policy),
    ],
  )
  log.info(
    `[aa-autorenew] session created: sub=${p.subscriber} plan=${p.planId} account=${accountAddress} session=${sessionId.slice(0, 10)}…`,
  )

  return {
    accountAddress,
    accountDeployed,
    sessionId,
    sessionSigner,
    digest: draft.digest as string,
    validUntil: String(validUntil),
  }
}

export interface ConfirmAutoRenewParams {
  subscriber: string
  agentId: number
  planId: number
  /** 前端对 digest 的裸 ECDSA 签名（eth_sign 语义，65 字节） */
  ownerSignature: string
}

/** confirm：服务端重建 draft + session key 签 userOpHash → aa-relay 上链授权 */
export async function confirmAutoRenew(p: ConfirmAutoRenewParams): Promise<{
  userOpHash: string
  txHash: string | null
  receiptSuccess: boolean
}> {
  if (!isAutoRenewEnabled()) throw new Error('Auto-renew (ERC-4337) not enabled on this gateway')
  const pool = getPool()
  const { rows } = await pool.query(
    `SELECT account_address, session_id, session_signer, session_key_enc, policy_json
     FROM aa_auto_renew
     WHERE subscriber = $1 AND agent_id = $2 AND plan_id = $3 AND renew_status = 'pending'`,
    [p.subscriber.toLowerCase(), p.agentId, p.planId],
  )
  if (!rows[0]) throw new Error('no pending auto-renew session (call enable first)')
  const row = rows[0]

  const aa = await loadAaSdk()
  const cfg = getAaChainConfig()
  const policy = parsePolicy(row.policy_json)
  const draft = await aa.buildEnableSessionUserOp({
    client: aaPublicClient(),
    chainConfig: cfg,
    account: row.account_address as Address,
    policy,
    gas: { ...AA_GAS, ...(await estimateFees()) },
  })
  const sessionKey = decryptApiKey(row.session_key_enc, config.masterEncryptionKey)
  const agentSigner = new aa.PrivateKeySigner(sessionKey)
  // owner 签名由前端提供（eth_sign 裸 ECDSA）；服务端仅代理注入，不接触 owner 私钥
  const ownerSigner = {
    type: 'external-wallet' as const,
    address: p.subscriber as Address,
    signUserOp: async () => p.ownerSignature as Hex,
    signMessage: async () => p.ownerSignature as Hex,
  }
  const op = await aa.signEnableUserOp({ chainConfig: cfg, draft, ownerSigner, agentSigner })
  const result = await relayRequest('/v1/userops', { chain: config.aaRelayChain, op, wait: true })

  const receiptSuccess = Boolean(result?.receipt?.success)
  if (receiptSuccess) {
    await pool.query(
      `UPDATE aa_auto_renew SET renew_status = 'enabled', last_renew_err = NULL, updated_at = NOW()
       WHERE subscriber = $1 AND agent_id = $2 AND plan_id = $3`,
      [p.subscriber.toLowerCase(), p.agentId, p.planId],
    )
    log.info(`[aa-autorenew] enabled: sub=${p.subscriber} plan=${p.planId} op=${result?.userOpHash}`)
  } else {
    // 链上授权失败：保持 pending 允许用户重签；记录原因便于前端展示
    const reason = `enable UserOp failed on-chain (op=${result?.userOpHash ?? 'n/a'})`
    await pool.query(
      `UPDATE aa_auto_renew SET last_renew_err = $1, updated_at = NOW()
       WHERE subscriber = $2 AND agent_id = $3 AND plan_id = $4`,
      [reason, p.subscriber.toLowerCase(), p.agentId, p.planId],
    )
    log.warn(`[aa-autorenew] enable failed: sub=${p.subscriber} plan=${p.planId} → ${reason}`)
  }
  return {
    userOpHash: result?.userOpHash as string,
    txHash: result?.receipt?.txHash ?? null,
    receiptSuccess,
  }
}

export interface DisableAutoRenewParams {
  subscriber: string
  agentId: number
  planId: number
}

/** disable：本地停用（后续不再续订）；返回 disableCallData 供前端可选链上撤销 session */
export async function disableAutoRenew(p: DisableAutoRenewParams): Promise<{ disableCallData?: string }> {
  const pool = getPool()
  const { rows } = await pool.query(
    `SELECT account_address, session_id FROM aa_auto_renew
     WHERE subscriber = $1 AND agent_id = $2 AND plan_id = $3`,
    [p.subscriber.toLowerCase(), p.agentId, p.planId],
  )
  if (!rows[0]) {
    const err = new Error('auto-renew not registered for this plan') as Error & { status?: number }
    err.status = 404
    throw err
  }
  await pool.query(
    `UPDATE aa_auto_renew SET renew_status = 'disabled', disabled_at = NOW(), updated_at = NOW()
     WHERE subscriber = $1 AND agent_id = $2 AND plan_id = $3`,
    [p.subscriber.toLowerCase(), p.agentId, p.planId],
  )
  let disableCallData: string | undefined
  try {
    const relay = await relayRequest('/v1/session/disable', {
      chain: config.aaRelayChain,
      product: AA_RELAY_PRODUCT,
      account: rows[0].account_address,
      sessionId: rows[0].session_id,
    })
    disableCallData = relay?.disableCallData
  } catch {
    // 本地停用已生效；链上撤销需要 owner 签名上链，可后续处理
  }
  log.info(`[aa-autorenew] disabled: sub=${p.subscriber} plan=${p.planId}`)
  return { disableCallData }
}

/** status：用户的自动续订登记列表（含订阅/计划/资金视图，供前端展示与充值引导） */
export async function listAutoRenew(subscriber: string): Promise<any[]> {
  const { rows } = await getPool().query(
    `SELECT ar.agent_id, ar.plan_id, ar.account_address, ar.current_subscription_id,
            ar.session_id, ar.session_signer, ar.renew_status, ar.renew_count,
            ar.last_renew_at, ar.last_renew_tx, ar.last_renew_err, ar.created_at, ar.updated_at,
            cs.status AS sub_status, cs.started_at AS sub_started_at, cs.expires_at AS sub_expires_at, cs.amount_wei,
            sp.price AS plan_price, sp.period AS plan_period
     FROM aa_auto_renew ar
     LEFT JOIN chain_subscriptions cs ON cs.subscription_id = ar.current_subscription_id
     LEFT JOIN subscription_plans sp ON sp.plan_id = ar.plan_id
     WHERE ar.subscriber = $1
     ORDER BY ar.updated_at DESC`,
    [subscriber.toLowerCase()],
  )
  return rows
}

// ============================================================================
// 续订 cron
// ============================================================================

/** 当前应续订的订阅：最新一条 活跃或已过期 的订阅（自动续订要接住刚过期的订阅） */
async function resolveCurrentSubscription(subscriber: string, agentId: number): Promise<any | null> {
  const { rows } = await getPool().query(
    `SELECT subscription_id, status, started_at, expires_at, amount_wei
     FROM chain_subscriptions
     WHERE LOWER(subscriber) = $1 AND agent_id = $2 AND status IN (1,2)
     ORDER BY subscription_id DESC LIMIT 1`,
    [subscriber.toLowerCase(), agentId],
  )
  return rows[0] ?? null
}

async function markRenewError(subscriber: string, agentId: number, planId: number, err: string): Promise<void> {
  await getPool().query(
    `UPDATE aa_auto_renew SET last_renew_err = $1, last_renew_at = NULL, updated_at = NOW()
     WHERE subscriber = $2 AND agent_id = $3 AND plan_id = $4`,
    [err, subscriber.toLowerCase(), agentId, planId],
  )
  log.warn(`[aa-autorenew] ${subscriber}:${agentId}:${planId} → ${err}`)
}

/** 单行续订处理。返回 true=已续订，false=尝试但失败，null=未到期/不应续订。 */
async function renewOne(row: any, nowSec: number, windowSec: number): Promise<boolean | null> {
  const pool = getPool()
  const { subscriber, agent_id: agentId, plan_id: planId } = row

  // ① 最新活跃/刚过期订阅
  const cur = await resolveCurrentSubscription(subscriber, agentId)
  if (!cur) {
    await markRenewError(subscriber, agentId, planId, 'no active subscription to renew')
    return null
  }

  // ② 指针自愈（续订成功后 indexer 产生新订阅，这里前移）
  if (Number(row.current_subscription_id ?? 0) !== Number(cur.subscription_id)) {
    await pool.query(
      `UPDATE aa_auto_renew SET current_subscription_id = $1, updated_at = NOW()
       WHERE subscriber = $2 AND agent_id = $3 AND plan_id = $4`,
      [cur.subscription_id, subscriber.toLowerCase(), agentId, planId],
    )
    row.current_subscription_id = cur.subscription_id
  }

  // ③ 到期窗口：到期前 windowSec 内或过期不超过 windowSec 才续订
  const expiresAt = Number(cur.expires_at ?? 0)
  if (expiresAt > nowSec + windowSec) return null // 未到窗口
  if (nowSec - expiresAt > windowSec) {
    await markRenewError(subscriber, agentId, planId, `subscription expired too long ago (${nowSec - expiresAt}s)`)
    return null
  }

  // ④ 冷却期防重：刚提交过（收据确认前 / 指针前移前）不重复提交
  if (row.last_renew_at && Date.now() - new Date(row.last_renew_at).getTime() < RENEW_COOLDOWN_MS) return null

  // ⑤ 计划仍有效
  const planRes = await pool.query(`SELECT price, active FROM subscription_plans WHERE plan_id = $1`, [planId])
  if (!planRes.rows[0] || !planRes.rows[0].active) {
    await markRenewError(subscriber, agentId, planId, 'plan is inactive — renewal stopped')
    return null
  }
  const priceWei = String(planRes.rows[0].price)

  // ⑥ 链下策略预检（target/selector/valueLimit/有效期）
  const aa = await loadAaSdk()
  const cfg = getAaChainConfig()
  const policy = parsePolicy(row.policy_json)
  const call = {
    target: config.subscriptionManagerOxaChain as Address,
    selector: SUBSCRIBE_SELECTOR,
    value: BigInt(priceWei),
  }
  const v = aa.validateSessionCall(policy, call, BigInt(nowSec))
  if (!v.ok) {
    await markRenewError(subscriber, agentId, planId, `policy denied: ${v.reason}`)
    return null
  }

  // ⑦ 资金预检（用户自付 gas：EntryPoint deposit 需非零）
  const funding = await getAccountFunding(row.account_address)
  if (funding.epDepositWei <= 0n && funding.nativeWei <= 0n) {
    await markRenewError(subscriber, agentId, planId, 'smart account unfunded — top up OXA for gas')
    return null
  }

  // ⑧ 构造 + 签名 + 上链（先打时间戳防重，失败清空允许重试）
  const sessionKey = decryptApiKey(row.session_key_enc, config.masterEncryptionKey)
  const agentSigner = new aa.PrivateKeySigner(sessionKey)
  const data = encodeFunctionData({
    abi: parseAbi(['function subscribe(uint256 planId) payable']),
    functionName: 'subscribe',
    args: [BigInt(planId)],
  })
  const op = await aa.buildSessionUserOp({
    client: aaPublicClient(),
    chainConfig: cfg,
    account: row.account_address as Address,
    sessionId: row.session_id,
    agentSigner,
    call: { target: config.subscriptionManagerOxaChain as Address, value: BigInt(priceWei), data },
    gas: { ...AA_GAS, ...(await estimateFees()) },
  })
  await pool.query(
    `UPDATE aa_auto_renew SET last_renew_at = NOW(), updated_at = NOW()
     WHERE subscriber = $1 AND agent_id = $2 AND plan_id = $3`,
    [subscriber.toLowerCase(), agentId, planId],
  )
  const result = await relayRequest('/v1/userops', { chain: config.aaRelayChain, op, wait: true })
  const success = Boolean(result?.receipt?.success)
  if (success) {
    await pool.query(
      `UPDATE aa_auto_renew SET renew_count = renew_count + 1, last_renew_tx = $2, last_renew_err = NULL,
         renew_log = renew_log || $4::jsonb, updated_at = NOW()
       WHERE subscriber = $1 AND agent_id = $3 AND plan_id = $5`,
      [
        subscriber.toLowerCase(),
        result.userOpHash,
        agentId,
        JSON.stringify([
          {
            at: new Date().toISOString(),
            subscriptionId: Number(cur.subscription_id),
            planId,
            userOpHash: result.userOpHash,
            txHash: result.receipt?.txHash ?? null,
          },
        ]),
        planId,
      ],
    )
    log.info(`[aa-autorenew] renewed plan ${planId} for ${subscriber} (op=${result.userOpHash})`)
    return true
  }
  await markRenewError(subscriber, agentId, planId, `renewal op failed on-chain (op=${result.userOpHash})`)
  return false
}

/** 全量扫描：对每个 enabled 登记做到期续订 */
export async function runAutoRenewScan(): Promise<{ checked: number; renewed: number; failed: number }> {
  if (!isAutoRenewEnabled()) return { checked: 0, renewed: 0, failed: 0 }
  const { rows } = await getPool().query(
    `SELECT subscriber, agent_id, plan_id, account_address, session_id, session_key_enc, policy_json,
            current_subscription_id, last_renew_at
     FROM aa_auto_renew WHERE renew_status = 'enabled'`,
  )
  const nowSec = Math.floor(Date.now() / 1000)
  const windowSec = config.aaAutoRenewWindowSec
  let renewed = 0
  let failed = 0
  for (const row of rows) {
    const key = `${row.subscriber}:${row.agent_id}:${row.plan_id}`
    if (inFlight.has(key)) continue
    inFlight.add(key)
    try {
      const r = await renewOne(row, nowSec, windowSec)
      if (r === true) renewed++
      else if (r === false) failed++
    } catch (err: any) {
      failed++
      await markRenewError(row.subscriber, row.agent_id, row.plan_id, `scan error: ${err.message}`)
    } finally {
      inFlight.delete(key)
    }
  }
  if (rows.length > 0) {
    log.info(`[aa-autorenew] scan done: ${rows.length} checked, ${renewed} renewed, ${failed} failed`)
  }
  return { checked: rows.length, renewed, failed }
}

let timer: NodeJS.Timeout | null = null

export function startAutoRenewDaemon(): void {
  if (!isAutoRenewEnabled()) {
    log.warn('[aa-autorenew] daemon disabled (AA_AUTO_RENEW_ENABLED / AA_RELAY_URL / AA_RELAY_API_KEY not set)')
    return
  }
  if (timer) return
  const run = (): void => {
    runAutoRenewScan().catch((err) => log.error(`[aa-autorenew] scan error: ${err.message}`))
  }
  run()
  timer = setInterval(run, config.aaAutoRenewIntervalSec * 1000)
  log.info(`[aa-autorenew] daemon started (every ${config.aaAutoRenewIntervalSec}s, window ${config.aaAutoRenewWindowSec}s)`)
}

export function stopAutoRenewDaemon(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
