# AgentX — 去中心化 AI Agent 平台

## 一、项目定位

**AgentX** 是一个基于区块链的 AI Agent 注册、交易与协作平台。

### 核心理念

```
Agent = Prompt + Skills[] + MCP
```

- **Prompt**：System prompt，定义 Agent 角色、知识和行为边界
- **Skills**：能力模块，含标准 JSON Schema 输入输出定义
- **MCP**：Model Context Protocol 连接，提供外部工具调用能力

### 与 ChatGPT/Claude 的差异

| | ChatGPT GPTs | AgentX |
|---|---|---|
| Agent 所有权 | OpenAI 平台 | **链上 NFT (你拥有)** |
| 代码/提示词 | 平台可见 | **AES-256-GCM 加密后存 IPFS** |
| 付费 | 平台抽成 | **链上订阅，加密自动解锁** |
| Agent 间协作 | 不支持 | **A2A 协议，Agent 可以互相调用** |
| 外部集成 | API 依赖平台 | **@agentx/sdk，第三方自由集成** |

---

## 二、技术架构

### 整体架构图

```
┌─────────────────────────────────────────────────────────┐
│                      AgentX Platform                     │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │  Agent   │  │  Market  │  │   Chat   │  │  User   │ │
│  │  Studio  │  │  市场     │  │  对话    │  │  中心   │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬────┘ │
│       │              │              │              │      │
├───────┴──────────────┴──────────────┴──────────────┴──────┤
│                    @agentx/sdk                             │
│                                                           │
│  ┌─────────┐ ┌──────────┐ ┌────────┐ ┌──────┐ ┌───────┐ │
│  │  Crypto │ │ Registry │ │  Sub   │ │ A2A  │ │  MCP  │ │
│  │  加密   │ │  身份注册 │ │  订阅   │ │ 协作  │ │ 连接  │ │
│  └────┬────┘ └────┬─────┘ └───┬────┘ └──┬───┘ └──┬────┘ │
│       │            │           │          │         │      │
├───────┴────────────┴───────────┴──────────┴─────────┴──────┤
│                    链上合约层                                │
│                                                           │
│  ┌────────────────┐ ┌──────────────────┐ ┌─────────────┐ │
│  │ IdentityRegistry│ │ SubscriptionMgr │ │ A2AProtocol  │ │
│  │   (ERC-721)    │ │                  │ │  Registry    │ │
│  └────────────────┘ └──────────────────┘ └─────────────┘ │
│                                                           │
│  ┌────────────────┐ ┌──────────────────┐ ┌─────────────┐ │
│  │ PaymentGateway │ │  Reputation      │ │ Configuration│ │
│  │                │ │  Registry        │ │  Registry    │ │
│  └────────────────┘ └──────────────────┘ └─────────────┘ │
│                                                           │
├───────────────────────────────────────────────────────────┤
│                    存储层                                  │
│                                                           │
│  ┌────────────┐            ┌──────────────────────────┐  │
│  │   IPFS     │            │  加密 Payload             │  │
│  │ (Pinata)   │            │  AES-256-GCM + ECIES     │  │
│  └────────────┘            └──────────────────────────┘  │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

### 技术选型

| 层 | 技术 | 用途 |
|---|---|---|
| 前端 | Next.js 14 + React 18 + TypeScript | Platform UI |
| 样式 | TailwindCSS + lucide-react | UI 组件 |
| Web3 | wagmi v2 + viem | 链上交互 |
| 加密 | @noble/ciphers (AES-256-GCM) + eciesjs (secp256k1) | 客户端加密解密 |
| 存储 | Pinata IPFS | 公开/加密 Agent payload |
| 合约 | Solidity 0.8.20 + OpenZeppelin | 链上身份/订阅/A2A |
| 开发框架 | Hardhat | 合约编译部署测试 |
| SDK | 独立 npm 包 `@agentx/sdk` | 第三方集成 |

### 多链支持

| 链 | 用途 |
|---|---|
| Ethereum Sepolia | 测试网 |
| zkSync Testnet | zkEVM 测试 |
| Polygon Mumbai | 便宜测试 |
| Base Sepolia | Coinbase 生态 |

---

## 三、核心流程

### 3.1 Agent 铸造流程

```
┌──────────────────────────────────────────────────────────┐
│              铸造者 (浏览器端)                             │
│                                                          │
│  ① 编写 Prompt ──────┐                                    │
│  ② 配置 Skills ──────┤                                    │
│  ③ 连接 MCP ─────────┤                                    │
│                      ▼                                    │
│              ┌──────────────┐                             │
│              │ 打包 Agent   │                             │
│              │ Payload      │                             │
│              └──────┬───────┘                             │
│                     │                                     │
│         ┌───────────┴───────────┐                         │
│         ▼                       ▼                         │
│  ┌─────────────┐        ┌──────────────┐                  │
│  │ 公开元数据   │        │ 加密 Payload  │                  │
│  │ (品牌/定价)  │        │ (Prompt+Skill │                  │
│  │             │        │  +MCP 加密版) │                  │
│  └──────┬──────┘        └──────┬───────┘                  │
│         ▼                       ▼                         │
│  ┌─────────────┐        ┌──────────────┐                  │
│  │ IPFS (cid1) │        │ IPFS (cid2)  │                  │
│  │ 公开版       │        │ 加密版        │                  │
│  │ tokenURI     │        │ encryptedCid │                  │
│  └──────┬──────┘        └──────┬───────┘                  │
│         │                       │                         │
│         ▼                       ▼                         │
│  ┌──────────────────────────────────┐                     │
│  │ AES Key ──► ECIES 加密 ──► 链上  │                     │
│  │          (用铸造者私钥)           │                     │
│  └──────────────────────────────────┘                     │
│                     │                                     │
│                     ▼                                     │
│  ┌─────────────────────────────────┐                      │
│  │ IdentityRegistry.registerAgent  │                      │
│  │   tokenURI: ipfs://cid1 (公开)  │                      │
│  │   attributes:                   │                      │
│  │     encryptedPayloadCid: cid2   │                      │
│  │     eciesEncryptedKey: 0x...    │                      │
│  │     skills: [...]              │                      │
│  │     mcp_endpoint: "https://..." │                      │
│  └─────────────────────────────────┘                      │
│                                                          │
│  铸造成功 → Agent NFT (ERC-721) 进入铸造者钱包             │
└──────────────────────────────────────────────────────────┘
```

### 3.2 订阅 + 解密使用流程

```
┌──────────────────────────────────────────────────────────────┐
│                   购买者 (浏览器端)                            │
│                                                              │
│  ① 在 Agent 市场浏览 → 选择 Agent → 购买订阅                   │
│                                                              │
│  ┌────────────────────────────────────────┐                  │
│  │ PaymentGateway.subscribe(agentId)      │                  │
│  │ → 支付订阅费 → SubscriptionManager     │                  │
│  │ → 铸造订阅 NFT 到购买者钱包             │                  │
│  └────────────────────────────────────────┘                  │
│                     │                                         │
│                     ▼                                         │
│  ② 订阅验证通过后，使用 Agent：                                │
│                                                              │
│  ┌────────────────────────────────────────┐                  │
│  │ subscriptionGuard.check(address, id)    │                  │
│  │ → 链上验证: 持有 Subscription NFT?      │                  │
│  │ → 否 → 拒绝 (需要先购买订阅)             │                  │
│  │ → 是 → 继续                           │                  │
│  └────────────────────────────────────────┘                  │
│                     │                                         │
│                     ▼                                         │
│  ┌────────────────────────────────────────┐                  │
│  │ 从链上读取 eciesEncryptedKey            │                  │
│  │ → ECIES 解密(购买者私钥) → AES Key     │                  │
│  └────────────────────────────────────────┘                  │
│                     │                                         │
│                     ▼                                         │
│  ┌────────────────────────────────────────┐                  │
│  │ IPFS 拉取 encryptedPayloadCid (cid2)   │                  │
│  │ → AES-256-GCM 解密 → Prompt+Skills+MCP │                  │
│  └────────────────────────────────────────┘                  │
│                     │                                         │
│                     ▼                                         │
│  ③ 注入 Chat 会话：                                          │
│     system prompt = Prompt                                   │
│     tools = Skills + MCP tools                               │
│                                                              │
│  ④ 用户对话 → Agent 使用 Skills + MCP 工具完成任务             │
│                                                              │
│  ⚠️ 全程客户端完成，无后端服务器参与                            │
│  ⚠️ 购买者看不到明文 Prompt（仅注入 Chat 上下文）              │
└──────────────────────────────────────────────────────────────┘
```

### 3.3 A2A Agent 协作流程

```
┌──────────────────────────────────────────────────────────────┐
│              Agent-to-Agent 协议                              │
│                                                              │
│  Agent A (审计专家)              Agent B (部署专家)           │
│       │                              │                       │
│       │ ① createTask(agentB,        │                       │
│       │    "deploy_contract",        │                       │
│       │    {bytecode, args})        │                       │
│       │─────────────────────────────►│                       │
│       │                              │                       │
│       │   ② Agent B 接收任务          │                       │
│       │   ③ 解密自己的 Skills+MCP    │                       │
│       │   ④ 执行部署                 │                       │
│       │                              │                       │
│       │ ⑤ completeTask(taskId,      │                       │
│       │    {contractAddress, txHash})│                       │
│       │◄─────────────────────────────│                       │
│       │                              │                       │
│  链上记录完整调用链路 (可审计)                                  │
│                                                              │
│  Agent 可以创建 Agent 链：                                     │
│  分析 → 审计 → 部署 → 监控 → 报警                             │
└──────────────────────────────────────────────────────────────┘
```

### 3.4 加密安全模型

```
┌──────────────────────────────────────────────────────────────┐
│                    加密分层                                   │
│                                                              │
│  第一层：内容加密                                             │
│  ┌────────────────────────────────────┐                      │
│  │ Prompt + Skills + MCP (明文)        │                      │
│  │         ↓ AES-256-GCM              │                      │
│  │ IV(12) + Ciphertext + AuthTag(16)  │                      │
│  │         ↓ Base64                   │                      │
│  │ encryptedPayload → IPFS (公开可读)  │                      │
│  └────────────────────────────────────┘                      │
│                                                              │
│  第二层：密钥加密                                             │
│  ┌────────────────────────────────────┐                      │
│  │ AES Key (32 bytes)                 │                      │
│  │         ↓ ECIES (购买者公钥)        │                      │
│  │ eciesEncryptedKey → 链上 (公开可读) │                      │
│  └────────────────────────────────────┘                      │
│                                                              │
│  安全保证：                                                   │
│  • IPFS 上的加密内容 → 没有 AES Key 无法解密                  │
│  • 链上的加密 Key → 没有私钥无法 ECIES 解密                   │
│  • 私钥 → 只有钱包持有者拥有                                   │
│  • 双重加密 → 突破任何一层都无法获得明文                        │
└──────────────────────────────────────────────────────────────┘
```

### 3.5 Skill 远程执行模型（防止源码泄露）

**核心问题**：如果 Skills 里包含 Python/JS 脚本源码，订阅者解密拿到源码后，
就可以摘下来永久使用，不再续费。

**解决方案：分层权限模型** — Skill 分为 Open 和 Closed 两种模式。

```
┌────────────────────────────────────────────────────────────┐
│                    Skill 双层模型                            │
│                                                            │
│  Open Skill (源码公开)                                       │
│  ┌──────────────────────────────────────────┐              │
│  │ 加密存储：Schema 定义 + 源码              │              │
│  │ 订阅者拿到：完整 Skill，可本地执行         │              │
│  │ 适用场景：简单工具 (计算器、文本处理)       │              │
│  │ 防泄露策略：无需防，源码本身就是卖点        │              │
│  └──────────────────────────────────────────┘              │
│                                                            │
│  Closed Skill (源码锁定)                                    │
│  ┌──────────────────────────────────────────┐              │
│  │ 加密存储：仅 Schema 定义（不含源码）       │              │
│  │ execution: {                              │              │
│  │   type: "mcp",          // 远程执行       │              │
│  │   toolName: "run_strategy_abc123"         │              │
│  │ }                                         │              │
│  │ 源码：运行在发布者的 MCP 服务器上          │              │
│  │ 订阅者：只能通过 MCP 调 Tool、拿结果        │              │
│  │ 续费保证：MCP 服务器每次请求校验链上订阅    │              │
│  │ 适用场景：量化策略、审计模型、私有算法      │              │
│  └──────────────────────────────────────────┘              │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**Closed Skill 调用流程：**

