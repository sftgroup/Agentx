// ---------------------------------------------------------------------------
// AgentX Gateway — 自动续订 cron + 失败护栏 + daemon（ERC-4337）
// ---------------------------------------------------------------------------
// 服务端定时续订引擎：扫描 enabled 登记，在订阅到期窗口内用 session key 签发
// UserOp 调用 SubscriptionManager.subscribe(planId) 自动续订（智能账户自付 gas）。
//
// 本模块只承载"续订调度"：
//   resolveCurrentSubscription 双归属订阅解析 + 指针前移（续订锚点）
//   watchFunding               e4 余额不足提前告警（资金巡检）
//   renewOne / runAutoRenewScan 单行续订 + 全量扫描（含失败护栏暂停）
//   start/stopAutoRenewDaemon  daemon 生命周期
// 会话创建 / 确认 / 撤销在 aa-session；账户部署 / 资金读取在 aa-account。
// ---------------------------------------------------------------------------

import { encodeFunctionData, parseAbi, type Address } from 'viem'
import { getPool } from '../lib/db'
import { config } from '../config'
import { decryptApiKey } from '../lib/crypto'
import { sendAlert } from '../lib/alert'
import { checkFundingSufficiency } from '../lib/aa-funding'
import {
  AA_GAS,
  SUBSCRIBE_SELECTOR,
  aaPublicClient,
  estimateFees,
  getAaChainConfig,
  isAutoRenewEnabled,
  loadAaSdk,
  parsePolicy,
  submitUserOp,
} from '../lib/aa-relay'
import { getAccountFunding } from './aa-account'
import { log } from './chain-data-reader'

/** 续订提交冷却（ms）：防止收据确认前 / indexer 指针前移前对同一期重复提交 */
const RENEW_COOLDOWN_MS = 10 * 60_000

// 进程内扫描防重（pm2 fork 单进程；跨进程由 DB last_renew_at 冷却兜底）
const inFlight = new Set<string>()

/** daemon 健康指标（health 端点暴露，供监控告警） */
export const autoRenewStats = {
  lastScanAt: null as string | null,
  lastScan: { checked: 0, renewed: 0, failed: 0, alerts: 0 },
  pausedCount: 0,
}

export function getAutoRenewStats(): typeof autoRenewStats {
  return { ...autoRenewStats, lastScan: { ...autoRenewStats.lastScan } }
}

/**
 * 当前应续订的订阅（导出供单测；续订 cron 与自愈共用）。
 * 自动续订的链上归属是智能账户（ERC-4337 的 msg.sender），indexer 按 msg.sender
 * 写入 chain_subscriptions，因此查询必须同时覆盖 EOA 与 account_address 两个归属。
 *   - 指针优先：current_subscription_id 指向的订阅 active 且无更新订阅时直接使用；
 *     若续订后 indexer 已产生账户名下的新订阅 → 前移指针返回新订阅（防对旧订阅
 *     重复续订扣费）；
 *   - 回退：EOA 或智能账户名下的最新一条 active/过期订阅（pointerMoved 供自愈前移）。
 */
