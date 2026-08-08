# AgentX Changelog

> 记录 Conversation Service 与 SDK 近期的重要变更。
> SDK 版本对应 npm 包 `@agentxv2/sdk`；Conversation Service 无独立版本号，跟随主仓库提交。

---

## 2026-08-08 — 文档：对话中引入自己的 MCP（Skill 执行模型）

新增 [publish-subscribe-pay.md §1.6](docs/publish-subscribe-pay.md)「Skill 执行模型：如何在对话中引入你自己的 MCP」：

- 明确「对话工具=发布时声明的 skills（私有加密上链），注册点=发布，无 MCP server 注册表」
- Skill `execution.type` 三种执行模型：`open`（SDK 本地）/ `mcp`（远程 MCP server，endpoint 默认 AgentX 平台 `/mcp`）/ `a2a`（委托子 Agent）
- **路径 A（发布者）**：skill 配 `execution.type='mcp'` + 自定义 MCP server 地址示例；安全模型=AgentX 不代理你的 MCP 鉴权，server 自行验证调用者链上订阅
- **路径 B（B 端应用）**：Conversation Service `loadInline` 直接注入自定义 prompt + MCP/HTTP 工具（integration-callers.md MCP 段已加指针）
- 边界：最终用户不能给别人的 Agent 临时加工具，工具由发布者决定
- （补充 2026-08-08 确认结论：对话工具来源三途径——① Agent 发布时声明（预声明）② 对话请求 inline 注入（运行时，无注册校验）③ 平台编排工具自动注入；`POST /api/v1/skills` 为 skill 模板市场，**非**对话运行注册表）
- （补充 2026-08-08 §1.7：SDK 连接机制——「我们的 SDK + 我们签发的 `agentx_` Key」= 连接我们的 AgentX 市场（Key 仅我们的 Gateway 可校验）；订阅付费分账——chain 进合约 escrow（平台 2.5% + 发布者 97.5%）/ fiat 走平台统一 Stripe + 渠道 share_bps / x402 收平台收款钱包；平台=托管+抽成+台账，大头归发布者）

无代码变更。

---

## 2026-08-08 — 应用侧建议项文档化（audit 收尾）

AgentX 平台侧已全部闭环。剩余为**应用侧（B 端调用方）实践建议**，已在 `integration-callers.md` 与交付包 `agentx-callers.env` 中显式化：

1. **显式配置 `AGENTX_CONVERSATION_LLM_KEY`**：每个调用方建议配置自己的 LLM Key 并传入 SDK 构造参数 `llmApiKey`——并行任务自动带 BYOK（partner 任务强制，未带 `400 LLM_KEY_REQUIRED`），避免每次请求重复传参、也防止误用平台兜底 Key
2. **`createSession` 补传 `agentId`**：将会话绑定到目标 Agent，任务上下文更完整（SDK 已支持 `ConversationCreateSessionParams.agentId`，示例已带）

> 注：这两项属 B 端应用部署/代码实践，AgentX 仓库无代码改动；`agentx-callers.env` 为本地交付物（含真实 key，不入库），已同步新增 pocketx-wallet / infrax 两个调用方与 SDK ≥0.10.1 示例。

---

## 2026-08-08 — 边界澄清：BYOK 适用范围 + B 端 MCP 路径（文档）

审计确认后更新文档，明确两条边界（决策维持现状，无代码变更）：

1. **BYOK 守卫适用范围**：只约束 partner 经 **REST / SDK 创建的并行任务**（`POST /sessions/:id/tasks`）；平台托管后台路径（用户定时任务 schedule、编排触发）不经过该守卫，按租户存储 `tenantKeyId` 或平台兜底执行——需走自己的 Key 时配置存储式 `tenantKeyId` 即可
2. **B 端用户与平台 MCP**：平台 MCP 对话/任务工具仅接受注册用户 JWT（R14 收紧不变）；B 端（含 aihunter）最终用户的对话/任务由 **REST + `agentx_` Key + `X-End-User-Id: 0x<钱包>`** 完整覆盖，无需走 MCP；「B 端用户 → AgentX JWT」接入 MCP 属未来独立设计项

- 文档：`docs/integration-callers.md`（§6 适用范围 + §7.5 B 端路径）、`sdk/README.md`（英文 note 同步）

---

## 2026-08-08 — 文档修正：`createTask` 参数签名与字段（B 端反馈）

- **integration-callers.md §6 / §7**：SDK 示例 `createTask(session.sessionId, { input: '你好' })` → 改为 `createTask({ sessionId: session.sessionId, agentId: 1, message: '你好' })`；HTTP 参考 `body: { input }` → `body: { agentId, message }`（或 inline `{ message, prompt/skills }`）
- 与 SDK 0.10.1 签名（`ConversationCreateTaskParams`）及 gateway 校验一致：`message` 必填，`agentId` 或 inline `prompt/skills` 必填
- 纯文档修正，无代码 / API 变更

---

