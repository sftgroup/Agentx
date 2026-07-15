# AgentX 前端需求文档 (PRD)

> 基于 ERC8004 现有代码改造，目标：将「品牌展示 Landing」→「Agent 铸造/交易/使用」全链路打通。

---

## 一、页面清单 & 路由

```
/                          Landing Page（品牌页）
/marketplace               Agent 市场（浏览/搜索/筛选）
/marketplace/[id]          Agent 详情页（介绍 + 订阅购买）
/studio                    Agent Studio（创建向导入口）
/studio/prompt             Step 1: Prompt 编辑器
/studio/skills             Step 2: Skill 配置器
/studio/mcp                Step 3: MCP 连接器
/studio/publish            Step 4: 预览 + 加密 + 上链发布
/dashboard                 Dashboard 首页（概览面板）
/dashboard/agents          我的 Agent（管理已铸造的 Agent）
/dashboard/subscriptions   我的订阅（已购买的 Agent 订阅管理）
/dashboard/revenue         收入面板（Agent 创作者收入）
/dashboard/tasks           A2A 任务面板
/chat/[agentId]            Agent 对话（核心使用入口）
/chat/[agentId]/settings   对话设置（模型/参数）
```

---

## 二、页面详细规格

### 2.1 Landing Page `/`

**定位**：品牌展示，转化用户去创作或购买

**模块**：
| 模块 | 说明 |
|------|------|
| Hero | 标题「铸造你的 AI Agent，永久拥有」，CTA → /studio / /marketplace |
| 核心卖点 | 3 列卡片：去中心化所有权(NFT)、端到端加密(AES+ECIES)、Agent 互调(A2A) |
| 运作流程图 | 3 步：铸造 → 订阅 → 使用，配图标 |
| 热门 Agent | 横向滚动卡片（数据来自链上，取评分 Top 6） |
| 创作者收益 | 「创作者得 93%，平台零抽成」+ 数字驱动 |
| Footer | 合约地址、多链信息、GitHub 链接 |

**状态**：ERC8004 已有基础版，需修改 Hero 文案 + 卖点 + 替换 ERC-8004 品牌为 AgentX

---

### 2.2 Agent 市场 `/marketplace`

**功能**：
| 功能 | 说明 |
|------|------|
| 搜索 | 关键词匹配 Agent 名称、描述、标签 |
| 筛选 | 分类标签(solidity/defi/nft)、价格区间、排序(评分/销量/最新) |
| 列表 | Grid 卡片，每卡：头像 + 名称 + 简介 + 评分 ★ + 价格 +「订阅」按钮 |
| 分页 | 每页 12 个，无限滚动/页码均可 |

**状态**：ERC8004 已有基础版（SearchFilters + AgentList），需补充链上搜索

---

### 2.3 Agent 详情 `/marketplace/[id]`

**模块**：
| 模块 | 说明 |
|------|------|
| 头部 | Agent 形象图 + 名称 + 版本 + 铸造者地址 + 链上已验证徽章 |
| 介绍 | Markdown 渲染描述、标签 |
| Skill 清单 | 每个 Skill 的名称 + 描述 + input/output Schema 预览（折叠） |
| MCP 连接 | 端点地址 + 可用工具列表（公开信息） |
| 评分 | ★ 平均分 + 评分人数 + 最近 3 条带评论文本的评价 |
| 订阅面板 | 价格 + 周期 +「立即订阅」按钮 → 发送链上交易 |
| A2A 信息 | 支持的 capability 标签 + 可接受的任务类型 |

**流程图**：
```
进入详情 → 链上读取 Agent metadata → IPFS 加载公开数据
                                      ↓
                    [订阅按钮] → PaymentGateway.subscribe()
                                      ↓
                                  等待交易确认
                                      ↓
                    [已订阅] → 「开始对话」按钮 → /chat/[agentId]
```

**状态**：ERC8004 有基础页，缺 Skill 清单渲染和订阅面板完整交互

---

### 2.4 Agent Studio（4 步创建向导）

#### Step 1: Prompt 编辑器 `/studio/prompt`

| 字段 | 控件 | 校验 |
|------|------|------|
| Agent 名称 | 文本输入 | 必填，1-50 字符 |
| 头像 | 上传/URL | 可选，走 IPFS 上传 |
| 描述 | Textarea | 必填，50-500 字符 |
| 标签 | Tags 输入 | 至少 1 个，最多 5 个 |
| System Prompt | Markdown 编辑器 | 必填，< 4KB |
| 版本号 | 文本（semver） | 必填，x.y.z 格式 |