export async function resolveCurrentSubscription(
  subscriber: string,
  agentId: number,
  accountAddress: string,
  currentSubscriptionId?: number | null,
): Promise<{ subscription: any; pointerMoved?: number } | null> {
  const pool = getPool()
  const subjects = [subscriber.toLowerCase(), accountAddress.toLowerCase()]
  // ① 指针优先：指针指向的订阅仍 active → 若无更新订阅则直接使用
  if (currentSubscriptionId) {
    const { rows } = await pool.query(
      `SELECT subscription_id, status, started_at, expires_at, amount_wei
       FROM chain_subscriptions WHERE subscription_id = $1`,
      [currentSubscriptionId],
    )
    if (rows[0] && Number(rows[0].status) === 1) {
      const newer = await pool.query(
        `SELECT subscription_id, status, started_at, expires_at, amount_wei
         FROM chain_subscriptions
         WHERE LOWER(subscriber) IN ($1, $2) AND agent_id = $3 AND subscription_id > $4 AND status IN (1,2)
         ORDER BY subscription_id DESC LIMIT 1`,
        [...subjects, agentId, currentSubscriptionId],
      )
      if (newer.rows[0]) {
        // 已有更新的订阅（自动续订产生，归属智能账户）→ 前移指针
        return { subscription: newer.rows[0], pointerMoved: Number(newer.rows[0].subscription_id) }
      }
      return { subscription: rows[0] }
    }
  }
  // ② 回退：EOA 或智能账户名下的最新一条 active/过期订阅
  const { rows } = await pool.query(
    `SELECT subscription_id, status, started_at, expires_at, amount_wei
     FROM chain_subscriptions
     WHERE LOWER(subscriber) IN ($1, $2) AND agent_id = $3 AND status IN (1,2)
     ORDER BY subscription_id DESC LIMIT 1`,
    [...subjects, agentId],
  )
  const sub = rows[0] ?? null
  if (!sub) return null
  const pointerMoved = Number(sub.subscription_id) !== Number(currentSubscriptionId ?? 0) ? Number(sub.subscription_id) : undefined
  return { subscription: sub, pointerMoved }
}

/** 暂停续订（失败护栏）：扫描只处理 enabled 行，暂停后不再骚扰重试；用户充值后 resume */
async function pauseAutoRenew(subscriber: string, agentId: number, planId: number, reason: string): Promise<void> {
  await getPool().query(
    `UPDATE aa_auto_renew SET renew_status = 'paused', paused_reason = $1, paused_at = NOW(), updated_at = NOW()
     WHERE subscriber = $2 AND agent_id = $3 AND plan_id = $4`,
    [reason, subscriber.toLowerCase(), agentId, planId],
  )
  autoRenewStats.pausedCount++
  await sendAlert(`auto-renew paused (${subscriber}:${agentId}:${planId})`, { reason })
  log.warn(`[aa-renewal] paused ${subscriber}:${agentId}:${planId} → ${reason}`)
}

/**
 * 记录续订失败并计数。
 *  - fatal=false（默认，资金不足/链上失败/临时异常）：递增 renew_fail_count，
 *    超过 AA_RENEW_MAX_FAIL_COUNT 自动暂停 + 告警（避免每轮无限重试）；
 *  - fatal=true（订阅消失/计划失效/策略拒绝等不可自愈）：直接暂停 + 告警。
 */
async function markRenewError(
  subscriber: string,
  agentId: number,
  planId: number,
  err: string,
  opts: { fatal?: boolean } = {},
): Promise<void> {
  const pool = getPool()
  if (opts.fatal) {
    await pauseAutoRenew(subscriber, agentId, planId, err)
    return
  }
  const { rows } = await pool.query(
    `UPDATE aa_auto_renew SET last_renew_err = $1, last_renew_at = NULL,
       renew_fail_count = renew_fail_count + 1, updated_at = NOW()
     WHERE subscriber = $2 AND agent_id = $3 AND plan_id = $4
     RETURNING renew_fail_count, renew_status`,
    [err, subscriber.toLowerCase(), agentId, planId],
  )
  log.warn(`[aa-renewal] ${subscriber}:${agentId}:${planId} → ${err}`)
  const row = rows[0]
  if (row && row.renew_status !== 'paused' && Number(row.renew_fail_count) >= config.aaRenewMaxFailCount) {
    await pauseAutoRenew(subscriber, agentId, planId, `连续失败 ${row.renew_fail_count} 次：${err}`)
  }
}