## 2026-08-08 — 发布 sdk@0.10.1（per-request endUserId + B 端能力澄清）

- **`@agentxv2/sdk@0.10.1` 已发布 npm**（patch，非破坏性增量）：
  - `ConversationCreateTaskParams.endUserId?` / `ConversationChatParams.endUserId?` — per-request 端用户钱包透传（B 端订阅转发：`0x` 钱包按该钱包订阅授权，`createSession` 原本已支持）
  - 文档：B 端 key 与用户 JWT 差异对照（UPGRADE.md）、MCP 边界说明（README）
- **仓库级加固（未发版，随下次发版带上，2026-08-08 审查后）**：
  - `createTask()` 的 per-request `endUserId` 统一以 `X-End-User-Id` header 发送（与 `stream()` 机制一致；0.10.1 已发布版本走请求体透传，Gateway 优先 header、回退 body，两版行为兼容，调用方无需改动）
- **澄清（防误解，2026-08-08 审查后写入 UPGRADE/README/integration-callers）**：`endUserId` **全程可选、缺省不会被拒**——缺省授权主体回退租户自身钱包（user 天然=用户钱包可用；partner 不代理，链上授权失败时返回 `403 AGENT_ACCESS_DENIED`）；非 `0x` 值仅记忆隔离。平台**无**「必须带 endUserId」的强制校验。
- **平台侧强制变化（Gateway 已上线，调用方需知悉）**：
  - partner（B 端）任务**强制 BYOK**：`X-Llm-Api-Key` header / `llmApiKey` / `tenantKeyId` 三者之一，否则 `400 LLM_KEY_REQUIRED`（防平台预算被后台任务消耗）
  - **平台 MCP**（`/mcp`，6 个 `agentx_gateway_*` 工具）仅接受注册用户 `access_token`；调用方**自建** MCP 不受限
  - B 端 key 覆盖 REST 全部对话 + 并行任务；JWT 额外覆盖 MCP 对话/任务与链上操作（A2A 上链 / 发布 / 订阅，用户钱包签名）
  - **kind 统一**：生产 5 个 `partner-*` 租户全部 `kind='partner'`（aiservicer/autoops 由 user→partner，R13 历史混用修正），预算约束与端用户转发对全部 B 端 key 一致
- 相关 Gateway 变更见本日条目：端用户订阅转发 / P9 能力位统一 / 并行任务强制 BYOK

---

## 2026-08-08 — B 端（partner）并行任务强制 BYOK（预算约束）

**背景**：B 端需求第 2 点——防止 partner 用平台 LLM 预算跑后台任务（并行/后台任务消耗平台兜底 key）。

**实现**（[gateway/src/routes/chat-tasks.ts](gateway/src/routes/chat-tasks.ts)）：
- partner 租户创建任务（`POST /sessions/:id/tasks`）必须携带 LLM Key：`X-Llm-Api-Key` header / `llmApiKey` / `tenantKeyId`（存储式）三者之一，否则 `400 { code: "LLM_KEY_REQUIRED" }`
- 对话（chat，`/agent/runs`）与 user 类租户不受此限制（维持平台兜底 key 行为）
- **测试**：gateway 46/46（新增 4 个 BYOK 守卫用例：partner 无 BYOK 400 / header 放行 / tenantKeyId 放行 / user 不受影响）；同时修正 2 个既有 partner 用例补 BYOK header、mock `lib/db` + `lib/crypto` 支撑 tenantKeyId 用例
- **文档**：integration-callers.md（§6 强制 BYOK 说明 + FAQ LLM_KEY_REQUIRED）、sdk README / UPGRADE 同步

---

## 2026-08-08 — B 端端用户订阅转发（B-end subscription proxying）

**背景**：B 端集成方需要「我的最终用户已订阅某 Agent → 我可代为对话」。原授权模型按**调用方租户**（`partner-...`）判定，端用户订阅无法传递（partner 地址非链地址，恒 403）。

**实现**：
- **Gateway**：新增 `resolveAccessSubject()`（[services/agent-access.ts](gateway/src/services/agent-access.ts)）——partner 租户请求带 `X-End-User-Id: 0x<钱包>`（或 body `endUserId`）时，改用该钱包做 `canAccessAgent`（拥有 / 订阅）授权；接入 [chat-tasks.ts](gateway/src/routes/chat-tasks.ts)（sessions + tasks）与 [agent-runs.ts](gateway/src/routes/agent-runs.ts)；非 `0x` 值仅作记忆隔离标识，不触发转发
- **SDK 0.10.1**（待发布）：`ConversationCreateTaskParams.endUserId?` / `ConversationChatParams.endUserId?` 支持 per-request 透传（`createSession` 原本已支持）
- **测试**：gateway **42/42**（新增 5 个端用户转发用例）；sdk 32/32；tsc build 干净
- **文档**：integration-callers.md（B 端代调示例 + HTTP 表 + FAQ）、sdk README / UPGRADE 同步

