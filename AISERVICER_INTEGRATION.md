# aiservicer — AgentX 对话服务接入说明

> 版本：v1 · 2026-08-04
> 适用项目：aiservicer（外部服务端集成）
> 服务：AgentX Conversation Service（多租户对话执行引擎，SSE 流式输出）

---

## 1. 接入方式总览

| 方式 | 鉴权凭据 | 入口 | 适用场景 |
|------|----------|------|----------|
| **A. Internal Token** | `AGENTX_CONVERSATION_TOKEN` | 直连 Conversation Service | 内部/受信网络调用，绕过 Gateway |
| **B. 租户 API Key（推荐）** | `AGENTX_CONVERSATION_API_KEY` | 经 AgentX Gateway | 外部服务接入，走平台鉴权/配额/计费 |

> 生产地址由 AgentX 平台提供（Gateway 公网地址 / Conversation Service 内网地址）。下文中 `<GATEWAY_BASE_URL>` / `<CONV_BASE_URL>` 为占位符。

---

## 2. 凭据

> 真实值由 AgentX 平台管理员下发，本仓库文档不含真实密钥。

```bash
# 方式 A（直连 Conversation Service）
AGENTX_CONVERSATION_TOKEN=<由 AgentX 提供>

# 方式 B（租户 API Key，推荐）
AGENTX_CONVERSATION_API_KEY=<由 AgentX 提供，agentx_ 开头>
```

---

## 3. 方式 B：租户 API Key（推荐，走 Gateway）

统一入口：`POST <GATEWAY_BASE_URL>/api/v1/agent/runs`（SSE 流式）

### 请求头

| Header | 必填 | 说明 |
|--------|------|------|
| `X-Api-Key` | ✅ | 租户 API Key（方式 B 鉴权） |
| `Content-Type` | ✅ | `application/json` |
| `X-End-User-Id` | 可选 | 端用户 ID，用于记忆隔离（多用户场景必传） |
| `X-Llm-Api-Key` | 可选 | **无状态 BYOK**：调用方自持 LLM Key（优先级最高，不落库） |
| `X-Llm-Endpoint` | 可选 | 与 `X-Llm-Api-Key` 配套的自定义 LLM 端点（如 DeepSeek `https://api.deepseek.com/v1`；缺省 OpenAI） |

> **无状态 BYOK**：只需在请求头带上调用方自己的 `X-Llm-Api-Key`（+ 非 OpenAI 时带 `X-Llm-Endpoint`），对话服务直接透传使用，**无需在 AgentX 侧配置或托管任何 Key**。每个请求独立，可自由切换供应商。

### 请求体

