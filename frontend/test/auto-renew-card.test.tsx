// ---------------------------------------------------------------------------
// AgentX — AutoRenewCard L2 前端组件 vitest（对应 docs/test-cases-aa-auto-renew.md
// 用例 91–109 + L12 自愈 / 充值 / resume / paused 展示等分支）
// mock：wagmi（useAccount/useWalletClient/usePublicClient）、@/hooks/useGatewayAuth、
// @/lib/auto-renew（API 层）、@/lib/gateway；viem 与 lucide-react 用真实实现。
// ---------------------------------------------------------------------------
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AutoRenewCard } from '@/components/user/AutoRenewCard'

const ACCOUNT = '0x2222222222222222222222222222222222222222'
const SIGN = '0x' + '12'.repeat(65)
const TX = '0x' + '34'.repeat(32)

const baseRow = (over: Record<string, unknown> = {}) => ({
  agent_id: 1,
  plan_id: 1,
  account_address: null as string | null,
  current_subscription_id: 10,
  session_id: null,
  session_signer: null,
  renew_status: 'pending' as string,
  renew_count: 0,
  renew_fail_count: 0,
  paused_reason: null,
  paused_at: null,
  last_renew_at: null,
  last_renew_tx: null,
  last_renew_err: null,
  created_at: null,
  updated_at: null,
  sub_status: 1,
  sub_started_at: null,
  sub_expires_at: null,
  amount_wei: '1000000000000000',
  plan_price: null,
  plan_period: null,
  funding: { nativeWei: '0', epDepositWei: '0', escrowWei: '0' },
  ...over,
})

const draft = {
  accountAddress: ACCOUNT,
  accountDeployed: false,
  sessionId: '0x' + 'dd'.repeat(32),
  sessionSigner: '0x' + 'ee'.repeat(32),
  digest: '0x' + 'aa'.repeat(32),
  validUntil: '1800000000',
}

const state = vi.hoisted(() => {
  const s = {
    address: '0x1111111111111111111111111111111111111111',
    accessToken: null as string | null,
    authLoading: false,
    walletClient: null as any,
    publicClient: null as any,
    rows: [] as any[],
    listErr: null as Error | null,
    enableResult: {
      accountAddress: '0x2222222222222222222222222222222222222222',
      accountDeployed: false,
      sessionId: '0x' + 'dd'.repeat(32),
      sessionSigner: '0x' + 'ee'.repeat(32),
      digest: '0x' + 'aa'.repeat(32),
      validUntil: '1800000000',
    } as any,
    enableErr: null as (Error & { status?: number }) | null,
    confirmResult: { userOpHash: '0x' + 'ff'.repeat(32), txHash: null, receiptSuccess: true },
    confirmErr: null as Error | null,
    resumeErr: null as (Error & { status?: number }) | null,
    revokeResult: { revoked: true, userOpHash: '0x' + 'ee'.repeat(32), txHash: null },
    disableResult: { disableUserOpHash: '0x' + 'bb'.repeat(32) },
    listAutoRenew: vi.fn(),
    enableAutoRenew: vi.fn(),
    confirmAutoRenew: vi.fn(),
    resumeAutoRenew: vi.fn(),
    revokeAutoRenew: vi.fn(),
    disableAutoRenew: vi.fn(),
    authenticate: vi.fn(),
  }
  return s
})

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: state.address, isConnected: !!state.address }),
  useWalletClient: () => ({ data: state.walletClient }),
  usePublicClient: () => state.publicClient,
}))

vi.mock('@/hooks/useGatewayAuth', () => ({
  useGatewayAuth: () => ({
    accessToken: state.accessToken,
    isLoading: state.authLoading,
    isAuthenticated: !!state.accessToken,
    error: null,
    context: null,
    authenticate: state.authenticate,
    refreshContext: vi.fn(),
  }),
}))

vi.mock('@/lib/gateway', () => ({
  GATEWAY_URL: 'http://localhost:3090',
  gatewayFetch: vi.fn(),
}))