---

## 2026-08-08 — B 端集成 key 的并行任务能力统一为 P9 能力位（R14 策略修订）

**背景**：B 端反馈 `GET /api/v1/tenant/me` 显示 `parallel_tasks: true`（Enterprise plan），但 `POST /api/v1/sessions` 返回 403 `PARTNER_TASKS_DISABLED`。根因是 R14（2026-08-06）对 `kind='partner'` 的 B 端 key 在 `chat-tasks` / `schedules` 全路由做了"一刀切"拦截，与既有的 P9 能力位机制（`tenant.allow_parallel_tasks ?? plan.features.parallel_tasks ?? true`）冲突——同一租户"报告有能力、调用被拒"。

**修订**（commit 后续）：
- **Gateway**：
  - `routes/chat-tasks.ts`：删除 R14 `partnerTaskGate`（按 `kind` 拦截），改为 `parallelTaskGate` —— 统一按 P9 能力位判定（`allow_parallel_tasks ?? plan.features.parallel_tasks ?? true`），对 user JWT 与 B 端 key **一视同仁**；移除 createTask 端点内重复的 P9 检查（收敛到 router.use 一处）
  - `routes/schedules.ts`：同步把 partner gate 替换为 P9 能力位 gate（与 `schedule-daemon` 触发前的 `parallelTasksEnabled` 检查一致）
  - **行为**：B 端 key 一个即可（不再需要第二个"钱包 JWT"变通）；Enterprise 计划 B 端自动获得 sessions/tasks 并行能力；能力位为 false 时返回 `403 PARALLEL_TASKS_DISABLED`
- **测试**：`test/chat-tasks.test.ts` R14 partner gate 3 用例 → 重写为「B 端 key 遵循 P9 能力位」5 用例（默认放行 / plan 关闭拦截 / 读写取消端点放行）；并 mock `canAccessAgent` 修复既有 7 个因无效地址走真实链调用的失败用例。gateway 单测 **37/37 通过**，tsc build 通过。
- **不受影响**：MCP 通道维持 R14 收紧（对话/任务工具仅接受 `access_token`，B 端 key 不能调 MCP）；A2A 上链、发布、订阅仍走用户钱包。
- **文档同步**（2026-08-08 同日）：`sdk/README.md`（ConversationClient 鉴权段 + Version History）、`sdk/UPGRADE.md`（新增「B 端集成 key 能力澄清」章节）、`docs/integration-callers.md`（一个 key 即够 + BYOK 透传小节 + MCP 鉴权修正）、`docs/sdk-integration-example.md` 已更新。SDK 无代码变更，无需重新发布 npm。

---

## 2026-08-08 — 发布 sdk@0.10.0（完整版）+ 用户钱包签名上链轨道

### @agentxv2/sdk@0.10.0 — 完整功能版（已发布 npm）

- **完整版发布**：整合 0.9.x 全部能力（Agent 应用类别 / 统一三轨支付 / sessions & 并行任务 / 流式 tool_call 修复 / 类型化 `onchain_approval_required`），作为稳定基线（`npm version minor`，非 patch）。
- **新增类型**：`ConversationSSEEvent` 增加 `'onchain_approval_required'` + `OnChainApprovalRequest { targetAgentId, taskType, inputData }`；前端 `useAgentChat` 改为显式 case（移除 `as unknown as`），并顺带消除 `AgentPayload.category` 既有类型错误。
- **无 breaking changes**。

### 用户钱包签名上链轨道（仓库级，2026-08-08）

- **原则修正**：链上 A2A 轨道由**用户自己付 gas**——Conversation Service 发 `onchain_approval_required` SSE 事件 → 前端弹钱包 → 用户签 `createTask`（合约记录 `clientAddress = msg.sender` = 用户地址）。
- **Gateway**：删除 `A2A_WORKER_PRIVATE_KEY` / `getA2ASigner` / `createTaskOnChain` / `POST /api/v1/internal/orchestrate/create-task` 路由（commit 7f87743）；a2a-worker 只读链，子任务**链下内联**（负伪 taskId 写 `a2a_task_results`），`agentx_a2a_get_task` 改查 DB。
- **Conversation Service**：`agentx_delegate mode="onchain"` 校验访问后直接返回 approval payload（不再调 `/create-task`），通过 side-event 队列在 AgentLoop 结束后统一 yield `onchain_approval_required`；嵌套（depth>0）run 拒绝 onchain。
- **Frontend**：新增 `OnchainApprovalModal`（wagmi v2：`writeContractAsync` 签 `createTask` → `useWaitForTransactionReceipt` → 从 `receipt.logs[].topics[1]` 解析 taskId → 轮询 `GET /api/v1/a2a/task-result/:taskId` 展示状态）。
- **生产**：三服务已构建部署（frontend/conversation 锁定 `@agentxv2/sdk@0.10.0`），`/create-task` 404 验证通过。

---

## 2026-08-08 — 发布 sdk@0.9.5（流式 tool_call 参数修复）

