// ---------------------------------------------------------------------------
// AgentX Gateway — 智能账户资金充足性判定（e4 提前告警 / e5 续订护栏共用）
// ---------------------------------------------------------------------------
// 判定口径（实证见 docs/infrax-bundler-restore-handoff.md §5）：
//   native 付订阅费、EntryPoint deposit 付 UserOp gas、escrow 付 relay A-10 服务费。
// 纯函数，不触碰链上/RPC，便于单测与多模块复用；链上读数由调用方传入。
// ---------------------------------------------------------------------------

export interface AccountFunding {
  nativeWei: bigint
  epDepositWei: bigint
  escrowWei: bigint
}

export interface FundingCheckOptions {
  /** escrow 服务费余量系数：e4 提前告警用 2（给用户留充值缓冲），e5 续订实际门槛用 1 */
  escrowMargin?: bigint
  /** 是否要求 native 余额 ≥ 订阅价（e4 告警口径 true；续订护栏历史口径仅要求非零） */
  requirePrice?: boolean
}

/**
 * 判定三类资金是否充足，返回不足项文案列表（空数组 = 充足）。
 * 口径统一：escrow ≥ margin×服务费；requirePrice 时 native ≥ 订阅价 且 native+EP ≥ 订阅价，
 * 否则仅要求 EP deposit / native 至少一项非零（满足 UserOp gas）。
 */
export function checkFundingSufficiency(
  funding: AccountFunding,
  priceWei: bigint,
  serviceFeeWei: bigint,
  opts: FundingCheckOptions = {},
): string[] {
  const margin = opts.escrowMargin ?? 1n
  const shortages: string[] = []
  const feeNeeded = serviceFeeWei * margin
  if (funding.escrowWei < feeNeeded) {
    shortages.push(`escrow ${funding.escrowWei} wei < ${margin}×服务费 ${feeNeeded} wei`)
  }
  if (opts.requirePrice) {
    if (priceWei > 0n && funding.nativeWei < priceWei) {
      shortages.push(`native ${funding.nativeWei} wei < 订阅费 ${priceWei} wei`)
    }
    if (funding.nativeWei + funding.epDepositWei < priceWei) {
      shortages.push(`native+gas存款 ${funding.nativeWei + funding.epDepositWei} wei < 订阅费 ${priceWei} wei`)
    }
  } else if (funding.epDepositWei <= 0n && funding.nativeWei <= 0n) {
    shortages.push('智能账户未注资（EP deposit 与 native 均为 0）')
  }
  return shortages
}
