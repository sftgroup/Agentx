# AgentX 接入/使用样例 — 第三方服务集成指南

> 面向任何想要接入 AgentX 平台的第三方服务（AI 助手平台、交易工具、SaaS 产品等）。
> 本文提供三种接入通道（SDK / MCP / REST）的完整可运行样例，以及必须注意的关键约定。
> 版本：SDK v0.11.6 · 2026-08-16
>
> 更完整的业务指南（发布 / 订阅 / 付费三轨 + 多 Agent 编排分层）见 [publish-subscribe-pay.md](./publish-subscribe-pay.md)。

---

## 1. 接入方式总览

| 通道 | 适用场景 | 入口 |
|------|----------|------|
| **SDK**（`@agentxv2/sdk`） | 业务后端需要读链数据 + 发起链上写操作 + 监听链上事件 | 直接使用 viem `PublicClient`/`WalletClient` |
| **MCP**（`POST /mcp`） | AI Agent / LLM 工具调用场景，标准 MCP JSON-RPC | Gateway 端点，32 个平台工具 |
| **REST**（`/api/v1/agents*`） | 前端或服务端需要快速查询 Agent 索引 | Gateway REST API |

```
第三方服务
   │
   ├─ SDK ────────────► 链上 IdentityRegistry / SubscriptionManager（实时、可写）
   ├─ MCP ────────────► Gateway /mcp（标准 MCP 协议，工具化）
   └─ REST ───────────► Gateway /api/v1/agents（DB 缓存索引，快速查询）
```

---

## 2. SDK 接入（推荐）

### 2.1 安装

```bash
npm install @agentxv2/sdk@0.11.5
```

### 2.2 初始化（chain-agnostic，viem）

```typescript
import { createPublicClient, createWalletClient, http } from 'viem'
import { AgentRegistry, SubscriptionManager } from '@agentxv2/sdk'

// 只读场景：仅需 PublicClient（无需钱包）
const publicClient = createPublicClient({
  transport: http('https://rpc-oxa.0xainet.top'),
})

// 写场景：需要 WalletClient（已连接的账户）
const walletClient = createWalletClient({
  transport: http('https://rpc-oxa.0xainet.top'),
  // account: '0x...'  // 或由外部钱包 provider 提供
})

const REGISTRY_ADDRESS = '0xbf5F9db266c8c97E3334466C88597Eb758AfE212'  // IdentityRegistry (OxaChain L1)
const SUBSCRIPTION_ADDRESS = '0x019AC9d945467478Dd371CDbD70cb2f325800E6B'  // SubscriptionManager (OxaChain L1)

const registry = new AgentRegistry({
  contractAddress: REGISTRY_ADDRESS,
  publicClient,
  walletClient,
})

const subscription = new SubscriptionManager({
  contractAddress: SUBSCRIPTION_ADDRESS,
  publicClient,
  walletClient,
})
```

### 2.3 读取：批量查询 Agent

```typescript
// 总注册数（直接读合约 totalAgents()，无需二分查找）
const total = await registry.totalAgents()
// → 62

// 全量拉取，带结构化元数据
const agents = await registry.getAllAgents({ fromId: 1, toId: total })

// 筛选：只看 active 的、具备某项能力的
const actives = await registry.getAllAgents({ activeOnly: true, capabilities: ['chat'] })

// 返回结构：
// { agentId, owner, tokenURI,
//   metadata: { name, description, capabilities, skills, isActive },
//   createdAt }

// 单个 Agent 详情
const meta = await registry.getAgentMetadata(1)
// → { name, description, encryptedPayloadCid, eciesEncryptedKey,
//     publicPayloadCid, capabilities, skills, isActive }
```

> **v0.8.1 容错解析**：部分 tokenURI 因合约 bug 损坏（base64 尾部垃圾 / JSON 未闭合）。
> SDK 会自动清理尾部垃圾、补齐未闭合引号/花括号，仍失败时 regex 兜底提取 `name`，
> 最终回退为 `Agent {id}`——与 Gateway indexer 行为一致，单条损坏数据不会导致整批查询失败。

> 可运行的完整 SDK 链上读取样例（生产地址）：[examples/sdk-chain-read.ts](../examples/sdk-chain-read.ts)

### 2.4 写入：创建套餐 + 订阅