vi.mock('@/lib/auto-renew', () => ({
  AA_ESCROW_ADDRESS: '0x8bf8ffee86f1d4a160f0953eb13bedcbf99eaf9e',
  AA_ENTRYPOINT_V07: '0x97e4cddcffeaf4580bc6315fee512f2b2d82798a',
  AA_RELAY_SERVICE_FEE_WEI: BigInt('2460000000000000'),
  listAutoRenew: state.listAutoRenew,
  enableAutoRenew: state.enableAutoRenew,
  confirmAutoRenew: state.confirmAutoRenew,
  resumeAutoRenew: state.resumeAutoRenew,
  revokeAutoRenew: state.revokeAutoRenew,
  disableAutoRenew: state.disableAutoRenew,
}))

const makeWalletClient = () => ({
  request: vi.fn(async () => SIGN),
  sendTransaction: vi.fn(async () => TX),
})
const makePublicClient = () => ({
  waitForTransactionReceipt: vi.fn(async () => ({ status: 'success' })),
})

const PROPS = {
  agentId: 1,
  planId: 1,
  subscriptionId: 10,
  planPriceWei: '1000000000000000',
  priceDisplay: '0.0010 OXA / period',
  isActive: true,
  expiresAt: 1800000000n,
}

beforeEach(() => {
  state.address = '0x1111111111111111111111111111111111111111'
  state.accessToken = null
  state.authLoading = false
  state.walletClient = makeWalletClient()
  state.publicClient = makePublicClient()
  state.rows = []
  state.listErr = null
  state.enableResult = { ...draft }
  state.enableErr = null
  state.confirmResult = { userOpHash: '0x' + 'ff'.repeat(32), txHash: null, receiptSuccess: true }
  state.confirmErr = null
  state.resumeErr = null
  state.disableResult = { disableUserOpHash: '0x' + 'bb'.repeat(32) }

  state.listAutoRenew.mockImplementation(async () => {
    if (state.listErr) throw state.listErr
    return state.rows
  })
  state.enableAutoRenew.mockImplementation(async () => {
    if (state.enableErr) throw state.enableErr
    return state.enableResult
  })
  state.confirmAutoRenew.mockImplementation(async () => {
    if (state.confirmErr) throw state.confirmErr
    return state.confirmResult
  })
  state.resumeAutoRenew.mockImplementation(async () => {
    if (state.resumeErr) throw state.resumeErr
    return { ok: true }
  })
  state.revokeAutoRenew.mockImplementation(async () => state.revokeResult)
  state.disableAutoRenew.mockImplementation(async () => state.disableResult)
  // 清空跨用例累加的调用历史（mockImplementation 不清 calls）
  state.listAutoRenew.mockClear()
  state.enableAutoRenew.mockClear()
  state.confirmAutoRenew.mockClear()
  state.resumeAutoRenew.mockClear()
  state.revokeAutoRenew.mockClear()
  state.disableAutoRenew.mockClear()
  state.authenticate.mockClear()

  vi.spyOn(window, 'confirm').mockReturnValue(true)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(async () => undefined) },
    configurable: true,
  })
})

describe('92/93 — 未认证（lazy）与 Sign in', () => {
  it('未认证 → 显示 Sign in 按钮，且不自动调 listAutoRenew（lazy，不弹签名）', () => {
    render(<AutoRenewCard {...PROPS} />)
    expect(screen.getByText('Sign in to manage auto-renew')).toBeInTheDocument()
    expect(state.listAutoRenew).not.toHaveBeenCalled()
  })

  it('点击 Sign in → 触发 1 次 authenticate（JWT 签名）', async () => {
    render(<AutoRenewCard {...PROPS} />)
    await userEvent.click(screen.getByText('Sign in to manage auto-renew'))
    expect(state.authenticate).toHaveBeenCalledTimes(1)
  })

  it('authLoading 且无 token → 显示 Signing in…', () => {
    state.authLoading = true
    render(<AutoRenewCard {...PROPS} />)
    expect(screen.getByText('Signing in…')).toBeInTheDocument()
  })
})

describe('95/96 — idle 与订阅状态', () => {
  it('已认证 + 无登记行 + active → Enable Auto-Renew 按钮 + 价格标签', async () => {
    state.accessToken = 'tok'
    render(<AutoRenewCard {...PROPS} />)
    expect(await screen.findByRole('button', { name: 'Enable Auto-Renew' })).toBeInTheDocument()
    expect(screen.getByText('0.0010 OXA / period')).toBeInTheDocument()
  })

  it('已认证 + 无登记行 + 非 active → 不显示 Enable，显示 Auto-renew is off', async () => {
    state.accessToken = 'tok'
    render(<AutoRenewCard {...PROPS} isActive={false} />)
    await waitFor(() => expect(state.listAutoRenew).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('button', { name: 'Enable Auto-Renew' })).not.toBeInTheDocument()
    expect(await screen.findByText(/Auto-renew is off/)).toBeInTheDocument()
  })
})

