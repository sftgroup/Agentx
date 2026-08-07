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
6. [SDK 接入示例](#6-sdk-接入示例)
7. [HTTP API 参考](#7-http-api-参考)
8. [错误码](#8-错误码)
9. [常见问题](#9-常见问题)
10. [安全最佳实践](#10-安全最佳实践)

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
- **能力开关**：平台可对套餐 / 租户维度启用或禁用「多任务并行 / 子 Agent」能力（见错误码 `403`）

## 3. 环境变量配置

每个调用方只需配置两个变量：

| 变量 | 说明 | 必填 | 示例 |
|---|---|---|---|
| `AGENTX_GATEWAY_URL` | AgentX 网关地址（从本团队网络可达） | ✅ | `http://43.159.60.46:3090` |
| `AGENTX_CONVERSATION_API_KEY` | 本团队租户 Key（`agentx_` 开头） | ✅ | `agentx_<your-key>` |

```bash
# .env 示例
export AGENTX_GATEWAY_URL=http://43.159.60.46:3090
export AGENTX_CONVERSATION_API_KEY=agentx_<your-key>
```

### 多调用方场景

同一项目若需接入多个调用方，请使用前缀区分，避免变量名冲突：

```bash
AITRADER_AGENTX_GATEWAY_URL=http://43.159.60.46:3090
AITRADER_AGENTX_CONVERSATION_API_KEY=agentx_<aitrader-key>
AISERVICER_AGENTX_GATEWAY_URL=http://43.159.60.46:3090
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
- 返回 `401` → Key 错误或已被轮换（见 [错误码](#8-错误码)）
- 配额 / 限流 / 并发等数值以 `plan` 对象为准（随套餐不同而不同）

## 6. SDK 接入示例

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
})
```

### 会话与任务（推荐，支持并行与取消）

```ts
// 1. 创建会话（幂等：同 agent+租户重复创建返回已有会话）
const session = await client.createSession({ agentId: 1 })

// 2. 提交任务，立即返回 taskId，后台并行执行
const task = await client.createTask(session.sessionId, { input: '你好' })

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
- 若任务「瞬间 error」，先检查是否未配置 BYOK / BYOK 无效（见[常见问题](#9-常见问题)）

## 7. HTTP API 参考

以下端点均需 `X-Api-Key` 请求头。

### 租户

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/tenant/me` | 当前租户信息与能力 |

### 会话与任务（经 Gateway 代理）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/sessions` | 创建会话（幂等），body: `{ agentId }` |
| POST | `/api/v1/sessions/:sessionId/tasks` | 创建任务，body: `{ input }` → 201 返回 taskId |
| GET | `/api/v1/sessions/:sessionId/tasks` | 列出会话内任务 |
| GET | `/api/v1/tasks/:taskId` | 查询任务详情 |
| DELETE | `/api/v1/tasks/:taskId` | 取消任务 |
| GET | `/api/v1/tasks/:taskId/events` | SSE 事件流（重放历史事件后实时推送，30s 心跳） |

### 对话

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/agent/runs` | 单轮对话，SSE 流式返回 |

## 7.5 MCP 接入（JSON-RPC）

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

## 8. 错误码

| HTTP | Code | 说明 | 处理 |
|---|---|---|---|
| 401 | — | Key 缺失 / 无效 / 已轮换 | 检查 `X-Api-Key`；在 Admin → Integrations 重新签发 |
| 403 | `PARALLEL_TASKS_DISABLED` | 该租户禁用了多任务 / 子 Agent | 回退单轮对话，或联系管理员在 Plans / Tenants 开启 |
| 404 | — | 会话 / 任务不存在 | 确认 ID 正确 |
| 409 | — | 冲突（如重复操作） | 按响应 detail 处理 |
| 429 | — | 触发限流（RPM 随套餐而定：Free=5 / Pro=30 / Enterprise=100，租户可覆盖） | 降低频率，或联系管理员调高配额 |
| 500 | — | 服务端异常 | 联系平台运维 |

## 9. 常见问题

| 现象 | 可能原因 | 处理 |
|---|---|---|
| 连接超时 | 网关地址从本团队网络不可达 | 确认可访问 `43.159.60.46:3090`，检查防火墙 / 白名单 |
| `401` 但 Key 未变 | Key 被团队内其他人轮换 | 联系平台管理员重新签发 |
| 任务瞬间 `error` | 平台兜底 LLM Key 无效 / 未配置 BYOK | 配置团队自己的 LLM Key（BYOK 透传，见 [§6](#6-sdk-接入示例)），如仍失败检查 Key 的有效性与配额 |
| 报 `403 PARTNER_TASKS_DISABLED` | **该错误已废弃**（2026-08-08 起 B 端 Key 与注册用户能力统一） | 确认 Gateway 已升级；一个 `agentx_` Key 即可，无需第二把 Key |
| 多个调用方共用 Key | 用量 / 配额无法区分 | 每个调用方使用独立 Key |
| 无流式事件 | SSE 被网关 / 代理缓冲 | 确认使用 HTTP/1.1 且未启用 gzip 缓冲 |

## 10. 安全最佳实践

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