/** resume：用户充值后恢复被暂停的自动续订（重置失败计数） */
export async function resumeAutoRenew(p: { subscriber: string; agentId: number; planId: number }): Promise<void> {
  const pool = getPool()
  const { rows } = await pool.query(
    `UPDATE aa_auto_renew SET renew_status = 'enabled', paused_reason = NULL, paused_at = NULL,
       renew_fail_count = 0, last_renew_err = NULL, updated_at = NOW()
     WHERE subscriber = $1 AND agent_id = $2 AND plan_id = $3 AND renew_status = 'paused'
     RETURNING plan_id`,
    [p.subscriber.toLowerCase(), p.agentId, p.planId],
  )
  if (!rows[0]) {
    const err = new Error('no paused auto-renew to resume (call enable first)') as Error & { status?: number }
    err.status = 404
    throw err
  }
  log.info(`[aa-renewal] resumed: sub=${p.subscriber} plan=${p.planId}`)
}

/**
 * 资金巡检（e4，余额不足主动告警）：在续订窗口开启前（到期前 AA_ALERT_AHEAD_SEC 秒）
 * 检查智能账户三类资金，任一不足则向 webhook 提前告警（不等续订失败才报）。
 *   - 已进入续订窗口（到期前 windowSec 内）→ 跳过，交给 renewOne ⑦ 的资金预检处理；
 *   - 告警节流：同登记距上次告警 < AA_ALERT_MIN_INTERVAL_SEC → 跳过（防每轮扫描轰炸）。
 * 判定口径与 renewOne ⑦ 共用 checkFundingSufficiency（lib/aa-funding），但阈值不同：
 *   e4 提前告警更严格（escrow ≥ 2×固定费留充值缓冲、native ≥ 订阅价），
 *   renewOne ⑦ 是续订时实际硬门槛（escrow ≥ 1×固定费、仅要求 gas 非零）。
 * 返回 null=未进入窗口；否则 { alerted, shortages }。
 */
export async function watchFunding(
  row: any,
  nowSec: number,
): Promise<{ alerted: boolean; shortages: string[] } | null> {
  const pool = getPool()
  const { subscriber, agent_id: agentId, plan_id: planId } = row
  const resolved = await resolveCurrentSubscription(subscriber, agentId, row.account_address, row.current_subscription_id)
  if (!resolved) return null
  const expiresAt = Number(resolved.subscription.expires_at ?? 0)
  // ① 未进入提前告警窗口 → 不巡检
  if (expiresAt <= 0 || nowSec < expiresAt - config.aaAlertAheadSec) return null
  // ② 已进入续订窗口 → 交给 renewOne 的资金预检（此处跳过，避免与失败护栏重复）
  if (expiresAt <= nowSec + config.aaAutoRenewWindowSec) return null
  // ③ 资金检查（统一判定，escrow 留 2× 余量 + 要求 native ≥ 订阅价）
  const funding = await getAccountFunding(row.account_address)
  const priceWei = BigInt(resolved.subscription.amount_wei ?? 0)
  const shortages = checkFundingSufficiency(
    funding,
    priceWei,
    BigInt(config.aaRelayServiceFeeWei),
    { escrowMargin: 2n, requirePrice: true },
  )
  if (shortages.length === 0) return { alerted: false, shortages }
  // ④ 告警节流：距上次告警 < 最小间隔 → 跳过
  const { rows } = await pool.query(
    `SELECT last_funding_alert_at FROM aa_auto_renew
     WHERE subscriber = $1 AND agent_id = $2 AND plan_id = $3`,
    [subscriber.toLowerCase(), agentId, planId],
  )
  const lastAt = rows[0]?.last_funding_alert_at
  if (lastAt && Date.now() - new Date(lastAt).getTime() < config.aaAlertMinIntervalSec * 1000) {
    return { alerted: false, shortages }
  }
  // ⑤ 发送告警 + 记录告警时间
  await sendAlert(`auto-renew funding low (${subscriber}:${agentId}:${planId})`, {
    reason: shortages.join('; '),
    account: row.account_address,
    subscriptionId: Number(resolved.subscription.subscription_id),
    expiresAt,
    funding: {
      nativeWei: funding.nativeWei.toString(),
      epDepositWei: funding.epDepositWei.toString(),
      escrowWei: funding.escrowWei.toString(),
    },
  })
  await pool.query(
    `UPDATE aa_auto_renew SET last_funding_alert_at = NOW(), updated_at = NOW()
     WHERE subscriber = $1 AND agent_id = $2 AND plan_id = $3`,
    [subscriber.toLowerCase(), agentId, planId],
  )
  log.warn(`[aa-renewal] funding alert sent: ${subscriber}:${agentId}:${planId} → ${shortages.join('; ')}`)
  return { alerted: true, shortages }
}

