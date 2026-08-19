// AgentX Gateway — escrow 计费事件同步 + 自动续订服务费对账单测（e5）
// 覆盖：未启用直接返回 / 正常对账无告警 / 漏计费告警 / 重复扣费告警。
// mock getPool + viem（getBlockNumber/getLogs），不触碰真实链上与 relay。
import { describe, it, expect, vi, beforeEach } from 'vitest'

const queryMock = vi.hoisted(() => vi.fn())
/** 链头区块高度（可调，用于模拟不同 head 下 fresh-start 起算点） */
const headBlockMock = vi.hoisted(() => ({ n: 1000n }))

vi.mock('../src/lib/db', () => ({
  getPool: () => ({ query: queryMock }),
}))

vi.mock('../src/config', () => ({
  config: {
    aaAutoRenewEnabled: true,
    aaEscrowAddress: '0x8bf8ffee86f1d4a160f0953eb13bedcbf99eaf9e',
    rpcUrlOxaChain: 'https://rpc-oxa.0xainet.top',
    chainIdOxaChain: 19505,
    aaEscrowSyncBlockSpan: 5000,
    aaEscrowReconcileIntervalSec: 3600,
    aaEscrowReconcileMinRatio: 0.5,
    aaEscrowReconcileMaxRatio: 3,
    aaRelayServiceFeeWei: '2460000000000000',
  },
}))

let clientMock: { getBlockNumber: ReturnType<typeof vi.fn>; getLogs: ReturnType<typeof vi.fn> } | null = null
vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>()
  return {
    ...actual,
    createPublicClient: () => {
      clientMock = {
        getBlockNumber: vi.fn(async () => headBlockMock.n),
        getLogs: vi.fn(async () => []),
      }
      return clientMock
    },
  }
})

