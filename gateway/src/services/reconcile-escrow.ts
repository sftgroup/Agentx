// ---------------------------------------------------------------------------
// AgentX Gateway — InfraXEscrow 计费事件同步 + 自动续订服务费对账（e5）
// ---------------------------------------------------------------------------
// 背景：relay A-10 计费（escrow 模式）每次 UserOp 向智能账户预扣 固定费+预估 gas，
// 收据后 settleUserOp 退差（Charged/Refunded 事件）。ref 为 relay 侧随机 uuid
// （aa:userop:<uuid>），无法与本地 renew_log 逐笔精确关联 → 采用期间聚合对账：
//   每个智能账户净扣费 = ΣCharged - ΣRefunded
//     漏计费：有续订记录但净扣费显著低于 条数×固定费（relay 未扣 / 事件断裂）；
//     重复扣费：净扣费显著高于 条数×(固定费+gas 余量)（L12 曾出现对旧订阅重复扣费）。
// 阈值：AA_ESCROW_RECONCILE_MIN_RATIO（默认 0.5）/ AA_ESCROW_RECONCILE_MAX_RATIO（默认 3）。
// 注意账户净扣费可能含 revoke（aa:revoke:<uuid>）等一次性服务费，因此仅对
// "显著偏低/偏高"告警（maxRatio=3 已给足余量，误报率低）。
// ---------------------------------------------------------------------------

import { createPublicClient, http, type Address } from 'viem'
import { getPool } from '../lib/db'
import { config } from '../config'
import { sendAlert } from './aa-autorenew'
import { log } from './chain-data-reader'

/** 计费相关事件面（只同步 charged/refunded，deposited/withdrawn 不参与对账） */
const chargeEventAbi = [
  {
    name: 'Charged',
    type: 'event',
    inputs: [
      { type: 'address', name: 'user', indexed: true },
      { type: 'uint256', name: 'amount' },
      { type: 'string', name: 'ref' },
    ],
  },
  {
    name: 'Refunded',
    type: 'event',
    inputs: [
      { type: 'address', name: 'user', indexed: true },
      { type: 'uint256', name: 'amount' },
      { type: 'string', name: 'ref' },
    ],
  },
] as const

let timer: ReturnType<typeof setInterval> | null = null

export interface EscrowSyncResult {
  lastBlock: number
  headBlock: number
  syncedEvents: number
  /** 是否已追平（head - last <= 跨度），追平后才做对账判定，避免追历史期间误报 */
  caughtUp: boolean
}

export interface EscrowAnomaly {
  account: string
  subscriber: string
  agentId: number
  planId: number
  kind: 'missing' | 'excess' | 'negative'
  renewCount: number
  expectedWei: string
  netWei: string
  detail: string
}

export interface EscrowReconcileResult {
  enabled: boolean
  caughtUp: boolean
  lastBlock: number
  headBlock: number
  syncedEvents: number
  accounts: number
  checked: number
  anomalies: EscrowAnomaly[]
  checkedAt: string
}

/** 增量同步 escrow Charged/Refunded 事件到 aa_escrow_events（幂等，tx+log 唯一） */
export async function syncEscrowEvents(): Promise<EscrowSyncResult> {
  const pool = getPool()
  const client = createPublicClient({ transport: http(config.rpcUrlOxaChain) })
  const head = Number(await client.getBlockNumber())
  const { rows } = await pool.query(`SELECT last_block FROM aa_escrow_sync WHERE id = 1`)
  const lastBlock = Number(rows[0]?.last_block ?? 0)
  let from = lastBlock + 1
  if (from <= 0) from = 0
  const span = config.aaEscrowSyncBlockSpan
  const to = Math.min(from + span - 1, head)
  let synced = 0
  if (from <= to) {
    const logs = await client.getLogs({
      address: config.aaEscrowAddress as Address,
      events: chargeEventAbi,
      fromBlock: BigInt(from),
      toBlock: BigInt(to),
    }).catch((err: any) => {
      log.warn(`[escrow-reconcile] getLogs failed ${from}..${to}: ${err.message}`)
      return []
    })
    for (const l of logs) {
      const kind = l.eventName === 'Refunded' ? 'refunded' : 'charged'
      const args = l.args as { user: Address; amount: bigint; ref: string }
      await pool.query(
        `INSERT INTO aa_escrow_events (chain_id, block_number, tx_hash, log_index, kind, account, amount_wei, ref)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (tx_hash, log_index) DO NOTHING`,
        [
          config.chainIdOxaChain,
          Number(l.blockNumber),
          l.transactionHash,
          l.logIndex,
          kind,
          String(args.user).toLowerCase(),
          args.amount.toString(),
          args.ref ?? null,
        ],
      )
      synced++
    }
    await pool.query(
      `UPDATE aa_escrow_sync SET last_block = $1, updated_at = NOW() WHERE id = 1`,
      [to],
    )
  }
  return {
    lastBlock: to,
    headBlock: head,
    syncedEvents: synced,
    caughtUp: head - to <= span,
  }
}

/**
 * 自动续订服务费对账：对每个有 aa_auto_renew 登记的智能账户，聚合 escrow 事件
 * 净扣费与 renew_log 期望（条数×固定费）比对，显著偏差 → 告警并记入 anomalies。
 * 仅在 caughtUp（已追平）时执行判定，避免追历史期间因数据不全误报。
 */