### @agentxv2/sdk@0.9.5 — 流式 tool_call 参数增量 chunk callId 丢失修复

**问题**：DeepSeek / OpenAI 流式响应中，`tool_calls` 的首个 chunk 带 `id` + `function.name`，后续参数增量 chunk 只带 `index`（无 `id`）。原实现以 `tc.id ?? call_${tc.index}` 构造 callId，后续 delta 与 `tool_call_start` 的 id 无法匹配，`toolCallsAccum` 找不到对应调用 → **累积的工具参数被静默丢弃**，工具调用以残缺参数失败。

**修复**（commit af94585）：`sdk/src/llm/gateway-provider.ts` + `sdk/src/llm/openai-provider.ts` 维护 `callIdsByIndex: Map<index, id>`，delta 通过映射关联到真实 callId，参数完整保留。

**兼容性**：纯 bug fix，无 breaking changes（`LLMProvider` 流事件契约不变）。已发布 npm。

---

## 2026-08-07 — 多 Agent 编排分层（链下默认 / 链上可选）+ 发布 sdk@0.9.4、payments@0.2.2

### 多 Agent 编排分层（Conversation Service + Gateway，仓库级）

- **策略**：主 Agent 编排**默认走链下**（对话通道内同步委派，零成本、实时），仅在用户**显式要求可审计 / 结算 / 上链**时才落链上 A2A 协议（可审计 taskId、结算、信誉）
- **Gateway**：`routes/internal-orchestrate.ts`（`ORCHESTRATE_TOKEN` 守卫）挂载 `/api/v1/internal/orchestrate`，提供 `POST /list`（列出可委派 Agent）、`POST /check`（访问校验）、`POST /create-task`（链上 A2A 任务创建，复用 `createTaskOnChain`，仅对 `canAccessAgent` 放行的目标执行）
- **Conversation Service**：新增 `services/orchestrator.ts`（`OrchestratorService`：listAgents / checkAccess / delegateOffChain / delegateOnChain）；`AgentRunnerService` 注入平台工具 `agentx_list_agents` + `agentx_delegate`（`mode: offchain|onchain`，默认取 `ORCHESTRATE_DEFAULT_MODE=offchain`），嵌套委派受 `ORCHESTRATE_MAX_DEPTH`（默认 4）约束；嵌套运行跳过 clarification gate（子 Agent 无法与用户对话）
- **配置**：`ORCHESTRATE_TOKEN`（Gateway 与 Conversation Service 须一致）/ `ORCHESTRATE_DEFAULT_MODE` / `ORCHESTRATE_MAX_DEPTH`，已写入两侧 `.env.example`
- **访问边界不变**：委派仅限「调用者自己写的 + 已订阅的（chain/fiat/x402）」Agent；无权限拒绝 `403 AGENT_ACCESS_DENIED`

### @agentxv2/sdk@0.9.4 — Agent 应用类别（category）字段（已发布 npm）

- **目的**：发布 Agent 时声明「应用类别 / 用途」，Marketplace 分类筛选与应用集成（运营、客服、销售、个人助理、写代码、服务器监控、空投、量化策略等）按此字段归类
- **SDK**：`core/types.ts` 新增 `AGENT_CATEGORIES`（13 个枚举）+ `AgentCategory` 类型；`AgentPayload.category?`（发布必填，前端 Studio 强制）；`publishAgent` 的 public metadata 写入 `category`；`getAllAgents` / `getAgentMetadata` 解析 `category`（tokenURI JSON 优先，链上 attrs 兜底）
- **Gateway**：`agents` 表新增 `category` 列（迁移 `020_agents_category.sql`）；索引器读取链上 `getAgentMetadata` attrs 的 `category`；`GET /api/v1/agents` 支持 `?category=` 过滤，`byCategory` 改为按 category 列聚合
- **Frontend**：Studio Basics 新增「应用类别」必选下拉；Marketplace 顶部分类标签组 + Agent 卡片分类标签；`useAgentSearch` 新增 `category` 过滤
- **文档**：`docs/publish-subscribe-pay.md`（发布/订阅/付费集成指南，含 category 必填说明）+ SDK README / UPGRADE 同步
- **生产**：需先发 sdk@0.9.4 再升级 gateway+frontend（node_modules 用 registry 版本，不含新类型）；迁移 020 需在生产 DB 执行

### @agentxv2/payments@0.2.2 — 归属元数据（已发布 npm）

- **目的**：让 npm registry 展示 AgentX 归属信息（`npm view` 的 `author/repository/homepage` 现可显示 AgentX/sftgroup）
- **内容**：`author: "AgentX (sftgroup)"`、`repository: github.com/sftgroup/Agentx`、`homepage`、`bugs`、`keywords`；README 维护声明
- **无代码/API 变化**：不 bump sdk（sdk `^0.2.0` 范围兼容，0.9.4 自动解析到 0.2.2）

---