```
┌──────────────────────────────────────────────────────────────┐
│ 用户 → LLM → "run_strategy({ symbols: ['BTC'] })"           │
│                    │                                         │
│                    ▼                                         │
│  ┌─────────────────────────────────────────┐                │
│  │ agent-runner (SDK)                       │                │
│  │                                          │                │
│  │ ① 检查 Skill 类型: execution.type        │                │
│  │    = "mcp" → 远程执行模式                 │                │
│  │    = undefined → 本地执行 (Open Skill)    │                │
│  │                                          │                │
│  │ ② 远程执行:                               │                │
│  │    POST https://agent-42.mcp.example.com │                │
│  │    Header: X-Subscriber-Address: 0x...   │                │
│  │    Header: X-Agent-Id: 42               │                │
│  │    Body: { method: "tools/call",        │                │
│  │            tool: "run_strategy_abc123",  │                │
│  │            params: { symbols: [...] } }  │                │
│  └──────────────┬──────────────────────────┘                │
│                 │                                            │
│                 ▼                                            │
│  ┌─────────────────────────────────────────┐                │
│  │ 发布者 MCP 服务器                         │                │
│  │                                          │                │
│  │ ① 解析 X-Subscriber-Address              │                │
│  │ ② 链上查询 SubscriptionManager           │                │
│  │    → getSubscription(address, agentId)   │                │
│  │    → status = 'active' ?                 │                │
│  │ ③ 否 → 403 "订阅已过期，请续费"           │                │
│  │ ④ 是 → 执行策略脚本 (Python/JS/...)      │                │
│  │ ⑤ 返回 { signal: "BUY", confidence, ... }│               │
│  │                                          │                │
│  │ ⚠️ 订阅者永远拿不到 Python 源码           │                │
│  └─────────────────────────────────────────┘                │
│                                                              │
│  用户看到: "建议买入 BTC，置信度 87%，理由: ..."              │
│  用户不知道: 策略代码长什么样、用了什么因子                    │
└──────────────────────────────────────────────────────────────┘
```

