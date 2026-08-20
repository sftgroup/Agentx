// ---------------------------------------------------------------------------
// AgentX Gateway — ERC-4337 自动续订会话生命周期（用户操作）
// ---------------------------------------------------------------------------
// 用户对某个链上订阅开启自动续订：网关经 infraX aa-relay 创建 ERC-4337 Session
// Key（Kernel v3 智能账户 + Session Module）。用户 EOA 一次授权（ENABLE-mode
// UserOp，eth_sign 裸 ECDSA digest）后，服务端在订阅到期前用 session key 签发
// UserOp 调用 SubscriptionManager.subscribe(planId) 自动续订（见 aa-renewal）。
//
// 本模块只承载"会话"生命周期：
//   enable  创建 session + 部署账户 → 返回 digest（待用户 eth_sign）
//   confirm 提交 owner 签名 → ENABLE-mode UserOp 上链授权生效
//   disable 本地停用 + 构造链上撤销 draft
//   revoke  owner 签名 disable UserOp 上链撤销（L12 残留自愈）
//   list    我的自动续订登记列表
// 续订 cron / daemon / 资金巡检在 aa-renewal；账户部署 / 残留检测在 aa-account。
// ---------------------------------------------------------------------------

import {
  toFunctionSelector,
  type Address,
  type Hex,
} from 'viem'
import { getPool } from '../lib/db'
import { config } from '../config'
import { encryptApiKey, decryptApiKey } from '../lib/crypto'
import { log } from './chain-data-reader'
import {
  AA_GAS,
  AA_RELAY_PRODUCT,
  SUBSCRIBE_SELECTOR,
  aaPublicClient,
  estimateFees,
  getAaChainConfig,
  isAutoRenewEnabled,
  loadAaSdk,
  parsePolicy,
  relayRequest,
  stringifyPolicy,
  submitUserOp,
} from '../lib/aa-relay'
import { ensureAccountDeployed, hasOnChainSession, resolveExistingSessionId } from './aa-account'

/** 零地址（ETH 计费计划 pay_token = 0x0 才支持自动续订） */
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
/**
 * SubscriptionManager.owner() selector —— ENABLE-mode 良性调用（无副作用 view）。
 * aa-sdk buildEnableSessionUserOp 默认 benignCall={target:账户自身,data:'0x'}，不在
 * 会话白名单内 → Session Module 校验失败（FailedOp AA24 signature error）。修复 =
 * 白名单增加本条 permission + benignCall=SM.owner()（链上探针验证通过，见
 * scripts/aa-benignfix-probe.mjs；confirm 纯授权不扣费）。
 */
const OWNER_SELECTOR: Hex = toFunctionSelector('owner()')

// ============================================================================
// L12：链上 session 残留检测 + 撤销 UserOp（Kernel v3 单 session 结构自愈）
// 根因：Kernel v3 同一时刻只绑定一个 session validator；若账户链上仍有旧
// session（disable 未上链 / 登记被清但链上未撤销），再次 enableSession 覆盖
// 会被拒（bundler tracer 显示 Session Module isValidSignature revert）。
// 自愈 = enable 前探测残留 → 构造 disable UserOp（owner 签名上链撤销）→ 再 enable。
// disable UserOp 为 root nonce key + owner ECDSA 签名（非 ENABLE-mode），
// 会推进账户 currentNonce —— 因此必须在 enable digest 生成之前完成撤销。
// ============================================================================

/**
 * 构造撤销旧 session 的 UserOp draft（未签名，三段批量）——
 * 用 @0xinfrax/aa-sdk@0.1.2 buildDisableSessionUserOp（AA-7 实证编码）：
 *   execute(BATCH, [disableSession(sessionId)@module,        // 直接删 session 记录
 *                   uninstallModule(VALIDATOR, module, …),   // 卸载 session validator
 *                   self.invalidateNonce(currentNonce + 1)]) // 推进 currentNonce
 * 三段缺一不可（2026-08-20 infraX 契约更新，见 aa-relay-session-rollover-fix-infrax.md §2.4/§2.5）：
 *   - 已部署 Session Module 的 onUninstall 为空实现 → uninstall 的 deInitData 不删
 *     session 记录，必须显式 disableSession（否则撤销重装后旧 session key 仍可验证）；
 *   - 撤销必须推进 currentNonce（invalidateNonce），否则紧接着的 enable 重装会因
 *     Kernel ValidationManager 的 validationConfig[vId].nonce 残留 revert InvalidNonce（AA23）。
 * 注意 Kernel v3 没有独立的 executeBatch 函数，批量走 execute(execMode=BATCH, …)。
 * ⚠️ EIP-712 digest 绑定构建时 nonce/gas —— gas 估算后再调用本函数（传入 gas）
 * 以重算 userOpHash，再交给 owner 签名。
 */
