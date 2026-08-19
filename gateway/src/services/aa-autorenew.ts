// ---------------------------------------------------------------------------
// AgentX Gateway — ERC-4337 Auto-Renew（t9）聚合入口
// ---------------------------------------------------------------------------
// 此文件为兼容桶（backward-compatible barrel），仅 re-export 拆分后的模块，
// 不承载任何实现逻辑，供路由（routes/auto-renew）与 daemon 引导（index.ts）沿用
// 既有导入路径，避免破坏调用方。新增功能请直接放入对应子模块：
//   - lib/aa-relay       relay 客户端 / AA SDK 基础设施（链配置、fee、policy 编解码）
//   - services/aa-account  智能账户链上操作（部署 / 资金 / 残留检测 / session 解析）
//   - services/aa-session  会话生命周期（enable / confirm / disable / revoke / list）
//   - services/aa-renewal  续订 cron + 失败护栏 + daemon（scan / 资金巡检 / 恢复）
// ---------------------------------------------------------------------------

// 基础设施（enablement 守卫 + AA 链配置）
export { isAutoRenewEnabled, getAaChainConfig } from '../lib/aa-relay'
export type { AccountFunding } from '../lib/aa-funding'

// 智能账户链上操作
export { ensureAccountDeployed, getAccountFunding, hasOnChainSession, resolveExistingSessionId } from './aa-account'

// 会话生命周期（用户操作）
export {
  createAutoRenew,
  confirmAutoRenew,
  disableAutoRenew,
  revokeAutoRenew,
  listAutoRenew,
} from './aa-session'
export type {
  CreateAutoRenewParams,
  ConfirmAutoRenewParams,
  DisableAutoRenewParams,
} from './aa-session'

// 续订 cron + 护栏 + daemon
export {
  resolveCurrentSubscription,
  resumeAutoRenew,
  watchFunding,
  runAutoRenewScan,
  autoRenewStats,
  getAutoRenewStats,
  startAutoRenewDaemon,
  stopAutoRenewDaemon,
} from './aa-renewal'