**订阅续费强制机制：**

| 层 | 校验点 | 绕过难度 |
|----|--------|----------|
| 前端 SDK | 解密前检查链上订阅 | 低（可篡改前端） |
| **MCP 服务器** | **每次 tool 调用前校验链上订阅 NFT** | **高（发布者自有服务器）** |
| 链上合约 | SubscriptionManager 时间戳校验 | 最高（不可篡改） |

> **关键设计**：前端校验是 UX 优化（提前拦截），MCP 服务器校验是安全底线。
> 即使前端被破解跳过校验，只要策略源码在发布者服务器上不离开，
> 没有活跃订阅的用户就永远调不到策略脚本。

---

## 四、数据模型

### 4.1 Agent Schema

```typescript
// @agentx/sdk 核心类型定义

interface AgentPayload {
  // === 身份信息 (公开) ===
  name: string
  description: string
  image?: string
  version: string
  tags: string[]
  
  // === 核心能力 (加密存储) ===
  prompt: string                    // System prompt
  skills: SkillDef[]               // 能力模块
  mcp: McpConnection               // MCP 协议连接
  
  // === A2A 协议 (公开) ===
  capabilities: string[]           // 能力标签: ["solidity_audit", "gas_opt"]
  supportedTasks: string[]         // 可接受的任务类型
  communicationProtocol: 'mcp' | 'a2a'
  authenticationMethod: 'ecdsa'
  
  // === 商业信息 (公开) ===
  pricing: {
    type: 'subscription' | 'pay_per_use'
    amount: string
    currency: string
    period?: string
  }
  
  // === 加密元数据 ===
  encryptedPayloadCid: string      // IPFS CID of encrypted payload
  eciesEncryptedKey: string        // ECIES encrypted AES key (on-chain)
  publicPayloadCid: string         // IPFS CID of public metadata
}

interface SkillDef {
  name: string
  description: string
  version: string
  inputSchema: JSONSchema          // MCP 标准 Tool inputSchema
  outputSchema: JSONSchema         // 输出 Schema
}

interface McpConnection {
  type: 'http' | 'sse' | 'stdio'
  url: string
  toolFilter?: string[]            // 可选：只暴露部分 tools
}

// ERC-721 链上存储结构
interface OnChainAgentMetadata {
  tokenURI: string                 // → 公开 IPFS CID
  attributes: {
    name: string
    description: string
    encryptedPayloadCid: string    // → 加密 IPFS CID
    eciesEncryptedKey: string      // → ECIES 加密的 AES Key
    publicPayloadCid: string       // → 公开 IPFS CID
    capabilities: string[]
    skills: string[]               // Skill 名称列表
    mcpEndpoint: string
    version: string
  }
}
```

