# AgentX Changelog

> 记录 Conversation Service 与 SDK 近期的重要变更。
> SDK 版本对应 npm 包 `@agentxv2/sdk`；Conversation Service 无独立版本号，跟随主仓库提交。

---

## 待发布（Pending）

### @agentxv2/payments@0.2.2 — 归属元数据（随下次功能迭代一起发）

- **目的**：让 npm registry 展示 AgentX 归属信息（当前 0.2.1 的 package.json 元数据变更尚未发布，`npm view` 的 `author/repository/homepage` 仍为空）
- **内容**：`author: "AgentX (sftgroup)"`、`repository: github.com/sftgroup/Agentx`、`homepage`、`bugs`、`keywords`；README 维护声明（源码位于 `sftgroup/Agentx/payments`）
- **无代码/API 变化**：不 bump sdk（sdk `^0.2.0` 范围兼容）
- 代码已在 main（commit `c65d2c4`），仅待 npm 发版

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