```typescript
// 创建订阅套餐（返回的 planId 从 PlanCreated 事件解析，无需手动 parseLog）
const { planId, txHash } = await subscription.createPlan({
  agentId: 1,
  price: 10000000000000000n,   // bigint，单位 wei
  period: 'month',             // ⚠ 仅 'day' | 'week' | 'month' | 'year'
  trialDays: 0,                // 0-30
})

// 订阅（ETH：自动带 price；返回 subscriptionId/expiresAt 从 Subscribed 事件解析）
const { subscriptionId, subscriber, expiresAt } = await subscription.subscribe(planId)

// 一步完成：创建 + 订阅
const both = await subscription.createPlanAndSubscribe({
  agentId: 1,
  price: 10000000000000000n,
  period: 'month',
})
// → { planId, subscriptionId, txHash, expiresAt }
```

### 2.5 事件监听（替代轮询）

```typescript
import { subscribeToEvents } from '@agentxv2/sdk'

const unsubscribe = await subscribeToEvents(publicClient, {
  identityRegistryAddress: REGISTRY_ADDRESS,
  subscriptionManagerAddress: SUBSCRIPTION_ADDRESS,
  events: ['Transfer', 'AgentRegistered', 'PlanCreated', 'Subscribed'],
  onEvent: (event) => {
    // event.type / event.args / event.txHash
    if (event.type === 'Transfer') {
      // mint (from=0x0) / transfer / burn (to=0x0)
      console.log('agent 变更:', event.args.tokenId, event.args.to)
    }
  },
})

// 停止监听
// unsubscribe()
```

### 2.6 对话（可选，多租户 SSE）

```typescript
import { ConversationClient } from '@agentxv2/sdk/conversation'

const client = new ConversationClient({
  gatewayUrl: 'https://agentx.0xainet.top',
  apiKey: 'agentx_sk_live_...',   // 租户 API Key
  llmApiKey: 'sk-...',            // 可选：无状态 BYOK，自带 LLM Key
  llmEndpoint: 'https://api.deepseek.com/v1',
  llmModel: 'deepseek-v4-pro',
})

for await (const event of client.stream({ message: '你好', agentId: 1 })) {
  if (event.type === 'text') console.log(event.content)
}

// v0.8.6 存储式 BYOK：使用已在平台 Settings 保存的租户自有 key（明文不出服务器）
// 聊天链路也可传 tenantKeyId：client.stream({ agentId: 1, message: '...', tenantKeyId: 'key-01HX...' })
```

> **一个 `agentx_` Key 即可**（2026-08-08 起）：B 端集成 Key 与注册用户 JWT 在对话 / 会话 / 并行任务上能力一致（统一受套餐 / 租户能力位约束），无需第二把 Key。**建议自带 LLM Key**（上方 `llmApiKey` / `llmEndpoint` / `llmModel`）——计费落在自己账户；未传时走平台兜底 Key（受租户配额限制）。

### 2.7 购买平台套餐（v0.11.5，TenantPlanPayments）

平台订阅套餐（B 端面板可购买的 tier，含每日配额 / 限流）通过统一支付入口购买。chain / x402 需先发起链上支付再提交 `txHash`；fiat 直接返回 Stripe checkout 链接。

```typescript
import { TenantPlanPayments } from '@agentxv2/sdk'

const plans = new TenantPlanPayments({
  gatewayUrl: 'https://agentx.0xainet.top',
  chain: 'oxachain',
})

// x402 轨：先转账到 PAY_TO，再提交 txHash 绑定套餐
const bound = await plans.buy({
  method: 'x402',
  tenantPlanId: 'c9f4...',        // plans 表 UUID（GET /api/v1/admin/plans 或平台套餐页获取）
  subscriber: '0x你的钱包',
  txHash: '0x...',                // 链上支付交易
})
// → { method:'x402', tenantId, planId, planSlug, quotaDaily, txHash }

// fiat 轨：返回 Stripe checkout，用户完成支付后 webhook 自动绑定
const { sessionUrl } = await plans.buy({
  method: 'fiat',
  tenantPlanId: 'c9f4...',
  subscriber: '0x你的钱包',
  successUrl: 'https://app.example.com/b/success',
  cancelUrl: 'https://app.example.com/b',
})
```

### 2.8 A2A 按次付费（v0.11.5，多 Agent 编排服务端自动）

多 Agent 编排委派（a2a-worker 将子任务委派给未订阅的 Agent）时，服务端**自动按次扣费**——从调用者 x402 余额扣 `X402_PRICE_WEI`（`a2a_pay_log` 审计幂等），SDK 调用方**零改动**。缺余额时委派返回 `403 AGENT_ACCESS_DENIED`（充值后自动恢复）；对话/会话直达路径不触发按次扣费（仍按订阅判定）。

### 2.9 余额预检（v0.11.6，BillingClient，委派前查询 x402 余额）

