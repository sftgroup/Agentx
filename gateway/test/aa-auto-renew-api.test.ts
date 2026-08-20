// AgentX Gateway — ERC-4337 auto-renew 路由层（L1 API）回归测试
// 覆盖 routes/auto-renew.ts 全部 6 个端点的：
//   · requireEnabled 统一 503（enable/confirm/revoke）
//   · 401 认证守卫（list/enable/confirm/resume/revoke/disable）
//   · 参数校验 400（缺参 / hex 格式校验）
//   · 成功路径 200（含 funding 视图 stringify、revoke 兜底参数透传）
//   · 错误映射（err.status → 4xx，无 status → 500）
// 服务层已 mock（../src/services/aa-autorenew），仅测路由接线；服务层
// 逻辑与链上路径见 test/aa-autorenew.test.ts 与 docs/test-cases-aa-auto-renew.md。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

const state = vi.hoisted(() => ({
  enabled: true,
  listRows: [] as any[],
  funding: { nativeWei: 1n, epDepositWei: 2n, escrowWei: 3n },
  fundingFail: false,
  listError: null as Error | null,
  createResult: { digest: '0x' + 'aa'.repeat(32), accountAddress: '0x2222222222222222222222222222222222222222' },
  createError: null as (Error & { status?: number }) | null,
  confirmResult: { confirmed: true, receipt: { success: true, txHash: '0x' + 'cc'.repeat(32) } },
  confirmError: null as Error | null,
  resumeError: null as (Error & { status?: number }) | null,
  revokeResult: { revoked: true },
  revokeError: null as (Error & { status?: number }) | null,
  disableResult: { disabled: true, disableUserOpHash: '0x' + 'bb'.repeat(32) },
  disableError: null as (Error & { status?: number }) | null,
}))

