// ---------------------------------------------------------------------------
// AgentX Gateway — A2A 委派按次付费（R19.7 / T5，x402 余额模式）
// ---------------------------------------------------------------------------
// A2A 编排是服务端→服务端（a2a-worker 内部 tool call），不能套 x402Guard
// HTTP 中间件做 402 握手；MPP 的 voucher 需 payer 每次 EIP-712 签名，worker
// 也无法自动完成。唯一可行 = x402 余额模式：主 agent 客户端预充值入 ledger
// （verifyAndCredit / a2a settle），每次委派由服务端原子 deduct 1 单位。
//
// 决策链：
//   canAccessAgentOrPay(sub, agentId)
//     ├─ canAccessAgent() == true          → 放行（拥有/订阅，不扣费）
//     └─ 否则 x402Enabled 且 balanceOf ≥ priceWei
//          → deduct → 写 a2a_pay_log 审计 → 放行（按次付费）
//          → 否则拒绝（提示充值或订阅）
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto'
import { getPool } from '../lib/db'
import { canAccessAgent } from './agent-access'
import { config } from '../config'
import { paymentsService } from './payments'
import { log } from './chain-data-reader'

export interface A2AAccessResult {
  allowed: boolean
  /** 'subscription' | 'pay-per-call' | 'denied' */
  mode: 'subscription' | 'pay-per-call' | 'denied'
  /** 按次付费时扣减的 wei（否则 0）。 */
  amountWei: string
  reason?: string
}

function x402PriceWei(): bigint {
  return paymentsService.x402?.priceWei() ?? 0n
}

function x402Enabled(): boolean {
  return Boolean(config.x402Enabled && config.x402PayTo && paymentsService.x402?.available())
}

/**
 * A2A 委派访问边界：拥有/订阅 放行；否则余额足够时按次扣费放行。
 * 扣费原子（x402_balances WHERE balance >= amount），审计幂等（唯一约束
 * payer+agent_id+ref_id）。
 */
export async function canAccessAgentOrPay(
  subscriber: string,
  agentId: number,
  opts?: { refId?: string },
): Promise<A2AAccessResult> {
  const sub = (subscriber || '').toLowerCase()
  if (!sub || sub === 'unknown') {
    return { allowed: false, mode: 'denied', amountWei: '0', reason: 'unknown subscriber' }
  }

  // 1. 拥有/订阅 → 放行，不扣费
  try {
    const ok = await canAccessAgent(sub, agentId)
    if (ok) return { allowed: true, mode: 'subscription', amountWei: '0' }
  } catch (err) {
    log.warn(`canAccessAgentOrPay: canAccessAgent failed: ${(err as Error).message}`)
  }

  // 2. 按次付费（x402 余额模式）
  if (!x402Enabled()) {
    return { allowed: false, mode: 'denied', amountWei: '0', reason: 'No subscription access to this agent' }
  }

  const price = x402PriceWei()
  if (price <= 0n) {
    return { allowed: false, mode: 'denied', amountWei: '0', reason: 'x402 price misconfigured' }
  }

  try {
    const balance = await paymentsService.balanceOf(sub)
    if (balance < price) {
      return {
        allowed: false,
        mode: 'denied',
        amountWei: '0',
        reason: `Insufficient x402 balance (${balance.toString()} wei) — top up or subscribe to this agent`,
      }
    }
    const deducted = await paymentsService.deduct(sub, price)
    if (!deducted) {
      return { allowed: false, mode: 'denied', amountWei: '0', reason: 'Insufficient x402 balance' }
    }

    // 审计（幂等）：同一 ref（taskId）重复调用不重复记账
    const refId = String(opts?.refId ?? `a2a:${randomUUID()}`)
    await getPool().query(
      `INSERT INTO a2a_pay_log (payer, agent_id, amount_wei, ref_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (payer, agent_id, ref_id) DO NOTHING`,
      [sub, agentId, price.toString(), refId]
    ).catch((err) => log.warn(`canAccessAgentOrPay: audit write failed: ${(err as Error).message}`))

    log.info(`A2A pay-per-call: subscriber=${sub} agentId=${agentId} deducted=${price.toString()} wei (ref=${refId})`)
    return { allowed: true, mode: 'pay-per-call', amountWei: price.toString() }
  } catch (err) {
    log.warn(`canAccessAgentOrPay: balance/deduct failed: ${(err as Error).message}`)
    return { allowed: false, mode: 'denied', amountWei: '0', reason: 'Payment rail error' }
  }
}
