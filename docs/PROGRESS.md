# AgentX — 项目任务清单与进度

> Last updated: 2026-08-21 · 统一进度文档，替代过时的 `memory/AGENTX_PROGRESS.md`（后者已归档停用）
> 状态图例：✅ 完成 · ⏸ 代码完成待外部前提 / 未采用 · 🔧 进行中 · ⏳ 待办 · 🔵 技术债
> 2026-08-21 归档整理：已完成任务（P/R/T/T2 详细条目）已压缩为一行摘要，完整实施记录保留于 git 历史与「五、验证记录」

---

## 一、当前状态（未完成 / 待办）

- **当前**：可立即开发任务已清零。R17/R17.5/R17.6 支付引擎迁移、R18 B 端计费策略修订、R19 C/B 端商业化、T 通用支付能力（9/9）、T2 ERC-4337 会话对齐均已完成并生产部署；R19 成功套餐绑定 + B 端申请端到端闭环已验证（2026-08-21）。
- **待办（唯一外部前提）**：
  - **R4 法币订阅（Stripe）上线** —— 优先级：中 · 前提：Stripe 商户账号（`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`）
    - 来源：P2-2（⏸ 待两个环境变量）
    - 实施要点：配置两个环境变量 → 启用 Stripe Checkout / webhook（HMAC 验签）/ status API 链路 → 端到端验证（创建订阅 → webhook 回调 → status 查询）
    - 验收标准：订阅全链路可支付、webhook 幂等处理、状态正确流转
- **未采用项**：T2-s6（replace 两笔流程——与 AgentX 现有「disable 本地停用 + owner 签名 revoke 上链 + enable」手动两笔等价，无需切换）· T2-e3（self-pay fallback——REQ-1 `depositFor` 已落地，无需 fallback）

---

## 二、已完成任务归档摘要

### P0–P9 基础设施与平台能力（2026-08-06 全部完成）

| 里程碑 | 摘要 | 关键提交 |
|---|---|---|
| P0 基础设施与合约 | 6 核心合约双链部署（Sepolia + OxaChain L1）+ Gateway 双轨（DB 索引层 + 链直读层 `/api/v1/chain` 6 端点）+ MCP 读工具 + 独立仓库 | — |
| P1 SDK 0.8.x | 0.8.0 链上数据 / 0.8.1 容错解析 / 0.8.2 写签名 / 0.8.3 安装修复 + 文档（全部发布 npm） | — |
| P2 支付体系 | 渠道归因 §6（attribute/report）+ 设计文档 ✅；A1 法币订阅 ⏸ 待 Stripe 凭据（→R4）；A2 x402 ⏸ 待配置（→R5，已随 R19 启用） | — |
| P3 管理后台 | admin system/revenue/payments 三端点 + 前端 /admin 7 Tab | — |
| P4 生产部署运维 | 三服务 pm2（43.159.60.46）+ 数据清洗 + 套餐闭环 + /docs/sdk 实时渲染 + 代码清理 | — |
| P5 代码审查修复 | 硬编码/死代码/模块解耦/鉴权统一/ABI 共享/安全(.gitignore)/生产修复 8 项 | `90bddc0` |
| P6 对话链路统一 | SDK `ConversationClient` 单一实现（前端去手写 fetch+SSE），三服务 SDK 拉齐 ^0.8.5 | `5675346` |
| P7 平台商业化能力 | LLM key 双轨（平台 key 后台管理 + 用户自加 key 透传）、渠道分成结算（settle 台账）、B 端 /apply 申请页 + admin 审批 | `1fa03b8`/`45703cd`/`25a3914` |
| P8 对话多任务并行 | sessions+tasks 模型（状态机 queued→done/cancelled）+ 并发队列 + SSE 重放 + 取消 | `9129031`/`051b4a6`/`151e67b` |
| P9 集成方可配置禁用多 task | `allow_parallel_tasks` 能力位（套餐级 + 租户级覆盖）+ 403 `PARALLEL_TASKS_DISABLED` 门卫 + 前端自动降级单轮 | `8023e6e` |