### 4.2 IPFS 存储结构

```
IPFS 上有两份数据：

┌─────────────────────────────────────┐
│ publicPayloadCid (公开 — tokenURI)   │
├─────────────────────────────────────┤
│ {                                   │
│   "name": "Code Review Agent",      │
│   "description": "...",             │  ← 任何人可见
│   "image": "ipfs://...",            │    (市场展示)
│   "tags": ["solidity", "security"], │
│   "capabilities": [...],           │
│   "pricing": { ... },              │
│   "skills": ["solidity_audit"],    │
│   "mcp_endpoint": "https://..."     │
│ }                                   │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ encryptedPayloadCid (加密版)         │
├─────────────────────────────────────┤
│ {                                   │
│   "encrypted": true,                │
│   "algorithm": "AES-256-GCM",       │  ← 加密存储
│   "data": "base64(IV+Ciphertext+    │    需要 AES Key + ECIES 解密
│            AuthTag)"                │    才能拿到内容
│ }                                   │
│                                     │
│ 解密后内容:                           │
│ {                                   │
│   "prompt": "你是...",              │
│   "skills": [                       │
│     { "name": "solidity_audit",     │
│       "inputSchema": {...},         │
│       "outputSchema": {...} }       │
│   ],                                │
│   "mcp": {                          │
│     "type": "http",                 │
│     "url": "https://...",           │
│     "tools": [...]                  │
│   }                                 │
│ }                                   │
└─────────────────────────────────────┘
```