## 2026-08-07 — 生产升级 sdk@0.9.3 + payments@0.2.1

### @agentxv2/payments@0.2.1 — 浏览器/bundler 兼容修复

**问题**：`@agentxv2/payments@0.2.0` 在 `service.ts` / `client.ts` / `stripe.ts` / `x402-v2.ts` 顶层引用了 Node 内置模块（`node:crypto` 的 `randomUUID`/`randomBytes`/`createHmac`/`timingSafeEqual` 与 `Buffer` base64）。SDK 0.9.3 re-export 该包根导出后，前端（webpack/Next.js）构建报 `UnhandledSchemeError: Reading from "node:crypto" is not handled by plugins`。

**修复**：
- 新增 `payments/src/crypto.ts`（纯 Web Crypto：`randomUUID` / `getRandomValues` / 手写 base64 / `hmacSha256Hex` / `timingSafeEqualStr`），替换 4 处 Node 内置用法，引擎在 Node ≥19 与浏览器均可运行
- `StripeAdapter.verifyWebhookSignature()` 改为 `async`（Web Crypto `subtle.sign` 异步）；`PaymentsService.handleWebhook` 与单测同步 `await`，对外契约不变
- 本地 tsc build + 87/87 vitest 全绿；`dist` 无任何 `node:`/`Buffer` 引用
- 已发布 npm `@agentxv2/payments@0.2.1`（sdk `^0.2.0` semver 自动兼容，**无需重发 sdk**）

**生产部署**（43.159.60.46，pm2）：
- gateway：重链 `file:../payments` → 0.2.1 → build → `pm2 restart agentx-gateway` ✅
- frontend：显式安装 payments@0.2.1 → `next build` 成功 → `pm2 restart agentx-frontend` ✅
- 最终：gateway = `@agentxv2/sdk@0.9.3` + `@agentxv2/payments@0.2.1`（file:）；frontend 同版本；三服务 online，`/api/v1/payments/info` 正常

---

## 2026-08-07

### SDK v0.8.11 — 三轨订阅支付（chain / fiat / x402）

**新特性**（npm `@agentxv2/sdk@0.8.11`）：统一支付层，让集成的 B 端与 AgentX 前端都能用多种方式订阅：

- **`SubscriptionPayments` 类（主入口）** — `pay({ method, planId, agentId, subscriber, ... })` 按三轨分发：
  - `chain` → 链上 SubscriptionManager（原生代币/ERC20 escrow，可指定 `valueWei` / `approveTokenFirst`）
  - `fiat` → Stripe 信用卡订阅，返回 checkout URL 重定向（无需钱包）
  - `x402` → 原生代币周期支付，Gateway 验 tx 后写入 `fiat_subscriptions(provider='x402')` 注册访问
- **`hasAccess(agentId, subscriber)`** — 统一访问检查（链上 OR fiat/x402），走 Gateway `/api/v1/chain/check-subscription`
- **`fetchX402Info()`** — x402 协议发现（priceWei / payTo / network / chain）
- **fiat `amountCents` 可选** — Gateway 按 planId 自动从链上套餐定价换算美元（`FIAT_TOKEN_USD_PRICE`）；显式传 `amountCents` 仍优先
- **x402 自动支付** — 未传 `txHash` 时自动用 `walletClient` 转账（max(plan price, protocol price)）并注册

**Gateway 配套**（本机同步到生产）：
- `POST /api/v1/x402/subscribe`（新增）— 幂等验 tx + 订阅续期（复用 `fiat_subscriptions`，无新表）
- `POST /api/v1/fiat/checkout` — 支持 planId 自动定价；`invoice.paid` 空行 bug 修复
- `hasSubscriptionAccess` 服务 — 统一「链上 OR fiat/x402」访问控制，接入 `check-subscription` 与 MCP `agentx_subscription_check`

**前端**：订阅详情页续费支持三选一支付方式（钱包 / 信用卡 / x402），复用 SDK `SubscriptionPayments`。

- 验证：SDK tsc 0 错误 + vitest 29/29 ✓（payment 12/12）；Gateway tsc 0 错误 + vitest 35/35 ✓
- 文档：`sdk/UPGRADE.md`（v0.8.10→v0.8.11）、`sdk/README.md`（Multi-Rail 章节 + 版本表）

---

## 2026-08-06

### SDK v0.8.10 — 主密钥加解密 + subscription 状态映射修正

**新特性**（npm `@agentxv2/sdk@0.8.10`，此前 0.8.8/0.8.9 均为 docs-sync，不含这些改动）：

- **`encryptWithKey()` / `decryptWithKey()`** — AES-256-GCM 主密钥线格式 `base64(IV[12] ‖ authTag[16] ‖ ciphertext)`，与 Gateway at-rest key 加密（`gateway/src/lib/crypto.ts`）字节级兼容；Gateway 已改由 SDK 提供此实现
- **`parseTokenURIJSON` 公开导出** — 容错 tokenURI 解析器现可从主入口导入（此前仅内部使用）
- **`A2AProtocol.createTask()` 支持原始字符串 input** — `input: string | Record`，向后兼容
- **Subscription 状态映射修正** — 链上 enum（`0=Inactive,1=Active,2=Expired,3=Cancelled`）此前被错误的位置数组映射（错位一位，几乎所有订阅状态都返回错误值），现修正为 `pending/active/expired/cancelled`