### R1–R16 开发任务清单（2026-08-06 起，除 R4 外均完成）

| # | 任务 | 完成 | 摘要 |
|---|---|---|---|
| R1 | 前端聊天页接入 sessions+tasks | ✅ 08-06 `0f5c30d` | useAgentChat 双模式（并行 task 默认 + 单轮 SSE 回退），生产冒烟 7/7 |
| R2 | 集成测试补 task 并行链路 | ✅ 08-06 | scripts 集成测试 [6] 组，生产 28/28 |
| R3 | 平台兜底 LLM key 有效化 | ✅ 08-06 | 正式 DeepSeek 平台 key + conversation `LLM_ENDPOINT/MODEL`，非 BYOK 任务真实执行 |
| R4 | 法币订阅（Stripe）上线 | ⏸ 待外部前提 | 见「一、当前状态」 |
| R5 | x402 支付门卫启用 | ✅ 08-12（随 R19） | `X402_ENABLED` + `X402_PAY_TO` 生产启用，链上充值记账 + A2A 按次扣费实测 |
| R6 | 渠道归因启用 | ✅ 08-06 | 激活 oxa-partner（share_bps=125），冒烟 5/5 |
| R7 | 大文件拆分 | ✅ 08-06 | gateway admin/mcp + 前端 8 个 >760 行文件拆分，行为零变更 |
| R8 | SDK 主入口拆分子路径 | ✅ 08-06 `a17a68a` | react hooks → `@agentxv2/sdk/react`，主入口去 wagmi 依赖 |
| R9 | revenue ERC20 平台费展示 | ✅ 08-06 `2deee30` | 按 token 分组展示，零地址 native sentinel 排除 |
| R10 | 用户定时任务 | ✅ 08-06 `60c0744` | schedules 一次性/周期调度 + 单飞乐观锁 daemon + 用户页 + P9 gate 联动，冒烟 13/14 |
| R11 | 多调用方接入配置管理 | ✅ 08-06 | `integration_partners` + admin 5 端点 + 前端 Integrations Tab + 5 调用方 key 签发分发，冒烟 10/10 |
| R12 | MCP 对话与任务管理工具 | ✅ 08-06 `c224317` | 6 工具 33→38，双鉴权（api_key/access_token），冒烟 7/7 |
| R13 | 外部项目方自助申请 API Key | ✅ 08-06 | `developer/apply` + admin 审批自动建租户发 key（明文仅一次），冒烟 4/4 |
| R14 | B 端能力边界 | ✅ 08-06（08-08 修订） | `tenants.kind` 区分 + MCP 仅注册用户；修订=删除 partner 拦截，统一 P9 能力位 |
| R15 | B 端能力修订补完 | ✅ 08-08（08-11 部分修订→R18） | partner 任务强制 BYOK（后废除）+ 端用户订阅转发（X-End-User-Id）+ kind 统一 + sdk@0.10.1 |
| R16 | 审计闭环与文档补完 | ✅ 08-08 | createTask 签名修正 + BYOK/MCP 边界澄清 + 文档 + 新 key 签发 + sdk@0.10.2/0.10.3 |

### R17–R19 近期里程碑

