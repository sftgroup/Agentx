# AgentX 侧 Tasklist — 通用支付能力接入（t1~t9）

> 归档日期：2026-08-18
> 归属：AgentX 侧任务（对应 InfraX 侧需求 AX-1~13，见 [infrax-requirements-2026-08-17.md](./infrax-requirements-2026-08-17.md)）
> 状态：**9/9 全部完成，生产生效**

---

## 1. 背景

AgentX 基于 InfraX 通用支付能力落地三项优化：**资金金库化托管（escrow）**、**A2A 编排待付款闭环**、**Agent 自主付费（MPC 钱包 + Session Key）**。

协同模式：InfraX 按需求清单发版 → AgentX 通过 `npm` bump 版本消费（`@0xinfrax/payments@0.1.4`、`@0xinfrax/mpc-sdk@0.3.0`、`@0xinfrax/session-key-core@0.2.2`、`@0xinfrax/session-key-evm@0.1.3`），不做代码复制。

---

## 2. Task 明细与完成状态

| # | Task | 状态 | 提交 | 关键文件 |
|---|---|---|---|---|
| **t1** | 引擎升级 + 启用 escrow：bump `@0xinfrax/payments` 0.1.4；`paymentsService` escrow 配置启用；新增 `escrowDepositFunctionAbi`；`/api/v1/x402/info` 与 `/api/v1/payments/info` 暴露 `escrowAddress` | ✅ | [2e95909](https://github.com/sftgroup/Agentx/commit/2e95909) | [payments.ts](../gateway/src/services/payments.ts)、[escrow-abi.ts](../gateway/src/lib/escrow-abi.ts)、[routes/x402.ts](../gateway/src/routes/x402.ts)、[routes/payments.ts](../gateway/src/routes/payments.ts) |
| **t2** | 金库 escrow 生产部署：`npm` bump、`.env` 注入 `X402_ESCROW_ADDRESS`、build + `pm2 restart agentx-gateway`、公网验证 | ✅ | [6c98367](https://github.com/sftgroup/Agentx/commit/6c98367)（含部署） | 生产 `gateway/.env`、pm2 进程 |
| **t3** | x402 对账：ledger（`x402_balances`）↔ 链上资产对账任务。最终模型 = **资金充足性检查**（escrow 模式：Σ `escrow.balanceOf(holder)` + 收款 EOA 余额；`deficit/surplus`，资产 < ledger − 容差 → 缺口告警） | ✅ | [3c2d608](https://github.com/sftgroup/Agentx/commit/3c2d608) → [6c98367](https://github.com/sftgroup/Agentx/commit/6c98367)（重写） | [reconcile-x402.ts](../gateway/src/services/reconcile-x402.ts)、[index.ts](../gateway/src/index.ts)（任务注册） |
| **t4** | 前端 escrow 充值适配：从 `/api/v1/x402/info` 读 `escrowAddress`；充值/付款路径改为调 `escrow.deposit()`（emit `Deposited` 入账），EOA 直转仅作回退 | ✅ | [2e95909](https://github.com/sftgroup/Agentx/commit/2e95909) | [OnchainApprovalModal.tsx](../frontend/components/a2a/OnchainApprovalModal.tsx)、[X402WalletCard.tsx](../frontend/components/billing/X402WalletCard.tsx)、[useTenantPlanPurchase.ts](../frontend/hooks/useTenantPlanPurchase.ts) |
| **t5** | A2A resume API：`POST /api/v1/a2a/tasks/:id/resume`（充值后恢复 `awaiting_payment` 任务；payer/Admin 鉴权；deduct + `a2a_pay_log` 幂等）；`a2a_task_results.status=4` 状态机 | ✅ | [2e95909](https://github.com/sftgroup/Agentx/commit/2e95909) | [routes/a2a.ts](../gateway/src/routes/a2a.ts)、[024_a2a_task_awaiting_payment.sql](../gateway/db/migrations/024_a2a_task_awaiting_payment.sql) |
| **t6** | A2A SSE 事件推送：worker 状态变更实时推送到前端（emit/subscribe/get） | ✅ | [2e95909](https://github.com/sftgroup/Agentx/commit/2e95909) | [a2a-events.ts](../gateway/src/services/a2a-events.ts) |
| **t7** | 402 响应结构化 + payTo 优先 escrow：`canAccessAgentOrPay` 返回 `{priceWei, payTo, resource, resumeRef, mode}`；`payTo` 取 `x402.escrowAddress()` 优先于 `X402_PAY_TO` | ✅ | [2e95909](https://github.com/sftgroup/Agentx/commit/2e95909) | [agent-access-pay.ts](../gateway/src/services/agent-access-pay.ts) |
| **t8** | Agent MPC 钱包自动代付：`tryAutoPayForDelegation`（escrow 模式 `contractWrite deposit` / EOA 直转）；A2A worker 集成（代付后重试 access）；admin 管理路由；`agent_payer_wallets` 表 | ✅ | [2e95909](https://github.com/sftgroup/Agentx/commit/2e95909) | [agent-payer.ts](../gateway/src/services/agent-payer.ts)、[a2a-worker.ts](../gateway/src/services/a2a-worker.ts)、[routes/admin.ts](../gateway/src/routes/admin.ts)、[025_agent_payer_wallets.sql](../gateway/db/migrations/025_agent_payer_wallets.sql) |
| **t9** | SDK Agent 钱包 API：`bindWallet` / `authorizePaymentSession` / `status` / `list` / `unbind` | ✅ | [2e95909](https://github.com/sftgroup/Agentx/commit/2e95909) | [agent-wallet.ts](../sdk/src/payment/agent-wallet.ts)、[payment/index.ts](../sdk/src/payment/index.ts) |

---

## 3. 生产验证记录

- **对账任务**（t2/t3 收尾）：生产日志
  ```
  [x402-reconcile] ok mode=escrow ledger=30598000000000000000 assets=30600000000000000000 holders=1 surplus=2000000000000000
  ```
  escrow 模式生效，链上资产 ≥ ledger（盈余 0.002 OXA 为 gas 残留，正常）。
- **公网能力暴露**：`GET https://agentx.0xainet.top/api/v1/x402/info` 返回
  `escrowAddress: 0x8Bf8Ffee86F1D4a160f0953Eb13BEDcBF99eaF9E`（oxachain 19505）。
- **质量门**：gateway `tsc --noEmit` 零错误；`npm test` 82/82 通过（含 [agent-access-pay.test.ts](../gateway/test/agent-access-pay.test.ts)）。
- **清理**：生产 `.env` 移除 `X402_ESCROW_LEGACY_WEI`（新对账模型已通过收款 EOA 余额兜底 legacy 充值，变量冗余）；删除 `.env.bak-escrow-20260817` 备份。

---

## 4. 关联提交

| 提交 | 说明 |
|---|---|
| [2e95909](https://github.com/sftgroup/Agentx/commit/2e95909) | feat: A2A 按次付费闭环 — 金库 escrow + awaiting_payment 状态机 + agent-payer 自动代付（t1/t4/t5/t6/t7/t8/t9 主体） |
| [3c2d608](https://github.com/sftgroup/Agentx/commit/3c2d608) | fix(reconcile): x402 对账支持 escrow 迁移基准（t3 中间态，后被重写取代） |
| [6c98367](https://github.com/sftgroup/Agentx/commit/6c98367) | fix(reconcile): x402 对账改为资金充足性检查模型（t3 最终态 + t2 部署） |

---

## 5. 备注

- 本 tasklist 为对话中定义的 9-task 拆分归档；t2/t3/t5/t6/t8/t9 有代码注释/文件级明确对应，t1/t4/t7 按改动分组划分。
- 依赖的 InfraX 侧需求（AX-1~13：escrow 透传 / ERC20 deposit / 审计日志 / 402 结构化 / a2aSettle balance / session-key 代付模板 / MPC 2-of-3）已全部交付并发版，见 InfraX 发布公告。
