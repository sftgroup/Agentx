// AgentX Gateway — 智能账户资金充足性判定单测（lib/aa-funding）
// 纯函数，覆盖 e4 提前告警（escrow 2× 余量 + requirePrice）与续订硬门槛（1× + 非零）两套口径。
import { describe, it, expect } from 'vitest'
import { checkFundingSufficiency, type AccountFunding } from '../src/lib/aa-funding'

const FEE = 2460000000000000n // 服务费 ≈0.00246 OXA
const PRICE = 1000000000000000n // 订阅费 0.001 OXA

const fund = (over: Partial<AccountFunding> = {}): AccountFunding => ({
  nativeWei: 0n,
  epDepositWei: 0n,
  escrowWei: 0n,
  ...over,
})

describe('checkFundingSufficiency — 统一资金判定', () => {
  it('默认（escrowMargin=1, 非 requirePrice）：escrow≥服务费 + gas 任一非零 → 充足', () => {
    const s = checkFundingSufficiency(fund({ escrowWei: FEE, epDepositWei: 1n }), PRICE, FEE)
    expect(s).toEqual([])
  })

  it('escrow 不足 → 报缺服务费', () => {
    const s = checkFundingSufficiency(fund({ escrowWei: FEE - 1n, epDepositWei: 1n }), PRICE, FEE)
    expect(s.join('')).toContain('escrow')
  })

  it('gas 两类全 0 → 报未注资', () => {
    const s = checkFundingSufficiency(fund({ escrowWei: FEE }), PRICE, FEE)
    expect(s.join('')).toContain('未注资')
  })

  it('e4 口径（escrowMargin=2n + requirePrice）：escrow∈[1×,2×) 也判不足（留充值缓冲）', () => {
    const s = checkFundingSufficiency(
      fund({ escrowWei: FEE, nativeWei: PRICE, epDepositWei: 1n }),
      PRICE,
      FEE,
      { escrowMargin: 2n, requirePrice: true },
    )
    expect(s.join('')).toContain('2×服务费')
  })

  it('e4 口径：native < 订阅价 → 报 native 不足', () => {
    const s = checkFundingSufficiency(
      fund({ escrowWei: FEE * 2n, nativeWei: PRICE - 1n, epDepositWei: 0n }),
      PRICE,
      FEE,
      { escrowMargin: 2n, requirePrice: true },
    )
    expect(s.join('')).toContain('native')
  })

  it('e4 口径：native+EP < 订阅价 → 报 native+gas 不足', () => {
    const s = checkFundingSufficiency(
      fund({ escrowWei: FEE * 2n, nativeWei: PRICE / 2n, epDepositWei: PRICE / 2n - 1n }),
      PRICE,
      FEE,
      { escrowMargin: 2n, requirePrice: true },
    )
    expect(s.join('')).toContain('native+gas')
  })

  it('e4 口径：资金全满足 → 充足', () => {
    const s = checkFundingSufficiency(
      fund({ escrowWei: FEE * 2n, nativeWei: PRICE, epDepositWei: 1n }),
      PRICE,
      FEE,
      { escrowMargin: 2n, requirePrice: true },
    )
    expect(s).toEqual([])
  })
})