| 里程碑 | 完成 | 摘要 |
|---|---|---|
| R17 支付引擎迁移发布流程 | ✅ 08-10 | sdk@0.11.0/0.11.1 发布、gateway 升级、旧包 deprecate、生产升级与冒烟、应用方通知、F2 首次跟随演练；完整 A–F 流程见 [payments-infrax-migration.md](payments-infrax-migration.md) §四（✅ 全部完成） |
| R17.5 引擎 0.1.2 剥离 a2a/period | ✅ 08-10 | exact 锁定 0.1.1 → 业务侧重建（`A2APeriodService` + 迁移 021 + `/payments/period/authorize`）→ sdk@0.11.2；issue #1 留痕 |
| R17.6 引擎 0.1.3 恢复 a2a/period | ✅ 08-10 | 迁移回模块委托（保留自托管 `createPeriodAuthorization`）+ 优雅 4xx 修复（`4648bb8`）+ sdk@0.11.3 |
| R18 B 端计费策略修订 | ✅ 08-11 `c69fdb7` | 放开 BYOK 强制；SSE done 事件 + 完成回调双通道按 token 精确计费（`billedTaskIds` 幂等）；生产部署 + 历史对齐 |
| R19 C/B 端分角色商业化 | ✅ 08-12 上线，08-21 成功绑定闭环 | B 端钱包自助接入 + B 端面板 + 自助购套餐（R19.1–R19.7）+ A2A 按次付费；**成功套餐绑定闭环已验证（2026-08-21）**；方案见 [billing-role-model-r19.md](billing-role-model-r19.md) |

### T / T2 通用能力（已并入归档）

| # | Task | 状态 | 提交 | 摘要 |
|---|---|---|---|---|
| t1 | 引擎升级 + 启用 escrow（`escrowDepositFunctionAbi` + info 暴露 escrowAddress） | ✅ | `2e95909` | 资金金库化托管 |
| t2 | 金库 escrow 生产部署（`.env` 注入 `X402_ESCROW_ADDRESS` + pm2 重启 + 公网验证） | ✅ | `6c98367` | escrow 模式生产生效 |
| t3 | x402 对账（ledger ↔ 链上资产，escrow 模式资金充足性检查 + 缺口告警） | ✅ | `3c2d608`→`6c98367` | 对账任务 [reconcile-x402.ts](../gateway/src/services/reconcile-x402.ts) |
| t4 | 前端 escrow 充值适配（调 `escrow.deposit()`，EOA 直转回退） | ✅ | `2e95909` | OnchainApprovalModal/X402WalletCard |
| t5 | A2A resume API（充值后恢复 `awaiting_payment` 任务；deduct + `a2a_pay_log` 幂等） | ✅ | `2e95909` | 迁移 024 |
| t6 | A2A SSE 事件推送（worker 状态实时推前端） | ✅ | `2e95909` | [a2a-events.ts](../gateway/src/services/a2a-events.ts) |
| t7 | 402 响应结构化 + payTo 优先 escrow | ✅ | `2e95909` | [agent-access-pay.ts](../gateway/src/services/agent-access-pay.ts) |
| t8 | Agent MPC 钱包自动代付（escrow deposit/EOA 直转 + worker 集成 + admin 路由） | ✅ | `2e95909` | [agent-payer.ts](../gateway/src/services/agent-payer.ts)、迁移 025 |
| t9 | SDK Agent 钱包 API（bindWallet/authorizePaymentSession/status/list/unbind） | ✅ | `2e95909` | [agent-wallet.ts](../sdk/src/payment/agent-wallet.ts) |

> T 生产验证：对账任务 `[x402-reconcile] ok mode=escrow ledger=… assets=… surplus=0.002 OXA`；`GET /api/v1/x402/info` 返回 `escrowAddress: 0x8Bf8Ffee86F1D4a160f0953Eb13BEDcBF99eaF9E`；质量门 tsc 0 + 82/82。

