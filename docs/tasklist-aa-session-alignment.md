# AgentX 侧 Tasklist — ERC-4337 会话接口对齐（aa-relay 2026-08-20 契约）

> 归档日期：2026-08-20
> 归属：AgentX 侧任务（对应 InfraX aa-relay 会话接口更新，契约见 infraX `SERVICE_API_REFERENCE.md §7.7`）
> 状态图例：✅ 完成 · ⏸ 未采用 / 外部依赖 · ⏳ 待办
> 总体状态：**A 部分（进一步对齐）6/6 完成** · B 部分（充值 escrow 遗留待办）已拆分待办

---

## 1. 背景

infraX 2026-08-20 更新 aa-relay 会话接口契约：

- **revoke 现为三段批量**（`disableSession@module + uninstallModule + invalidateNonce(cur+1)`，链上真正撤销；已部署 Session Module `onUninstall` 为空实现，两段版不删旧 session 记录 → 旧 session key 残留可验证）；
- **replace 为两笔流程**（① disable 旧 session → ② enable 新 session；`POST /v1/session/replace` 返回 `disableDraft`，`POST /v1/session/replace/submit` 广播）；
- **SDK 发布** `@0xinfrax/aa-sdk@0.1.2`（新导出 `buildDisableSessionUserOp` / `encodeDisableSessionBatch` / `verifyDisableSignature`）；
- relay 生产 `rpc-gw.0xainet.top/aa-relay/` 上线 `POST /v1/session/revoke` / `/v1/session/replace` / `replace/submit`，统一提交流程 `submitSignedOp`（owner 派生校验 + ECDSA 签名校验 + userOpHash 一致性 + A-10 escrow 计费 + 广播结算）。

AgentX 自动续订（L12 session 轮换）据此对齐。

---

## 2. A 部分：进一步对齐 — Task 明细与完成状态

