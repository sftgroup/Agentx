// AgentX Gateway — R19.7 A2A 委派按次付费（x402 余额模式）单元测试。
// 覆盖：已订阅/拥有放行（不扣费）、x402 未启用拒绝、余额不足拒绝、
// 余额足够 deduct 成功放行（pay-per-call + 审计写入）、未知订阅者拒绝。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const queryMock = vi.hoisted(() => vi.fn())
const PRICE = 1000n

vi.mock('../src/lib/db', () => ({
  getPool: () => ({ query: queryMock }),
}))

vi.mock('../src/services/agent-access', () => ({
  canAccessAgent: vi.fn(),
}))

vi.mock('../src/config', () => ({
  config: { x402Enabled: true, x402PayTo: '0xpayto', x402PriceWei: '1000' },
}))

vi.mock('../src/services/payments', () => ({
  paymentsService: {
    x402: {
      priceWei: () => PRICE,
      available: () => true,
    },
    balanceOf: vi.fn(),
    deduct: vi.fn(),
  },
}))

vi.mock('../src/services/chain-data-reader', () => ({
  log: { info: vi.fn(), warn: vi.fn() },
}))

import { canAccessAgent } from '../src/services/agent-access'
import { paymentsService } from '../src/services/payments'
import { canAccessAgentOrPay } from '../src/services/agent-access-pay'

const SUB = '0xabc'
const AGENT = 7

beforeEach(() => {
  vi.clearAllMocks()
  queryMock.mockResolvedValue({ rows: [] })
  vi.mocked(canAccessAgent).mockResolvedValue(false)
  vi.mocked(paymentsService.balanceOf).mockResolvedValue(PRICE)
  vi.mocked(paymentsService.deduct).mockResolvedValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('canAccessAgentOrPay (A2A pay-per-call)', () => {
  it('放行：拥有/订阅（mode=subscription，不扣费、不写审计）', async () => {
    vi.mocked(canAccessAgent).mockResolvedValue(true)

    const res = await canAccessAgentOrPay(SUB, AGENT, { refId: 'task:1' })

    expect(res.allowed).toBe(true)
    expect(res.mode).toBe('subscription')
    expect(res.amountWei).toBe('0')
    expect(paymentsService.balanceOf).not.toHaveBeenCalled()
    expect(paymentsService.deduct).not.toHaveBeenCalled()
    expect(queryMock).not.toHaveBeenCalled()
  })

  it('拒绝：x402 未启用（reason 提示订阅/充值）', async () => {
    const { config } = await import('../src/config')
    vi.spyOn(config, 'x402Enabled', 'get').mockReturnValue(false)

    const res = await canAccessAgentOrPay(SUB, AGENT)

    expect(res.allowed).toBe(false)
    expect(res.mode).toBe('denied')
    expect(res.reason).toContain('No subscription')
    expect(paymentsService.deduct).not.toHaveBeenCalled()
  })

  it('拒绝：余额不足（提示充值或订阅）', async () => {
    vi.mocked(paymentsService.balanceOf).mockResolvedValue(PRICE - 1n)

    const res = await canAccessAgentOrPay(SUB, AGENT)

    expect(res.allowed).toBe(false)
    expect(res.mode).toBe('denied')
    expect(res.reason).toContain('Insufficient x402 balance')
    expect(paymentsService.deduct).not.toHaveBeenCalled()
  })

  it('放行：余额足够 → deduct 成功 → pay-per-call + 审计写入', async () => {
    const res = await canAccessAgentOrPay(SUB, AGENT, { refId: 'task:42' })

    expect(res.allowed).toBe(true)
    expect(res.mode).toBe('pay-per-call')
    expect(res.amountWei).toBe('1000')
    expect(paymentsService.balanceOf).toHaveBeenCalledWith(SUB.toLowerCase())
    expect(paymentsService.deduct).toHaveBeenCalledWith(SUB.toLowerCase(), PRICE)
    // 审计写入 a2a_pay_log
    const insertCall = queryMock.mock.calls.find((c) => String(c[0]).startsWith('INSERT INTO a2a_pay_log'))
    expect(insertCall).toBeDefined()
    expect(insertCall![1]).toEqual([SUB.toLowerCase(), AGENT, '1000', 'task:42'])
  })

  it('拒绝：deduct 返回 false（并发余额不足）→ denied', async () => {
    vi.mocked(paymentsService.deduct).mockResolvedValue(false)

    const res = await canAccessAgentOrPay(SUB, AGENT)

    expect(res.allowed).toBe(false)
    expect(res.mode).toBe('denied')
  })

  it('拒绝：未知订阅者（unknown/空）', async () => {
    const res = await canAccessAgentOrPay('unknown', AGENT)
    expect(res.allowed).toBe(false)
    expect(res.mode).toBe('denied')
    expect(paymentsService.balanceOf).not.toHaveBeenCalled()
  })
})
