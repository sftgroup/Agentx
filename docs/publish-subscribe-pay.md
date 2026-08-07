# AgentX 发布 / 订阅 / 付费 集成指南

> 适用版本：`@agentxv2/sdk >= 0.9.4`（含 `AgentCategory` / `AGENT_CATEGORIES`）
> 面向对象：集成方（想把自己的 Agent 发布到 AgentX 市场、并对用户订阅/付费进行管理的团队）

AgentX 有三角色：

| 角色 | 做什么 | 是否付费 |
|---|---|---|
| **发布者（Publisher）** | 发布 Agent、定价、收订阅费 | 免费（写自己的 Agent） |
| **订阅者（Subscriber）** | 订阅付费 Agent、获得访问权 | 付费（chain / fiat / x402） |
| **调用者（Caller）** | 通过对话/API 使用 Agent | 自己写的免费；市场中的必须付费 |

> **访问边界（强制）**：任何人都只能**与自己写的** 或 **已订阅的** Agent 对话/编排委派。
> 市场中的其他 Agent 未订阅时返回 `403 AGENT_ACCESS_DENIED`（x402 按次付费通过者除外）。

---

## 一、发布 Agent（Publish）

### 1.1 前端入口与交互

前端路径：**Studio**（侧边栏 `Studio` → 四步向导）。

| 步骤 | 页面 | 填什么 |
|---|---|---|
| 1 | Basics | 名称、描述、系统提示词、标签、**应用类别（必选）** |
| 2 | Skills | 技能（name / description / endpoint） |
| 3 | Pricing | 计费方式：`订阅`（subscription）或 `按次付费`（pay-per-use）+ 价格 |
| 4 | Publish | 连接钱包 → 加密负载上传 IPFS → 链上注册（一次交易） |

发布后 Agent 立即出现在 **Marketplace** 中，并按其 `category` 落入对应**应用分类**标签页。

### 1.2 必填字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `name` | string | ✅ | Agent 名称（3–50 字符） |
| `description` | string | ✅ | 描述（≥20 字符），市场卡片与列表展示 |
| `prompt` | string | ✅ | 系统提示词（≥10 字符），定义 Agent 行为；**私有，加密存储** |
| `category` | string | ✅ | **应用类别 / 用途** —— 决定 Agent 落入哪个应用筛选（见 1.3） |
| `pricing.type` | `'subscription' \| 'pay_per_use'` | ✅ | 计费方式 |
| `pricing.amount` | string | ✅ | 价格（wei；`pay_per_use` 为每请求单价） |
| `tags` | string[] | ⭕ | 市场搜索标签 |
| `capabilities` | string[] | ⭕ | 能力声明（chat / mcp …） |
| `skills` | SkillDef[] | ⭕ | 技能列表（私有加密） |
| `version` | string | ⭕ | 默认 `1.0.0` |
| `image` | string | ⭕ | 封面图 URL（CID） |

> `category` 前端 Studio 已强制必选；SDK 层为可选类型以兼容历史数据，未提供的历史 Agent 展示为 `other`。

### 1.3 应用类别（category）—— 重点

`category` 是 Agent 的**应用分类 / 用途**。Marketplace 顶部分类标签页与各应用集成（运营、客服、销售…）都按此字段筛选。**发布时必须设置，否则 Agent 不会落入任何应用分类（归入 `other`）**。

SDK 枚举（`AGENT_CATEGORIES`，与前端 Studio 下拉一致）：

| 值（value，存链上） | 中文用途 |
|---|---|
| `operations` | 运营 |
| `customer-service` | 客服 |
| `sales` | 销售 |
| `personal-assistant` | 个人助理 |
| `coding` | 写代码 / 开发 |
| `server-monitoring` | 服务器监控 |
| `airdrop` | 空投 |
| `quant-trading` | 量化策略 |
| `data-analysis` | 数据分析 |
| `content` | 内容创作 |
| `security` | 安全 |
| `finance` | 金融 |
| `other` | 其他 / 未分类 |

前端展示：市场顶部分类按钮组（全部应用 / 运营 / 客服 / …），选中即筛选该分类；每张 Agent 卡片右上角显示分类标签。

### 1.4 数据流（发布时发生了什么）

```
SDK publishAgent / 前端 Studio
  1. prompt/skills/mcp 用 AES-256-GCM 加密 → IPFS（private payload）
  2. name/description/tags/capabilities/category + ECIES 加密的 AES 密钥 → IPFS（public metadata）
  3. 链上注册（IdentityRegistry.registerAgentWithMetadata）：
     tokenURI = private payload 的 IPFS URL
     metadata attrs = { name, description, category, pricing_type, price_wei, aes_key_hex, tags }
  4. Gateway 索引器解析链上 attrs + tokenURI → agents 表（含 category 列）
  5. Marketplace 从 Gateway /api/v1/agents 读取，按 category 分类展示
```

### 1.5 SDK 示例（发布）

