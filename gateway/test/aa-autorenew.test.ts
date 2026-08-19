// AgentX Gateway — ERC-4337 auto-renew 核心逻辑单测（t9）
// 覆盖续订 cron 的双归属解析 / 指针前移 / 失败护栏暂停 / resume 恢复。
// 纯 DB 查询逻辑，mock getPool；不触碰链上 / aa-relay（链上路径见
// docs/test-cases-aa-auto-renew.md 的生产实证）。
import { describe, it, expect, vi, beforeEach } from 'vitest'

const queryMock = vi.hoisted(() => vi.fn())
/** 智能账户三类资金 mock（getAccountFunding 链上读取，测试可控；默认全 0 = 资金不足） */
const fundingMock = vi.hoisted(() => ({ native: 0n, epDeposit: 0n, escrow: 0n }))

vi.mock('../src/lib/db', () => ({
  getPool: () => ({ query: queryMock }),
}))

vi.mock('../src/config', () => ({
  config: {
    nodeEnv: 'test',
    aaAutoRenewEnabled: true,
    aaRelayUrl: 'http://relay.test:9131',
    aaRelayApiKey: 'test-key',
    aaRelayChain: 'oxachain',
    aaAutoRenewIntervalSec: 3600,
    aaAutoRenewWindowSec: 86400,
    aaAutoRenewSessionDays: 730,
    aaAutoRenewMaxCount: 366,
    aaRenewMaxFailCount: 3,
    aaAlertWebhookUrl: '',
    aaAlertAheadSec: 259200,
    aaAlertMinIntervalSec: 86400,
    aaEscrowReconcileIntervalSec: 3600,
    aaEscrowSyncBlockSpan: 5000,
    aaEscrowReconcileMinRatio: 0.5,
    aaEscrowReconcileMaxRatio: 3,
    aaEscrowAddress: '0x8bf8ffee86f1d4a160f0953eb13bedcbf99eaf9e',
    aaRelayServiceFeeWei: '2460000000000000',
    aaDeployerPrivateKey: '',
    chainIdOxaChain: 19505,
    rpcUrlOxaChain: 'https://rpc-oxa.0xainet.top',
    aaEntryPointOxaChain: '0x97e4cddcffeaf4580bc6315fee512f2b2d82798a',
    aaKernelFactoryOxaChain: '0xf8abe4510a6810d5ef26aa3222c0f63d32b757d1',
    aaKernelImplementationOxaChain: '0x5131d75af2126eba05edbb6bc24902c42d1b52b4',
    aaEcdsaValidatorOxaChain: '0xb0d4f548e022b8a9d5b454ffb7f327ee2afeb16c',
    aaSessionModuleOxaChain: '0xfbbca78d2d7d08c1163aa57a0056973ef4fd8c74',
    subscriptionManagerOxaChain: '0x1234567890123456789012345678901234567890',
    masterEncryptionKey: 'test-encryption-key-0000000000000000',
  },
}))

vi.mock('../src/services/chain-data-reader', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// L12 撤销 draft 构建会走真实 RPC（getNonce / fee 估算），测试环境 stub 掉
vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>()
  return {
    ...actual,
    createPublicClient: () => ({
      readContract: vi.fn(async (params: any) => {
        // escrow.balanceOf(account) vs entryPoint.balanceOf(account)
        if (params?.address === '0x8bf8ffee86f1d4a160f0953eb13bedcbf99eaf9e') return fundingMock.escrow
        return fundingMock.epDeposit
      }),
      getStorageAt: vi.fn(async () => '0x' + '00'.repeat(32)),
      getBalance: vi.fn(async () => fundingMock.native),
      getGasPrice: vi.fn(async () => 1n),
      waitForTransactionReceipt: vi.fn(async () => ({ status: 'success' })),
    }),
  }
})