---

## 五、合约层设计

### 5.1 现有合约复用

| 合约 | 用途 | 改动 |
|------|------|------|
| `IdentityRegistry` | Agent NFT (ERC-721) 身份注册 | **零改动** |
| `SubscriptionManager` | 订阅生命周期管理 | **零改动** |
| `PaymentGateway` | 统一支付入口 | **零改动** |
| `A2AProtocolRegistry` | Agent Card / Skill / Task | **零改动** |
| `ReputationRegistry` | 链上评分 | **零改动** |
| `ConfigurationRegistry` | 键值配置 | **零改动** |
| `MultiEndpointRegistry` | 多端点管理 | **零改动** |

> 所有加密信息（`encryptedPayloadCid` / `eciesEncryptedKey`）存在 IPFS 元数据的 `attributes` 字段中，**现有合约一行不改**。

### 5.2 合约交互路径

```
注册 Agent:
  IdentityRegistry.registerAgentWithMetadata(tokenURI, metadata)
    tokenURI = ipfs://publicPayloadCid
    metadata[].key = "encryptedPayloadCid" → value = cid2
    metadata[].key = "eciesEncryptedKey"   → value = 0x...

购买订阅:
  PaymentGateway.subscribe(agentId, period)
    → SubscriptionManager.createSubscription()
    → 铸造 Subscription NFT 到用户钱包

验证订阅:
  SubscriptionManager.getSubscription(userAddress, agentId)
    → 检查 status = 'active' AND expiresAt > now

A2A 任务:
  A2AProtocolRegistry.createTask(targetAgentId, taskType, input)
    → 触发 TaskCreated 事件
    → Agent 监听 → 执行 → completeTask()
```

---

## 六、SDK 模块设计

### 6.1 `@agentx/sdk` 包结构

```
@agentx/sdk/
├── core/
│   ├── crypto.ts           # AES-256-GCM + ECIES 加解密
│   └── schema.ts           # AgentPayload 类型定义
│
├── registry/
│   ├── agent-registry.ts   # 铸造/查询 Agent
│   └── ipfs-fetcher.ts     # IPFS 多网关获取 + 缓存
│
├── subscription/
│   ├── subscription.ts     # 订阅购买/续费/检查
│   └── guard.ts            # 链上 NFT 持有验证 + 解密门控
│
├── a2a/
│   ├── agent-card.ts       # Agent Card 注册/查询
│   ├── skill-registry.ts   # Skill 注册 (JSON Schema)
│   └── task-executor.ts    # 任务创建/监听/完成
│
├── mcp/
│   ├── connector.ts        # HTTP/SSE/stdio MCP 连接
│   └── tool-executor.ts    # 标准化 Tool 调用
│
├── reputation/
│   └── reputation.ts       # 评分/评价/信誉查询
│
├── config/
│   └── configuration.ts    # Agent 配置管理
│
├── react/                  # 可选 React hooks
│   ├── useAgent.ts
│   ├── useMarketSearch.ts
│   └── useSubscriptionGuard.ts
│
└── index.ts                # 统一入口
```