| T2 | Task | 状态 | 提交 | 摘要 |
|---|---|---|---|---|
| s1/s2 | SDK 对齐 `@0xinfrax/aa-sdk@^0.1.2` + 三段批量 revoke 单测 | ✅ | `f080086` | `buildDisableSessionUserOp` 三段 selectors 断言 |
| s3/s4 | 广播路径切 `/v1/session/revoke` + 单测逐字段断言 | ✅ | `c08dd2d` | 不再预置 signature，relay 注入 owner 签名 |
| s5 | 文档同步（revoke 端点两处更正） | ✅ | `c08dd2d` | aa-relay 文档 + 测试文档 L12 |
| s6 | replace 两笔流程对齐评估 | ⏸ 未采用 | — | 与手动两笔等价，无需切换 |
| e1 | 方案选型（主路径 = 一次 `depositFor`，REQ-1 已落地 impl `0x5ff86381…`） | ✅ | — | 12 期费用估算模型随 8625da6 落地 |
| e2 | 前端充值引导 UI（三类资金 + 估算 + `depositFor` 一键充值） | ✅ | `8625da6` | [AutoRenewCard.tsx](../frontend/components/user/AutoRenewCard.tsx) |
| e3 | self-pay fallback（session 白名单加 deposit） | ⏸ 不采用 | — | REQ-1 已落地，无需 fallback |
| e4 | 余额不足主动告警（`watchFunding` 资金巡检 + webhook 告警 + 节流） | ✅ | — | 迁移 028 `last_funding_alert_at` |
| e5 | escrow 计费对账（Charged/Refunded 事件 ↔ `renew_log` 净额比对） | ✅ | — | [reconcile-escrow.ts](../gateway/src/services/reconcile-escrow.ts)、迁移 029 |
| e6 | 【infraX 前置】REQ-1/2/3 交付与确认 | ✅ 已闭环 08-21 | — | `depositFor` 部署 + 资金总览 + 价目文档 §3.1 |
| e7 | 【REQ-3 落点】`/v1/userops` 广播切异步（`wait:false` → 202 + opHash 轮询） | ✅ 08-21 | — | [aa-relay.ts](../gateway/src/lib/aa-relay.ts) `submitUserOp`；revoke 保持 `wait:true` |

> T2 生产验证：2026-08-19 三段批量 revoke 全链路通过（tx success，nonce 4→5）；2026-08-20 gateway 96/96 + tsc 0。REQ-3（2026-08-21）：预扣构成无调整、退差语义统一、异步模式已支持、限额 perTx=1/perDay=10 OXA。

### P10 / R7 收尾（2026-08-06）

| 里程碑 | 完成 | 摘要 |
|---|---|---|
| P10 R6–R10 技术债与定时任务 | ✅ 08-06 | 渠道归因 / 大文件拆分 / SDK 子路径 / revenue ERC20 / 用户定时任务（与 R6–R10 对应） |
| R7 收尾 | ✅ 08-06 | hooks 去重（contract-address.ts）+ useAgentRegistry 刷新精简 + chat/a2a 页拆分 + Gateway URL 统一（lib/gateway.ts） |

---

## 三、生产环境

| 项 | 值 |
|----|-----|
| 服务器 | 43.159.60.46（SSH: ubuntu） |
| 服务 | agentx-gateway:3090 · agentx-conversation:8100 · agentx-frontend:3100（pm2） |
| 数据库 | agentx_gateway（索引层）+ agentx_conversation（对话，端口 5433） |
| SDK | `@agentxv2/sdk@0.11.7`（npm latest；gateway/conversation/frontend 三服务一致，依赖 `@0xinfrax/payments@0.1.4`） |
| 文档站点 | https://agentx.0xainet.top/docs/sdk（实时渲染 README） |
| 管理后台 | https://agentx.0xainet.top/admin（X-Admin-Key） |
| 测试钱包 | `0xd8e2cf…2812`（e2e / R19 绑定用，私钥 `~/agentx-prod-test-wallet.txt`，已被 gitignore 保护） |

## 四、链上合约地址

**OxaChain L1**（Chain ID 19505 · RPC `https://rpc-oxa.0xainet.top` · Explorer `https://explorer-oxa.0xainet.top`）
| 合约 | 地址 |
|------|------|
| IdentityRegistry | `0xbf5F9db266c8c97E3334466C88597Eb758AfE212` |
| SubscriptionManager v3 | `0x019AC9d945467478Dd371CDbD70cb2f325800E6B` |
| ReputationRegistry | `0x6a18C2664E1b42063860d864b6448b824d7B843F` |
| A2AProtocolRegistry v2 | `0x7F42a7dC4A0F3C107664C3750bE1B5B6fa6BEb86` |
| ConfigurationRegistry | `0x07280674ccc2898Fd038A9e3C22005CA83ffD2F8` |
| MultiEndpointRegistry | `0xB361d04F49000013FC131D3C59C41c8486C64f8c` |