#### Step 2: Skill 配置器 `/studio/skills`

| 功能 | 说明 |
|------|------|
| 添加 Skill | 弹窗表单：name + description + inputSchema(JSON编辑器) + outputSchema(JSON编辑器) + 执行模式(Open/Closed) |
| Skill 列表 | 可拖拽排序，编辑/删除 |
| Closed Skill | 如果是 Closed，额外字段：MCP endpoint + toolName（发布者自己部署的 MCP 服务器） |
| Schema 校验 | 输入 JSON 后实时校验格式 |

#### Step 3: MCP 连接器 `/studio/mcp`

| 功能 | 说明 |
|------|------|
| 连接类型 | HTTP / SSE / stdio（下拉选择） |
| 端点 URL | 文本输入 |
| 测试连接 | 按钮 → MCPConnector.listTools() → 显示可用工具列表 |
| 工具筛选 | 多选 checkbox，选择要暴露给订阅者的 tools |

#### Step 4: 预览 + 发布 `/studio/publish`

| 功能 | 说明 |
|------|------|
| 预览卡片 | 模拟 Agent 在市场上的展示效果（名称+描述+Skills清单+定价） |
| 定价设置 | 订阅制：金额 + 周期（月/季/年）+ 币种(ETH/USDC)；按次付费：每次单价 |
| 加密发布 | 「一键加密 + 上链」按钮 |
| 发布流程 | ① 浏览器端 AES-256-GCM 加密 Payload → ② 上传加密版到 IPFS → ③ 上传公开元数据到 IPFS → ④ ECIES 加密 AES Key（用户公钥）→ ⑤ IdentityRegistry.registerWithMetadata(tokenURI, metadata) → ⑥ 等待交易确认 → ⑦ 成功提示 + 跳转 Agent 详情 |

**发布进度条**：加密 Payload → IPFS 上传 → 签名交易 → 链上确认（4 步进度指示）

**状态**：全新开发，ERC8004 无此页面

---

### 2.5 Dashboard 首页 `/dashboard`

| 模块 | 说明 |
|------|------|
| 统计卡片 | 我铸造的 Agent 数、活跃订阅数、月收入、A2A 任务数 |
| 最近创建的 Agent | 列表，每项：名称 + 状态 + 订阅数 + 评分 |
| 活跃订阅 | 即将到期提醒（< 7 天高亮） |
| 收入趋势 | 简易折线图（按周/月） |
| 快捷入口 | 创建 Agent / 浏览市场 / 管理任务 |

**状态**：ERC8004 有 AgentDashboard 组件框架，需改造数据源

---

### 2.6 我的 Agent `/dashboard/agents`

| 功能 | 说明 |
|------|------|
| 列表 | 当前钱包铸造的所有 Agent，卡片显示：名称 + 状态(Active/Inactive) + 订阅数 + 收入 |
| 操作 | 编辑（跳 Studio 预填） / 停用 / 查看详情 / 查看订阅者 |
| 筛选 | 按状态、创建时间排序 |

**状态**：ERC8004 有 `useAgentRegistry.getAgentsByOwner`，需配 UI

---

### 2.7 我的订阅 `/dashboard/subscriptions`

| 功能 | 说明 |
|------|------|
| 列表 | 当前钱包订阅的所有 Agent，卡片：名称 + 到期时间 + 状态(Active/Expiring/Expired) |
| 即将到期 | 红色提醒，< 30 天 |
| 操作 | 续费（直接发链上交易）/ 取消 / 前往对话 |
| 到期自动提醒 | 前端 + 可选邮件提醒 |

---

### 2.8 Agent 对话 `/chat/[agentId]`

**核心使用入口。这是最关键、最复杂的页面。**

| 模块 | 说明 |
|------|------|
| 进入门控 | 首次进入 → `guardSubscription()` → 无订阅则弹出订阅引导面板 |
| 解密加载 | 有订阅 → `AgentRunner.useAgent(agentId)` → ECIES 解密 AES Key → IPFS 拉取 → AES 解密 → 拿到 prompt + skills + mcp |
| Chat UI | 消息列表（user/assistant/tool 三角色气泡）+ 输入框 + 发送按钮 |
| System Prompt | 解密后注入 LLM 上下文，用户不可见 |
| Tool 调用 | LLM function call → 对 Open Skill 本地执行 / 对 Closed Skill MCP 远程执行 → 结果显示为可折叠 tool 气泡 |
| MCP 工具 | assistant 调用 MCP tool → `MCPConnector.callTool()` → 结果渲染 |
| 对话历史持久化 | 可选：存 localStorage 或 IPFS（加密） |
| 上下文记忆 | 多轮对话保留上下文（标准 LLM messages 数组） |

