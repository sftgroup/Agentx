# AgentX 调用方接入指南（通用版）

> 面向各业务团队 / 调用方的接入文档。适用于通过 SDK 或 HTTP 直接调用 AgentX 平台能力的场景。
> 适用 SDK：`@agentxv2/sdk >= 0.9.4`（含 sessions / tasks 能力、三轨订阅支付、Agent 应用分类）
> 本文件为**通用文档**，Key 以占位符 `agentx_<your-key>` 表示，请勿在此提交真实 Key。

---

## 目录

1. [概述](#1-概述)
2. [架构与租户模型](#2-架构与租户模型)
3. [环境变量配置](#3-环境变量配置)
4. [Key 签发与轮换](#4-key-签发与轮换)
5. [验证连接](#5-验证连接)
6. [付费与配额计费](#6-付费与配额计费当前实况)
7. [SDK 接入示例](#7-sdk-接入示例)
8. [HTTP API 参考](#8-http-api-参考)
9. [MCP 接入（JSON-RPC）](#9-mcp-接入json-rpc)
10. [错误码](#10-错误码)
11. [常见问题](#11-常见问题)
12. [安全最佳实践](#12-安全最佳实践)

---

## 1. 概述

AgentX 是一个多租户 AI Agent 平台，对外提供：

- **链上数据**：Agent / Plan / Subscription 注册表读取（区块链直读）
- **对话能力**：会话（session）+ 后台任务（task）并行执行，SSE 流式事件
- **管理能力**：平台侧统一管理调用方接入、套餐、配额

调用方（业务系统）只需配置**两组环境变量**即可接入，无需管理钱包签名或私钥。

## 2. 架构与租户模型

```
┌──────────────┐   X-Api-Key   ┌─────────────────────┐
│  调用方系统    │ ───────────▶ │  AgentX Gateway      │
│ (aitrader等)  │              │  :3090               │
└──────────────┘              │  ├─ 鉴权 / 配额 / 限流 │
                              │  └─ 代理 → Conversation│
                              │      Service :8100    │
                              └─────────────────────┘
```

- **租户隔离**：每个调用方 = 一个独立租户（`wallet_address` 形如 `partner-<slug>`），Key 互不通用，可单独禁用 / 轮换 / 配额管理
- **鉴权方式**：请求头 `X-Api-Key: agentx_...`（租户 Key），或 JWT（钱包签名，适用于终端用户）
- **一个 Key 即可**：B 端集成 Key（`agentx_...`）与注册用户 JWT 在**会话 / 并行任务 / 对话**能力上完全等价（统一受套餐 / 租户能力位约束），**不需要第二把 Key**。仅 MCP 通道的对话 / 任务工具要求注册用户 `access_token`，A2A 上链 / 发布 / 订阅要求用户自己的钱包（设计如此）
- **端用户订阅转发（B 端代调，2026-08-08）**：B 端请求带 `X-End-User-Id: 0x<钱包地址>` 时，网关改用该钱包做「拥有 / 订阅」授权检查（通过即放行对话 / 任务）——实现「我的最终用户订阅了该 Agent → 我这边可代为对话」。不传或非 `0x` 地址时回退到租户自身授权；端用户记忆隔离不受影响
- **能力开关**：平台可对套餐 / 租户维度启用或禁用「多任务并行 / 子 Agent」能力（见错误码 `403`）

## 3. 环境变量配置

每个调用方配置一个鉴权 Key（`agentx_`），另按应用侧建议显式配置 LLM Key：

| 变量 | 说明 | 必填 | 示例 |
|---|---|---|---|
| `AGENTX_GATEWAY_URL` | AgentX 网关地址（从本团队网络可达） | ✅ | `https://agentx.0xainet.top` |
| `AGENTX_CONVERSATION_API_KEY` | 本团队租户 Key（`agentx_` 开头） | ✅ | `agentx_<your-key>` |
| `AGENTX_CONVERSATION_LLM_KEY` | **应用侧建议（非必填，2026-08-11 起）**：本团队自己的 LLM API Key（openai/deepseek 等）。SDK 构造时传入 `llmApiKey`，所有并行任务自动带 BYOK，费用落自己账户、配额独立；不传则走平台 Key 并按 token 计费（见 [§6](#6-付费与配额计费当前实况)） | 建议 ✅ | `sk-<your-llm-key>` |

```bash
# .env 示例（应用侧建议：LLM Key 显式配置，任务自动 BYOK）
export AGENTX_GATEWAY_URL=https://agentx.0xainet.top
export AGENTX_CONVERSATION_API_KEY=agentx_<your-key>
export AGENTX_CONVERSATION_LLM_KEY=sk-<your-llm-key>
```

### 多调用方场景

同一项目若需接入多个调用方，请使用前缀区分，避免变量名冲突：

```bash
AITRADER_AGENTX_GATEWAY_URL=https://agentx.0xainet.top
AITRADER_AGENTX_CONVERSATION_API_KEY=agentx_<aitrader-key>
AISERVICER_AGENTX_GATEWAY_URL=https://agentx.0xainet.top
AISERVICER_AGENTX_CONVERSATION_API_KEY=agentx_<aiservicer-key>
```

## 4. Key 签发与轮换

Key 由平台统一签发，调用方侧无需生成：

1. 登录 **AgentX Admin → Integrations**
2. 点击 **Create** 创建调用方：
   - `slug`：调用方标识（小写字母 / 数字 / 短横线，如 `aitrader`）
   - `name`：显示名称
   - `gateway_url`：该调用方视角的网关地址
   - `plan_slug`：套餐（默认 `enterprise`）
   - `notes`：备注（可选）
3. 创建成功后页面展示 `agentx_...` Key —— **明文仅显示一次**，请立即复制并写入调用方 `.env`
4. 需要更换 Key 时点击 **Rotate**：新 Key 立即生效，旧 Key 立即失效（同样仅显示一次）
5. 点击 **Edit** 可修改名称 / 网关地址 / 套餐 / 启停；**Delete** 移除调用方（租户数据保留供审计）

## 5. 验证连接

配置完成后，验证是否接入成功：

```bash
curl -H "X-Api-Key: $AGENTX_CONVERSATION_API_KEY" \
     $AGENTX_GATEWAY_URL/api/v1/tenant/me
```

**预期返回**（HTTP 200）：

```json
{
  "tenant": {
    "id": "…",
    "wallet_address": "partner-<your-slug>",
    "status": "active"
  },
  "plan": {
    "name": "Enterprise",
    "slug": "enterprise",
    "quota_daily": 5000000,
    "quota_used": 0,
    "platform_models": [],
    "byok_enabled": true,
    "rate_limit_rpm": 100,
    "max_concurrent": 10,
    "features": { "parallel_tasks": true }
  },
  "capabilities": {
    "parallel_tasks": true,
    "parallel_tasks_override": null
  },
  "own_keys": [],
  "usage_today": { "total_tokens": 0, "total_tool_calls": 0 }
}
```

- `tenant.wallet_address` 为 `partner-<slug>` → 配置正确
- 返回 `401` → Key 错误或已被轮换（见 [错误码](#10-错误码)）
- 配额 / 限流 / 并发等数值以 `plan` 对象为准（随套餐不同而不同）

## 6. 付费与配额计费（当前实况）

> 实况日期 2026-08-11。当前付费体系 = **套餐订阅（配额制）+ 平台 LLM 按 token 计量**。链上按量付费轨（x402 / MPP / Period / Stablecoin）与法币订阅（Stripe）代码已实现但**未启用**（待商户 / 结算通道凭据，见 [docs/PROGRESS.md](PROGRESS.md) R4/R5）。

### 6.1 两种 LLM 模式：BYOK 与平台 Key

| 模式 | 进入方式（`TenantLLMResolver` 判定优先级） | 计费 | 限制 |
|---|---|---|---|
| **BYOK**（自带 Key） | ① 请求头 `X-Llm-Api-Key` / 构造参数 `llmApiKey`（无状态透传）② 存储式 `tenantKeyId`（平台保存，明文不出服务器） | ❌ 不计平台配额，费用落在调用方自己的 LLM 账户 | 受套餐 RPM / 并发限制 |
| **平台 Key**（平台兜底） | ③ 无 BYOK → 平台统一 Key；④ GatewayProvider 兜底 | ✅ **按 token 计费**，扣套餐每日配额 | 受套餐每日配额 + RPM / 并发限制 |

- **BYOK 可选（2026-08-11 起，原「partner 任务强制 BYOK」已废除）**：实时对话与并行任务**均不强制**携带 LLM Key；不带 Key 时自动走平台 Key，平台按 token 精确计费（调用方零代码改动，仅费用归属平台配额）。
- 平台**推荐**调用方自带 Key：费用落自己账户、配额独立不互相挤占（建议项，非硬性要求）。

### 6.2 套餐配额（`plans` 表）

| 套餐 | 月费 | 每日配额 `quota_daily` | 每月配额 | RPM | 并发 | 平台模型 |
|---|---|---|---|---|---|---|
| Free | $0 | 0（无平台配额，平台 Key 不可用 → 须 BYOK） | 0 | 5 | 1 | 无 |
| Pro | $29 | 500,000 tokens | 15,000,000 | 30 | 3 | 有 |
| Enterprise | $299 | 5,000,000 tokens | 150,000,000 | 100 | 10 | 有 |

### 6.3 平台模式计费链路

```
平台 LLM 消耗（conversation-service 的 done 事件携带 usage + llmSource='platform'）
  ├─ 实时对话  POST /api/v1/agent/runs
  │      → gateway pipeSSEWithUsage 解析 done 事件 → updateQuota
  ├─ 并行任务  GET /api/v1/tasks/:id/events（SSE 订阅者）
  │      → pipeTaskSSE 解析 done 事件 → updateQuota
  └─ 并行任务「无人订阅」时
        conversation-service 完成后回调 POST /api/v1/internal/task-billing
        → gateway 校验 X-Orchestrate-Token + llmSource='platform'
        → wallet→tenant 映射 → updateQuota
```

- **幂等**：同一任务 SSE 计量与完成回调**任一先到只计一次**（`billedTaskIds` 去重）
- **计数存储**：Redis 计数器 `quota:<tenantId>`（24h 过期自动重置）；Redis 不可用时回退 DB `tenants.quota_used` 累加
- **用量可见**：`GET /api/v1/tenant/me` 返回 `plan.quota_daily` / `quota_used` / `usage_today.total_tokens`，可核对当日消耗

### 6.4 超限行为

| 场景 | 响应 |
|---|---|
| 请求到达时已超每日配额 | `429 { limit_type: "daily_quota", error: "Daily quota exceeded. Upgrade your plan or switch to BYOK mode." }` |
| 流式结束后追加计费超限 | 本次请求已完成，**下次请求**起被 429 拦截 |
| 无平台模型可用（如 Free） | `400 { error: "No platform models available on current plan" }` |
| RPM 超限 | `429 { limit_type: "rpm", retry_after: 60 }` |

## 7. SDK 接入示例

### 安装

```bash
npm install @agentxv2/sdk@^0.9.4
```

### 初始化

```ts
import { ConversationClient } from '@agentxv2/sdk/conversation'

const client = new ConversationClient({
  gatewayUrl: process.env.AGENTX_GATEWAY_URL!,
  apiKey: process.env.AGENTX_CONVERSATION_API_KEY!, // X-Api-Key 鉴权
  llmApiKey: process.env.AGENTX_CONVERSATION_LLM_KEY, // 可选：BYOK 透传（不传则走平台 Key 并按 token 计费，见 §6）
})
```

### 会话与任务（推荐，支持并行与取消）

```ts
// 1. 创建会话（幂等：同 agent+租户重复创建返回已有会话）
//    建议补传 agentId，将会话绑定到目标 Agent，任务上下文更完整
const session = await client.createSession({ agentId: 1 })

// 2. 提交任务，立即返回 taskId，后台并行执行（body: { agentId, message }）
const task = await client.createTask({ sessionId: session.sessionId, agentId: 1, message: '你好' })

// 3. 查询任务状态（queued | running | done | error | cancelled）
const status = await client.getTask(task.taskId)

// 4. 列出会话内任务
const tasks = await client.listTasks(session.sessionId)

// 5. 取消运行中的任务（终态任务取消为幂等）
await client.cancelTask(task.taskId)

// 6. 查询租户能力（判断是否支持并行任务）
const caps = await client.getCapabilities()
if (caps.parallelTasks === false) {
  // 回退到单轮对话（见下）
}
```

> **B 端代调（端用户订阅转发）**：若最终用户（你的客户）已订阅某 Agent，可传该用户的钱包地址让网关按其订阅授权：
>
> ```ts
> // header：X-End-User-Id: 0x<用户钱包>；或 body：endUserId
> const session = await client.createSession({ agentId: 1, endUserId: '0x<用户钱包>' })
> const task = await client.createTask({ sessionId: session.sessionId, agentId: 1, message: '你好', endUserId: '0x<用户钱包>' })
> ```
>
> 仅 `0x` 开头 + 40 位 hex 的钱包地址会触发转发，其余值只作记忆隔离标识。网关用该钱包做「拥有 / 订阅」检查，通过即放行；未通过返回 `403 AGENT_ACCESS_DENIED`。

### 单轮对话（SSE 流式）

```ts
const stream = await client.stream(
  { agentId: 1, message: '你好' },
  { signal: AbortController.signal }
)
for await (const event of stream) {
  // event.type: 'text' | 'tool_result' | 'done' | 'error'
}
```

> `createTask` 可能返回 `403 PARALLEL_TASKS_DISABLED`（套餐 / 租户禁用了多任务），此时应回退到单轮 `stream()` 接口。

### 自带 LLM Key（BYOK 透传，推荐）

平台任务 / 对话的 LLM 默认走平台兜底 Key（DeepSeek / OpenAI 平台配额，受租户配额限制）。**平台推荐调用方透传自己的 LLM Key**，计费落在自己账户、配额不互相挤占：

```ts
// 方式一（推荐）：无状态透传 —— 构造时带上自己的 key + endpoint + model
const client = new ConversationClient({
  gatewayUrl: process.env.AGENTX_GATEWAY_URL!,
  apiKey: process.env.AGENTX_CONVERSATION_API_KEY!, // X-Api-Key 鉴权
  llmApiKey: 'sk-...',                            // 你的 LLM Key（如 DeepSeek / OpenAI）
  llmEndpoint: 'https://api.deepseek.com/v1',     // 可选：OpenAI 兼容端点
  llmModel: 'deepseek-chat',                      // 可选：模型名
})
```

- 方式二：**请求级透传**——`client.stream({ agentId: 1, message: '...', tenantKeyId })`，使用已在平台 Settings 保存的租户自有 Key（明文不出服务器，v0.8.6 起）
- 方式三：**HTTP 直接调用**——请求头 `X-Llm-Api-Key`（+ `X-Llm-Endpoint` / `X-Llm-Model`），等价 SDK 的 `llmApiKey`
- 优先级：`tenantKeyId`（服务器解密注入）> 请求头 / `llmApiKey` > 平台兜底 Key

> **BYOK 可选（2026-08-11 起，原「B 端任务强制 BYOK」已废除）**：partner 租户创建任务（`POST /sessions/:id/tasks`）**不再强制**携带 LLM Key——未传时自动走平台兜底 Key，平台按 done 事件 usage 精确计费（扣套餐每日配额，见 [§6](#6-付费与配额计费当前实况)）；传了则费用落调用方自己账户。
> **BYOK 判定**：请求头 `X-Llm-Api-Key` / 构造参数 `llmApiKey` / 存储式 `tenantKeyId`，优先级 `tenantKeyId`（服务器解密注入）> 请求头 / `llmApiKey` > 平台兜底 Key。平台托管后台路径（用户定时任务 schedule、编排触发）不经过上述 BYOK 通道，按租户存储 Key 或平台兜底执行；若需后台任务也走调用方自己的 Key，配置存储式 `tenantKeyId` 即可。
> ⚠️ **`tenantKeyId` 严格按租户隔离**（2026-08-08 审计确认）：`tenant_api_keys` 按 `tenant_id` 归属，每个租户只能使用**自己**在 `POST /api/v1/tenant/keys` 存的 Key。**Key 轮换 / 切换租户后，必须用新 Key（`agentx_...`）重新调 `POST /api/v1/tenant/keys` 为新租户存 BYOK**，得到新的 `tenantKeyId` 并更新环境变量；沿用旧租户的 `tenantKeyId` 会报 `400 { error: "Tenant API key not found or inactive" }`（不是 Key 失效，而是该 ID 不属于当前租户）。
> 若任务「瞬间 error」，先检查平台兜底 Key 是否有效 / 套餐是否有平台模型配额（见[常见问题](#11-常见问题)）

## 8. HTTP API 参考

以下端点均需 `X-Api-Key` 请求头。

### 租户

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/tenant/me` | 当前租户信息与能力 |

### 会话与任务（经 Gateway 代理）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/sessions` | 创建会话（幂等），body: `{ agentId }` |
| POST | `/api/v1/sessions/:sessionId/tasks` | 创建任务，body: `{ agentId, message }`（或 inline `{ message, prompt/skills }`）→ 201 返回 taskId |
| GET | `/api/v1/sessions/:sessionId/tasks` | 列出会话内任务 |
| GET | `/api/v1/tasks/:taskId` | 查询任务详情 |
| DELETE | `/api/v1/tasks/:taskId` | 取消任务 |
| GET | `/api/v1/tasks/:taskId/events` | SSE 事件流（重放历史事件后实时推送，30s 心跳） |

> `X-End-User-Id` 请求头（或 body `endUserId`）**可选，缺省不会被拒**（2026-08-08 澄清）：传 `0x` 钱包地址时按该用户订阅授权（B 端代调）；传其他值仅作记忆隔离。不传时授权主体回退到**租户自身钱包**——注册用户天然可用；partner 租户仅表示**不代理**（`partner-*` 非链地址无法命中链上订阅，授权失败时返回 `403 AGENT_ACCESS_DENIED`，非「缺 endUserId」拒绝）。平台**无**「必须带 endUserId」的强制校验。

### 对话

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/agent/runs` | 单轮对话，SSE 流式返回 |

## 9. MCP 接入（JSON-RPC）

平台暴露标准 MCP 端点 `POST <GATEWAY>/mcp`（共 38 个工具）。除链上数据外，还包含对话与并行任务管理工具：

| 工具 | 说明 | 鉴权 |
|---|---|---|
| `agentx_gateway_chat` | 单轮对话（SSE 聚合为 `{reply, tool_calls}`） | 仅 `access_token`（注册用户 JWT） |
| `agentx_gateway_create_session` | 创建会话（幂等） | 同上 |
| `agentx_gateway_create_task` | 创建后台任务（立即返回 taskId） | 同上 |
| `agentx_gateway_get_task` | 查询任务状态/结果 | 同上 |
| `agentx_gateway_list_tasks` | 会话内任务列表 | 同上 |
| `agentx_gateway_cancel_task` | 取消任务（终态幂等） | 同上 |

> ⚠️ **MCP 通道的对话 / 任务工具仅接受注册用户 `access_token`（钱包签名登录 Gateway 签发的 JWT），B 端集成 Key（`agentx_...`）不可用于 MCP 对话 / 任务**（R14 收紧，2026-08-06 起）。若你的调用方只有 B 端 Key，请改用 REST（`/api/v1/sessions*`）或 SDK `ConversationClient`——REST 通道一个 `agentx_` Key 即可。链上只读 / 写工具不受此限制。
>
> **边界说明（通用）**：以上仅针对 **AgentX 平台 MCP**（Gateway `/mcp` 的 `agentx_gateway_*` 工具，共 6 个：`chat` / `create_session` / `create_task` / `get_task` / `list_tasks` / `cancel_task`）。调用方**自建**的 MCP 服务器（如自部署的 aitrader-mcp、RAG MCP）鉴权由其自行配置，**不在平台边界内**——是否匿名放行、是否提供会话/任务工具，由调用方自己决定。
>
> **B 端（含 aihunter 等）最终用户的使用路径**：B 端 Key **不能**调平台 MCP 对话/任务工具（仅注册用户 JWT，R14 收紧，维持不变）。B 端用户的对话/任务能力已由 **REST + 一个 `agentx_` Key + `X-End-User-Id: 0x<钱包>`** 完整覆盖（端用户订阅转发，见 [§7](#7-sdk-接入示例)）——无需走 MCP。若未来需打通「B 端用户 → AgentX 注册用户 JWT」接入平台 MCP，作为独立需求另行设计。
>
> **B 端自建对话工具（inline 注入）**：若 B 端要让自己的 MCP/HTTP 工具进入对话，可直连 Conversation Service 的 `loadInline`——外部应用直接注入自己的 prompt + skills（含 `execution.type='mcp'/'http'` 工具），跳过平台 Agent 查找（内部 API，非公开 REST）。对话工具的完整模型见 [publish-subscribe-pay.md §1.6](publish-subscribe-pay.md)。

对话/任务工具的参数使用 snake_case（`access_token`/`session_id`/`task_id`/`agent_id`），鉴权凭据直接放在 `arguments` 中：

```bash
curl -s -X POST <GATEWAY>/mcp -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": {
    "name": "agentx_gateway_create_task",
    "arguments": {
      "access_token": "<user-jwt>",
      "session_id": "<session-id>",
      "message": "分析最近一周的交易",
      "agent_id": 1
    }
  }
}'
```

> 完整工具清单与 Claude Desktop 配置见仓库 `MCP_SETUP.md`。

## 10. 错误码

| HTTP | Code | 说明 | 处理 |
|---|---|---|---|
| 401 | — | Key 缺失 / 无效 / 已轮换 | 检查 `X-Api-Key`；在 Admin → Integrations 重新签发 |
| 403 | `PARALLEL_TASKS_DISABLED` | 该租户禁用了多任务 / 子 Agent | 回退单轮对话，或联系管理员在 Plans / Tenants 开启 |
| 404 | — | 会话 / 任务不存在 | 确认 ID 正确 |
| 409 | — | 冲突（如重复操作） | 按响应 detail 处理 |
| 429 | — | 触发限流：RPM（Free=5 / Pro=30 / Enterprise=100）或每日配额（`limit_type: "daily_quota"`，见 [§6](#6-付费与配额计费当前实况)） | 降低频率 / 切换 BYOK，或联系管理员调高配额 |
| 500 | — | 服务端异常 | 联系平台运维 |

## 11. 常见问题

| 现象 | 可能原因 | 处理 |
|---|---|---|
| 连接超时 | 网关地址从本团队网络不可达 | 确认可访问 `https://agentx.0xainet.top`，检查防火墙 / 白名单 |
| 如何代已订阅用户对话 | 直接调用按租户自身授权被 403 | 请求带 `X-End-User-Id: 0x<用户钱包>`（B 端代调，见 [§7](#7-sdk-接入示例)）；也可先 `GET /api/v1/chain/check-subscription` 确认订阅 |
| `401` 但 Key 未变 | Key 被团队内其他人轮换 | 联系平台管理员重新签发 |
| 任务瞬间 `error` | 平台兜底 LLM Key 无效 / 无平台模型配额 | 自带 LLM Key（BYOK 透传，见 [§7](#7-sdk-接入示例)），如仍失败检查 Key 的有效性与配额 |
| 报 `400 LLM_KEY_REQUIRED` | **该错误已不再返回**（2026-08-11 起 B 端任务不强制 BYOK） | 无需处理；不带 Key 时平台按 token 计费（见 [§6](#6-付费与配额计费当前实况)） |
| 报 `400 Tenant API key not found or inactive` | `tenantKeyId` 不属于当前租户（Key 轮换 / 切换租户后沿用了旧租户的 `tenantKeyId`） | 用当前租户的 `agentx_` Key 调 `POST /api/v1/tenant/keys` 重新存 BYOK，取新 `tenantKeyId` 更新 `.env`（`tenantKeyId` 严格按租户隔离，见 [§7](#7-sdk-接入示例)） |
| 报 `403 PARTNER_TASKS_DISABLED` | **该错误已废弃**（2026-08-08 起 B 端 Key 与注册用户能力统一） | 确认 Gateway 已升级；一个 `agentx_` Key 即可，无需第二把 Key |
| 多个调用方共用 Key | 用量 / 配额无法区分 | 每个调用方使用独立 Key |
| 无流式事件 | SSE 被网关 / 代理缓冲 | 确认使用 HTTP/1.1 且未启用 gzip 缓冲 |

## 12. 安全最佳实践

- **Key 不入库**：`.env` 加入 `.gitignore`，禁止提交含真实 Key 的配置到代码仓库
- **最小权限**：各团队仅使用自己调用方的 Key，不用跨团队混用
- **定期轮换**：人员变动或疑似泄露时立即在 Admin → Integrations 轮换
- **前端隔离**：Key 只存在于服务端环境变量，禁止在前端代码 / 浏览器中暴露
- **环境隔离**：dev / prod 建议使用不同租户，便于审计与配额隔离

---

## 附：调用方清单（示例）

| 调用方 | slug | 状态 |
|---|---|---|
| AItrader | `aitrader` | 已接入 |
| AIServicer | `aiservicer` | 已接入 |
| AIHunter SaaS | `aihunter-saas` | 已接入 |
| AutoOps | `autoops` | 已接入 |
| AIOps SaaS | `aiops-saas` | 待项目创建后配置 |

> 详细签发 / 轮换 / 管理流程见 AgentX Admin → Integrations 页面。