// @0xinfrax/aa-sdk@0.1.2 buildDisableSessionUserOp：三段批量撤销 draft
// （execute(BATCH, [disableSession@module, uninstallModule, invalidateNonce(cur+1)])）
vi.mock('@0xinfrax/aa-sdk', () => ({
  KernelV3SessionDataBuilder: { disableData: vi.fn(() => '0xbbbb') },
  MODULE_TYPE_VALIDATOR: 1n,
  getUserOpHash: vi.fn(() => '0x' + 'ab'.repeat(32)),
  estimateFeesPerGas: vi.fn(async () => ({ maxFeePerGas: 1n, maxPriorityFeePerGas: 1n })),
  buildDisableSessionUserOp: vi.fn(async ({ account, sessionId, gas }) => ({
    op: {
      sender: account,
      nonce: 0n,
      callData:
        '0xe9ae5c53' + // execute(bytes32,bytes)
        '01' + '00'.repeat(62) + // BATCH execMode（MSB 布局）
        'f42c859d' + '00'.repeat(62) + // ① disableSession(sessionId)@module
        'a71763a8' + '00'.repeat(62) + // ② uninstallModule(VALIDATOR, module, …)
        '1f1b92e3' + '00'.repeat(63) + '01', // ③ invalidateNonce(currentNonce(0)+1=1)
      callGasLimit: gas?.callGasLimit ?? 0n,
      verificationGasLimit: gas?.verificationGasLimit ?? 0n,
      preVerificationGas: gas?.preVerificationGas ?? 0n,
      maxFeePerGas: gas?.maxFeePerGas ?? 0n,
      maxPriorityFeePerGas: gas?.maxPriorityFeePerGas ?? 0n,
      signature: '0x',
    },
    userOpHash: '0x' + 'ab'.repeat(32),
    currentNonce: 0,
    sessionIdBytes: '0x' + 'dd'.repeat(32),
  })),
}))

import { resolveCurrentSubscription, resumeAutoRenew, runAutoRenewScan, watchFunding } from '../src/services/aa-renewal'
import { resolveExistingSessionId } from '../src/services/aa-account'
import { revokeAutoRenew } from '../src/services/aa-session'

const EOA = '0x1111111111111111111111111111111111111111'
const ACCOUNT = '0x2222222222222222222222222222222222222222'

const subRow = (id: number, status: number, over: Record<string, unknown> = {}) => ({
  subscription_id: id,
  status,
  started_at: 1700000000,
  expires_at: 1730000000,
  amount_wei: '1000000000000000',
  ...over,
})

/** 按 SQL 分支路由的 pool.query 模拟（未命中分支 → 空 rows）。
 *  注意：vitest 在测试后 cleanup 阶段会 flush 未消费的 mock 调用（参数 undefined），
 *  必须容忍非字符串入参并返回空 rows，避免未捕获异常导致测试误判失败。 */
function mockQueries(branches: { pointer?: any[]; newer?: any[]; fallback?: any[]; enabled?: any[] } = {}) {
  queryMock.mockImplementation((sql: unknown) => {
    if (typeof sql !== 'string') return Promise.resolve({ rows: [] })
    if (sql.includes('FROM chain_subscriptions WHERE subscription_id = $1')) return Promise.resolve({ rows: branches.pointer ?? [] })
    if (sql.includes('subscription_id > $4')) return Promise.resolve({ rows: branches.newer ?? [] })
    if (sql.includes('status IN (1,2)')) return Promise.resolve({ rows: branches.fallback ?? [] })
    if (sql.includes('FROM aa_auto_renew WHERE renew_status')) return Promise.resolve({ rows: branches.enabled ?? [] })
    return Promise.resolve({ rows: [] })
  })
}

