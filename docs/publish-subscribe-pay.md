# AgentX 发布 / 订阅 / 付费 集成指南

> 适用版本：`@agentxv2/sdk >= 0.10.0`（含 `AgentCategory` / `AGENT_CATEGORIES` / 三轨订阅支付 / 用户钱包签名上链编排）
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

### 1.6 Skill 执行模型：如何在对话中引入你自己的 MCP

> 背景问题：**对话中的工具（MCP）是不是都要先在对话中注册？用户能否引入自己的 MCP？**
> 答：AgentX **没有「MCP server 注册表」**（不像 Claude Desktop 要先配置 server 列表）。对话可用的工具 = **Agent 发布时声明的 `skills`**（私有加密上链，见 1.4），对话时由 Conversation Service 从 metadata 加载注入 LLM——**注册点就是发布，不是对话中**。

**对话工具的来源（注入链路，2026-08-08 代码确认）**——对话运行时工具注入逻辑（`AgentRunner.streamRun`）：请求带 `prompt`/`skills` 即走 inline 模式，否则按 `agentId` 从链上 metadata 加载：

| 来源 | 注册时机 | 机制 | 需要先注册？ |
|---|---|---|---|
| ① Agent 发布的 skills | 发布 Agent 时声明（私有加密上链，见 1.4） | 对话按 `agentId` 从链上 metadata 加载（`AgentContextLoader.load`） | **预声明**（发布即注册），最常见的用法 |
| ② 对话请求 inline 注入 | 运行时，**无预注册** | 请求体直接带 `prompt` + `skills[]` → `loadInline`，跳过平台 Agent 查找 | **不需要**——现传 `execution.type='mcp'` + endpoint 即可，无任何注册校验 |
| ③ 平台编排工具 | 自动 | `agentx_list_agents` / `agentx_delegate` 由 `AgentRunner.buildOrchestrationSkills` 自动注入 | 不需要 |

> **关键澄清**：
> - **不存在「MCP server 注册表」**——无需把 MCP server 先登记到平台。「注册」仅有两层含义：**① Agent 发布时把 skills 写进链上 metadata**（对订阅者生效）；**② 对话请求 inline 现传 skills**（运行时注入，随请求生效）。
> - Gateway `POST /api/v1/skills` 是 **skill 模板市场**（提交模板供公开浏览/复用，admin 审核，见 gateway `routes/skills.ts`），**不是对话的运行注册表**——不提交模板也能在对话中使用（inline 或发布时声明）。
> - 无论哪种来源，MCP 调用都由你的 MCP server 自行鉴权（平台不代理，见下方安全模型）。

**Skill 结构**（SDK `Skill` 类型）：

```ts
interface Skill {
  name: string
  description: string
  version?: string
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
  outputSchema?: Record<string, unknown>
  execution?: {
    type: 'open' | 'mcp' | 'a2a'   // 三种执行模型
    endpoint?: string             // mcp：你的 MCP server 地址（默认 AgentX 平台 /mcp）
    toolName?: string             // mcp：MCP server 上的工具名（默认 = skill.name）
    targetAgentId?: number        // a2a：委托的目标 Agent
    skillFilter?: string[]        // a2a：只暴露目标 Agent 的部分 skills
    promptOverride?: string       // a2a：覆盖目标 Agent 的系统提示词
  }
}
```

**三种执行模型**：

| `execution.type` | 含义 | 调用目标 | 典型用途 |
|---|---|---|---|
| `open` | SDK 本地实现 | 内置逻辑 | 纯计算 / 本地函数 |
| `mcp` | 远程 MCP server | `execution.endpoint ?? 平台 /mcp`（38 个工具） | **接入你自己的 MCP / 平台 MCP** |
| `a2a` | 委托另一个 AgentX Agent | `execution.targetAgentId` | 多 Agent 编排 / 子 Agent |

**引入自己的 MCP（路径 A：作为发布者）**——给 skill 配 `execution.type='mcp'` + 你自己部署的 MCP server 地址：