/** 单行续订处理。返回 true=已续订，false=尝试但失败，null=未到期/不应续订。 */
async function renewOne(row: any, nowSec: number, windowSec: number): Promise<boolean | null> {
  const pool = getPool()
  const { subscriber, agent_id: agentId, plan_id: planId } = row

  // ① 当前应续订的订阅（指针为锚；覆盖 EOA 与智能账户两个归属）
  const resolved = await resolveCurrentSubscription(subscriber, agentId, row.account_address, row.current_subscription_id)
  if (!resolved) {
    // 订阅不存在：重试无意义（fatal 直接暂停）
    await markRenewError(subscriber, agentId, planId, 'no active subscription to renew', { fatal: true })
    return null
  }
  const cur = resolved.subscription

  // ② 指针自愈（续订成功后 indexer 产生新订阅，这里前移）
  if (resolved.pointerMoved) {
    await pool.query(
      `UPDATE aa_auto_renew SET current_subscription_id = $1, updated_at = NOW()
       WHERE subscriber = $2 AND agent_id = $3 AND plan_id = $4`,
      [resolved.pointerMoved, subscriber.toLowerCase(), agentId, planId],
    )
    row.current_subscription_id = resolved.pointerMoved
  }

  // ③ 到期窗口：到期前 windowSec 内或过期不超过 windowSec 才续订
  const expiresAt = Number(cur.expires_at ?? 0)
  if (expiresAt > nowSec + windowSec) return null // 未到窗口
  if (nowSec - expiresAt > windowSec) {
    // 错过续订窗口：重试无意义（fatal 直接暂停）
    await markRenewError(subscriber, agentId, planId, `subscription expired too long ago (${nowSec - expiresAt}s)`, { fatal: true })
    return null
  }

  // ④ 冷却期防重：刚提交过（收据确认前 / 指针前移前）不重复提交
  if (row.last_renew_at && Date.now() - new Date(row.last_renew_at).getTime() < RENEW_COOLDOWN_MS) return null

  // ⑤ 计划仍有效
  const planRes = await pool.query(`SELECT price, active FROM subscription_plans WHERE plan_id = $1`, [planId])
  if (!planRes.rows[0] || !planRes.rows[0].active) {
    // 计划下架：重试无意义（fatal 直接暂停）
    await markRenewError(subscriber, agentId, planId, 'plan is inactive — renewal stopped', { fatal: true })
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
    // 策略拒绝（白名单/限额/有效期）：配置问题，重试无意义（fatal 直接暂停）
    await markRenewError(subscriber, agentId, planId, `policy denied: ${v.reason}`, { fatal: true })
    return null
  }

  // ⑦ 资金预检（三类资金，实证见 docs/infrax-bundler-restore-handoff.md §5）：
  //    - escrow 余额 → relay A-10 服务费（预扣固定费+预估 gas，实测 ~0.00246 OXA/次），
  //      不足 relay 会拒绝/扣费失败 → 直接不提交；
  //    - EntryPoint deposit → UserOp gas（bundler 按实际用量结算，未用部分退还）；
  //    - native 余额 → execute value（订阅费）。
  // 与 watchFunding（e4）共用 checkFundingSufficiency，此处为续订实际硬门槛：
  //   escrow ≥ 1×固定费、gas 两类资金至少一项非零（不要求 native ≥ 订阅价，历史口径）。
  const funding = await getAccountFunding(row.account_address)
  const fundingShortages = checkFundingSufficiency(
    funding,
    BigInt(priceWei ?? 0),
    BigInt(config.aaRelayServiceFeeWei),
    { escrowMargin: 1n, requirePrice: false },
  )
  if (fundingShortages.length > 0) {
    await markRenewError(subscriber, agentId, planId, fundingShortages.join('; '))
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
  // 异步提交（wait:false → 202 + userOpHash）后轮询收据，解耦长连接（infraX REQ-3 口径）
  const result = await submitUserOp(op, { pollMs: 150_000 })
  const success = result.status === 'confirmed' && Boolean(result.receipt?.success)
  if (success) {
    await pool.query(
      `UPDATE aa_auto_renew SET renew_count = renew_count + 1, last_renew_tx = $2, last_renew_err = NULL,
         renew_fail_count = 0, renew_log = renew_log || $4::jsonb, updated_at = NOW()
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
    log.info(`[aa-renewal] renewed plan ${planId} for ${subscriber} (op=${result.userOpHash})`)
    return true
  }
  if (result.status === 'reverted') {
    await markRenewError(subscriber, agentId, planId, `renewal op reverted on-chain (op=${result.userOpHash})`)
  } else {
    // pending 超时：预扣保留、非致命；冷却期内不再重提，由下次 scan 复查（op 可能已确认）
    await markRenewError(subscriber, agentId, planId, `renewal op pending at timeout (op=${result.userOpHash})`)
  }
  return false
}

/** 全量扫描：先做资金巡检（e4 提前告警），再对每个 enabled 登记做到期续订 */
export async function runAutoRenewScan(): Promise<{ checked: number; renewed: number; failed: number; alerts: number }> {
  if (!isAutoRenewEnabled()) return { checked: 0, renewed: 0, failed: 0, alerts: 0 }
  const { rows } = await getPool().query(
    `SELECT subscriber, agent_id, plan_id, account_address, session_id, session_key_enc, policy_json,
            current_subscription_id, last_renew_at
     FROM aa_auto_renew WHERE renew_status = 'enabled'`,
  )
  const nowSec = Math.floor(Date.now() / 1000)
  const windowSec = config.aaAutoRenewWindowSec
  let renewed = 0
  let failed = 0
  let alerts = 0
  for (const row of rows) {
    const key = `${row.subscriber}:${row.agent_id}:${row.plan_id}`
    if (inFlight.has(key)) continue
    inFlight.add(key)
    try {
      // e4 资金巡检（提前告警；失败不阻塞续订主流程）
      try {
        const w = await watchFunding(row, nowSec)
        if (w?.alerted) alerts++
      } catch (wErr: any) {
        log.warn(`[aa-renewal] funding watch failed for ${key}: ${wErr.message}`)
      }
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
    log.info(`[aa-renewal] scan done: ${rows.length} checked, ${renewed} renewed, ${failed} failed, ${alerts} funding alerts`)
  }
  autoRenewStats.lastScanAt = new Date().toISOString()
  autoRenewStats.lastScan = { checked: rows.length, renewed, failed, alerts }
  return { checked: rows.length, renewed, failed, alerts }
}

let timer: NodeJS.Timeout | null = null

export function startAutoRenewDaemon(): void {
  if (!isAutoRenewEnabled()) {
    log.warn('[aa-renewal] daemon disabled (AA_AUTO_RENEW_ENABLED / AA_RELAY_URL / AA_RELAY_API_KEY not set)')
    return
  }
  if (timer) return
  const run = (): void => {
    runAutoRenewScan().catch((err) => log.error(`[aa-renewal] scan error: ${err.message}`))
  }
  run()
  timer = setInterval(run, config.aaAutoRenewIntervalSec * 1000)
  log.info(`[aa-renewal] daemon started (every ${config.aaAutoRenewIntervalSec}s, window ${config.aaAutoRenewWindowSec}s)`)
}

export function stopAutoRenewDaemon(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