describe('resolveCurrentSubscription — 双归属解析 + 指针前移', () => {
  beforeEach(() => queryMock.mockReset())

  it('指针优先：指针指向的订阅仍 active 且无更新订阅 → 直接返回指针订阅', async () => {
    mockQueries({ pointer: [subRow(10, 1)] })
    const r = await resolveCurrentSubscription(EOA, 1, ACCOUNT, 10)
    expect(r?.subscription.subscription_id).toBe(10)
    expect(r?.pointerMoved).toBeUndefined()
  })

  it('指针优先 + 续订后已有更新订阅（归属智能账户）→ 前移指针返回新订阅', async () => {
    mockQueries({ pointer: [subRow(10, 1)], newer: [subRow(11, 1)] })
    const r = await resolveCurrentSubscription(EOA, 1, ACCOUNT, 10)
    expect(r?.subscription.subscription_id).toBe(11)
    expect(r?.pointerMoved).toBe(11)
  })

  it('指针失效（已过期）→ 回退命中智能账户名下的新订阅并前移', async () => {
    // 续订后旧指针订阅已过期（status=2），新订阅归属智能账户（LOWER(subscriber)=account_address）
    mockQueries({ pointer: [subRow(10, 2)], fallback: [subRow(11, 1)] })
    const r = await resolveCurrentSubscription(EOA, 1, ACCOUNT, 10)
    expect(r?.subscription.subscription_id).toBe(11)
    expect(r?.pointerMoved).toBe(11)
  })

  it('指针失效 → 回退命中 EOA 名下最新订阅（未启用过续订的路径）', async () => {
    mockQueries({ pointer: [subRow(10, 2)], fallback: [subRow(9, 1)] })
    const r = await resolveCurrentSubscription(EOA, 1, ACCOUNT, 10)
    expect(r?.subscription.subscription_id).toBe(9)
    expect(r?.pointerMoved).toBe(9)
  })

  it('无任何订阅 → null（触发 fatal 暂停）', async () => {
    mockQueries()
    const r = await resolveCurrentSubscription(EOA, 1, ACCOUNT, null)
    expect(r).toBeNull()
  })
})

describe('resumeAutoRenew — 暂停恢复', () => {
  beforeEach(() => queryMock.mockReset())

  it('paused 行 → 恢复为 enabled 并重置失败计数', async () => {
    queryMock.mockImplementation(async (sql: unknown) => ({
      rows: typeof sql === 'string' && sql.includes('RETURNING plan_id') ? [{ plan_id: 1 }] : [],
    }))
    await expect(resumeAutoRenew({ subscriber: EOA, agentId: 1, planId: 1 })).resolves.toBeUndefined()
    const updateSql = queryMock.mock.calls.map((c: unknown[]) => c[0] as string).find(s => typeof s === 'string' && s.includes('RETURNING plan_id'))
    expect(updateSql).toContain(`renew_status = 'enabled'`)
    expect(updateSql).toContain('renew_fail_count = 0')
    expect(updateSql).toContain(`AND renew_status = 'paused'`)
  })

  it('非 paused 行 → 404 错误（无静默成功）', async () => {
    queryMock.mockImplementation(async () => ({ rows: [] }))
    const err = await resumeAutoRenew({ subscriber: EOA, agentId: 1, planId: 1 }).catch((e: Error & { status?: number }) => e)
    expect(err.status).toBe(404)
  })
})

