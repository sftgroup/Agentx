// ---------------------------------------------------------------------------
// AgentX Gateway — x402 Ledger ↔ On-Chain Balance Reconciliation (t3)
// ---------------------------------------------------------------------------
// Periodically anchors the off-chain ledger (x402_balances) against the
// on-chain assets that back it.
//
//   EOA 模式：链上资产 = 收款 X402_PAY_TO 余额（所有充值直转该 EOA）。
//   escrow 模式：链上资产 = Σ escrow.balanceOf(AgentX ledger 持有者)
//                + 收款 X402_PAY_TO 余额（legacy/旧路径充值滞留）。
//                Σ balanceOf 只遍历 AgentX ledger holder，天然排除同合约中
//                infraX 平台资金（OE-4 迁移的 9.99994 OXA 记在其 EOA 名下）。
//
//   消费模型：AgentX 的 deduct 只改 ledger（x402_balances），不调 escrow.charge，
//   因此链上托管 ≥ ledger 负债（已消费资金滞留金库/EOA）。对账 = 资金充足性
//   检查：链上资产 < ledger 总量 - 容差 → 缺口告警（真实风控）；富余为正常。
//
// 差异超过容差（默认 0.1 原生币）时打 error 日志告警。周期可配
// X402_RECONCILE_INTERVAL_SEC（默认 1800s）。
// ---------------------------------------------------------------------------

import { createPublicClient, http } from 'viem'
import type { Address } from 'viem'
import { getPool } from '../lib/db'
import { config } from '../config'
import { escrowReadAbi } from '../lib/escrow-abi'

const DEFAULT_TOLERANCE_WEI = '100000000000000000' // 0.1 native
const MAX_ESCROW_USERS_PER_RUN = 200 // 单轮 escrow 逐用户查询上限，防 RPC 打爆

let timer: ReturnType<typeof setInterval> | null = null

function getChainRpc(chain: string): string {
  return chain === 'sepolia' ? config.rpcUrl : config.rpcUrlOxaChain
}

export interface ReconcileResult {
  mode: 'eoa' | 'escrow' | 'disabled'
  ledgerTotalWei: string
  onchainTotalWei: string
  /** 资金缺口（链上资产 < ledger 时为差值，否则 0）。 */
  deficitWei: string
  /** 链上资产相对 ledger 的富余（已消费未退出资金），仅信息性。 */
  surplusWei: string
  withinTolerance: boolean
  holders: number
  checkedAt: string
}

export async function runX402Reconciliation(): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    mode: 'disabled',
    ledgerTotalWei: '0',
    onchainTotalWei: '0',
    deficitWei: '0',
    surplusWei: '0',
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

  // 1. Ledger total + holder count（负债侧）。
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(balance_wei::numeric), 0) AS total, COUNT(*) AS holders
     FROM x402_balances WHERE balance_wei::numeric > 0`
  )
  const ledgerTotal = BigInt(rows[0].total)
  result.ledgerTotalWei = ledgerTotal.toString()
  result.holders = Number(rows[0].holders)

  const publicClient = createPublicClient({ transport: http(getChainRpc(config.x402Chain)) })

  // 2. 链上资产侧（资产锚）。
  const escrow = config.x402EscrowAddress.toLowerCase()
  const eoa = config.x402PayTo.toLowerCase()
  let onchainAssets = 0n

  try {
    if (escrow) {
      result.mode = 'escrow'
      // AgentX ledger 持有者在金库的托管之和（不含 infraX 平台资金）。
      const { rows: holders } = await pool.query(
        `SELECT address FROM x402_balances
         WHERE balance_wei::numeric > 0 ORDER BY updated_at DESC LIMIT $1`,
        [MAX_ESCROW_USERS_PER_RUN]
      )
      for (const h of holders) {
        try {
          const bal = await publicClient.readContract({
            address: escrow as Address,
            abi: escrowReadAbi,
            functionName: 'balanceOf',
            args: [h.address as Address],
          }) as bigint
          onchainAssets += bal
        } catch { /* skip unreadable holder */ }
      }
      // legacy/旧路径充值滞留资金仍在收款 EOA。
      onchainAssets += await publicClient.getBalance({ address: eoa as Address })
    } else {
      result.mode = 'eoa'
      onchainAssets = await publicClient.getBalance({ address: eoa as Address })
    }
    result.onchainTotalWei = onchainAssets.toString()

    // 3. 资金充足性：资产 < 负债 - 容差 → 缺口告警；富余（消费滞留）正常。
    const deficit = ledgerTotal - onchainAssets
    result.deficitWei = (deficit > 0n ? deficit : 0n).toString()
    result.surplusWei = (deficit < 0n ? -deficit : 0n).toString()
    result.withinTolerance = deficit <= tolerance
  } catch (err: any) {
    console.error('[x402-reconcile] failed to read on-chain assets:', err.message)
    result.withinTolerance = false
  }

  // 4. Alert on mismatch.
  if (!result.withinTolerance) {
    console.error(
      `[x402-reconcile] MISMATCH mode=${result.mode} ledger=${result.ledgerTotalWei} assets=${result.onchainTotalWei} ` +
      `deficit=${result.deficitWei} holders=${result.holders}`
    )
  } else {
    console.log(
      `[x402-reconcile] ok mode=${result.mode} ledger=${result.ledgerTotalWei} assets=${result.onchainTotalWei} ` +
      `holders=${result.holders}` + (result.surplusWei !== '0' ? ` surplus=${result.surplusWei}` : '')
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
