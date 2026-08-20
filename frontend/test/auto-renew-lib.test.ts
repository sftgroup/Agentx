// AgentX — auto-renew Gateway 客户端 lib 单测（docs/test-cases-aa-auto-renew.md 用例 110）
// 覆盖 listAutoRenew / enableAutoRenew 的路径拼接、Authorization 头、
// 错误映射 parseError（{error} 字段 vs HTTP 状态码兜底）。
import { describe, it, expect, beforeEach, vi } from 'vitest'

const state = vi.hoisted(() => ({
  fetchRes: { ok: true, status: 200, json: async () => ({ rows: [] }) } as any,
  gatewayFetch: vi.fn(),
}))

vi.mock('@/lib/gateway', () => ({
  GATEWAY_URL: 'http://gateway.test',
  gatewayFetch: state.gatewayFetch,
}))

// 在 vi.mock 之后再导入被测模块
import { listAutoRenew, enableAutoRenew, AA_RELAY_SERVICE_FEE_WEI } from '@/lib/auto-renew'

beforeEach(() => {
  state.gatewayFetch.mockReset()
  state.fetchRes = { ok: true, status: 200, json: async () => ({ rows: [] }) }
  state.gatewayFetch.mockImplementation(async () => state.fetchRes)
})

describe('listAutoRenew', () => {
  it('成功 → 返回 rows，携带 Bearer 头', async () => {
    const row = { agent_id: 1, plan_id: 1, renew_status: 'enabled' }
    state.fetchRes = { ok: true, status: 200, json: async () => ({ rows: [row] }) }
    const r = await listAutoRenew('tok-1')
    expect(r).toEqual([row])
    const [path, init] = state.gatewayFetch.mock.calls[0]
    expect(path).toBe('/api/v1/billing/auto-renew')
    expect(init.headers.Authorization).toBe('Bearer tok-1')
  })

  it('返回 {error} → 抛该文案（110）', async () => {
    state.fetchRes = { ok: false, status: 500, json: async () => ({ error: 'boom' }) }
    await expect(listAutoRenew('tok-1')).rejects.toThrow('boom')
  })

  it('非 JSON 错误响应 → 兜底 HTTP <status>', async () => {
    state.fetchRes = { ok: false, status: 502, json: async () => { throw new Error('bad json') } }
    await expect(listAutoRenew('tok-1')).rejects.toThrow('HTTP 502')
  })
})

describe('enableAutoRenew', () => {
  it('成功 → 返回 draft，POST + JSON body', async () => {
    const draft = { accountAddress: '0x2222222222222222222222222222222222222222', digest: '0x' + 'aa'.repeat(32) }
    state.fetchRes = { ok: true, status: 200, json: async () => draft }
    const r = await enableAutoRenew('tok-1', { agentId: 1, planId: 1, subscriptionId: 10, planPriceWei: '1000000000000000' })
    expect(r).toEqual(draft)
    const [path, init] = state.gatewayFetch.mock.calls[0]
    expect(path).toBe('/api/v1/billing/auto-renew/enable')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ agentId: 1, planId: 1, subscriptionId: 10, planPriceWei: '1000000000000000' })
  })

  it('{error} → 抛文案', async () => {
    state.fetchRes = { ok: false, status: 409, json: async () => ({ error: 'Residual session detected, revoke first' }) }
    await expect(enableAutoRenew('tok-1', { agentId: 1, planId: 1, subscriptionId: 10, planPriceWei: '1' }))
      .rejects.toThrow('Residual session detected, revoke first')
  })
})

describe('常量与生产一致', () => {
  it('AA_RELAY_SERVICE_FEE_WEI 与网关/relay 生产对齐（0.00246 OXA）', () => {
    expect(AA_RELAY_SERVICE_FEE_WEI).toBe(BigInt('2460000000000000'))
  })
})