**状态**：ERC8004 有 `/user/chat/[agentId]` 基础版，需重写解密+注入+Tool调用链路

---

### 2.9 A2A 任务面板 `/dashboard/tasks`

| 功能 | 说明 |
|------|------|
| 任务列表 | 我创建的 + 我接收的，状态筛选(待处理/进行中/已完成/失败) |
| 创建任务 | 选择目标 Agent + taskType + 输入 JSON |
| 任务详情 | 输入/输出数据展示 + 链上 tx hash |
| Agent 链 | 可视化 Agent 间调用关系（taskId → 上游/下游 Agent） |

**状态**：全新开发

---

## 三、全局组件

| 组件 | 说明 | 状态 |
|------|------|------|
| **AppLayout** | 全局布局：Header + Sidebar + Content | ERC8004 已有 |
| **Header** | Logo + 导航 + 钱包连接按钮 | 改造品牌 |
| **Sidebar** | 菜单：市场 / Studio / Dashboard / A2A | 已有，加菜单项 |
| **WalletConnect** | wagmi 钱包连接，支持 MetaMask/WalletConnect/Coinbase | 已有 |
| **AgentCard** | 市场列表卡片，可复用在多页 | 已有 |
| **SubscriptionGuard** | 订阅门控组件，包裹需要订阅的页面 | **新开发** |
| **EncryptProgress** | 发布加密进度指示器（Step 1→4） | **新开发** |
| **SchemaPreview** | JSON Schema 可视化预览（折叠/展开） | **新开发** |
| **ChatBubble** | 消息气泡：user/assistant/tool/error | 已有，微调 |
| **RatingStars** | 评分组件（1-5 星交互） | 已有 |
| **TxStatusToast** | 链上交易状态通知（pending/confirmed/failed） | 已有 |

---

## 四、核心交互流程

### 4.1 铸造 Agent 完整流程

```
用户 → /studio
  Step 1 prompt:  填写名称 + Prompt → 存 localStorage draft
  Step 2 skills:  添加 Skill(Open/Closed) → 填入 Schema
  Step 3 mcp:     连接 MCP → test → 选 tools
  Step 4 publish: 预览 + 定价 → [一键加密+上链]
    → Loading: "🔐 加密 Payload..."  (AES-256-GCM)
    → Loading: "📦 上传 IPFS..."     (Pinata)
    → Loading: "🔑 加密密钥..."      (ECIES)
    → Wallet: "✍️ 签名交易..."       (MetaMask)
    → Loading: "⛓️ 等待链上确认..."
    → ✅ "Agent #42 铸造成功！" → 跳转 /marketplace/42
```

### 4.2 使用 Agent 完整流程

```
用户 → /marketplace → 选择 Agent → /marketplace/42
  → 查看详情（公开元数据：名称、描述、Skill 列表、评分）
  → [订阅按钮] → MetaMask 确认 → 等待确认
  → [开始对话] → /chat/42
  → SubscriptionGuard 校验链上订阅
  → AgentRunner.useAgent(42) → 解密
    ├─ ECIES 解密 AES Key（本地，无网络请求）
    ├─ IPFS 拉取加密 Payload
    └─ AES-256-GCM 解密 → prompt + skills + mcp
  → 注入 LLM 上下文
  → 用户可以开始对话
```

### 4.3 Closed Skill 远程调用流程

```
用户 → Chat 输入「审计合约 0x1234」
  → LLM function call: tool=slither_audit, args={contract:"0x1234"}
  → agent-runner 识别 execution.type === "mcp"
  → POST https://publisher-mcp.example.com
      Headers:
        X-Subscriber-Address: 0x用户钱包
        X-Signature: 用户对 "agentx:mcp:slither_audit:timestamp" 的 ECDSA 签名
        X-Timestamp: 当前时间戳
      Body: { jsonrpc: "2.0", method: "tools/call", params: { name: "slither_audit", arguments: {...} } }
  → 发布者 MCP 服务器校验：
      签名有效？ ✓
      链上 hasActiveSubscription(address, agentId) = true？ ✓
      订阅未过期？ ✓
  → 执行 slither 审计脚本 (Python)
  → 返回 { vulnerabilities: [...], score: 85 }
  → Chat UI 显示 tool 调用气泡（可折叠，显示输入/输出）
  → LLM 总结结果给用户
```