export async function runEscrowReconciliation(): Promise<EscrowReconcileResult> {
  const result: EscrowReconcileResult = {
    enabled: Boolean(config.aaAutoRenewEnabled && config.aaEscrowAddress && config.rpcUrlOxaChain),
    caughtUp: false,
    lastBlock: 0,
    headBlock: 0,
    syncedEvents: 0,
    accounts: 0,
    checked: 0,
    anomalies: [],
    checkedAt: new Date().toISOString(),
  }
  if (!result.enabled) return result

  const sync = await syncEscrowEvents()
  result.lastBlock = sync.lastBlock
  result.headBlock = sync.headBlock
  result.syncedEvents = sync.syncedEvents
  result.caughtUp = sync.caughtUp
  if (!sync.caughtUp) {
    log.info(`[escrow-reconcile] syncing… last=${sync.lastBlock} head=${sync.headBlock} (${sync.syncedEvents} events)`)
    return result
  }

  const pool = getPool()
  const fixedFee = BigInt(config.aaRelayServiceFeeWei)
  const minRatio = config.aaEscrowReconcileMinRatio
  const maxRatio = config.aaEscrowReconcileMaxRatio

  // 每账户聚合净扣费
  const { rows: nets } = await pool.query(
    `SELECT account,
            COALESCE(SUM(amount_wei::numeric) FILTER (WHERE kind = 'charged'), 0)
              - COALESCE(SUM(amount_wei::numeric) FILTER (WHERE kind = 'refunded'), 0) AS net
     FROM aa_escrow_events WHERE kind IN ('charged','refunded')
     GROUP BY account`,
  )
  const netByAccount = new Map<string, bigint>()
  for (const r of nets) netByAccount.set(r.account, BigInt(r.net))
  result.accounts = netByAccount.size

  // 自动续订登记行（含已暂停/停用，审计全量）
  const { rows: registrations } = await pool.query(
    `SELECT subscriber, agent_id, plan_id, account_address, renew_log, renew_status
     FROM aa_auto_renew WHERE account_address IS NOT NULL`,
  )
  result.checked = registrations.length

  for (const reg of registrations) {
    const account = String(reg.account_address).toLowerCase()
    const renewCount = Array.isArray(reg.renew_log) ? reg.renew_log.length : 0
    const net = netByAccount.get(account) ?? 0n
    const expected = BigInt(renewCount) * fixedFee
    // 净扣费为负（退款多于扣费）：异常
    if (net < 0n) {
      result.anomalies.push({
        account, subscriber: reg.subscriber, agentId: reg.agent_id, planId: reg.plan_id,
        kind: 'negative', renewCount, expectedWei: expected.toString(), netWei: net.toString(),
        detail: 'escrow 净扣费为负（退款多于扣费），请人工核查',
      })
      continue
    }
    if (renewCount <= 0) continue
    // 漏计费：有续订记录但净扣费显著低于期望
    if (net < BigInt(Math.floor(Number(expected) * minRatio))) {
      result.anomalies.push({
        account, subscriber: reg.subscriber, agentId: reg.agent_id, planId: reg.plan_id,
        kind: 'missing', renewCount, expectedWei: expected.toString(), netWei: net.toString(),
        detail: `续订 ${renewCount} 次但 escrow 净扣费 ${net} wei < 期望 ${expected} wei，疑似漏计费`,
      })
      continue
    }
    // 重复/多扣：净扣费显著高于 条数×(固定费+gas 余量)（maxRatio 已含 revoke/gas 波动余量）
    if (net > BigInt(Math.ceil(Number(expected) * maxRatio))) {
      result.anomalies.push({
        account, subscriber: reg.subscriber, agentId: reg.agent_id, planId: reg.plan_id,
        kind: 'excess', renewCount, expectedWei: expected.toString(), netWei: net.toString(),
        detail: `续订 ${renewCount} 次但 escrow 净扣费 ${net} wei 远超期望 ${expected} wei，疑似重复扣费`,
      })
    }
  }

  if (result.anomalies.length > 0) {
    const summary = result.anomalies.map((a) => `${a.kind}:${a.subscriber}:${a.agentId}:${a.planId} net=${a.netWei} exp=${a.expectedWei}`).join(' | ')
    log.error(`[escrow-reconcile] ${result.anomalies.length} anomaly(ies): ${summary}`)
    await sendAlert(`auto-renew escrow reconcile anomalies (${result.anomalies.length})`, {
      anomalies: result.anomalies,
      lastBlock: sync.lastBlock,
    })
  } else {
    log.info(
      `[escrow-reconcile] ok accounts=${result.accounts} checked=${result.checked} lastBlock=${sync.lastBlock} head=${sync.headBlock}`,
    )
  }
  return result
}

export function startEscrowReconciler(): void {
  if (timer) return
  const intervalSec = config.aaEscrowReconcileIntervalSec
  log.info(`[escrow-reconcile] starting (every ${intervalSec}s)`)
  timer = setInterval(() => {
    runEscrowReconciliation().catch((err) => log.error(`[escrow-reconcile] job error: ${err.message}`))
  }, intervalSec * 1000)
  setTimeout(() => {
    runEscrowReconciliation().catch((err) => log.error(`[escrow-reconcile] initial run error: ${err.message}`))
  }, 10_000)
}

export function stopEscrowReconciler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
    log.info('[escrow-reconcile] stopped')
  }
}