- 验证：SDK tsc 0 错误 + vitest 17/17 ✓；构建产物 dist 已更新
- 文档：`sdk/UPGRADE.md`（v0.8.9→v0.8.10）、`sdk/README.md` 版本表已更新

## 2026-08-06

### Gateway — R13 外部项目方自助申请 API Key

**新特性**：外部项目方可在 `/apply` 页自助提交 API 接入申请，admin 审批后**自动**创建集成租户并签发 `agentx_` key（复用 P7-5 申请模型 + R11 自动建租户逻辑）。

- **`POST /api/v1/developer/apply`**（公开）— 提交 `type=developer` 申请（company/contact_name/contact_email/website/description）
- **`POST /admin/applications/:id/decide`** 扩展 — approve 按 `app.type` 分流：developer → 自动建租户（wallet=`partner-<slug>`，enterprise plan）+ 签发 `agentx_` key（明文仅响应一次）+ 注册 `integration_partners`；channel 流程不变
- **`GET /admin/applications`** 返回 `type` 字段
- **migration 015** — `partner_applications` 增加 `type TEXT NOT NULL DEFAULT 'channel'`
- **前端**：`/apply` 双 Tab（渠道合作 / API 接入）；admin Applications Tab 支持 developer 审批并展示一次性 key
- **边界修补**（`defc031`）：tenants `ON CONFLICT (wallet_address)` 补充 `api_key = EXCLUDED.api_key`（孤儿租户场景签发 key 失效漏洞，R11 POST /integrations 同步修复）；slug 分配 50 次上限；必填字段全空格返回 400
- 测试：`developer.test.ts` 4 用例，gateway 全量 31/31 通过；生产冒烟 4/4 PASS
- 详细变更说明见 [docs/R13-change-notes.md](docs/R13-change-notes.md)

### Gateway — MCP 新增对话与任务管理工具（33→38）

**新特性**：MCP 端点 `/mcp` 工具数 33→38，补齐对话与并行任务管理能力（此前仅链上 + 网关只读，MCP 客户端无法消费 P8/P9 并行能力）。

- **`agentx_gateway_chat`** — 单轮对话；经 Gateway 调用 `POST /agent/runs`，将 SSE 流聚合为 `{ reply, tool_calls }` 返回
- **`agentx_gateway_create_session` / `create_task` / `get_task` / `list_tasks` / `cancel_task`** — 会话幂等创建、后台任务提交（立即返回 taskId）、任务查询/列表/取消（终态幂等）
- **鉴权**：MCP 为公开路由，对话/任务工具在工具 `arguments` 中接受 `api_key`（`X-Api-Key`）或 `access_token`（JWT）二选一；参数 snake_case，handler 转 camelCase 内部转发 gateway REST，P9 gate 403（`PARALLEL_TASKS_DISABLED`）透传
- 测试：新增 `gateway/test/mcp.test.ts` 11 用例，gateway 全量 27/27 通过
- 文档：`MCP_SETUP.md`、`mcp/README.md`、`docs/sdk-vs-mcp.md`、`docs/integration-callers.md`（§7.5 MCP 接入）、`README.md` 同步更新

### SDK v0.9.0 — Browser Control Skill 扩展

**新特性**：`@agentxv2/sdk/skills` 面向 Agent 浏览器控制的动作集扩展。

- `executeBrowserAction()` 新增动作：`hover`（悬停）、`press`（键盘事件）、`select`（SELECT 值 / checkbox+radio checked）、`back` / `forward`（历史导航）、`getInfo`（url/title/readyState/viewport/scrollY）
- `extractAccessibleDOM()` 快照增强：补充 `name` / `role` / `aria-label`、表单 `value`（input/textarea/select）、checkbox/radio `checked`、anchor `target`，让快照对 agent 可直接行动
- 新增 `sleep(ms)` 异步节奏辅助函数；`findElement` 回退匹配新增 `name` 属性
- 向后兼容：全部为新增动作/字段，无破坏性变更

---

## 2026-08-05

### Gateway v0.2.1 — SDK-based ChainDataReader + 实时链上读取 API

**新特性**：将生产验证过的 SDK 链上读取逻辑（`examples/sdk-chain-read.ts`）封装为独立服务 `ChainDataReader`，新增公开实时 REST 端点（**直读链上，不经 DB 索引**，与 `/api/v1/agents` 索引层互补）。所有端点支持 `?chain=sepolia|oxachain`（默认 oxachain）。