describe('97/98/99 — enable → pending-sign 与 Cancel', () => {
  it('点击 Enable → enableAutoRenew 被调，成功进入 pending-sign（Account/Digest/Limit 面板）', async () => {
    state.accessToken = 'tok'
    render(<AutoRenewCard {...PROPS} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Enable Auto-Renew' }))
    await waitFor(() => expect(state.enableAutoRenew).toHaveBeenCalledTimes(1))
    expect(state.enableAutoRenew).toHaveBeenCalledWith('tok', {
      agentId: 1, planId: 1, subscriptionId: 10, planPriceWei: '1000000000000000',
    })
    expect(await screen.findByText(/Enable request ready — sign to authorize/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign & Enable' })).toBeInTheDocument()
    expect(screen.getByText(new RegExp(ACCOUNT))).toBeInTheDocument()
  })

  it('pending-sign 点击 Cancel → 回 idle（丢弃 draft，恢复 Enable 按钮）', async () => {
    state.accessToken = 'tok'
    render(<AutoRenewCard {...PROPS} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Enable Auto-Renew' }))
    await screen.findByRole('button', { name: 'Sign & Enable' })
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByRole('button', { name: 'Enable Auto-Renew' })).toBeInTheDocument()
  })

  it('enable 报错（relay 故障）→ 错误条 + Retry', async () => {
    state.accessToken = 'tok'
    state.enableErr = new Error('relay unreachable')
    render(<AutoRenewCard {...PROPS} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Enable Auto-Renew' }))
    expect(await screen.findByText(/relay unreachable/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})

describe('100/101/102 — eth_sign 与 confirm', () => {
  it('eth_sign 被拒 → 错误提示（代码流转到 error 状态）', async () => {
    state.accessToken = 'tok'
    state.walletClient.request = vi.fn(async () => { throw new Error('User rejected the request') })
    render(<AutoRenewCard {...PROPS} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Enable Auto-Renew' }))
    await screen.findByRole('button', { name: 'Sign & Enable' })
    await userEvent.click(screen.getByRole('button', { name: 'Sign & Enable' }))
    expect(await screen.findByText(/User rejected the request/)).toBeInTheDocument()
    // 确认接口不应被调
    expect(state.confirmAutoRenew).not.toHaveBeenCalled()
  })

  it('confirm 成功（receiptSuccess=true）→ enabled 状态 + 智能账户 + 资金视图 + renew 次数', async () => {
    state.accessToken = 'tok'
    // 初始为 disabled 的登记行（含 account + 资金），经 Re-enable → confirm 后升为 enabled
    state.rows = [baseRow({
      renew_status: 'disabled',
      account_address: ACCOUNT,
      renew_count: 3,
      funding: { nativeWei: '1000000000000000000000', epDepositWei: '1000000000000000000000', escrowWei: '10000000000000000' },
    })]
    render(<AutoRenewCard {...PROPS} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Re-enable' }))
    await screen.findByRole('button', { name: 'Sign & Enable' })
    await userEvent.click(screen.getByRole('button', { name: 'Sign & Enable' }))
    expect(await screen.findByText('Auto-renew enabled — the smart account will renew this subscription automatically.')).toBeInTheDocument()
    expect(state.confirmAutoRenew).toHaveBeenCalledWith('tok', { agentId: 1, planId: 1, ownerSignature: SIGN })
  })

  it('confirm revert（receiptSuccess=false）→ 错误含 op 前缀', async () => {
    state.accessToken = 'tok'
    state.confirmResult = { userOpHash: '0x' + 'ab'.repeat(32), txHash: null, receiptSuccess: false }
    render(<AutoRenewCard {...PROPS} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Enable Auto-Renew' }))
    await screen.findByRole('button', { name: 'Sign & Enable' })
    await userEvent.click(screen.getByRole('button', { name: 'Sign & Enable' }))
    expect(await screen.findByText(/Enable UserOp reverted on-chain/)).toBeInTheDocument()
    expect(screen.getByText(/0xababababab/)).toBeInTheDocument()
  })
})

describe('L12 自愈 — enable 检测残留 session → 先撤销再 enable', () => {
  it('needsSessionRevoke → eth_sign(disable) → revokeAutoRenew(含兜底参数) → 二次 enable → pending-sign', async () => {
    state.accessToken = 'tok'
    state.enableResult = {
      ...draft,
      needsSessionRevoke: true,
      disableUserOpHash: '0x' + 'cd'.repeat(32),
      disableSessionId: '0x' + 'dd'.repeat(32),
    }
    render(<AutoRenewCard {...PROPS} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Enable Auto-Renew' }))
    await waitFor(() => expect(state.revokeAutoRenew).toHaveBeenCalledTimes(1))
    expect(state.revokeAutoRenew).toHaveBeenCalledWith('tok', {
      agentId: 1, planId: 1,
      disableUserOpHash: '0x' + 'cd'.repeat(32),
      ownerSignature: SIGN,
      accountAddress: ACCOUNT,
      sessionId: '0x' + 'dd'.repeat(32),
    })
    // 撤销后二次 enable 才生成新 digest
    expect(state.enableAutoRenew).toHaveBeenCalledTimes(2)
    expect(await screen.findByText(/Enable request ready — sign to authorize/)).toBeInTheDocument()
  })

  it('残留但无 walletClient → 错误提示联系支持，不调 revoke', async () => {
    state.accessToken = 'tok'
    state.enableResult = { ...draft, needsSessionRevoke: true, disableUserOpHash: '0x' + 'cd'.repeat(32) }
    state.walletClient = null
    render(<AutoRenewCard {...PROPS} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Enable Auto-Renew' }))
    expect(await screen.findByText(/old session that cannot be revoked automatically/)).toBeInTheDocument()
    expect(state.revokeAutoRenew).not.toHaveBeenCalled()
  })
})

describe('103/104 — 资金引导', () => {
  const fundedRow = () => baseRow({
    renew_status: 'paused',
    account_address: ACCOUNT,
    paused_reason: 'funding insufficient',
    renew_fail_count: 2,
  })

  it('enabled + 双零资金 → 琥珀色资金引导（12 期估算 + 三行充值 + Top up all）', async () => {
    state.accessToken = 'tok'
    state.rows = [fundedRow()]
    render(<AutoRenewCard {...PROPS} />)
    expect(await screen.findByText(/Smart account needs funds before the next renewal/)).toBeInTheDocument()
    expect(screen.getByText('Balance — pays the subscription price')).toBeInTheDocument()
    expect(screen.getByText('Gas deposit — pays UserOp gas')).toBeInTheDocument()
    expect(screen.getByText('Service escrow — pays the relay fee')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Top up all three/ })).toBeInTheDocument()
  })

  it('资金正常（native/EP/escrow 充足）→ 无资金警告，显示三类余额', async () => {
    state.accessToken = 'tok'
    state.rows = [{
      ...fundedRow(),
      renew_status: 'enabled',
      funding: {
        nativeWei: '20000000000000000',
        epDepositWei: '20000000000000000',
        escrowWei: '10000000000000000',
      },
    }]
    render(<AutoRenewCard {...PROPS} />)
    expect(await screen.findByText('Auto-renew enabled')).toBeInTheDocument()
    expect(screen.queryByText(/Smart account needs funds/)).not.toBeInTheDocument()
    expect(screen.getByText(/Balance:/)).toHaveTextContent('0.02')
    expect(screen.getByText(/Service escrow:/)).toHaveTextContent('0.01')
  })
})

describe('105/106/107 — disable / refresh / copy', () => {
  it('disable → window.confirm 通过 → 本地停用 + Re-enable 入口', async () => {
    state.accessToken = 'tok'
    state.rows = [baseRow({ renew_status: 'enabled', account_address: ACCOUNT, renew_count: 5 })]
    render(<AutoRenewCard {...PROPS} />)
    const btn = await screen.findByRole('button', { name: 'Disable Auto-Renew' })
    await userEvent.click(btn)
    expect(window.confirm).toHaveBeenCalled()
    await waitFor(() => expect(state.disableAutoRenew).toHaveBeenCalledWith('tok', { agentId: 1, planId: 1 }))
    expect(await screen.findByText(/Auto-renew is off/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Re-enable' })).toBeInTheDocument()
    expect(screen.getByText(/Previously renewed 5×/)).toBeInTheDocument()
  })

  it('用户拒绝 confirm → 不调 disableAutoRenew', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    state.accessToken = 'tok'
    state.rows = [baseRow({ renew_status: 'enabled', account_address: ACCOUNT })]
    render(<AutoRenewCard {...PROPS} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Disable Auto-Renew' }))
    expect(state.disableAutoRenew).not.toHaveBeenCalled()
  })

  it('refresh → 重新 GET 列表（点击刷新按钮触发第二次）', async () => {
    state.accessToken = 'tok'
    render(<AutoRenewCard {...PROPS} />)
    await waitFor(() => expect(state.listAutoRenew).toHaveBeenCalledTimes(1))
    await userEvent.click(screen.getByTitle('Refresh status'))
    await waitFor(() => expect(state.listAutoRenew).toHaveBeenCalledTimes(2))
  })

  it('copy 地址 → clipboard 写入 + 短暂 Copied', async () => {
    state.accessToken = 'tok'
    state.rows = [baseRow({ renew_status: 'enabled', account_address: ACCOUNT })]
    render(<AutoRenewCard {...PROPS} />)
    await userEvent.click(await screen.findByTitle('Copy address'))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(ACCOUNT)
    expect(await screen.findByText('Copied')).toBeInTheDocument()
  })
})

describe('109 — 网络错误与 Retry', () => {
  it('listAutoRenew 失败 → 错误条 + Retry；点击 Retry 重拉', async () => {
    state.accessToken = 'tok'
    state.listErr = new Error('Network Error')
    render(<AutoRenewCard {...PROPS} />)
    expect(await screen.findByText(/Network Error/)).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: 'Retry' })
    state.listErr = null
    state.rows = []
    await userEvent.click(retry)
    await waitFor(() => expect(state.listAutoRenew).toHaveBeenCalledTimes(2))
  })
})

describe('resume — 暂停恢复', () => {
  it('paused + 点 Resume → resumeAutoRenew 被调 → enabled + paused_reason 清除', async () => {
    state.accessToken = 'tok'
    state.rows = [baseRow({
      renew_status: 'paused',
      account_address: ACCOUNT,
      paused_reason: 'funding insufficient',
      renew_fail_count: 2,
      funding: { nativeWei: '10000000000000000', epDepositWei: '10000000000000000', escrowWei: '10000000000000000' },
    })]
    render(<AutoRenewCard {...PROPS} />)
    // paused 展示：原因 + 失败次数 + Resume
    expect(await screen.findByText(/Auto-renew paused/)).toBeInTheDocument()
    expect(screen.getByText(/2 consecutive failures/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Resume Auto-Renew' }))
    await waitFor(() => expect(state.resumeAutoRenew).toHaveBeenCalledWith('tok', { agentId: 1, planId: 1 }))
    expect(await screen.findByText(/Auto-renew resumed/)).toBeInTheDocument()
  })

  it('resume 失败（网关 404）→ 回到 paused 并展示错误', async () => {
    state.accessToken = 'tok'
    state.resumeErr = Object.assign(new Error('No paused auto-renew to resume'), { status: 404 })
    state.rows = [baseRow({
      renew_status: 'paused',
      account_address: ACCOUNT,
      funding: { nativeWei: '10000000000000000', epDepositWei: '10000000000000000', escrowWei: '10000000000000000' },
    })]
    render(<AutoRenewCard {...PROPS} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Resume Auto-Renew' }))
    expect(await screen.findByText(/No paused auto-renew to resume/)).toBeInTheDocument()
  })
})

describe('充值 — doTopUp 分支', () => {
  const setupPausedUnfunded = () => {
    state.accessToken = 'tok'
    state.rows = [baseRow({ renew_status: 'paused', account_address: ACCOUNT })]
  }

  it('输入 0 → 金额必须大于 0', async () => {
    setupPausedUnfunded()
    render(<AutoRenewCard {...PROPS} />)
    await screen.findByText(/Smart account needs funds/)
    const rows = screen.getAllByRole('button', { name: 'Top up' })
    const balInput = screen.getByLabelText('Balance — pays the subscription price')
    fireEvent.change(balInput, { target: { value: '0' } })
    await userEvent.click(rows[0])
    expect(await screen.findByText(/Amount must be greater than 0/)).toBeInTheDocument()
  })

  it('非法金额（指数形式）→ Invalid amount', async () => {
    setupPausedUnfunded()
    render(<AutoRenewCard {...PROPS} />)
    await screen.findByText(/Smart account needs funds/)
    const balInput = screen.getByLabelText('Balance — pays the subscription price')
    fireEvent.change(balInput, { target: { value: '1e18' } })
    await userEvent.click(screen.getAllByRole('button', { name: 'Top up' })[0])
    expect(await screen.findByText(/Invalid amount/)).toBeInTheDocument()
  })

  it('Balance 充值成功 → sendTransaction(to=智能账户) → 等待回执 → refresh → 确认文案', async () => {
    setupPausedUnfunded()
    render(<AutoRenewCard {...PROPS} />)
    await screen.findByText(/Smart account needs funds/)
    await userEvent.click(screen.getAllByRole('button', { name: 'Top up' })[0])
    await waitFor(() => expect(state.walletClient.sendTransaction).toHaveBeenCalledTimes(1))
    const arg = state.walletClient.sendTransaction.mock.calls[0][0]
    expect(arg.to).toBe(ACCOUNT) // balance → 直转智能账户
    expect(arg.value).toBe(12000000000000000n) // 0.012 = 0.001×12 期
    expect(state.publicClient.waitForTransactionReceipt).toHaveBeenCalled()
    expect(await screen.findByText('Top-up confirmed — funds are live on-chain.')).toBeInTheDocument()
  })

  it('Gas 充值 → sendTransaction(to=EntryPoint, data=depositTo(address) selector 0xb760faf9)', async () => {
    setupPausedUnfunded()
    render(<AutoRenewCard {...PROPS} />)
    await screen.findByText(/Smart account needs funds/)
    await userEvent.click(screen.getAllByRole('button', { name: 'Top up' })[1])
    await waitFor(() => expect(state.walletClient.sendTransaction).toHaveBeenCalledTimes(1))
    const arg = state.walletClient.sendTransaction.mock.calls[0][0]
    expect(arg.to).toBe('0x97e4cddcffeaf4580bc6315fee512f2b2d82798a')
    expect(String(arg.data).startsWith('0xb760faf9')).toBe(true) // depositTo(address)
  })

  it('Escrow 充值 → sendTransaction(to=escrow, data=depositFor(user) selector 0xaa67c919)', async () => {
    setupPausedUnfunded()
    render(<AutoRenewCard {...PROPS} />)
    await screen.findByText(/Smart account needs funds/)
    await userEvent.click(screen.getAllByRole('button', { name: 'Top up' })[2])
    await waitFor(() => expect(state.walletClient.sendTransaction).toHaveBeenCalledTimes(1))
    const arg = state.walletClient.sendTransaction.mock.calls[0][0]
    expect(arg.to).toBe('0x8bf8ffee86f1d4a160f0953eb13bedcbf99eaf9e')
    expect(String(arg.data).startsWith('0xaa67c919')).toBe(true) // depositFor(address) payable
  })

  it('用户在钱包拒绝 → Top-up cancelled in wallet（不显示错误条）', async () => {
    setupPausedUnfunded()
    state.walletClient.sendTransaction = vi.fn(async () => { throw { shortMessage: 'User rejected the request.' } })
    render(<AutoRenewCard {...PROPS} />)
    await screen.findByText(/Smart account needs funds/)
    await userEvent.click(screen.getAllByRole('button', { name: 'Top up' })[0])
    expect(await screen.findByText('Top-up cancelled in wallet.')).toBeInTheDocument()
  })

  it('Top up all three → 依次 escrow/balance/gas，共 3 笔 sendTransaction', async () => {
    setupPausedUnfunded()
    render(<AutoRenewCard {...PROPS} />)
    await userEvent.click(await screen.findByRole('button', { name: /Top up all three/ }))
    await waitFor(() => expect(state.walletClient.sendTransaction).toHaveBeenCalledTimes(3))
  })
})