vi.mock('../src/config', () => ({ config: { aaAutoRenewEnabled: true } }))
vi.mock('../src/services/chain-data-reader', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('../src/services/aa-autorenew', () => ({
  isAutoRenewEnabled: () => state.enabled,
  listAutoRenew: async () => {
    if (state.listError) throw state.listError
    return state.listRows
  },
  getAccountFunding: async () => {
    if (state.fundingFail) throw new Error('rpc down')
    return state.funding
  },
  createAutoRenew: async () => {
    if (state.createError) throw state.createError
    return state.createResult
  },
  confirmAutoRenew: async () => {
    if (state.confirmError) throw state.confirmError
    return state.confirmResult
  },
  resumeAutoRenew: async () => {
    if (state.resumeError) throw state.resumeError
  },
  revokeAutoRenew: vi.fn(async () => {
    if (state.revokeError) throw state.revokeError
    return state.revokeResult
  }),
  disableAutoRenew: async () => {
    if (state.disableError) throw state.disableError
    return state.disableResult
  },
}))

import autoRenewRouter from '../src/routes/auto-renew'
import { revokeAutoRenew } from '../src/services/aa-autorenew'

const app = express()
app.use(express.json())
// Mock auth: inject tenant context when X-Api-Key present（与 billing.test.ts 同款）
app.use('/api/v1/billing', (req, _res, next) => {
  if (req.headers['x-api-key']) {
    ;(req as any).tenant = {
      id: 't-1',
      walletAddress: '0x1111111111111111111111111111111111111111',
      kind: 'partner',
    }
  }
  next()
}, autoRenewRouter)

const SIGN = '0x' + '11'.repeat(65) // 65-byte hex signature
const HASH = '0x' + 'ab'.repeat(32) // 32-byte hex hash
const ACCOUNT = '0x2222222222222222222222222222222222222222'
const SESSION = '0x' + 'dd'.repeat(32)

beforeEach(() => {
  state.enabled = true
  state.listRows = []
  state.funding = { nativeWei: 1n, epDepositWei: 2n, escrowWei: 3n }
  state.fundingFail = false
  state.listError = null
  state.createError = null
  state.confirmError = null
  state.resumeError = null
  state.revokeError = null
  state.disableError = null
  revokeAutoRenew.mockClear()
})

describe('requireEnabled — 统一 503（enable/confirm/revoke）', () => {
  beforeEach(() => {
    state.enabled = false
  })

  it('enable 禁用 → 503（即使未认证也先 503：中间件先于 auth 判断）', async () => {
    const res = await request(app).post('/api/v1/billing/auto-renew/enable').send({})
    expect(res.status).toBe(503)
    expect(res.body.error).toBe('Auto-renew (ERC-4337) is not enabled on this gateway')
  })

  it('confirm 禁用 → 503', async () => {
    const res = await request(app).post('/api/v1/billing/auto-renew/confirm').send({})
    expect(res.status).toBe(503)
  })

  it('revoke 禁用 → 503', async () => {
    const res = await request(app).post('/api/v1/billing/auto-renew/revoke').send({})
    expect(res.status).toBe(503)
  })

  it('list / resume / disable 无 requireEnabled → 未认证时 401（不被 503 短路）', async () => {
    expect((await request(app).get('/api/v1/billing/auto-renew')).status).toBe(401)
    expect((await request(app).post('/api/v1/billing/auto-renew/resume').send({})).status).toBe(401)
    expect((await request(app).post('/api/v1/billing/auto-renew/disable').send({})).status).toBe(401)
  })
})

describe('认证守卫 — 401 without auth', () => {
  it('GET /auto-renew → 401', async () => {
    const res = await request(app).get('/api/v1/billing/auto-renew')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Authentication required')
  })

  it('enable → 401', async () => {
    const res = await request(app).post('/api/v1/billing/auto-renew/enable').send({
      agentId: 1, planId: 1, subscriptionId: 10, planPriceWei: '1000000000000000',
    })
    expect(res.status).toBe(401)
  })

  it('confirm → 401', async () => {
    const res = await request(app).post('/api/v1/billing/auto-renew/confirm').send({
      agentId: 1, planId: 1, ownerSignature: SIGN,
    })
    expect(res.status).toBe(401)
  })

  it('resume → 401', async () => {
    const res = await request(app).post('/api/v1/billing/auto-renew/resume').send({ agentId: 1, planId: 1 })
    expect(res.status).toBe(401)
  })

  it('revoke → 401', async () => {
    const res = await request(app).post('/api/v1/billing/auto-renew/revoke').send({
      agentId: 1, planId: 1, disableUserOpHash: HASH, ownerSignature: SIGN,
    })
    expect(res.status).toBe(401)
  })

  it('disable → 401', async () => {
    const res = await request(app).post('/api/v1/billing/auto-renew/disable').send({ agentId: 1, planId: 1 })
    expect(res.status).toBe(401)
  })
})

describe('GET /billing/auto-renew — 列表 + 资金视图', () => {
  it('空列表 → 200 { rows: [] }', async () => {
    const res = await request(app).get('/api/v1/billing/auto-renew').set('X-Api-Key', 'agentx_test')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ rows: [] })
  })

  it('有 account_address 的行 → funding BigInt 转为字符串', async () => {
    state.listRows = [{ subscription_id: 10, account_address: ACCOUNT, renew_status: 'enabled' }]
    const res = await request(app).get('/api/v1/billing/auto-renew').set('X-Api-Key', 'agentx_test')
    expect(res.status).toBe(200)
    expect(res.body.rows[0].funding).toEqual({ nativeWei: '1', epDepositWei: '2', escrowWei: '3' })
  })

  it('无 account_address 的行 → funding null（不调 getAccountFunding）', async () => {
    state.listRows = [{ subscription_id: 10, account_address: null, renew_status: 'paused' }]
    const res = await request(app).get('/api/v1/billing/auto-renew').set('X-Api-Key', 'agentx_test')
    expect(res.status).toBe(200)
    expect(res.body.rows[0].funding).toBeNull()
  })

  it('getAccountFunding 抛错（链 RPC 故障）→ 该行 funding null，列表仍 200', async () => {
    state.listRows = [{ subscription_id: 10, account_address: ACCOUNT }]
    state.fundingFail = true
    const res = await request(app).get('/api/v1/billing/auto-renew').set('X-Api-Key', 'agentx_test')
    expect(res.status).toBe(200)
    expect(res.body.rows[0].funding).toBeNull()
  })

  it('listAutoRenew 抛错 → 500 透出消息', async () => {
    state.listError = new Error('db down')
    const res = await request(app).get('/api/v1/billing/auto-renew').set('X-Api-Key', 'agentx_test')
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('db down')
  })
})