- **`GET /api/v1/chain/health`** — 实时链状态（当前块高 + 总 Agent 数）
- **`GET /api/v1/chain/total`** — 总 Agent 数（等价 SDK `totalAgents()`）
- **`GET /api/v1/chain/agents`** — 批量 Agent（`fromId`/`toId`/`activeOnly`/`capabilities` 筛选，等价 `getAllAgents()`）
- **`GET /api/v1/chain/agents/:agentId`** — 单个 Agent 详情（exists + 结构化 metadata，等价 `getAgentMetadata()`）
- **`GET /api/v1/chain/plans/:planId`** — 订阅套餐详情（`price` 为 wei 字符串，等价 `getPlan()`）
- **`GET /api/v1/chain/check-subscription`** — 检查钱包对某 Agent 的订阅状态（`hasActiveSubscription`）
- 复用 `@agentxv2/sdk`（容错 tokenURI 解析，与 indexer 行为一致）；SDK/MCP 协议**无任何变更**
- 详细日志：统一 `[chain-data]` 前缀（pm2 logs 可 `grep "chain-data"`），覆盖每次读操作的入参/结果/耗时与错误分支
- 依赖：gateway 新增 `@agentxv2/sdk ^0.8.1`、`viem ^2.55.0`（`wagmi` 为 SDK CJS 入口 peer）

### SDK v0.8.1 — 容错 tokenURI 解析

**优化**：`parseTokenURIJSON` 与 Gateway indexer 逐行对齐，提升畸形链上数据的容错能力。

- base64 尾部垃圾清理（trim 掉最后一个 `==` padding 之后的内容）
- Unterminated JSON 修复（奇数引号补 `"`、缺失闭括号补 `}`）
- regex 兜底：仍失败时至少提取 `name` 字段
- 显式处理 `ipfs://`（提前返回 null）；`getAgentMetadata` 的 name 回退 `Agent {id}` 与 `getAllAgents` 对齐

---

## 2026-08-04

### SDK v0.8.0 — 链上数据能力

**新特性**：为第三方服务的 `chain-sync` / `subscribe` / `pricing` 场景提供 SDK 统一封装，替代裸 ethers.js + 手工 ABI 实现。

- **IdentityRegistry 批量查询**：
  - `getAllAgents(options?)` — 批量拉取 Agent（`fromId`/`toId`/`activeOnly`/`capabilities` 筛选，`batchSize` 分批），返回结构化 `AgentSummary`（name/description/capabilities/skills/isActive/createdAt）
  - `totalAgents()` — 直接读取合约 `totalAgents()`，替代二分查找最大 ID
  - `getAgentMetadata(agentId)` — 结构化元数据（链上 attributes + tokenURI JSON 合并解析）
- **SubscriptionManager 写操作**：
  - `createPlan()` — 返回 `planId`（从 `PlanCreated` 事件解析，不再手工 parseLog）；**period 类型化为 `day|week|month|year`**（严格对齐合约 `_periodToSeconds`，杜绝 `monthly/quarterly/yearly` 静默 30 天过期）
  - `subscribe()` — 返回 `subscriptionId/expiresAt/subscriber`（从 `Subscribed` 事件解析，修复此前恒为 0）
  - `createPlanAndSubscribe()` — 组合方法
- **事件监听**：`subscribeToEvents()` — viem `watchContractEvent` 监听 `Transfer`/`AgentRegistered`/`PlanCreated`/`Subscribed`，返回 unsubscribe，将同步延迟从 2 分钟降到 15 秒级
- **Gateway v0.2.0**：
  - `GET /api/v1/agents` — 新增 `activeOnly`/`capabilities`/`fromId`/`toId` 筛选 + `page`/`pageSize` 分页
  - `GET /api/v1/agents/count` — 总数 / active 数统计
  - agent-indexer — 结构化 metadata（skills/is_active/agent_created_at）入库；`totalAgents()` 界定全量扫描；新增 `AgentRegistered`/`Transfer` 事件驱动增量同步（mint → upsert，burn → 删除）
  - 新迁移 `005_agents_structured.sql`（is_active / skills / agent_created_at 列 + 索引）
  - MCP `/mcp` — 工具数 29 → 32：新增 `agentx_identity_list_all`（批量+筛选，等价 `getAllAgents`）、`agentx_identity_metadata`（等价 `getAgentMetadata`）、`agentx_subscription_create_plan`（等价 `createPlan`）；`agentx_identity_total_count` 改用 `totalAgents()`

### SDK v0.7.5 — AgentLoop 模型覆盖修复

**修复**：`AgentLoop` 主循环原先强制发送 `ctx.model ?? 'gpt-4o'`，忽略 LLM Provider 自身配置的模型（`#517490b`）。

- **影响范围**：任何通过 Provider 指定模型、但未在 `ctx` 传 `model` 的场景——包括 BYOK（`X-Llm-Model`）和租户 DB 配置（`tenant_llm_configs.model`），此前实际均被强制成 `gpt-4o`。
- **变更**：
  - `LLMProvider` 接口暴露可选 `model`（Provider 配置的模型）
  - `OpenAIProvider` / `GatewayProvider` 暴露 `model` getter
  - AgentLoop 模型解析优先级改为：`ctx.model` → `provider.model` → `gpt-4o`