### 6.2 核心 API 设计

```typescript
// 1. 加密解密 (纯函数，零依赖)
function encryptPayload(plaintext: string): { encryptedBase64: string; keyBase64: string }
function decryptPayload(encryptedBase64: string, keyBase64: string): string
function eciesEncrypt(data: string, publicKey: string): string
function eciesDecrypt(data: string, privateKey: string): string
function packAgent(agent: AgentPayload): Promise<{ encryptedCid: string; key: string }>
function unpackAgent(encryptedCid: string, key: string): Promise<AgentPayload>

// 2. Agent 注册
function registerAgent(payload: AgentPayload): Promise<{ agentId: number; txHash: string }>
function getAgent(agentId: number): Promise<AgentPayload>
function searchAgents(query: SearchQuery): Promise<AgentSummary[]>

// 3. 订阅
function subscribe(agentId: number, period: Period): Promise<{ subscriptionId: number }>
function checkSubscription(address: string, agentId: number): Promise<boolean>
function useAgent(agentId: number): Promise<AgentPayload>
//    ↑ 一键：验证订阅 → ECIES 解密 → IPFS 获取 → 返回完整 Agent

// 4. A2A 协作
function createTask(agentId: number, type: string, input: string): Promise<{ taskId: number }>
function executeTask(taskId: number): Promise<{ result: string }>
function discoverAgents(capability: string): Promise<AgentCard[]>

// 5. MCP 工具
function connectMCP(config: McpConnection): Promise<MCPClient>
function listTools(client: MCPClient): Promise<Tool[]>
function callTool(client: MCPClient, name: string, args: object): Promise<any>
```

### 6.3 第三方集成示例

```typescript
// 只用一个 wallet 就能用

import { AgentX } from '@agentx/sdk'

const agentx = new AgentX({ chain: 'sepolia', wallet })

// 场景1: 在自己的 App 里搜索并使用 Agent
const results = await agentx.search({ capability: 'code_review' })
const agent = await agentx.useAgent(results[0].id)  // 自动订阅校验 + 解密

// 场景2: Agent 调用 Agent
await agentx.a2a.createTask(otherAgentId, 'audit', {
  contract: '0x...',
  severity: 'high'
})

// 场景3: 铸造自己的 Agent 出售
await agentx.register({
  name: 'My Audit Bot',
  prompt: '你是 Solidity 审计专家...',
  skills: [{ name: 'slither', inputSchema: {...} }],
  mcp: { type: 'http', url: 'https://...' },
  pricing: { type: 'subscription', amount: '0.01', currency: 'ETH' }
})
```

---

## 七、前端页面规划

### 7.1 页面结构

```
AgentX Platform
├── /                          # Landing Page
├── /marketplace               # Agent 市场
│   ├── /marketplace/search    # 搜索 + 筛选
│   └── /marketplace/[id]     # Agent 详情 + 订阅
├── /studio                    # Agent Studio (铸造)
│   ├── /studio/create         # 创建/编辑 Agent
│   ├── /studio/prompt         # Prompt 编辑器
│   ├── /studio/skills         # Skill 配置器
│   ├── /studio/mcp            # MCP 连接器
│   └── /studio/publish        # 加密 + 发布
├── /dashboard                 # 用户面板
│   ├── /dashboard/agents      # 我的 Agent
│   ├── /dashboard/subscription# 我的订阅
│   └── /dashboard/revenue     # 收入
├── /chat/[agentId]            # Agent 对话
│   ├── 订阅验证 → ECIES 解密
│   ├── 注入 system prompt
│   ├── MCP 工具调用
│   └── 对话后链上评分
└── /a2a                       # A2A 任务面板
    ├── /a2a/tasks             # 任务列表
    └── /a2a/create            # 创建 A2A 任务
```

### 7.2 Agent Studio 核心表单

