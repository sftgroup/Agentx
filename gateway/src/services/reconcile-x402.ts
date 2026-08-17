// ---------------------------------------------------------------------------
// AgentX Gateway — x402 Ledger ↔ On-Chain Balance Reconciliation (t3)
// ---------------------------------------------------------------------------
// Periodically anchors the off-chain ledger (x402_balances) against the
// on-chain balance that backs it:
//   1. Aggregate anchor (always): total ledger balance vs native balance of
//      X402_PAY_TO (EOA 收款模式) 或 escrow 合约（OE-5 金库模式，总余额读
//      escrow 内全部资金 —— EOA 模式没有 escrow 时读收款 EOA 余额）。
//   2. Per-user anchor (escrow only): 每个 ledger holder 的余额 vs
//      escrow.balanceOf(user)。非 escrow 模式 EOA 无法按用户对账，仅做总量。
//
// 差异超过容差（默认 0.1 原生币）时打 error 日志告警。对账周期可配
// X402_RECONCILE_INTERVAL_SEC（默认 1800s）。
// ---------------------------------------------------------------------------

import { createPublicClient, http } from 'viem'
import type { Address } from 'viem'
import { getPool } from '../lib/db'
import { config } from '../config'
import { escrowReadAbi } from '../lib/escrow-abi'

const DEFAULT_TOLERANCE_WEI = '100000000000000000' // 0.1 native
const MAX_ESCROW_USERS_PER_RUN = 200 // 单轮 escrow 逐用户对账上限，防 RPC 打爆

let timer: ReturnType<typeof setInterval> | null = null

function getChainRpc(chain: string): string {
  return chain === 'sepolia' ? config.rpcUrl : config.rpcUrlOxaChain
}

export interface ReconcileResult {
  mode: 'eoa' | 'escrow' | 'disabled'
  ledgerTotalWei: string
  onchainTotalWei: string
  diffWei: string
  withinTolerance: boolean
  holders: number
  escrowMismatches?: { address: string; ledgerWei: string; onchainWei: string }[]
  checkedAt: string
}

export async function runX402Reconciliation(): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    mode: 'disabled',
    ledgerTotalWei: '0',
    onchainTotalWei: '0',
    diffWei: '0',
    withinTolerance: true,
    holders: 0,
    checkedAt: new Date().toISOString(),
  }

  if (!config.x402Enabled || !config.x402PayTo) {
    console.log('[x402-reconcile] disabled (x402 not configured)')
    return result
  }

  const pool = getPool()
  const tolerance = BigInt(process.env.X402_RECONCILE_TOLERANCE_WEI || DEFAULT_TOLERANCE_WEI)
  // OE-5 迁移基准：escrow 启用前经 EOA（X402_PAY_TO）入账的存量 ledger 余额，
  // 资金仍锚定在收款 EOA。对账口径 = (ledger_total - legacy) == escrow 合约余额，
  // 即只核对 escrow 期新增入账。配置 X402_ESCROW_LEGACY_WEI（与 infraX reconcile
  // 的 LEGACY_BASE_* 概念一致）。
  const legacy = BigInt(process.env.X402_ESCROW_LEGACY_WEI || '0')

  // 1. Ledger total + holder count.
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(balance_wei::numeric), 0) AS total, COUNT(*) AS holders
     FROM x402_balances WHERE balance_wei::numeric > 0`
  )
  const ledgerTotal = BigInt(rows[0].total)
  result.ledgerTotalWei = ledgerTotal.toString()
  result.holders = Number(rows[0].holders)

  const publicClient = createPublicClient({ transport: http(getChainRpc(config.x402Chain)) })

  // 2. On-chain anchor.
  const escrow = config.x402EscrowAddress.toLowerCase()
  const anchorAddress = (escrow || config.x402PayTo.toLowerCase()) as Address
  result.mode = escrow ? 'escrow' : 'eoa'

  try {
    const onchainTotal = await publicClient.getBalance({ address: anchorAddress })
    result.onchainTotalWei = onchainTotal.toString()
    // escrow 模式：仅核对 escrow 期新增入账（ledger_total - legacy）；EOA 模式总量直接对比。
    const effectiveLedger = escrow ? (ledgerTotal - legacy < 0n ? 0n : ledgerTotal - legacy) : ledgerTotal
    const diff = effectiveLedger - onchainTotal
    result.diffWei = (diff < 0n ? -diff : diff).toString()
    result.withinTolerance = (diff < 0n ? -diff : diff) <= tolerance
  } catch (err: any) {
    console.error('[x402-reconcile] failed to read on-chain balance:', err.message)
    result.withinTolerance = false
  }

  // 3. Per-user anchor (escrow only): ledger holder ↔ escrow.balanceOf(user).
  // 存量用户（余额 ≤ legacy 基准，escrow 前 EOA 入账）无法在 escrow 中核对，跳过。
  // legacy=0 时等效核对全部持有者（无存量场景）。
  if (escrow && result.mode === 'escrow') {
    try {
      const { rows: holders } = await pool.query(
        `SELECT address, balance_wei FROM x402_balances
         WHERE balance_wei::numeric > $1 ORDER BY updated_at DESC LIMIT $2`,
        [legacy.toString(), MAX_ESCROW_USERS_PER_RUN]
      )
      const mismatches: NonNullable<ReconcileResult['escrowMismatches']> = []
      for (const h of holders) {
        try {
          const onchain = await publicClient.readContract({
            address: anchorAddress,
            abi: escrowReadAbi,
            functionName: 'balanceOf',
            args: [h.address as Address],
          }) as bigint
          const ledger = BigInt(h.balance_wei)
          if (ledger !== onchain) {
            mismatches.push({ address: h.address, ledgerWei: ledger.toString(), onchainWei: onchain.toString() })
          }
        } catch { /* skip unreadable holder */ }
      }
      result.escrowMismatches = mismatches
      if (mismatches.length > 0) {
        result.withinTolerance = false
      }
    } catch (err: any) {
      console.error('[x402-reconcile] per-user escrow check failed:', err.message)
      result.withinTolerance = false
    }
  }

  // 4. Alert on mismatch.
  if (!result.withinTolerance) {
    console.error(
      `[x402-reconcile] MISMATCH mode=${result.mode} ledger=${result.ledgerTotalWei} onchain=${result.onchainTotalWei} ` +
      `diff=${result.diffWei} holders=${result.holders}` +
      (result.escrowMismatches?.length ? ` escrowMismatches=${result.escrowMismatches.length}` : '')
    )
  } else {
    console.log(
      `[x402-reconcile] ok mode=${result.mode} ledger=${result.ledgerTotalWei} onchain=${result.onchainTotalWei} ` +
      `holders=${result.holders}`
    )
  }

  return result
}

export function startX402Reconciler(): void {
  if (timer) return
  const intervalSec = parseInt(process.env.X402_RECONCILE_INTERVAL_SEC || '1800', 10)
  console.log(`[x402-reconcile] starting (every ${intervalSec}s)`)
  timer = setInterval(() => {
    runX402Reconciliation().catch(err =>
      console.error('[x402-reconcile] job error:', err.message)
    )
  }, intervalSec * 1000)
  setTimeout(() => {
    runX402Reconciliation().catch(err =>
      console.error('[x402-reconcile] initial run error:', err.message)
    )
  }, 10_000)
}

export function stopX402Reconciler(): void {
  if (timer) { clearInterval(timer); timer = null; console.log('[x402-reconcile] stopped') }
}