- **依赖**：`conversation-service` 升级至 `@agentxv2/sdk ^0.7.5`（本地与生产均已安装并部署）。

### SDK v0.7.4 — BYOK 模型透传（X-Llm-Model）

**新特性**：对话服务协议新增 `X-Llm-Model` 请求头（`#c22d397`）。

- Gateway（`agent-runs` 读取 → `conversation-proxy` 转发）→ Conversation Service（`runs` 读取 → `agent-runner` 透传 → `tenant-llm-resolver` 使用 `headerModel || ctx.model || 'gpt-4o'`）。
- SDK `ConversationClient` 新增 `llmModel` 配置，自动发送 `X-Llm-Model`。
- **向后兼容**：不传时行为不变（仍为 `gpt-4o` 兜底）。
- 典型用法：DeepSeek 等非 OpenAI 供应商需要显式传模型名（如 `deepseek-v4-pro`）。

### SDK v0.7.3 — 无状态 BYOK（X-Llm-Endpoint）

**新特性**：调用方可自持 LLM Key 与端点，AgentX 侧零配置、零存储（`#0cb94c6`）。

- 协议新增 `X-Llm-Api-Key` + `X-Llm-Endpoint` 请求头，全链路透传。
- SDK `ConversationClient` 新增 `llmApiKey` / `llmEndpoint`。
- 修复：`tenant-llm-resolver` 将租户 DB 配置的 `endpoint_url` 透传给 Provider（`#01a28b6`）。

**LLM Key 解析优先级（当前）**：

```
1. X-Llm-Api-Key + X-Llm-Endpoint + X-Llm-Model（请求头，无状态 BYOK）
2. tenant_llm_configs（租户持久化 Key，加密存储，支持 endpoint/model）
3. OPENAI_API_KEY env（AgentX 官方 Key）
4. AgentX Gateway 兜底
```

### SDK v0.7.2 — 澄清打断（Clarification Interruption）

**新特性**（`#9c2e75e`）：AgentLoop 前置意图门——对模糊请求先向 LLM 询问澄清问题，再决定是否执行工具/写记忆。

- SSE 协议新增 `clarification` 事件（携带 `question`）。
- SDK `ConversationClient.stream()` 产出澄清事件；`chat()` 聚合结果含 `clarification` 字段。
- 服务端开关：`CLARIFICATION_ENABLED`（默认开启）、`CLARIFICATION_MODEL`（默认 `gpt-4o-mini`）。

### Conversation Service — 记忆置信度过滤

**新特性**（`#9c2e75e`）：事实提取为 `{fact, confidence}`，低于 `MEMORY_CONFIDENCE_THRESHOLD`（默认 0.5）的记忆被丢弃，防止低价值内容污染长期记忆。

### Conversation Service — 质量重构

**代码清理**（`#ec1442a`，详见 [REFACTORING_NOTES.md](REFACTORING_NOTES.md)）：

- 删除未使用代码：`ContextEngine`、`lib/llm-resolver.ts` 的 `LLMResolver`、`SandboxService`（连同 sandbox 配置）
- 修复硬编码：事实提取模型改用 `config.compactModel`
- 抽取通用 `tryParseJson<T>`，消除 `parseClarificationJson` / `parseFactsJson` 冗余

### 前端（agentx-frontend）— SDK 升级 + 生产配置恢复

- SDK `^0.6.5 → ^0.7.5`（`#410685f`）：chat 页面的 AgentLoop fallback 获得 provider 模型修复与澄清打断支持；`next build` 验证通过。
- `.env.production`：恢复为完整配置（合约地址 / RPC / Pinata / WalletConnect），`APP_URL` 与 `GATEWAY_URL` 指向新生产服务器 `43.159.60.46`；重新构建部署后前端真正指向新 Gateway。

---

## 文档（2026-08-04）

| 文档 | 内容 |
|------|------|
| [README.md](README.md) | 项目门面：SDK v0.8.0、目录结构、BYOK 示例 |
| [CHANGELOG.md](CHANGELOG.md) | 本文件 |
| [REFACTORING_NOTES.md](REFACTORING_NOTES.md) | 对话服务重构说明（死代码清理、硬编码修复） |
| [AISERVICER_INTEGRATION.md](AISERVICER_INTEGRATION.md) | aiservicer 接入样例（完整 BYOK + DeepSeek） |
| [CONVERSATION_SERVICE.md](CONVERSATION_SERVICE.md) | 对话服务协议：鉴权、BYOK、澄清、记忆 |
| [INTEGRATION.md](INTEGRATION.md) | SDK 集成指南 v0.8.0 |
| [sdk/UPGRADE.md](sdk/UPGRADE.md) | SDK 升级指南 |