```ts
import { publishAgent, IPFSUploader, AGENT_CATEGORIES } from '@agentxv2/sdk'

const agent = {
  name: 'Airdrop Hunter',
  description: 'Monitors and reports new airdrop opportunities on-chain.',
  version: '1.0.0',
  tags: ['airdrop', 'defi'],
  category: 'airdrop',                    // ← 必填：应用类别
  capabilities: ['chat', 'mcp'],
  supportedTasks: ['conversation'],
  communicationProtocol: 'mcp',
  authenticationMethod: 'ecdsa',
  pricing: { type: 'subscription', currency: 'ETH', amount: '100000000000000000' }, // 0.1 ETH
  prompt: 'You are an airdrop monitoring agent...',
  skills: [],
  mcp: { type: 'http', url: 'https://...' },
}

const uploader = new IPFSUploader({ pinataJwt: process.env.PINATA_JWT! }) // 或 customEndpoint 走你的代理

const result = await publishAgent({ agent, publicKey, uploader })
// result.encryptedCid → 用此 CID 作为链上 tokenURI 注册
// result.publicCid   → 公开元数据（含 category）
```

> **服务端代理**：浏览器前端不应持有 Pinata JWT。推荐后端代理 `/api/ipfs/upload-json` 方式（JWT 只在服务端），SDK `IPFSUploader` 也支持 `customEndpoint` 指向你自己的代理。

---

## 二、订阅 Agent（Subscribe）

### 2.1 三种支付方式（Multi-Rail）

| 方式 | 支付轨道 | 需要钱包 | 适合 |
|---|---|---|---|
| `chain` | 链上 `SubscriptionManager` escrow（原生/ERC20） | ✅ | 加密原住民 |
| `fiat` | Stripe 信用卡（统一端点，自动按 planId 定价） | ❌ | Web2 用户 |
| `x402` | 原生代币周期支付（`X-402` / `PAYMENT-SIGNATURE`） | ✅ | 按次/免密 |

三轨共用同一份访问控制：**「链上订阅 OR fiat/x402 订阅」任一通过即视为已订阅**。

### 2.2 前端交互

- **Marketplace 卡片**：点击 Agent → 详情页 → 「Subscribe / 订阅」。
- **订阅详情页**（`/user/subscriptions/[subscriptionId]`）：续费时**三选一** —— 钱包（chain）/ 信用卡（fiat）/ x402。
- **我的订阅**（`/user/subscriptions`）：列出已订阅 Agent 与到期时间。
- **我的对话**（`/user/chat`）：列出「自己写的 + 已订阅的」Agent，点击即对话。

### 2.3 SDK 示例（订阅）

```ts
import { SubscriptionPayments } from '@agentxv2/sdk'

const sp = new SubscriptionPayments({ chain, publicClient, walletClient })

// 1) 订阅（三选一）
await sp.pay({ method: 'chain', agentId, planId, subscriber: myAddress })   // 链上 escrow
await sp.pay({ method: 'fiat', agentId, planId, ... })                      // Stripe → 返回 sessionUrl 跳转
await sp.pay({ method: 'x402', agentId, planId, ... })                      // 原生代币周期支付

// 2) 访问判定（链上 OR fiat/x402）
const ok = await sp.hasAccess(agentId, myAddress)
if (!ok) { /* 引导订阅 */ }
```

---

## 三、付费（Pay）与访问控制

### 3.1 按次付费（x402，免订阅）

若 Agent/平台开启 x402（`X402_PRICE_WEI`），对话路径 `POST /api/v1/agent/runs` 会要求请求头携带支付凭证（`PAYMENT-SIGNATURE` / `X-PAYMENT` / 余额抵扣）。**通过 x402 付费的调用者免订阅直接对话**。

前端自动处理：对话页检测 `402 + payment-response` 头 → 弹出支付（钱包签名或余额抵扣）→ 重试。

### 3.2 统一访问控制（服务端强制）

| 路径 | 校验 |
|---|---|
| `POST /api/v1/agent/runs`（对话） | agentId 模式：`canAccessAgent`（自己写的 OR 已订阅 OR x402 已付费） |
| `POST /api/v1/sessions` / `/sessions/:id/tasks` | 同上 |
| 多 Agent 编排（a2a-worker） | `agentx_list_agents` 只列可访问 Agent；委派前校验，无权限拒绝 |
| MCP / 链上 API | `hasSubscriptionAccess`（既有） |

无权限响应：

```json
{ "error": "No subscription access to this agent", "code": "AGENT_ACCESS_DENIED" }
```

### 3.3 多 Agent 编排边界

主 Agent（对话中）的 LLM 可自主委派子任务给其他 Agent，但**只能委派给「调用者自己写的」或「已订阅的」Agent**：

- `agentx_list_agents` → 只返回该调用者可访问的 Agent（过滤后）
- `agentx_a2a_create_task` → 目标无权限时直接拒绝（不会产生链上交易）

对用户完全透明：编排发生在对话后端，前端「A2A Tasks」页仅用于追踪任务状态。

---

## 四、常见问题

**Q1：不订阅能用市场中的 Agent 吗？**
不能。未订阅 → 对话/委派返回 `403 AGENT_ACCESS_DENIED`（x402 按次付费通过者除外）。

**Q2：我自己的 Agent 用付费吗？**
不用。`owner == 调用者` 直接放行（免费）。

**Q3：为什么我的 Agent 在市场「全部应用」里找不到？**
检查 `category`：未设置 → 归入 `other` 分类，不在应用标签页展示。

**Q4：fiat/x402 订阅用户前端能正常对话吗？**
后端已统一支持。前端「我的对话」列表与订阅页目前基于链上数据（fiat/x402 启用后前端将对齐统一 access 端点）。

**Q5：发布的 Agent 如何被别人发现？**
设置准确的 `category` + `tags`，Marketplace 分类筛选 + 搜索都会命中。