按次付费前程序化预检余额，避免「先撞 403 再引导充值」：

```ts
import { BillingClient } from '@agentxv2/sdk'

const billing = new BillingClient({
  gatewayUrl: 'https://gw.example.com',
  apiKey: 'agentx_xxx', // 或 accessToken
})

// 租户余额（默认）
const { balance, balanceWei, currency, updatedAt, payTo, priceWei } = await billing.getBalance()

// 端用户余额（partner 透传端用户 0x 钱包，与 R19.7 口径一致）
const user = await billing.getBalance({ endUserId: '0xabc…' })

// 委派前预检：余额不足时展示充值引导
if (priceWei && BigInt(balanceWei) < BigInt(priceWei)) {
  // 引导端用户向 payTo 转原生代币（OXA），充值后自动恢复
}
```

- 余额为 0 / 未充值：返回 `balance: "0"`（正常响应，不抛错）；`balance` 为 OXA 高精度 decimal，`balanceWei` 为原始 wei（与 `priceWei` 精确比较）
- `payTo` / `priceWei` 仅当 x402 开启时返回
- 等价 REST：`GET /api/v1/billing/balance`（`X-Api-Key: agentx_xxx`；`X-End-User-Id: 0x…` 透传查端用户）

---

## 3. MCP 接入（AI Agent 工具化）

标准 MCP JSON-RPC 2.0，`POST <GATEWAY>/mcp`，共 38 个工具。

```bash
# 列出全部工具
curl -s -X POST https://agentx.0xainet.top/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# 批量查询 Agent（等价 SDK getAllAgents）
curl -s -X POST https://agentx.0xainet.top/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call",
       "params":{"name":"agentx_identity_list_all",
                 "arguments":{"chain":"oxachain","activeOnly":true}}}'

# 创建套餐（WRITE，返回待签名的交易参数）
curl -s -X POST https://agentx.0xainet.top/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call",
       "params":{"name":"agentx_subscription_create_plan",
                 "arguments":{"chain":"oxachain","agentId":1,
                              "price":"10000000000000000","period":"month"}}}'
```

> MCP 返回格式为标准 `result.content[0].text`（JSON 字符串），解析后即结果。
> 工具清单与说明见 [`MCP_SETUP.md`](../MCP_SETUP.md)。

---

## 4. REST 接入（快速查询索引）

Gateway 维护 Agent 链上索引（事件驱动增量同步 + 全量兜底），查询走 PostgreSQL，速度快。

```bash
# 列表 + 分页 + 筛选
curl -s "https://agentx.0xainet.top/api/v1/agents?activeOnly=true&page=1&pageSize=50"

# 统计
curl -s "https://agentx.0xainet.top/api/v1/agents/count"
# → {"total":62,"active":62}

# 单个详情
curl -s "https://agentx.0xainet.top/api/v1/agents/1"
```

---

## 5. 关键约定（必须注意）

1. **period 枚举**：`createPlan` 的 `period` 只接受 `'day' | 'week' | 'month' | 'year'`。合约 `_periodToSeconds` 只映射这四个值，传其他字符串（如 `'monthly'`/`'quarterly'`）会被**静默回退为 30 天**，SDK 会在运行时直接抛错。
2. **金额单位**：`price` 为 bigint，单位 wei（或 ERC20 最小单位）。
3. **链参数**：MCP/REST 请求需指定 `chain: "oxachain" | "sepolia"`；SDK 由你传入的 RPC/合约地址决定。
4. **WRITE 工具**：MCP 写操作返回待签名的交易参数（`_writeOp`），真正的交易签名/发送由调用方用钱包完成。
5. **事件解析**：`createPlan`/`subscribe` 的返回值已从链上事件解析出 `planId`/`subscriptionId`/`expiresAt`，无需自行 `parseLog`。

---

## 6. 完整最小示例（Node.js，纯 fetch，无额外依赖）

```javascript
// example.mjs — 验证 MCP 通道联通性（等价第 3 节）
const MCP_URL = 'https://agentx.0xainet.top/mcp'
const rpc = async (method, params) => {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const json = await res.json()
  if (json.error) throw new Error(JSON.stringify(json.error))
  return json.result
}

const tools = (await rpc('tools/list')).tools
console.log('工具数:', tools.length)  // → 38

const res = await rpc('tools/call', {
  name: 'agentx_identity_list_all',
  arguments: { chain: 'oxachain', fromId: 1, toId: 3 },
})
const { agents } = JSON.parse(res.content[0].text)
console.log('前 3 个 Agent:', agents.map(a => ({ id: a.agentId, name: a.metadata.name })))
```