---

## 五、数据流 & 状态管理

| 数据类型 | 来源 | 存储 |
|---------|------|------|
| Agent 列表 | 链上 IdentityRegistry events | SDK cache + React Query |
| Agent 详情 | IPFS + 链上 metadata | React Query |
| 订阅状态 | SubscriptionManager 链上 | React Query，定期刷新 |
| 对话历史 | 浏览器端 Chat | localStorage（可选） |
| Studio 草稿 | 用户输入 | localStorage（自动保存） |
| 钱包状态 | wagmi | wagmi store |
| 交易状态 | 链上确认 | wagmi useWaitForTransaction |

**推荐方案**：React Query (TanStack Query) 做服务端状态管理 + Zustand 做客户端 UI 状态。

---

## 六、技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 框架 | Next.js 14 App Router | 沿用 ERC8004 |
| 语言 | TypeScript strict | 沿用 |
| 样式 | TailwindCSS | 沿用 |
| 图标 | lucide-react | 沿用 |
| 组件库 | 可选 shadcn/ui | 加速开发 |
| Web3 | wagmi v2 + viem | 沿用（viem 已集成到 SDK） |
| 加密 | @agentx/sdk (core/crypto) | **新集成** |
| SDK | @agentx/sdk (agent/registry/subscription/mcp) | **新集成** |
| 状态 | @tanstack/react-query + zustand | 推荐新增 |
| 表单 | react-hook-form + zod | 推荐（Studio 复杂表单） |
| Markdown | react-markdown + rehype-highlight | Prompt 预览 + Chat 渲染 |

---

## 七、开发优先级

### P0（核心闭环，先做）
1. **Landing Page 改造** — 品牌替换 + CTA 调整
2. **Studio 4 步向导** — prompt + skills + mcp + publish（加密发布全流程）
3. **Agent 详情页改造** — 集成 SDK 订阅购买 + 解密校验
4. **Chat 对话页重写** — 集成 AgentRunner + Closed Skill MCP 调用
5. **SubscriptionGuard 组件** — 通用门控
6. **EncryptProgress 组件** — 发布进度

### P1（增强体验）
7. Dashboard 面板（agents/subscriptions/revenue）
8. Agent 市场搜索 + 筛选优化
9. A2A 任务面板

### P2（完善）
10. 对话历史持久化（加密存 IPFS）
11. Agent 评分 + 评价系统
12. 多链切换 UI

---

## 八、改造 vs 新建对照

| ERC8004 页面 | AgentX 对应 | 改动量 |
|-------------|------------|--------|
| `/` Landing | `/` | 小改（文案+品牌） |
| `/marketplace` | `/marketplace` | 中改（集成 SDK） |
| `/marketplace/[id]` | `/marketplace/[id]` | 大改（订阅+解密） |
| `/dashboard/agent` | `/dashboard/agents` | 中改 |
| `/user/chat/[agentId]` | `/chat/[agentId]` | **重写** |
| — | `/studio/*` | **新建** |
| — | `/dashboard/tasks` | **新建** |
| `Header/Sidebar/WalletConnect` | 复用 | 小改 |
| `AgentCard/SearchFilters/AgentList` | 复用 | 小改 |
| `useAgentRegistry` 等 hooks | 改调 `@agentx/sdk` | 重写适配层 |

---

## 九、环境变量

```env
NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_SUBSCRIPTION_MANAGER_ADDRESS=0x...
NEXT_PUBLIC_PAYMENT_GATEWAY_ADDRESS=0x...
NEXT_PUBLIC_A2A_PROTOCOL_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_REPUTATION_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_CONFIGURATION_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_IPFS_GATEWAY=gateway.pinata.cloud
NEXT_PUBLIC_PINATA_JWT=...
NEXT_PUBLIC_DEFAULT_CHAIN_ID=11155111

# LLM 配置（Chat 页用）
NEXT_PUBLIC_LLM_API_ENDPOINT=https://api.openai.com/v1
NEXT_PUBLIC_LLM_MODEL=gpt-4o
```