| # | Task | 状态 | 提交 | 关键文件 |
|---|---|---|---|---|
| **s1** | SDK 对齐：bump `@0xinfrax/aa-sdk` ^0.1.1 → ^0.1.2；`buildDisableUserOpDraft` 改用 `aa.buildDisableSessionUserOp`（gas 估算后传入以重算 userOpHash 再交 owner 签名），删除自建三段批量编码/常量/导入 | ✅ | [f080086](https://github.com/sftgroup/Agentx/commit/f080086) | [aa-autorenew.ts](../gateway/src/services/aa-autorenew.ts)、[package.json](../gateway/package.json) |
| **s2** | 单测更新：mock `buildDisableSessionUserOp`，断言广播 `op.callData` 含三段 selectors（`disableSession 0xf42c859d` / `uninstall 0xa71763a8` / `invalidateNonce 0x1f1b92e3`）+ SDK 以 account/sessionId/gas 调用；14/14 通过 | ✅ | [f080086](https://github.com/sftgroup/Agentx/commit/f080086) | [aa-autorenew.test.ts](../gateway/test/aa-autorenew.test.ts) |
| **s3** | 广播路径对齐：`revokeAutoRenew` 撤销上链由 `POST /v1/userops` 切换为 `POST /v1/session/revoke`（`submitSignedOp` 统一流程），请求体 `chain/account/owner/sessionId/userOpHash/signature/op/wait:true`，op 不再预置 signature（relay 侧注入 owner 签名） | ✅ | [c08dd2d](https://github.com/sftgroup/Agentx/commit/c08dd2d) | [aa-autorenew.ts](../gateway/src/services/aa-autorenew.ts) |
| **s4** | 单测断言新端点与请求体（URL 含 `/v1/session/revoke`，逐字段校验 `account/owner/sessionId/userOpHash/signature/wait`） | ✅ | [c08dd2d](https://github.com/sftgroup/Agentx/commit/c08dd2d) | [aa-autorenew.test.ts](../gateway/test/aa-autorenew.test.ts) |
| **s5** | 文档同步：`aa-relay-session-rollover-fix-infrax.md`（2 处 `/v1/userops` → `/v1/session/revoke`）、`test-cases-aa-auto-renew.md`（L12 段补广播路径对齐说明） | ✅ | [c08dd2d](https://github.com/sftgroup/Agentx/commit/c08dd2d) | [aa-relay-session-rollover-fix-infrax.md](./aa-relay-session-rollover-fix-infrax.md)、[test-cases-aa-auto-renew.md](./test-cases-aa-auto-renew.md) |
| **s6** | replace 两笔流程对齐评估（disable 旧 + enable 新） | ⏸ 未采用 | — | **决策**：AgentX 现有「disable 本地停用 + owner 签名 revoke 上链 + enable」手动两笔流程与 replace 端点功能等价，无需切换。保留为可选后续（若未来复用 relay session store 轮换能力再评估） |

### A 部分生产验证

- **2026-08-19（f080086 轮）**：`aa-l12-heal-verify.mjs` 全链路通过 —— clean→confirm→残留检测→三段批量 revoke（tx `0x044412fe…` success，gasUsed 176680，nonce 4→5）→clean→confirm；残留已清理（`aa_auto_renew` 0 行、链上 `isModuleInstalled=false`、nonce=6）。
- **2026-08-20（c08dd2d 轮）**：gateway 全量 **96/96** 测试通过；`tsc --noEmit` 0 错误；`npm run build` 通过。

### A 部分关联提交

| 提交 | 说明 |
|---|---|
| [f080086](https://github.com/sftgroup/Agentx/commit/f080086) | feat(aa): revoke 对齐 infraX 三段批量契约 —— 改用 `@0xinfrax/aa-sdk@0.1.2` `buildDisableSessionUserOp`（s1/s2） |
| [c08dd2d](https://github.com/sftgroup/Agentx/commit/c08dd2d) | feat(aa): revoke 广播对齐 infraX `/v1/session/revoke` 端点 —— `submitSignedOp` 统一流程（s3/s4/s5） |

---

## 3. B 部分：遗留待办拆分 — 智能账户充值 escrow 用户路径（relay A-10 计费依赖）

> 来源：aa-relay A-10 计费（escrow 模式）——每次 UserOp 向 `op.sender`（智能账户）预扣固定费 + 预估 gas；余额取自链上 `InfraXEscrow(0x8bf8ffee…).balanceOf(sender)`，`deposit()` 只记 `msg.sender` → **用户如何给智能账户充值 escrow 是当前唯一产品闭环缺口**。
> 需求文档：[aa-auto-renew-funding-requirements-infrax.md](./aa-auto-renew-funding-requirements-infrax.md)（REQ-1~5 + §4 AgentX 侧自理）。

**资金模型（AgentX 链上实证）**：订阅费 = 子账户 native 余额（execute value）；UserOp gas = 子账户 EntryPoint deposit；relay 服务费（约 0.00246 OXA/次）= 子账户在 InfraXEscrow 的 `_balances[account]`。三类资金按账户独立记账，EOA 与子账户互不共用。

### 拆分后任务

| # | Task | 状态 | 依赖 / 备注 |
|---|---|---|---|
| **e1** | 方案选型与产品路径设计：对比 REQ-1（infraX 合约升级 `depositFor(address user)`，EOA 单笔 tx 代子账户入账）vs REQ-4（AgentX 自理 self-pay fallback，session 白名单加 `escrow.deposit()`），确定主/备方案、UX 流程与一年续订费用估算模型 | ⏳ 待办 | 主方案依赖 infraX REQ-1 排期；fallback 不依赖合约升级 |
| **e2** | 前端充值引导 UI：开启自动续订时展示智能账户三类资金（native / EP deposit / escrow），按估算费用引导用户一步充值（REQ-1 落地后走 `depositFor`；否则三步合一 fallback） | ⏳ 待办 | 依赖 e1 选型；涉及 [AutoRenewCard.tsx](../frontend/components/user/AutoRenewCard.tsx)、[lib/auto-renew.ts](../frontend/lib/auto-renew.ts) |
| **e3** | 【fallback】自动续订 session 白名单增加 `escrow.deposit()` 条目（valueLimit=充值上限），使子账户可用 session key 自付充值 | ⏳ 待办 | 仅 REQ-1 未落地前启用；REQ-4（funding-requirements §3） |
| **e4** | 余额不足主动告警：gateway 在 escrow 不足时提前发送站内/邮件通知（现状 `renewOne` ⑦ 已有 escrow 预检 + 失败护栏自动暂停，缺「提前主动通知」与恢复引导） | ⏳ 待办 | 复用 [aa-autorenew.ts](../gateway/src/services/aa-autorenew.ts) `sendAlert`/`pauseAutoRenew` 机制 |
| **e5** | 计费对账：escrow `Charged/Refunded` 事件与本地 `renew_log` 对账任务 | ⏳ 待办 | 参考 [reconcile-x402.ts](../gateway/src/services/reconcile-x402.ts) 模式 |
| **e6** | 【外部依赖，非 AgentX 自理】infraX 侧前置：REQ-1 `InfraXEscrow.depositFor(address user)` 合约升级 + REQ-2 relay 资金总览端点 / 402 `topupHint` 文案修正 + REQ-3 价目文档 | ⏸ 外部依赖 | 见 funding-requirements §3，需 infraX 排期 |

### B 部分验收标准（对齐 funding-requirements §5）

1. EOA 单笔 tx 调 `depositFor(子账户)` 入账成功，`balanceOf(子账户)` 即时可见（或 fallback 三步路径可充）；
2. 子账户 escrow 余额充足时，relay 广播 UserOp 不再 402；
3. 前端可引导用户完成智能账户充值并展示三类资金视图；
4. 余额不足时用户收到提前通知，补齐后自动恢复续订。

---

## 4. 备注

- A 部分不涉及链上合约/relay 部署，纯 AgentX 侧代码 + 文档 + 测试对齐，已推送 `origin/main`（c08dd2d）。
- B 部分核心是「产品侧智能账户充值 escrow 用户路径」，e1 为总入口；e2/e3/e4/e5 为实施拆解，e6 为 infraX 侧外部前置。
- 与既有文档关系：[test-cases-aa-auto-renew.md](./test-cases-aa-auto-renew.md)（测试用例与 L12 状态）、[aa-relay-session-rollover-fix-infrax.md](./aa-relay-session-rollover-fix-infrax.md)（session 轮换修复契约）、[aa-auto-renew-funding-requirements-infrax.md](./aa-auto-renew-funding-requirements-infrax.md)（充值 escrow 需求）。