**Sepolia**
| 合约 | 地址 |
|------|------|
| IdentityRegistry | `0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F` |
| SubscriptionManager v3 | `0xC15fE80b9d800abb72121F353a6ae6d6E9077E63` |
| ReputationRegistry | `0xeb6B410ea71b8d9dA0c96f6A91d35027CE143DC9` |
| A2AProtocolRegistry v2 | `0x309C7447d89f3087A9924BB686d88df020F7e9cB` |
| ConfigurationRegistry | `0x68DcE00e4C9077c94BC68016cD14B09557faEA6c` |
| MultiEndpointRegistry | `0xEB5e866f186d4B73F97aa0d70B86f2C6e2e21Cb7` |

---

## 五、验证记录（关键实测）

| 验证项 | 结果 |
|--------|------|
| SDK 链上创建套餐（0.8.2 修复后） | plan 41 创建成功，读回 period=month；39/40/41 经 PlanCreated 事件同步进 Gateway DB |
| 干净安装 0.8.3 | ESM+CJS 加载、getPlan(41)、totalAgents()=62 全部正常 |
| x402 paywall | 返回 HTTP 402 + `x-price/x-pay-to/x-network` 头 |
| P7 全链路集成回归（生产） | 15/15 通过：三服务 health / 链上读 / MCP 工具 / 对话 SSE 直连与经 gateway |
| P7 渠道结算链路 smoke（生产） | 渠道创建 → 插入归因（1 OXA）→ report（channelShare=1e18×125/10000 正确）→ settle（写 `channel_settlements` 台账 + attribution `settled=true`）→ 有归因渠道删除自动转停用，全通过；测试数据已清理 |
| P7 B 端申请链路 smoke（生产） | 公开 `/channel/apply` 提交 → admin 列表可见 → 审批通过自动创建 channel（含 channelId 解析）→ 删除清理，全通过 |
| 渠道归因 | 归因→幂等（重复归因 false）→ report 分成计算正确（1 ETH × 125bps = 0.0125 ETH） |
| period 数据清洗 | 生产 38 个套餐全部为标准值；130s 同步周期后无回写 |
| 管理后台 | system/revenue/payments 200，日志输出 ip/query/耗时/结果 |
| 代码审查修复回归（90bddc0） | gateway/frontend typecheck+build 全绿；MCP 迁移后 identity_total_count=62 / subscription_plans / identity_list_all(过滤) / subscription_my_list=[1,2,3] 正常；skills review 无 key→401、带 key→404(业务语义)；生产三服务 online，frontend 200 |
| 对话链路统一回归（5675346） | 三服务 SDK 均为 0.8.5；JWT（现场签名）→ gateway `/api/v1/agent/runs` → conversation-service SSE 流式事件正常返回（text/done）；直连 `/runs`（X-Internal-Token）SSE 同样正常。LLM 层因生产未配置平台 key 报 `Missing or invalid Authorization header`——为既有凭据配置状态，与链路改造无关 |
| P8 多任务并行冒烟（9129031） | 生产 6/6 PASS：POST /sessions 201 → POST /sessions/:id/tasks 立即返回 taskId → 轮询终态（done）→ GET /sessions/:id/tasks 列表 → GET /tasks/:id/events 返回持久化 `data:` 事件 → DELETE /tasks/:id 200+状态字段。测试数据已清理 |
| R6 渠道归因启用（生产） | 冒烟 5/5 PASS：归因幂等 / report 分成计算正确（share = amount_paid × share_bps / 10000）/ settle 台账 |
| R7 大文件拆分回归 | gateway admin 冒烟 10/10；mcp curl tools/list 正常（38 工具）；前端 typecheck 零错误 + build 25 页全生成；生产 home/admin/dashboard 全部 200 |
| R8 SDK 子路径 | `dist/index.d.mts` 无 `useAgentRunner`、`dist/react` 有；前端导入 `@agentxv2/sdk/react` 后 typecheck + build 全绿 |
| R9 revenue ERC20 | 生产 revenue 返回正确；`pay_token=0x0`（native sentinel）排除出 ERC20 分组 |
| R10 定时任务冒烟 | 生产 13/14 PASS（创建/列表/启停/删除/一次性触发/周期触发/P9 gate failed 记录）；cleanup 后 0 残留 |
| C 端用户旅程 E2E（注入钱包，2026-08-20） | 生产 `https://agentx.0xainet.top` 全链路 **39 PASS / 0 FAIL / 1 SKIP**（J1-H/J1-E1/J2/J4/J8/J9/J10 + 无注入 probe 对照）；J9 懒认证验证通过；详见 [test-cases-consumer-journeys.md](test-cases-consumer-journeys.md) 附录。期间修复 2 个真实缺陷（见下） |
| 跨秒首次登录 401（`23881be`） | 服务端用权威 `challenge.timestamp` 重建验签 message（不再信任客户端 timestamp）；前端传挑战返回的 timestamp。J1-H challenge→sign→verify 200 复验 |
| J9 订阅解码错位（`15d218f`） | `getSubscriptionDetail`/`getPlan` 链上为嵌套结构（前导 offset + tuple），ABI 误写平铺 outputs → viem 扁平解码越界。修复 = 单具名 tuple + `useSubscription.ts` 数组解构改对象访问；本地 eth_call 实证 sub 10/27 与 plan 1/5 解码正常；J9 console=0 |
| UI 层逐页深查（2026-08-21） | C110–C274 + /apply 全量 UI 审计入 e2e 套件：**44 PASS / 0 FAIL / 1 SKIP**（SKIP=聊天 UI 需链上订阅环境）；详见 [test-cases-consumer-journeys.md](test-cases-consumer-journeys.md)「UI 层深查结果」 |
| B 端申请端到端闭环（2026-08-21） | 公开 `/channel/apply` 建申请 → admin `/applications/:id/decide` 审批通过自动建 active channel（share_bps=125）→ C211 归因成功 / C214 幂等 / C215 链上凭据落库 / C213 停用拒绝 → 测试渠道已停用清理，全通过 |
| R19 成功套餐绑定（2026-08-21） | `0xd8e2cf…` 钱包 EIP-191 登录 → 查 pro plan → 链上转账补足 ~29 OXA → `purpose=tenant-plan` 购买 → plan=pro 绑定成功 + `quotaDaily` 生效（拒绝路径此前已验证） |
| /apply 页 UI 回归（2026-08-21） | `/apply` 已入 e2e 套件（ui-audit.cjs）：hero 渲染 / 收益 3 卡片 / 8 表单字段 / C217 空表单 Submit 禁用 + 必填补齐启用 / 0 JS 错误；本地实跑 3 PASS |
| e2e workflow 首次真实触发（2026-08-21） | `workflow_dispatch` 触发 run 32420199995（commit 36dacbd）全绿：deps/chromium 安装 → 订阅 fixture（幂等未重复付费）→ Chat E2E → UI audit（C117–C274 含 /apply）→ 截图上传，结论 **success** |

---

## 归档说明

- 旧 `memory/AGENTX_PROGRESS.md` 已停用（内容停在 2026-07-14），历史记录保留于 git 历史，不再维护
- 2026-08-20：独立 tasklist 统一并入本文件 —— `docs/tasklist-agentx-payment.md`（t1~t9）→「### T」章节；`docs/tasklist-aa-session-alignment.md`（s1~s6 + e1~e6）→「### T2」章节；两独立文件已删除
- 2026-08-21：已完成任务归档整理——P0–P10 / R1–R19 / T / T2 详细条目压缩为「二、已完成任务归档摘要」一行摘要，完整实施记录保留于 git 历史；待办仅剩 R4（外部前提）