```json
{
  "message": "帮我分析这个合约的风险",
  "agentId": 42,
  "enableMemory": true,
  "history": [{ "role": "user", "content": "你好" }],
  "contextBudget": 8000
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `message` | string | ✅ | 用户消息 |
| `agentId` | number | 二选一 | AgentX 已注册 Agent ID |
| `prompt` / `skills[]` | string / array | 二选一 | Inline 模式：自带提示词 + 工具，见 §5 |
| `enableMemory` | bool | 否 | 是否启用跨会话记忆（默认 false） |
| `history` | array | 否 | 多轮上下文（`{role, content}[]`） |
| `contextBudget` | number | 否 | 上下文 token 预算，超出自动压缩 |

### 响应：SSE 事件流

`data: {json}` 每行一个事件：

| type | 说明 | 关键字段 |
|------|------|----------|
| `thinking` | 思考/准备阶段 | `content` |
| `tool_call` | 工具调用 | `toolName`, `toolArgs` |
| `tool_result` | 工具结果 | `toolName`, `toolResult` |
| `text` | 最终回复文本 | `content` |
| `clarification` | 请求模糊，被打断澄清 | `question` |
| `done` | 完成 | `usage`, `iterations` |
| `error` | 失败 | `error` |

> `clarification`：当请求意图模糊时服务会中断执行并发回澄清问题，调用方应把 `question` 展示给用户、收集答案后带着 `history` 重试。

---

## 4. 方式 A：Internal Token（直连，内部专用）

入口：`POST <CONV_BASE_URL>/runs`（SSE）

| Header | 说明 |
|--------|------|
| `X-Internal-Token` | 方式 A 鉴权 |
| `X-Tenant-Address` | 租户标识（0x 地址） |
| `X-Llm-Api-Key` | 可选：无状态 BYOK，自带 LLM Key |
| `X-Llm-Endpoint` | 可选：与 `X-Llm-Api-Key` 配套的 LLM 端点（缺省 OpenAI） |
| `X-End-User-Id` | 可选：端用户记忆隔离 |

请求体与方式 B 相同（`agentId` 或 inline `prompt`/`skills` 二选一）。

---

## 5. Inline 模式 — 注入自有工具（含 RAG）

无需注册 AgentX Agent，请求体直传 `prompt` + `skills[]`，每个 skill 可挂 MCP/HTTP 工具端点：

```json
{
  "message": "根据知识库回答：AgentX 支持哪些链？",
  "prompt": "你是客服助手，回答前先调用 rag_query 检索知识库。",
  "skills": [
    {
      "name": "rag_query",
      "description": "Retrieve relevant chunks from the knowledge base",
      "inputSchema": {
        "type": "object",
        "properties": { "query": { "type": "string" } },
        "required": ["query"]
      },
      "execution": {
        "type": "mcp",
        "endpoint": "https://your-rag-mcp.example.com/mcp",
        "toolName": "rag_query"
      }
    }
  ],
  "enableMemory": false
}
```

| execution.type | 说明 |
|----------------|------|
| `mcp` | MCP JSON-RPC 2.0 远程工具（`endpoint` + `toolName`） |
| `http` | 普通 HTTP POST 工具（`endpoint`，body 为 input） |
| `a2a` | Agent 间委派（`targetAgentId`） |

> 工具端点鉴权由调用方自持：服务只做转发（30s 超时），请自行保证 `endpoint` 的访问安全。

---

## 6. 记忆与多用户隔离

- 记忆按 `(租户 + agent + end_user)` 三级隔离
- **多端用户场景**：每次请求必须传 `X-End-User-Id`，否则所有用户共享 `default` 记忆桶
- 记忆事实带置信度，低于 `MEMORY_CONFIDENCE_THRESHOLD`（默认 0.5）的不入库
- 短程上下文（多轮）由调用方自行维护 `history[]` 传回

---

## 7. 配额（当前套餐：Enterprise）

| 项 | 限额 |
|----|------|
| 日配额 | 5,000,000 次 |
| 速率 | 100 RPM |
| 并发 | 10 |

---

## 8. 错误码

| HTTP | 场景 |
|------|------|
| 400 | 缺少 `message` / 缺少 `agentId` 或 inline |
| 401 | API Key 无效或缺失（方式 B）/ Internal Token 无效（方式 A） |
| 403 | 租户被暂停 / 超配额 |
| 429 | 触发 RPM 限流 |
| 500 | 服务内部错误 |

SSE 内错误以 `data: {"type":"error","error":"..."}` 呈现。

---

## 9. 快速开始（最终形态：无状态 BYOK）

无需 AgentX 侧配置任何 Key —— aiservicer 每次请求自带自己的 DeepSeek Key + 端点即可：

### 9.1 curl（方式 B，走 Gateway）

```bash
curl -N -X POST <GATEWAY_BASE_URL>/api/v1/agent/runs \
  -H "X-Api-Key: <AGENTX_CONVERSATION_API_KEY>" \
  -H "X-Llm-Api-Key: <AISERVICER_DEEPSEEK_API_KEY>" \
  -H "X-Llm-Endpoint: https://api.deepseek.com/v1" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "你好，介绍一下你自己",
    "prompt": "你是 aiservicer 的客服助手。",
    "enableMemory": false
  }'
```

### 9.2 SDK（v0.7.3）

```bash
npm install @agentxv2/sdk@0.7.3
```

```ts
import { ConversationClient } from '@agentxv2/sdk/conversation'

const client = new ConversationClient({
  gatewayUrl: '<GATEWAY_BASE_URL>',
  apiKey: '<AGENTX_CONVERSATION_API_KEY>',
  // 无状态 BYOK：aiservicer 自己的 DeepSeek Key + 端点，AgentX 侧零配置
  llmApiKey: '<AISERVICER_DEEPSEEK_API_KEY>',
  llmEndpoint: 'https://api.deepseek.com/v1',
  endUserId: 'user-123',   // 多用户场景必传，用于记忆隔离
})

// 流式
for await (const event of client.stream({ message: '你好', enableMemory: true })) {
  if (event.type === 'text') console.log(event.content)
  if (event.type === 'clarification') console.log('需要澄清：', event.question)
  if (event.type === 'done') console.log('usage:', event.usage)
}

// 聚合
const result = await client.chat({ message: '你好' })
console.log(result.text)
```

### 9.3 鉴权自检

```bash
# 期望 400（缺少 message）而非 401 → 鉴权通过
curl -i -X POST <GATEWAY_BASE_URL>/api/v1/agent/runs \
  -H "X-Api-Key: <AGENTX_CONVERSATION_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

> 完整服务端协议见仓库 [CONVERSATION_SERVICE.md](CONVERSATION_SERVICE.md)，SDK 用法见 [INTEGRATION.md](INTEGRATION.md)（`ConversationClient`，v0.7.3）。