describe('POST /billing/auto-renew/enable — 参数校验与成功', () => {
  const valid = { agentId: 1, planId: 1, subscriptionId: 10, planPriceWei: '1000000000000000' }

  it('缺参（agentId 缺失）→ 400', async () => {
    const res = await request(app).post('/api/v1/billing/auto-renew/enable').set('X-Api-Key', 'agentx_test').send({ planId: 1, subscriptionId: 10, planPriceWei: '1' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('agentId, planId, subscriptionId, planPriceWei required')
  })

  it('planPriceWei=0（falsy）→ 400（不允许 0 金额开启）', async () => {
    const res = await request(app).post('/api/v1/billing/auto-renew/enable').set('X-Api-Key', 'agentx_test').send({ ...valid, planPriceWei: 0 })
    expect(res.status).toBe(400)
  })

  it('合法参数 → 200，透传 createAutoRenew 结果（digest/accountAddress）', async () => {
    const res = await request(app).post('/api/v1/billing/auto-renew/enable').set('X-Api-Key', 'agentx_test').send(valid)
    expect(res.status).toBe(200)
    expect(res.body.digest).toBe('0x' + 'aa'.repeat(32))
    expect(res.body.accountAddress).toBe(ACCOUNT)
  })

  it('createAutoRenew 抛 status 错误（L12 残留 409）→ 映射 409', async () => {
    state.createError = Object.assign(new Error('Residual session detected, revoke first'), { status: 409 })
    const res = await request(app).post('/api/v1/billing/auto-renew/enable').set('X-Api-Key', 'agentx_test').send(valid)
    expect(res.status).toBe(409)
    expect(res.body.error).toContain('Residual session')
  })

  it('createAutoRenew 抛无 status 错误 → 500', async () => {
    state.createError = new Error('relay unreachable')
    const res = await request(app).post('/api/v1/billing/auto-renew/enable').set('X-Api-Key', 'agentx_test').send(valid)
    expect(res.status).toBe(500)
  })
})

describe('POST /billing/auto-renew/confirm — 签名格式与成功', () => {
  const valid = { agentId: 1, planId: 1, ownerSignature: SIGN }

  it('缺 ownerSignature → 400', async () => {
    const res = await request(app).post('/api/v1/billing/auto-renew/confirm').set('X-Api-Key', 'agentx_test').send({ agentId: 1, planId: 1 })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('agentId, planId, ownerSignature required')
  })

  it('ownerSignature 非 65 字节 hex → 400', async () => {
    const res = await request(app).post('/api/v1/billing/auto-renew/confirm').set('X-Api-Key', 'agentx_test').send({ ...valid, ownerSignature: '0x1234' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('ownerSignature must be a 65-byte hex signature')
  })

  it('合法 → 200 透传 confirm 结果（含 receipt）', async () => {
    const res = await request(app).post('/api/v1/billing/auto-renew/confirm').set('X-Api-Key', 'agentx_test').send(valid)
    expect(res.status).toBe(200)
    expect(res.body.receipt.success).toBe(true)
  })

  it('confirmAutoRenew 抛错 → 500（固定 500，不做 status 映射）', async () => {
    state.confirmError = new Error('relay broadcast failed')
    const res = await request(app).post('/api/v1/billing/auto-renew/confirm').set('X-Api-Key', 'agentx_test').send(valid)
    expect(res.status).toBe(500)
  })
})

describe('POST /billing/auto-renew/resume — 恢复', () => {
  it('缺参 → 400', async () => {
    const res = await request(app).post('/api/v1/billing/auto-renew/resume').set('X-Api-Key', 'agentx_test').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('agentId, planId required')
  })

  it('合法 → 200 { ok: true }', async () => {
    const res = await request(app).post('/api/v1/billing/auto-renew/resume').set('X-Api-Key', 'agentx_test').send({ agentId: 1, planId: 1 })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('非 paused 行 → 服务抛 404 → 映射 404', async () => {
    state.resumeError = Object.assign(new Error('No paused auto-renew to resume'), { status: 404 })
    const res = await request(app).post('/api/v1/billing/auto-renew/resume').set('X-Api-Key', 'agentx_test').send({ agentId: 1, planId: 1 })
    expect(res.status).toBe(404)
  })

  it('无 status 错误 → 500', async () => {
    state.resumeError = new Error('db down')
    const res = await request(app).post('/api/v1/billing/auto-renew/resume').set('X-Api-Key', 'agentx_test').send({ agentId: 1, planId: 1 })
    expect(res.status).toBe(500)
  })
})

describe('POST /billing/auto-renew/revoke — 链上撤销（校验 + 兜底透传）', () => {
  const valid = { agentId: 1, planId: 1, disableUserOpHash: HASH, ownerSignature: SIGN }

  it('缺 disableUserOpHash → 400', async () => {
    const res = await request(app).post('/api/v1/billing/auto-renew/revoke').set('X-Api-Key', 'agentx_test').send({ agentId: 1, planId: 1, ownerSignature: SIGN })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('agentId, planId, disableUserOpHash, ownerSignature required')
  })

  it('disableUserOpHash 非 32 字节 hex → 400', async () => {
    const res = await request(app).post('/api/v1/billing/auto-renew/revoke').set('X-Api-Key', 'agentx_test').send({ ...valid, disableUserOpHash: '0xzz' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('disableUserOpHash must be a 32-byte hex hash')
  })

  it('ownerSignature 非法 → 400', async () => {
    const res = await request(app).post('/api/v1/billing/auto-renew/revoke').set('X-Api-Key', 'agentx_test').send({ ...valid, ownerSignature: '0x' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('ownerSignature must be a 65-byte hex signature')
  })

  it('accountAddress 非法 → 400', async () => {
    const res = await request(app).post('/api/v1/billing/auto-renew/revoke').set('X-Api-Key', 'agentx_test').send({ ...valid, accountAddress: '0x123' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('accountAddress must be a 20-byte hex address')
  })

  it('sessionId 非法 → 400', async () => {
    const res = await request(app).post('/api/v1/billing/auto-renew/revoke').set('X-Api-Key', 'agentx_test').send({ ...valid, sessionId: 'not-hex' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('sessionId must be a 32-byte hex value')
  })

  it('合法（无兜底字段）→ 200，revokeAutoRenew 不传 accountAddress/sessionId', async () => {
    const res = await request(app).post('/api/v1/billing/auto-renew/revoke').set('X-Api-Key', 'agentx_test').send(valid)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ revoked: true })
  })

  it('L12 残留兜底：回传 accountAddress + sessionId → 透传至 revokeAutoRenew', async () => {
    const res = await request(app).post('/api/v1/billing/auto-renew/revoke').set('X-Api-Key', 'agentx_test').send({ ...valid, accountAddress: ACCOUNT, sessionId: SESSION })
    expect(res.status).toBe(200)
    expect(revokeAutoRenew).toHaveBeenCalledWith(expect.objectContaining({ accountAddress: ACCOUNT, sessionId: SESSION }))
  })

  it('revokeAutoRenew 抛 status 错误 → 映射', async () => {
    state.revokeError = Object.assign(new Error('No session to revoke'), { status: 404 })
    const res = await request(app).post('/api/v1/billing/auto-renew/revoke').set('X-Api-Key', 'agentx_test').send(valid)
    expect(res.status).toBe(404)
  })

  it('无 status 错误 → 500', async () => {
    state.revokeError = new Error('bundler down')
    const res = await request(app).post('/api/v1/billing/auto-renew/revoke').set('X-Api-Key', 'agentx_test').send(valid)
    expect(res.status).toBe(500)
  })
})

describe('POST /billing/auto-renew/disable — 本地停用', () => {
  it('缺参 → 400', async () => {
    const res = await request(app).post('/api/v1/billing/auto-renew/disable').set('X-Api-Key', 'agentx_test').send({ agentId: 1 })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('agentId, planId required')
  })

  it('合法 → 200 透传 disable 结果（disableUserOpHash 供 revoke 上链）', async () => {
    const res = await request(app).post('/api/v1/billing/auto-renew/disable').set('X-Api-Key', 'agentx_test').send({ agentId: 1, planId: 1 })
    expect(res.status).toBe(200)
    expect(res.body.disableUserOpHash).toBe('0x' + 'bb'.repeat(32))
  })

  it('disableAutoRenew 抛错 → 500', async () => {
    state.disableError = new Error('db down')
    const res = await request(app).post('/api/v1/billing/auto-renew/disable').set('X-Api-Key', 'agentx_test').send({ agentId: 1, planId: 1 })
    expect(res.status).toBe(500)
  })
})