describe('runAutoRenewScan — 失败护栏', () => {
  beforeEach(() => queryMock.mockReset())

  it('enabled 行无订阅 → fatal 直接暂停（paused_reason 落库）+ 告警，scan 计数不记 failed', async () => {
    mockQueries({
      enabled: [
        {
          subscriber: EOA,
          agent_id: 1,
          plan_id: 1,
          account_address: ACCOUNT,
          session_id: '0xdeadbeef',
          session_key_enc: 'enc',
          policy_json: '{}',
          current_subscription_id: 10,
          last_renew_at: null,
        },
      ],
    })
    const r = await runAutoRenewScan()
    expect(r).toEqual({ checked: 1, renewed: 0, failed: 0, alerts: 0 })
    // 应发出 paused 流转（fatal → pauseAutoRenew），reason 作为参数落库
    const pausedCall = queryMock.mock.calls.find((c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes(`renew_status = 'paused'`))
    expect(pausedCall).toBeDefined()
    expect((pausedCall as unknown[])[1]).toContain('no active subscription to renew')
  })

  it('无 enabled 行 → 空扫描不执行任何 DB 更新', async () => {
    mockQueries()
    const r = await runAutoRenewScan()
    expect(r).toEqual({ checked: 0, renewed: 0, failed: 0, alerts: 0 })
    expect(queryMock.mock.calls.filter(c => typeof c[0] === 'string').length).toBe(1) // 仅 SELECT
  })
})

describe('watchFunding — e4 余额不足提前告警', () => {
  beforeEach(() => {
    queryMock.mockReset()
    fundingMock.native = 0n
    fundingMock.epDeposit = 0n
    fundingMock.escrow = 0n
  })

  const regRow = (over: Record<string, unknown> = {}) => ({
    subscriber: EOA,
    agent_id: 1,
    plan_id: 1,
    account_address: ACCOUNT,
    current_subscription_id: 10,
    ...over,
  })

  it('未进入提前告警窗口（距到期 > aheadSec）→ 不巡检返回 null', async () => {
    // expires_at = now + 10 天 > aheadSec（3 天）→ 未进入窗口
    mockQueries({ pointer: [subRow(10, 1, { expires_at: Math.floor(Date.now() / 1000) + 10 * 86400 })] })
    const r = await watchFunding(regRow(), Math.floor(Date.now() / 1000))
    expect(r).toBeNull()
    expect(queryMock.mock.calls.filter(c => typeof c[0] === 'string' && (c[0] as string).includes('last_funding_alert_at')).length).toBe(0)
  })

  it('已进入续订窗口（到期前 windowSec 内）→ 跳过巡检交给 renewOne', async () => {
    // expires_at = now + 6 小时 < windowSec（1 天）→ 已进入续订窗口
    mockQueries({ pointer: [subRow(10, 1, { expires_at: Math.floor(Date.now() / 1000) + 6 * 3600 })] })
    const r = await watchFunding(regRow(), Math.floor(Date.now() / 1000))
    expect(r).toBeNull()
  })

  it('进入提前窗口且资金充足 → 不告警（shortages 空）', async () => {
    mockQueries({ pointer: [subRow(10, 1, { expires_at: Math.floor(Date.now() / 1000) + 2 * 86400 })] })
    fundingMock.native = BigInt('20000000000000000') // 0.02 OXA > 订阅费 0.001
    fundingMock.epDeposit = BigInt('20000000000000000')
    fundingMock.escrow = BigInt('10000000000000000') // 0.01 OXA > 2×服务费(0.00492)
    const r = await watchFunding(regRow(), Math.floor(Date.now() / 1000))
    expect(r).toEqual({ alerted: false, shortages: [] })
  })

  it('进入提前窗口资金不足 → 告警（未配置 webhook 走 log.error）并记录 last_funding_alert_at', async () => {
    mockQueries({ pointer: [subRow(10, 1, { expires_at: Math.floor(Date.now() / 1000) + 2 * 86400 })] })
    // funding 全 0：escrow / native 均不足
    const fetchSpy = vi.fn(async () => ({ ok: true, status: 200 })) as any
    vi.stubGlobal('fetch', fetchSpy)
    const r = await watchFunding(regRow(), Math.floor(Date.now() / 1000))
    expect(r?.alerted).toBe(true)
    expect(r?.shortages.length).toBeGreaterThan(0)
    // 未配置 AA_ALERT_WEBHOOK_URL → sendAlert 仅 log.error，不走 fetch
    expect(fetchSpy).not.toHaveBeenCalled()
    // last_funding_alert_at 落库
    const updateCall = queryMock.mock.calls.find((c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('last_funding_alert_at = NOW()'))
    expect(updateCall).toBeDefined()
    vi.unstubAllGlobals()
  })

  it('告警节流：距上次告警 < minInterval → 跳过不重复告警', async () => {
    queryMock.mockImplementation(async (sql: unknown) => {
      if (typeof sql !== 'string') return { rows: [] }
      if (sql.includes('FROM chain_subscriptions WHERE subscription_id = $1')) {
        return { rows: [subRow(10, 1, { expires_at: Math.floor(Date.now() / 1000) + 2 * 86400 })] }
      }
      if (sql.includes('last_funding_alert_at FROM')) return { rows: [{ last_funding_alert_at: new Date() }] } // 刚刚告警过
      return { rows: [] }
    })
    const fetchSpy = vi.fn(async () => ({ ok: true, status: 200 })) as any
    vi.stubGlobal('fetch', fetchSpy)
    const r = await watchFunding(regRow(), Math.floor(Date.now() / 1000))
    expect(r?.alerted).toBe(false) // 已节流，不发送
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('resolveExistingSessionId — L12 残留 session 解析', () => {
  beforeEach(() => queryMock.mockReset())

  it('历史登记行命中 → 直接返回该 session_id（不触发 relay）', async () => {
    queryMock.mockImplementation(async (sql: unknown) => ({
      rows: typeof sql === 'string' && sql.includes('session_id IS NOT NULL') ? [{ session_id: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }] : [],
    }))
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const sid = await resolveExistingSessionId(EOA, 1, 1, ACCOUNT)
    expect(sid).toBe('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('登记行缺失 → relay session store 兜底，取最后一条（最近一次 enable）', async () => {
    queryMock.mockImplementation(async () => ({ rows: [] }))
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ code: 0, data: [{ sessionId: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }, { sessionId: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }] }),
    })) as any)
    const sid = await resolveExistingSessionId(EOA, 1, 1, ACCOUNT)
    expect(sid).toBe('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
    expect(fetch).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('登记行与 relay 均无 → null（enable 时抛 409 阻止继续）', async () => {
    queryMock.mockImplementation(async () => ({ rows: [] }))
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ code: 0, data: [] }) })) as any)
    const sid = await resolveExistingSessionId(EOA, 1, 1, ACCOUNT)
    expect(sid).toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('revokeAutoRenew — 链上撤销守卫', () => {
  beforeEach(() => queryMock.mockReset())

  it('无登记行 → 404（无 session 可撤销）', async () => {
    queryMock.mockImplementation(async () => ({ rows: [] }))
    const err = await revokeAutoRenew({
      subscriber: EOA,
      agentId: 1,
      planId: 1,
      disableUserOpHash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      ownerSignature: '0x' + '11'.repeat(65),
    }).catch((e: Error & { status?: number }) => e)
    expect(err.status).toBe(404)
  })

  it('登记行缺失但调用方回传 accountAddress/sessionId（L12 残留兜底）→ 完整走通撤销上链', async () => {
    queryMock.mockImplementation(async () => ({ rows: [] }))
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ code: 0, data: { userOpHash: '0x' + 'ab'.repeat(32), receipt: { success: true, txHash: '0x' + 'cd'.repeat(32) } } }),
    })) as any
    vi.stubGlobal('fetch', fetchSpy)
    const r = await revokeAutoRenew({
      subscriber: EOA,
      agentId: 1,
      planId: 1,
      // 与 mock getUserOpHash 返回一致 → 通过哈希一致性校验，进入 relay 广播
      disableUserOpHash: '0x' + 'ab'.repeat(32),
      ownerSignature: '0x' + '11'.repeat(65),
      accountAddress: ACCOUNT,
      sessionId: '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    })
    expect(r.revoked).toBe(true)
    expect(fetchSpy).toHaveBeenCalled()
    // SDK buildDisableSessionUserOp 以 account/sessionId/gas 构建三段批量撤销 draft
    const aaSdk = await import('@0xinfrax/aa-sdk')
    expect(aaSdk.buildDisableSessionUserOp).toHaveBeenCalledWith(
      expect.objectContaining({ account: ACCOUNT, sessionId: expect.any(String), gas: expect.any(Object) }),
    )
    // 对齐 infraX 会话接口：撤销走 POST /v1/session/revoke（submitSignedOp 统一流程）
    const [url, init] = fetchSpy.mock.calls[0] as [string, { body: string }]
    expect(String(url)).toContain('/v1/session/revoke')
    const body = JSON.parse(init.body)
    expect(body.account).toBe(ACCOUNT)
    expect(body.owner).toBe(EOA) // 撤销以用户 EOA（session owner）签名提交
    expect(body.sessionId).toBe('0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd')
    expect(body.userOpHash).toBe('0x' + 'ab'.repeat(32))
    expect(body.signature).toBe('0x' + '11'.repeat(65))
    expect(body.wait).toBe(true)
    // 广播的 op.callData = execute(BATCH, abi.encode([disableSession, uninstallModule, invalidateNonce(cur+1)]))
    expect(body.op.callData.startsWith('0xe9ae5c53')).toBe(true) // execute(bytes32,bytes)
    expect(body.op.callData).toContain('0100000000000000000000000000000000000000000000000000000000000000') // BATCH execMode
    expect(body.op.callData).toContain('f42c859d') // disableSession(sessionId)@module —— 三段批量新增（旧 session key 删除）
    expect(body.op.callData).toContain('a71763a8') // uninstallModule selector
    expect(body.op.callData).toContain('1f1b92e3') // invalidateNonce selector
    expect(body.op.callData).toContain('0000000000000000000000000000000000000000000000000000000000000001') // currentNonce(0)+1
    vi.unstubAllGlobals()
  })
})