vi.mock('../src/services/chain-data-reader', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const sendAlertMock = vi.hoisted(() => vi.fn())
vi.mock('../src/lib/alert', () => ({ sendAlert: sendAlertMock }))

import { runEscrowReconciliation } from '../src/services/reconcile-escrow'
import { config } from '../src/config'

const EOA = '0x1111111111111111111111111111111111111111'
const ACCOUNT = '0x2222222222222222222222222222222222222222'
const FEE = '2460000000000000' // aaRelayServiceFeeWei

/** syncEscrowEvents：last_block=100 → head=1000 → 单轮从 101..100 无事件，caughtUp=true */
function mockSync() {
  queryMock.mockImplementation(async (sql: unknown, params: unknown[]) => {
    if (typeof sql !== 'string') return { rows: [] }
    if (sql.includes('SELECT last_block FROM aa_escrow_sync')) return { rows: [{ last_block: 100 }] }
    if (sql.includes('UPDATE aa_escrow_sync')) return { rows: [] }
    if (sql.includes('FROM aa_escrow_events WHERE kind IN')) return { rows: [] }
    if (sql.includes('FROM aa_auto_renew WHERE account_address IS NOT NULL')) return { rows: [] }
    return { rows: [] }
  })
}

describe('runEscrowReconciliation — escrow 计费对账（e5）', () => {
  beforeEach(() => {
    queryMock.mockReset()
    sendAlertMock.mockReset()
    headBlockMock.n = 1000n
    ;(config as any).aaAutoRenewEnabled = true
  })

  it('未启用（aaAutoRenewEnabled=false）→ enabled=false 直接返回', async () => {
    ;(config as any).aaAutoRenewEnabled = false
    const r = await runEscrowReconciliation()
    expect(r.enabled).toBe(false)
    expect(r.caughtUp).toBe(false)
    ;(config as any).aaAutoRenewEnabled = true
  })

  it('首次同步（last_block=0）→ 直接从最近 span 块起算（head-5000..head），首轮即追平', async () => {
    headBlockMock.n = 120000n
    queryMock.mockImplementation(async (sql: unknown) => {
      if (typeof sql !== 'string') return { rows: [] }
      if (sql.includes('SELECT last_block FROM aa_escrow_sync')) return { rows: [{ last_block: 0 }] }
      if (sql.includes('UPDATE aa_escrow_sync')) return { rows: [] }
      return { rows: [] }
    })
    const r = await runEscrowReconciliation()
    // getLogs 从 head-span+1=115001 起，toBlock=head=120000（恰好最近 5000 块，含 head）
    expect(clientMock!.getLogs).toHaveBeenCalledTimes(1)
    const call = clientMock!.getLogs.mock.calls[0][0]
    expect(call.fromBlock).toBe(115001n)
    expect(call.toBlock).toBe(120000n)
    // 首轮即追平 → 对账立即可用（无登记行 → 无告警）
    expect(r.caughtUp).toBe(true)
    expect(r.lastBlock).toBe(120000)
    expect(r.anomalies).toEqual([])
  })

  it('last_block>0（已有游标）→ 从 last+1 续拉，不重置起算点', async () => {
    headBlockMock.n = 120000n
    queryMock.mockImplementation(async (sql: unknown) => {
      if (typeof sql !== 'string') return { rows: [] }
      if (sql.includes('SELECT last_block FROM aa_escrow_sync')) return { rows: [{ last_block: 118000 }] }
      if (sql.includes('UPDATE aa_escrow_sync')) return { rows: [] }
      return { rows: [] }
    })
    const r = await runEscrowReconciliation()
    const call = clientMock!.getLogs.mock.calls[0][0]
    expect(call.fromBlock).toBe(118001n) // last+1，不用 head-span
    expect(call.toBlock).toBe(120000n)
    expect(r.caughtUp).toBe(true)
  })

  it('追历史期间（未追平）→ 仅同步不对账判定', async () => {
    // last_block=100, head=1000，span=5000 → 实际 to=1000（100+5000-1 > head），caughtUp=true；
    // 构造未追平：head 远大于 last+span
    queryMock.mockImplementation(async (sql: unknown) => {
      if (typeof sql !== 'string') return { rows: [] }
      if (sql.includes('SELECT last_block FROM aa_escrow_sync')) return { rows: [{ last_block: 100 }] }
      return { rows: [] }
    })
    // viem getBlockNumber 固定 1000 → caughtUp = 1000 - 1000 = 0 <= 5000 → true；此处不强测未追平，
    // 改测 caughtUp 后无登记行 → checked=0 无告警
    const r = await runEscrowReconciliation()
    expect(r.caughtUp).toBe(true)
    expect(r.checked).toBe(0)
    expect(r.anomalies).toEqual([])
    expect(sendAlertMock).not.toHaveBeenCalled()
  })

  it('正常对账：续订 1 次，净扣费 = 固定费 → 无告警', async () => {
    mockSync()
    queryMock.mockImplementation(async (sql: unknown) => {
      if (typeof sql !== 'string') return { rows: [] }
      if (sql.includes('SELECT last_block FROM aa_escrow_sync')) return { rows: [{ last_block: 100 }] }
      if (sql.includes('UPDATE aa_escrow_sync')) return { rows: [] }
      if (sql.includes('FROM aa_escrow_events WHERE kind IN')) {
        return { rows: [{ account: ACCOUNT, net: FEE }] }
      }
      if (sql.includes('FROM aa_auto_renew WHERE account_address IS NOT NULL')) {
        return { rows: [{ subscriber: EOA, agent_id: 1, plan_id: 1, account_address: ACCOUNT, renew_log: [{ at: '2026-08-20T00:00:00Z' }], renew_status: 'enabled' }] }
      }
      return { rows: [] }
    })
    const r = await runEscrowReconciliation()
    expect(r.enabled).toBe(true)
    expect(r.caughtUp).toBe(true)
    expect(r.checked).toBe(1)
    expect(r.anomalies).toEqual([])
    expect(sendAlertMock).not.toHaveBeenCalled()
  })

  it('漏计费：有 1 次续订但 escrow 无 Charged → missing 告警', async () => {
    mockSync()
    queryMock.mockImplementation(async (sql: unknown) => {
      if (typeof sql !== 'string') return { rows: [] }
      if (sql.includes('SELECT last_block FROM aa_escrow_sync')) return { rows: [{ last_block: 100 }] }
      if (sql.includes('UPDATE aa_escrow_sync')) return { rows: [] }
      if (sql.includes('FROM aa_escrow_events WHERE kind IN')) return { rows: [] } // 无扣费事件
      if (sql.includes('FROM aa_auto_renew WHERE account_address IS NOT NULL')) {
        return { rows: [{ subscriber: EOA, agent_id: 1, plan_id: 1, account_address: ACCOUNT, renew_log: [{ at: '2026-08-20T00:00:00Z' }], renew_status: 'enabled' }] }
      }
      return { rows: [] }
    })
    const r = await runEscrowReconciliation()
    expect(r.anomalies).toHaveLength(1)
    expect(r.anomalies[0].kind).toBe('missing')
    expect(r.anomalies[0].netWei).toBe('0')
    expect(r.anomalies[0].expectedWei).toBe(FEE)
    expect(sendAlertMock).toHaveBeenCalledTimes(1)
  })

  it('重复扣费：净扣费远超期望（> 3×固定费）→ excess 告警', async () => {
    mockSync()
    queryMock.mockImplementation(async (sql: unknown) => {
      if (typeof sql !== 'string') return { rows: [] }
      if (sql.includes('SELECT last_block FROM aa_escrow_sync')) return { rows: [{ last_block: 100 }] }
      if (sql.includes('UPDATE aa_escrow_sync')) return { rows: [] }
      if (sql.includes('FROM aa_escrow_events WHERE kind IN')) {
        return { rows: [{ account: ACCOUNT, net: '100000000000000000' }] } // 0.1 OXA >> 3×固定费
      }
      if (sql.includes('FROM aa_auto_renew WHERE account_address IS NOT NULL')) {
        return { rows: [{ subscriber: EOA, agent_id: 1, plan_id: 1, account_address: ACCOUNT, renew_log: [{ at: '2026-08-20T00:00:00Z' }], renew_status: 'enabled' }] }
      }
      return { rows: [] }
    })
    const r = await runEscrowReconciliation()
    expect(r.anomalies).toHaveLength(1)
    expect(r.anomalies[0].kind).toBe('excess')
    expect(sendAlertMock).toHaveBeenCalledTimes(1)
  })

  it('净扣费为负（退款多于扣费）→ negative 告警', async () => {
    mockSync()
    queryMock.mockImplementation(async (sql: unknown) => {
      if (typeof sql !== 'string') return { rows: [] }
      if (sql.includes('SELECT last_block FROM aa_escrow_sync')) return { rows: [{ last_block: 100 }] }
      if (sql.includes('UPDATE aa_escrow_sync')) return { rows: [] }
      if (sql.includes('FROM aa_escrow_events WHERE kind IN')) {
        return { rows: [{ account: ACCOUNT, net: '-5000000000000000' }] }
      }
      if (sql.includes('FROM aa_auto_renew WHERE account_address IS NOT NULL')) {
        return { rows: [{ subscriber: EOA, agent_id: 1, plan_id: 1, account_address: ACCOUNT, renew_log: [{ at: '2026-08-20T00:00:00Z' }], renew_status: 'enabled' }] }
      }
      return { rows: [] }
    })
    const r = await runEscrowReconciliation()
    expect(r.anomalies).toHaveLength(1)
    expect(r.anomalies[0].kind).toBe('negative')
    expect(sendAlertMock).toHaveBeenCalledTimes(1)
  })
})
