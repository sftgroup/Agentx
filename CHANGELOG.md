# AgentX Changelog

> 记录 Conversation Service 与 SDK 近期的重要变更。
> SDK 版本对应 npm 包 `@agentxv2/sdk`；Conversation Service 无独立版本号，跟随主仓库提交。

---

## 2026-08-06

### Gateway — MCP 新增对话与任务管理工具（33→38）

**新特性**：MCP 端点 `/mcp` 工具数 33→38，补齐对话与并行任务管理能力（此前仅链上 + 网关只读，MCP 客户端无法消费 P8/P9 并行能力）。

- **`agentx_gateway_chat`** — 单轮对话；经 Gateway 调用 `POST /agent/runs`，将 SSE 流聚合为 `{ reply, tool_calls }` 返回
- **`agentx_gateway_create_session` / `create_task` / `get_task` / `list_tasks` / `cancel_task`** — 会话幂等创建、后台任务提交（立即返回 taskId）、任务查询/列表/取消（终态幂等）
- **鉴权**：MCP 为公开路由，对话/任务工具在工具 `arguments` 中接受 `api_key`（`X-Api-Key`）或 `access_token`（JWT）二选一；参数 snake_case，handler 转 camelCase 内部转发 gateway REST，P9 gate 403（`PARALLEL_TASKS_DISABLED`）透传
- 测试：新增 `gateway/test/mcp.test.ts` 11 用例，gateway 全量 27/27 通过
- 文档：`MCP_SETUP.md`、`mcp/README.md`、`docs/sdk-vs-mcp.md`、`docs/integration-callers.md`（§7.5 MCP 接入）、`README.md` 同步更新

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
