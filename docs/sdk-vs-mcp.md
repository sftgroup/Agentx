# SDK vs MCP — 使用场景与区别

> AgentX 提供两种链上数据/能力接入方式：**[`@agentxv2/sdk`](https://www.npmjs.com/package/@agentxv2/sdk)（直连区块链）** 与 **[`@agentxv2/mcp`](https://www.npmjs.com/package/@agentxv2/mcp)（经 Gateway MCP 协议）**。
> 版本：SDK v0.11.7 · MCP 客户端 v0.1.0 · 2026-08-20（MCP 已新增对话/任务管理工具，工具数 32→38；SDK 新增 BillingClient 余额预检 + AgentWalletConfig agent 自主钱包管理）

---

## 1. 一句话区别

| | **SDK** | **MCP 客户端** |
|---|---|---|
| 本质 | 直连区块链的**库**（viem，链无关） | 连 AgentX Gateway 的 **MCP 协议客户端** |
| 你需要提供 | RPC 端点 + 合约地址 +（写时）钱包密钥 | 只需 Gateway URL |
| 数据路径 | 你 → 区块链 RPC | 你 → AgentX Gateway → 区块链 RPC |

```
SDK:   你的服务 ──viem──► RPC ──► 智能合约（6 个）
MCP:   你的服务 ──JSON-RPC──► Gateway /mcp ──ethers──► 智能合约
```

---

## 2. 能力对比

| 能力 | SDK | MCP | 说明 |
|------|:--:|:--:|------|
| 读链上 Agent 数据（批量/筛选） | ✅ `getAllAgents()` | ✅ `listAgents()` | **等价**（同一个 `IdentityRegistry` 读取，均为实时链上） |
| 单个元数据 / 总数 / 存在性 | ✅ | ✅ | 均有对应方法 |
| **真实交易写操作**（创建套餐/订阅/注册） | ✅ 直接签名提交，返回 `txHash` + 事件解析的 `planId`/`subscriptionId` | ⚠️ 只返回 **WRITE 描述**（`_writeOp` + 合约地址 + 参数），**不持有你的密钥**，交易仍需你钱包签名提交 | 核心差异 |
| 订阅套餐查询 | ✅ `getPlan()` | ✅ `getPlan()` | 等价（`price` 均为 wei 字符串） |
| **事件监听**（实时增量） | ✅ `subscribeToEvents()` | ❌ 无 | MCP 是请求-响应协议，无事件流；增量需自己轮询 |
| 加密工具（ECIES/AES-256-GCM） | ✅ | ❌ | SDK 独有（端到端加密负载） |
| IPFS 上传 | ✅ | ❌ | SDK 独有 |
| AgentLoop / 对话（SSE） | ✅ `ConversationClient` | ✅ `agentx_gateway_chat` | SDK 直连流式；MCP 经 Gateway 聚合 SSE 为 `reply`（2026-08-06 新增） |
| 会话 / 并行任务管理 | ✅ `createSession`/`createTask`/`getTask`/`listTasks`/`cancelTask` | ✅ `agentx_gateway_create_session`/`create_task`/`get_task`/`list_tasks`/`cancel_task` | 双通道等价（MCP 2026-08-06 新增，需 `api_key`/`access_token`） |
| A2A / 信誉 / 配置 / 端点工具 | ⚠️ 部分（SDK 提供 A2A daemon 等） | ✅ 全部 38 工具 | MCP 覆盖 6 个合约的读 + WRITE 描述 |
| 平台健康/租户信息 | ❌ | ✅ `gatewayHealth()` / `gatewayTenant()` | MCP 独有（需要 `X-Api-Key` 的租户工具） |

> **关键点**：SDK 的写操作是"真实交易"（签名+提交），MCP 的写操作是"指令描述"（安全，不托管密钥）。**MCP 不能替你发交易**——这是架构性差异，不是功能缺失。

---

## 3. 使用场景

### 用 SDK（深度集成 / 需要交易 / 需要事件）

- **DApp / 前端**：展示 Agent 列表、订阅支付、创建套餐 —— 结合 wagmi 钱包，用户签名真实交易
- **服务端后端**：批量同步链上数据到自有数据库（`getAllAgents` 全量拉取）；监听链上事件做增量（`subscribeToEvents`）
- **需要加密/IPFS**：端到端加密负载（ECIES 包装 + AES-256-GCM）、上传元数据到 IPFS
- **对话能力**：`ConversationClient` 走 SSE 流式对话（BYOK 透传）

```typescript
import { AgentRegistry, SubscriptionManager, subscribeToEvents } from '@agentxv2/sdk'

// 读：批量 + 筛选
const agents = await registry.getAllAgents({ activeOnly: true, capabilities: ['chat'] })
// 写：真实交易（钱包签名）
const { planId, txHash } = await subscription.createPlan({ agentId: 1, price: 1n, period: 'month' })
// 事件：增量同步
const unwatch = await subscribeToEvents(publicClient, { events: ['Transfer'], onEvent: (e) => {} })
```

### 用 MCP 客户端 — 快速接入与只读场景（经 Gateway）

- **AI Agent / LLM 工具调用**：让 Agent 通过 `tools/list` 动态发现 38 个工具，自然语言驱动读取链上数据、发起对话与并行任务
- **第三方服务快速接入**：一行 `new McpClient({ gatewayUrl })`，无需 RPC/合约地址/链配置
- **只读为主 + 少量写**：读套餐、查订阅状态、查平台费率；写操作拿描述后由自有钱包处理
- **版本解耦**：Gateway 新增工具即时可用（`tools/list` 动态发现），客户端无需升级

```typescript
import { McpClient } from '@agentxv2/mcp'

const mcp = new McpClient({ gatewayUrl: 'https://agentx.0xainet.top', defaultChain: 'oxachain' })

const tools = await mcp.listTools()              // → 38
const { agents } = await mcp.listAgents({ activeOnly: true })
const plan = await mcp.getPlan(1)                // → price/period/...
const op = await mcp.createPlan({ agentId: 2, price: '10000000000000000', period: 'month' })
// op = { _writeOp: true, contract, chain, args } → 用钱包签名提交

// 对话 + 并行任务（需 api_key / access_token 参数）
const { id: sessionId } = await mcp.callTool('agentx_gateway_create_session', { api_key: 'agentx_...', agent_id: 1 })
const task = await mcp.callTool('agentx_gateway_create_task', { api_key: 'agentx_...', session_id: sessionId, message: '分析数据', agent_id: 1 })
// → { id, status: "queued", ... }；get_task / list_tasks / cancel_task 参数风格相同
```

---

## 4. 选型决策树

```
我需要做什么？（与 README 引言完全一致）
├─ 深度集成：链上读写 / 真实交易（订阅、创建套餐）/ 事件监听 / 加密 / IPFS / 对话 SSE
│     → **SDK**（直连区块链）
├─ AI Agent 工具化调用（LLM 驱动，38 个工具动态发现，含对话/任务）
│     → **MCP 客户端**（经 Gateway）
├─ 快速接入、只读为主、不想配置 RPC / 合约地址
│     → **MCP 客户端**（零依赖、免链配置）
└─ 两者都行：MCP 更轻（零依赖），SDK 更全（直连 + 交易 + 事件）
```

---

## 5. 其他差异

| 维度 | SDK | MCP 客户端 |
|------|-----|-----------|
| 运行时依赖 | viem（+ wagmi/react 可选，peer） | **零依赖**（原生 fetch） |
| 网络 | 直连区块链 RPC（可用公网/私有节点） | 需可访问 AgentX Gateway |
| 鉴权 | 链上签名（无平台鉴权） | 默认公开；租户工具可带 `X-Api-Key` |
| 更新方式 | 随 npm 版本发布，功能变更需升级 | 服务端工具升级即时生效 |
| 浏览器 | ✅（可配 wagmi 钱包） | ✅（fetch） |
| 失败模式 | RPC 不可用则失败 | Gateway 不可用则失败（单点，但省去链配置） |

---

## 6. 相关文档

- SDK 使用：仓库 [sdk/README.md](../sdk/README.md) · [INTEGRATION.md](../INTEGRATION.md) · [UPGRADE.md](../sdk/UPGRADE.md)
- MCP：仓库 [MCP_SETUP.md](../MCP_SETUP.md) · 包 [@agentxv2/mcp README](../mcp/README.md)
- 三通道接入样例（SDK / MCP / REST）：[docs/sdk-integration-example.md](sdk-integration-example.md)
- **双通道 DApp 代码示例（SDK + MCP 同时使用）**：[examples/sdk-mcp-dapp.ts](../examples/sdk-mcp-dapp.ts)
- 链上数据需求实现状态：[docs/agent-sync-service-proposal.md](agent-sync-service-proposal.md)