```ts
import { publishAgent, IPFSUploader } from '@agentxv2/sdk'

const agent = {
  name: 'My Agent',
  description: '...',
  category: 'operations',
  prompt: 'You are ...',
  pricing: { type: 'subscription', currency: 'ETH', amount: '100000000000000000' },
  // 对话中可调用的工具：LLM 触发时对话服务会转发到你的 MCP server
  skills: [{
    name: 'my_internal_tool',
    description: 'Queries my team internal system',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    execution: { type: 'mcp', endpoint: 'https://my-team-mcp.example.com/mcp', toolName: 'search' },
  }],
  // 不写 endpoint 时默认走 AgentX 平台 MCP（/mcp，38 个工具）
  // mcp: { type: 'http', url: 'https://...' },
}
const result = await publishAgent({ agent, publicKey, uploader })
```

发布后：订阅者与该 Agent 对话时，LLM 可调用 `my_internal_tool` → Conversation Service 按 MCP JSON-RPC 协议转发到你的 MCP server（[agent-context-loader.ts](file:///home/ubuntu/Agentx/conversation-service/src/services/agent-context-loader.ts)）。

**安全模型（重要）**：
- AgentX **不代理你的 MCP 鉴权**——你的 MCP server 应在每次调用时自行验证调用者的链上订阅（SDK 注释明示）
- 默认走平台 `/mcp` 时，平台 MCP 有自己的鉴权：对话/任务工具仅接受注册用户 `access_token`（B 端 key 不能调）

**边界（最终用户视角）**：最终用户**不能**给别人的 Agent 临时加工具——工具由发布者决定。最终用户想要自定义工具，只能：① 自己发布带自定义 MCP skill 的 Agent；② 由 B 端应用通过 **inline 注入**（Conversation Service `loadInline`，外部应用可直接注入自己的 prompt + MCP/HTTP 工具，跳过平台 Agent 查找，见 [integration-callers.md](integration-callers.md)）。

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
import { SubscriptionPayments, SubscriptionManager } from '@agentxv2/sdk'

// chain 轨道需要 on-chain 读写能力；fiat / x402 轨道走 Gateway /api/v1/payments
const sm = new SubscriptionManager({ contractAddress, publicClient, walletClient })
const sp = new SubscriptionPayments({
  gatewayUrl: 'https://gw.example.com',   // fiat / x402 必需
  subscriptionManager: sm,                // chain 轨道 & x402 自动出资必需
  walletClient,
  chain: 'oxachain',
})

// 1) 订阅（三选一）
await sp.pay({ method: 'chain', agentId, planId, subscriber: myAddress })   // 链上 escrow
const { sessionUrl } = await sp.pay({ method: 'fiat', agentId, planId, subscriber: myAddress })  // Stripe → 跳转
await sp.pay({ method: 'x402', agentId, planId, subscriber: myAddress })   // 原生代币周期支付

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

### 3.3 多 Agent 编排：上链 / 链下 分层策略

主 Agent（对话中）的 LLM 可自主委派子任务给其他 Agent，但**只能委派给「调用者自己写的」或「已订阅的」Agent**（与对话访问边界一致，无权返回 `403 AGENT_ACCESS_DENIED`）。

编排分两轨，**默认走链下**：

| 轨道 | 适用 | 成本 | 保证 |
|---|---|---|---|
| **链下**（默认，`agentx_delegate` mode=`offchain`） | 同平台内部、高频、实时对话式委派 | 零（无链上写入） | 子 Agent 在对话通道内同步运行，结果实时返回主 Agent |
| **链上**（显式，`agentx_delegate` mode=`onchain`） | 跨组织、结算对账、信誉积累、需第三方验证 | **用户钱包支付 gas** + 任务交易 | 可审计的 A2A taskId、链上记录、结算/信誉钩子 |

> **v0.10.0 gas 模型（2026-08-08）**：链上轨道**平台从不代付 gas**。用户显式要求可审计/结算时，Conversation Service 发出 `onchain_approval_required` SSE 事件，**用户自己的钱包**签 `createTask` —— 用户付 gas，合约记录 `clientAddress = msg.sender`（= 用户地址）。Gateway 不再持有任何签名密钥（`A2A_WORKER_PRIVATE_KEY` 已移除），永不写链；a2a-worker 创建的子任务**链下内联**处理（本地负伪 taskId），只有用户签的顶层任务在链上。

对话中注入的平台工具（Conversation Service 提供，仅当调用方有权时可用）：

- `agentx_list_agents` — 列出调用者可委派的 Agent（id / name / description / category）
- `agentx_delegate` — `{ targetAgentId, message, mode? }`：
  - 默认 `mode: "offchain"` → 子 Agent 在对话通道内**同步**运行，实时返回结果（零成本）
  - 用户**显式要求可审计/结算/上链**（如「上链」「可审计」「结算」「对账」「on-chain」「audit」「settle」）→ 自动 `mode: "onchain"` → Conversation Service 校验访问权后发 `onchain_approval_required` 事件（含 `{ targetAgentId, taskType, inputData }`）→ **前端弹钱包，用户签 `createTask`**（用户付 gas，成为链上 client）→ 返回 `taskId` 作为审计轨迹 → a2a-worker 异步处理并记录到 `a2a_task_results` → 前端轮询 `GET /api/v1/a2a/task-result/:taskId` 展示结果

前端流程（用户视角）：

```
对话中：「上链委派给 Agent #X 做审计」
  → Conversation 发 onchain_approval_required（SSE side-event）
  → 前端弹「上链确认」弹窗（展示目标 Agent / taskType / inputData / gas 支付方=我的钱包）
  → 用户钱包确认（签名 createTask，付 OXA gas）
  → 前端从 receipt.logs[].topics[1] 解析 taskId
  → 轮询 gateway → 处理中 / 完成 / 失败 → 「查看 A2A 任务」跳转 /a2a 页
```

> 嵌套限制：`onchain` 轨道仅在**顶层对话**可用（子代理无法向用户弹钱包）；嵌套子任务一律走链下（`ORCHESTRATE_MAX_DEPTH` 默认 4）。

平台可配置（Conversation Service 环境变量）：

```bash
ORCHESTRATE_TOKEN=...                 # 必须与 Gateway 的 ORCHESTRATE_TOKEN 一致
ORCHESTRATE_DEFAULT_MODE=offchain     # 默认轨道：offchain | onchain
ORCHESTRATE_MAX_DEPTH=4               # 链下嵌套委派最大深度
```

对用户完全透明：编排发生在对话后端；「A2A Tasks」页追踪链上任务的审计状态；链下委派实时返回无需追踪。

> 既有链上 A2A 工具（a2a-worker 的 `agentx_a2a_create_task`）保留，用于**以链上任务为入口**的编排场景（SDK `A2AProtocol` / `A2ADaemon`）——同样由**调用者自己的钱包**签 `createTask`，与对话通道的链下委派互补。

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

**Q6：对话里要求「上链」会发生什么？谁会付 gas？**
用户自己付 gas。Conversation 发 `onchain_approval_required` → 前端弹钱包 → 用户签 `createTask`（付 OXA gas）→ 生成链上 taskId 作为审计轨迹 → a2a-worker 异步处理。平台不代付、不持有签名密钥。

**Q7：链上轨道需要什么前置条件？**
前端需连接支持 OxaChain L1（chainId 19505）的钱包且有 OXA 余额；后端无签名密钥要求（`A2A_WORKER_PRIVATE_KEY` 已废弃）。

**Q8：编排子任务会重复收费吗？**
不会。链上轨道只有用户显式签名的**顶层任务**上链；a2a-worker 内部产生的子任务全部链下内联处理（零 gas）。
