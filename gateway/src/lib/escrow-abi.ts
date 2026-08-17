// ---------------------------------------------------------------------------
// AgentX Gateway — InfraXEscrow ABI 常量（OE-5 金库托管，infraX projects/escrow）
// ---------------------------------------------------------------------------
// 金库合约由 infraX 仓库（sftgroup/infraX/projects/escrow）维护与部署，AgentX
// 只消费其地址 + 本 ABI（读链校验 / 对账）。不在此仓库复制合约源码，避免分叉。
// 事件与函数签名须与 IInfraXEscrow.sol 保持一致；若上游变更请同步。
// ---------------------------------------------------------------------------

/** InfraXEscrow.deposit() 事件（native deposit: token = address(0)）。 */
export const escrowDepositAbi = [
  'event Deposited(address indexed user, uint256 amount, address token)',
] as const

/** IInfraXEscrow.deposit() 函数面（MPC contractWrite / 前端充值调用）。 */
export const escrowDepositFunctionAbi = [
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'payable' as const,
    inputs: [],
    outputs: [],
  },
] as const

/** IInfraXEscrow 最小只读面（对账 / 链上余额锚查询）。 */
export const escrowReadAbi = [
  'function balanceOf(address user) external view returns (uint256)',
  'function erc20BalanceOf(address token, address user) external view returns (uint256)',
  'function owner() external view returns (address)',
] as const

/** IInfraXEscrow 完整事件面（审计 / 索引）。 */
export const escrowEventAbi = [
  'event Deposited(address indexed user, uint256 amount, address token)',
  'event Withdrawn(address indexed user, uint256 amount, address token)',
  'event Charged(address indexed user, uint256 amount, string ref)',
  'event Refunded(address indexed user, uint256 amount, string ref)',
] as const