async function buildDisableUserOpDraft(
  accountAddress: string,
  sessionId: string,
): Promise<{ op: any; userOpHash: string }> {
  const aa = await loadAaSdk()
  const cfg = getAaChainConfig()
  const fees = await estimateFees()
  const draft = await aa.buildDisableSessionUserOp({
    client: aaPublicClient(),
    chainConfig: cfg,
    account: accountAddress as Address,
    sessionId,
    gas: {
      callGasLimit: AA_GAS.callGasLimit,
      verificationGasLimit: AA_GAS.verificationGasLimit,
      preVerificationGas: AA_GAS.preVerificationGas,
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    },
  })
  return { op: draft.op, userOpHash: draft.userOpHash }
}

/** 撤销链上 session（owner 对 disableUserOpHash 的 eth_sign 裸 ECDSA 签名）。
 *  上链前重建 draft 并校验 userOpHash 与前端签名一致（防 nonce 变化导致签名失配）。 */
export async function revokeAutoRenew(p: {
  subscriber: string
  agentId: number
  planId: number
  disableUserOpHash: string
  ownerSignature: string
  /** L12 残留兜底：登记表行被清空时由调用方回传 enable 响应里的 accountAddress/disableSessionId */
  accountAddress?: string
  sessionId?: string
}): Promise<{ revoked: boolean; userOpHash: string; txHash: string | null }> {
  if (!isAutoRenewEnabled()) throw new Error('Auto-renew (ERC-4337) not enabled on this gateway')
  const { rows } = await getPool().query(
    `SELECT account_address, session_id FROM aa_auto_renew
     WHERE subscriber = $1 AND agent_id = $2 AND plan_id = $3`,
    [p.subscriber.toLowerCase(), p.agentId, p.planId],
  )
  const row = rows[0]
  // DB 优先；登记表行缺失（历史残留场景）时回退到 enable 响应的兜底参数。
  // 完整性仍由重建 draft 的 userOpHash 比对保证：签名绑定 op，sessionId 传错则哈希失配 → 409。
  const accountAddress = row?.account_address ?? p.accountAddress
  const sessionId = row?.session_id ?? p.sessionId
  if (!accountAddress || !sessionId) {
    const err = new Error('no session to revoke (call enable or disable first)') as Error & { status?: number }
    err.status = 404
    throw err
  }
  const { op, userOpHash } = await buildDisableUserOpDraft(String(accountAddress), String(sessionId))
  if (userOpHash.toLowerCase() !== p.disableUserOpHash.toLowerCase()) {
    const err = new Error('session state changed since the revoke request was prepared — retry enable') as Error & {
      status?: number
    }
    err.status = 409
    throw err
  }
  // 对齐 infraX 2026-08-20 会话接口：撤销上链走 POST /v1/session/revoke
  // （submitSignedOp 统一流程：owner 派生账户校验 + 签名校验 + userOpHash 一致性 +
  //  A-10 escrow 计费 + 广播 + 结算）。op 无需预置 signature，relay 侧注入 owner 签名。
  const result = await relayRequest(
    '/v1/session/revoke',
    {
      chain: config.aaRelayChain,
      account: accountAddress,
      owner: p.subscriber,
      sessionId,
      userOpHash,
      signature: p.ownerSignature,
      op,
      wait: true,
    },
    150_000,
  )
  const revoked = Boolean(result?.receipt?.success)
  if (revoked) {
    log.info(
      `[aa-session] session revoked on-chain: sub=${p.subscriber} plan=${p.planId} account=${accountAddress} session=${String(sessionId).slice(0, 10)}… op=${result?.userOpHash}`,
    )
  } else {
    log.warn(`[aa-session] revoke op failed on-chain: sub=${p.subscriber} plan=${p.planId} account=${accountAddress} op=${result?.userOpHash}`)
  }
  return {
    revoked,
    userOpHash: result?.userOpHash as string,
    txHash: result?.receipt?.txHash ?? null,
  }
}

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
  /** L12：账户链上残留旧 session，需先撤销（前端签名 disableUserOpHash 后调 revoke）再重试 enable */
  needsSessionRevoke?: boolean
  disableUserOpHash?: string
  disableSessionId?: string
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

  // ② 预测智能账户地址（owner + salt 0 + kernel v3.0-beta，与 aa-relay 一致；
  //    ensureAccountDeployed 后续会复算并校验 relay 返回地址一致）
  const aa = await loadAaSdk()
  const cfg = getAaChainConfig()
  const { factoryData } = aa.encodeKernelFactoryData(cfg, p.subscriber as Address, 0n, cfg.kernelVersion)
  const predictedAccount = (await aa.predictWithFactoryGetAddress(cfg, factoryData)) as string

  // ③ L12 自愈：账户链上已绑定旧 session（Kernel v3 单 session，enableSession
  //    覆盖被拒 → FailedOp AA23/AA24）。先返回撤销 draft 由前端签名上链，再重试
  //    enable。disable UserOp 推进 currentNonce，故必须在本次 digest 生成前撤销。
  if (await hasOnChainSession(predictedAccount)) {
    const oldSessionId = await resolveExistingSessionId(p.subscriber, p.agentId, p.planId, predictedAccount)
    if (!oldSessionId) {
      const err = new Error(
        'smart account has an existing on-chain session that cannot be auto-revoked — please contact support',
      ) as Error & { status?: number }
      err.status = 409
      throw err
    }
    const { userOpHash } = await buildDisableUserOpDraft(predictedAccount, oldSessionId)
    log.info(
      `[aa-session] on-chain session residue detected — revoke first: sub=${p.subscriber} account=${predictedAccount} session=${oldSessionId.slice(0, 10)}…`,
    )
    return {
      needsSessionRevoke: true,
      accountAddress: predictedAccount,
      accountDeployed: true,
      disableSessionId: oldSessionId,
      disableUserOpHash: userOpHash,
      // enable 专属字段置空（前端在 needsSessionRevoke 分支不消费）
      sessionId: '',
      sessionSigner: '',
      digest: '',
      validUntil: '',
    }
  }

  // ④ aa-relay 创建 session（生成 session key + 策略落库 + 预测账户地址）
  const now = Math.floor(Date.now() / 1000)
  const validUntil = now + config.aaAutoRenewSessionDays * 86400
  const priceWei = BigInt(p.planPriceWei)
  const sm = config.subscriptionManagerOxaChain as Address
  const permissions = [
    {
      targets: [sm],
      selectors: [SUBSCRIBE_SELECTOR],
      valueLimit: priceWei, // 单笔限额 = 订阅价
      countLimit: config.aaAutoRenewMaxCount, // 总调用上限（2 年窗口保护）
      dailyLimit: priceWei, // 每天最多续订一次
    },
    {
      // ENABLE-mode 良性调用白名单（无副作用）：benignCall 必须命中白名单，
      // 否则 Session Module 校验失败 → FailedOp AA24（见 aa-session 头注）。
      targets: [sm],
      selectors: [OWNER_SELECTOR],
      valueLimit: 0n,
      countLimit: 1,
      dailyLimit: 0n,
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

  // ⑤ 部署智能账户（digest 依赖已部署账户的 currentNonce）
  const accountDeployed = await ensureAccountDeployed(accountAddress as Address, p.subscriber as Address)

  // ⑥ 重建 policy + 构造 ENABLE draft → digest（owner 需签名）
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
    benignCall: { target: sm, value: 0n, data: OWNER_SELECTOR },
    gas: { ...AA_GAS, ...(await estimateFees()) },
  })

  // ⑦ 登记 aa_auto_renew（pending，待用户签名确认；重复开启时覆盖为最新 session）
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
    `[aa-session] session created: sub=${p.subscriber} plan=${p.planId} account=${accountAddress} session=${sessionId.slice(0, 10)}…`,
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
     WHERE subscriber = $1 AND agent_id = $2 AND plan_id = $3 AND renew_status = 'pending'
     ORDER BY updated_at DESC LIMIT 1`,
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
    // 与 createAutoRenew 一致的良性调用（白名单含 owner() 条目），否则重建的
    // UserOp 执行调用不在白名单 → FailedOp AA24；digest 亦因 callData 不同而失配。
    benignCall: { target: config.subscriptionManagerOxaChain as Address, value: 0n, data: OWNER_SELECTOR },
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
  // 异步提交 + 轮询（wait:false → 202 + userOpHash），解耦 enable 长连接（infraX REQ-3 口径）
  const result = await submitUserOp(op, { pollMs: 150_000 })

  const receiptSuccess = result.status === 'confirmed' && Boolean(result.receipt?.success)
  if (receiptSuccess) {
    await pool.query(
      `UPDATE aa_auto_renew SET renew_status = 'enabled', last_renew_err = NULL,
         renew_fail_count = 0, paused_reason = NULL, paused_at = NULL, updated_at = NOW()
       WHERE subscriber = $1 AND agent_id = $2 AND plan_id = $3`,
      [p.subscriber.toLowerCase(), p.agentId, p.planId],
    )
    log.info(`[aa-session] enabled: sub=${p.subscriber} plan=${p.planId} op=${result?.userOpHash}`)
  } else {
    // 链上授权失败：保持 pending 允许用户重签；记录原因便于前端展示
    const reason = `enable UserOp failed on-chain (op=${result?.userOpHash ?? 'n/a'})`
    await pool.query(
      `UPDATE aa_auto_renew SET last_renew_err = $1, updated_at = NOW()
       WHERE subscriber = $2 AND agent_id = $3 AND plan_id = $4`,
      [reason, p.subscriber.toLowerCase(), p.agentId, p.planId],
    )
    log.warn(`[aa-session] enable failed: sub=${p.subscriber} plan=${p.planId} → ${reason}`)
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

/** disable：本地停用（后续不再续订）。同时构造链上撤销 draft（disableUserOpHash），
 *  前端 eth_sign 后调 revokeAutoRenew 才能真正撤销链上 session（L12 防残留）。 */
export async function disableAutoRenew(p: DisableAutoRenewParams): Promise<{
  disableCallData?: string
  disableUserOpHash?: string
  accountAddress?: string
  sessionId?: string
}> {
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
    `UPDATE aa_auto_renew SET renew_status = 'disabled', disabled_at = NOW(), updated_at = NOW(),
       renew_fail_count = 0, paused_reason = NULL, paused_at = NULL
     WHERE subscriber = $1 AND agent_id = $2 AND plan_id = $3`,
    [p.subscriber.toLowerCase(), p.agentId, p.planId],
  )
  let disableCallData: string | undefined
  let disableUserOpHash: string | undefined
  const accountAddress = rows[0].account_address ? String(rows[0].account_address) : undefined
  const sessionId = rows[0].session_id ? String(rows[0].session_id) : undefined
  try {
    const relay = await relayRequest('/v1/session/disable', {
      chain: config.aaRelayChain,
      product: AA_RELAY_PRODUCT,
      account: rows[0].account_address,
      sessionId: rows[0].session_id,
    })
    disableCallData = relay?.disableCallData
    // 链上撤销 draft：owner 签名后调 POST /billing/auto-renew/revoke 上链
    if (accountAddress && sessionId) {
      const draft = await buildDisableUserOpDraft(accountAddress, sessionId)
      disableUserOpHash = draft.userOpHash
    }
  } catch {
    // 本地停用已生效；链上撤销需要 owner 签名上链，可后续处理
  }
  log.info(`[aa-session] disabled: sub=${p.subscriber} plan=${p.planId}`)
  return { disableCallData, disableUserOpHash, accountAddress, sessionId }
}

/** status：用户的自动续订登记列表（含订阅/计划/资金视图，供前端展示与充值引导） */
export async function listAutoRenew(subscriber: string): Promise<any[]> {
  const { rows } = await getPool().query(
    `SELECT ar.agent_id, ar.plan_id, ar.account_address, ar.current_subscription_id,
            ar.session_id, ar.session_signer, ar.renew_status, ar.renew_count,
            ar.renew_fail_count, ar.paused_reason, ar.paused_at,
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