```
┌─────────────────────────────────────┐
│  Agent Studio — 创建你的 AI Agent    │
├─────────────────────────────────────┤
│                                     │
│  📝 Prompt                          │
│  ┌─────────────────────────────────┐│
│  │ 你是 Solidity 安全审计专家...     ││
│  │                                 ││
│  │ (Markdown 编辑器)               ││
│  └─────────────────────────────────┘│
│                                     │
│  🛠 Skills                          │
│  ┌─────────────────────────────────┐│
│  │ [+] 添加 Skill                  ││
│  │ ┌─────────────────────────────┐ ││
│  │ │ Name: slither_audit         │ ││
│  │ │ Description: 静态分析...     │ ││
│  │ │ Input: { contract: string } │ ││
│  │ │ Output: { issues: [...] }   │ ││
│  │ └─────────────────────────────┘ ││
│  └─────────────────────────────────┘│
│                                     │
│  🔌 MCP Connection                  │
│  ┌─────────────────────────────────┐│
│  │ Type: [HTTP ▼]                  ││
│  │ URL: https://mcp.example.com    ││
│  │ [Test Connection]               ││
│  │ ✓ 12 tools available            ││
│  │ □ code_review                   ││
│  │ ✓ deploy_contract               ││
│  │ □ scan_vulnerability            ││
│  └─────────────────────────────────┘│
│                                     │
│  💰 定价                            │
│  ┌─────────────────────────────────┐│
│  │ ○ 订阅制  每月 0.01 ETH         ││
│  │ ○ 按次付费  每次 0.001 ETH       ││
│  └─────────────────────────────────┘│
│                                     │
│  ┌─────────────────────────────────┐│
│  │ ⚡ [一键加密 + 发布到链上]       ││
│  └─────────────────────────────────┘│
│                                     │
└─────────────────────────────────────┘
```

---

## 八、实施路线图

### Phase 1: SDK 核心 (Week 1-2)

| # | 任务 | 产出 |
|---|------|------|
| 1 | `core/schema.ts` — Agent Schema | 类型定义 |
| 2 | `core/crypto.ts` — AES-256-GCM + ECIES | 加密引擎 |
| 3 | `registry/agent-registry.ts` | 注册/查询 Agent API |
| 4 | `subscription/` — 订阅 + 解密门控 | 订阅 + 解密 API |
| 5 | `@agentx/sdk` 发包 | npm 包 |
| 6 | SDK 单元测试 | 测试覆盖 |

### Phase 2: 平台改造 (Week 2-3)

| # | 任务 | 产出 |
|---|------|------|
| 7 | 改名 AgentX | 全局品牌替换 |
| 8 | Agent Studio 表单 | Prompt + Skill + MCP 编辑器 |
| 9 | 加密发布流程 | 加密 → IPFS → 铸造 |
| 10 | Chat 页面解密集成 | 订阅验证 → 解密注入 |
| 11 | 订阅门控中间件 | 前端 + API 双重校验 |

### Phase 3: A2A 协作 (Week 3-4)

| # | 任务 | 产出 |
|---|------|------|
| 12 | A2A SDK 封装 | agent-card / task-executor |
| 13 | A2A 任务面板 | 前端 UI |
| 14 | Agent 间调用 demo | 审计 Agent → 部署 Agent |
| 15 | 外部集成示例 | 第三方 App 集成 demo |

### Phase 4: 发布 (Week 4+)

| # | 任务 | 产出 |
|---|------|------|
| 16 | SDK 文档 | README + API 文档 + 示例 |
| 17 | 安全审计 | 合约 + 加密审计报告 |
| 18 | 测试网部署 | Sepolia 全链路测试 |
| 19 | 主网部署 | 多链部署 |

---

## 九、技术风险与对策

| 风险 | 对策 |
|------|------|
| ECIES 密钥丢失 → Agent 永久不可用 | 铸造者保留 AES Key 明文备份 |
| IPFS 文件不可用 | Pinata 固定 + 多网关 fallback |
| 合约升级需要保留旧数据 | OpenZeppelin UUPS 代理模式 |
| 加密算法被攻破 | AES-256-GCM 是 NIST 标准，ECIES 基于 secp256k1 |
| 前端加密性能 | Web Crypto API 硬件加速，< 1s 处理 1MB |

---

## 十、竞争优势

| 维度 | OpenAI GPTs | AgentX |
|------|------------|--------|
| 所有权 | 平台 | **NFT 你拥有** |
| 隐私 | 平台可见 Prompt | **AES-256 + ECIES 双重加密** |
| 付费 | 平台抽成 30% | **链上直销，创作者得 93%** |
| Agent 协作 | ❌ | **✅ A2A 协议，Agent 互调** |
| 外部集成 | 依赖 OpenAI API | **@agentx/sdk 任意集成** |
| 去中心化 | ❌ | **✅ 全客户端加密/解密** |
| 可组合性 | ❌ | **✅ Agent 市场 = 可组合乐高** |
