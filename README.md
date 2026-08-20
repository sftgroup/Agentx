# AgentX — Decentralized AI Agent Platform

> SDK v0.11.7 · Contracts on Sepolia + OxaChain L1 · Production: `https://agentx.0xainet.top` · Last updated: 2026-08-21

AgentX is a decentralized AI Agent platform that enables publishers to create, encrypt, and distribute AI Agents on-chain, while subscribers can purchase and run them with autonomous ReAct AgentLoop inference — all secured by E2E encryption and on-chain subscription gating.

**两种接入方式，按场景选择：**

- **SDK** · [`@agentxv2/sdk`](https://www.npmjs.com/package/@agentxv2/sdk) v0.11.7 — 直连区块链：链上读写、真实交易（订阅 / 创建套餐）、事件监听、加密、IPFS、对话 SSE、**三轨订阅支付（chain / fiat / x402）**、Agent 应用分类、**用户钱包签名上链编排**、**agent 自主钱包（MPC）管理 · A2A 代付**。适合 **DApp 与深度集成**。
- **MCP 客户端** · [`@agentxv2/mcp`](https://www.npmjs.com/package/@agentxv2/mcp) v0.1.0 — 经 Gateway MCP 协议：38 个工具（链上读写 + 对话/并行任务管理）、AI Agent 工具化调用、零依赖、免链配置。适合 **快速接入与只读场景**。

> 详细对比（能力 / 场景 / 选型决策树）：[docs/sdk-vs-mcp.md](docs/sdk-vs-mcp.md)
> 完整接入指南：发布 / 订阅 / 付费三轨 + 多 Agent 编排分层（含用户钱包签名上链）→ [docs/publish-subscribe-pay.md](docs/publish-subscribe-pay.md)

---

## Project Structure

```
Agentx/
├── contracts/           # Solidity 智能合约 (Foundry + OpenZeppelin)
│   ├── src/             #   — 独立版 IdentityRegistry + SubscriptionManager v3 (@deprecated)
│   └── src/erc8004-*/   #   — ERC-8004 标准实现 (interfaces, core, extensions)
├── sdk/                 # TypeScript SDK npm 包 (@agentxv2/sdk)
│   └── src/             #   — core, agent, agent-loop, llm, registry, subscription,
│                        #     a2a, mcp, reputation, endpoint, configuration, ipfs, react
├── gateway/             # Express.js 后端网关
│   ├── src/             #   — routes/, middleware/, services/, lib/
│   ├── db/migrations/   #   — PostgreSQL 迁移脚本
│   └── deploy/          #   — 部署脚本 (⚠️ 已统一配置 → deploy_config.py)
├── conversation-service/ # 多租户对话执行引擎（独立微服务）
│   └── src/             #   — services/ (runner, memory, llm resolver, tool executor),
│                        #     routes/ (runs SSE, tenants)
├── frontend/            # Next.js 14 前端
│   ├── app/             #   — 15 个页面路由
│   ├── components/      #   — layout, studio, wallet, chat, guard, providers
│   │   └── agent/       #   — hooks/, dashboard/ (Agent 仪表板组件)
│   ├── hooks/           #   — aimarket/, user/ 数据获取 hooks
│   └── lib/             #   — i18n, ipfs, wagmi 配置
├── e2e/                 # C 端 UI 回归 + 链上订阅 E2E 套件（playwright-core + 注入钱包）
│   ├── lib/provider.cjs #   — 钱包注入/MetaMask 模拟 + OXA RPC 隧道 + PASS/FAIL 日志
│   ├── scripts/         #   — ui-audit.cjs（C117–C274 含 /apply）、chat.cjs
│   └── onchain/         #   — subscribe.cjs 链上订阅 fixture（幂等）
├── docs/                 # 设计/需求文档 + 统一任务进度清单 (PROGRESS.md)
├── .ua/                 # 知识图谱 (Understand-Anything v2.9.4)
│   └── knowledge-graph.json  # 509 节点 · 451 边 · 8 架构层 · 8 步导览
├── CODE_REVIEW_REPORT.md # 代码审查报告与修复任务清单
└── memory/              # ⚠️ 已归档（进度统一见 docs/PROGRESS.md）
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│       43.159.60.46 — agentx.0xainet.top (Production)     │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ Next.js FE  │  │ Express GW   │  │  PostgreSQL 14 │  │
│  │   :3100     │  │   :3090      │  │    :5433       │  │
│  │             │  │  + MCP Srv   │  │                │  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Conversation Service :8100 (agent dialogue, SSE) │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘

Smart Contracts (dual-chain):
  Sepolia (11155111)                       OxaChain L1 (19505)
  ├─ IdentityRegistry                      ├─ IdentityRegistry
  ├─ SubscriptionManager v3                ├─ SubscriptionManager v3
  ├─ A2AProtocolRegistry v2                ├─ A2AProtocolRegistry v2
  ├─ ReputationRegistry                    ├─ ReputationRegistry
  ├─ ConfigurationRegistry                 ├─ ConfigurationRegistry
  └─ MultiEndpointRegistry                 └─ MultiEndpointRegistry

ERC-8004 Standard (planned):
  ├─ ERC8004IdentityRegistry  (core)
  ├─ ValidationRegistry       (core — now uses IERC8004Identity interface)
  ├─ ReputationRegistry      (core)
  ├─ PaymentGateway          (extension)
  ├─ AgentFactory / AgentWallet / TokenPriceOracle / A2AProtocolRegistry
```

---

## Quick Start

```bash
npm install @agentxv2/sdk@0.11.7
```

```typescript
import { AgentLoop, AgentRunner, OpenAIProvider } from '@agentxv2/sdk'

const runner = new AgentRunner({ reader, wallet })
const ctx = await runner.useAgent(42)

const loop = new AgentLoop({
  ctx,
  llmProvider: new OpenAIProvider({ apiKey: 'sk-...', model: 'gpt-4o' }),
  maxIterations: 5,
  onTextDelta: (delta) => console.log(delta),
})

await loop.run('Audit this contract for vulnerabilities')
```

### Hosted Conversation Service (v0.8.0)

Run agents on our hosted Conversation Service from your own app — no chain sync, no IPFS, no local key management:

```typescript
import { ConversationClient } from '@agentxv2/sdk/conversation'

const client = new ConversationClient({
  gatewayUrl: 'https://agentx.0xainet.top',
  apiKey: 'agentx_xxx',      // Tenant API Key (issued after registration)
  endUserId: 'user_123',     // Optional: per end-user memory isolation
  llmApiKey: 'sk-...',       // Optional: stateless BYOK — your own LLM key (highest priority)
  llmEndpoint: 'https://api.deepseek.com/v1',  // Optional: endpoint for llmApiKey (default OpenAI)
  llmModel: 'deepseek-v4-pro', // Optional: model for llmApiKey (default gpt-4o)
})

const result = await client.chat({ agentId: 42, message: '你好', enableMemory: true })
// Streaming: for await (const event of client.stream({...})) { ... }
// Inline mode: omit agentId, pass prompt + skills (MCP/HTTP/RAG) — no AgentX registration needed
// Stored BYOK (v0.8.6): use a tenant-owned key saved in platform Settings — pass tenantKeyId in chat/stream params
```

---

## Key Features

| Feature | Description |
|---------|-------------|
| **ReAct AgentLoop** | Autonomous Think → Tools → Observe → Repeat execution |
| **E2E Encryption** | AES-256-GCM + ECIES for agent distribution |
| **On-Chain Subscriptions** | ETH/ERC20 subscription with escrow trial, auto-expiry |
| **Gateway SaaS** | Multi-tenant LLM proxy with EIP-191 wallet auth + JWT |
| **Conversation Service** | Hosted multi-tenant conversation engine (SSE streaming, memory, clarification) |
| **Stateless BYOK** | Callers supply their own LLM key + endpoint per request (`X-Llm-Api-Key` / `X-Llm-Endpoint`) — zero AgentX-side key storage |
| **Dual-Mode LLM** | Platform quota (DeepSeek/OpenAI) + BYOK transparent proxy |
| **Admin Dashboard** | Web UI for platform key/plan/tenant/usage management |
| **MCP Remote Tools** | Publisher-hosted tools with ECDSA auth |
| **Payment Stack** | 三轨订阅支付（chain 链上 escrow / fiat Stripe / x402 周期支付，统一 `/api/v1/payments` 端点）+ 链上自动分成（creator 97.5% + 平台 2.5%）+ 渠道归因分成（可追溯） |
| **Multi-Agent Orchestration** | 编排分层：**链下默认**（对话通道实时委派，零成本）+ **链上可选**（A2A 协议，可审计 / 结算 / 信誉；**用户显式要求时启用，由用户自己的钱包签 `createTask` 付 gas**，平台永不代付、不持签名密钥） |
| **Agent Categories** | 发布必填应用类别（`AGENT_CATEGORIES`，13 枚举），Marketplace 分类筛选 + 卡片标签 |
| **Live Chain Data API** | `/api/v1/chain` 实时直读（SDK 驱动）+ `/api/v1/agents` 索引层（PostgreSQL 双轨架构） |
| **A2A Protocol** | Agent-to-Agent task delegation with auto-processing Worker + SDK Daemon |
| **IPFS / Pinata** | Encrypted payload + metadata upload to IPFS via Pinata |
| **Dual-Chain** | Sepolia (testnet) + OxaChain L1 (mainnet, default) |
| **i18n** | English / 繁體中文 language switcher |
| **Cluster-Ready** | PM2 cluster mode with Redis-backed auth challenges |

---

## Production URLs

| Service | URL |
|---------|-----|
| **Frontend** | `https://agentx.0xainet.top` |
| **Admin Panel** | `https://agentx.0xainet.top/admin` |
| **Gateway** | `https://agentx.0xainet.top` |
| **Gateway Health** | `https://agentx.0xainet.top/api/v1/health` |
| **Chain Data API** | `https://agentx.0xainet.top/api/v1/chain`（实时链上读取：health/total/agents/plans/check-subscription） |
| **MCP Server** | `https://agentx.0xainet.top/mcp` |
| **Conversation Service** | `http://127.0.0.1:8100` |
| **SDK Docs (live)** | `https://agentx.0xainet.top/docs/sdk`（实时渲染 SDK README） |
| **OxaChain RPC** | `https://rpc-oxa.0xainet.top` |
| **OxaChain Explorer** | `https://explorer-oxa.0xainet.top` |
| **SDK (npm)** | `npm install @agentxv2/sdk@0.11.7` |
| **Frontend (Web)** | Next.js platform UI (`frontend/`, SDK `^0.11.5`, production `https://agentx.0xainet.top`) |

---

## Configuration

### Gateway (`gateway/.env.example`)

完整配置模板包含 26 个环境变量，覆盖：服务器、数据库、Redis、JWT、双链 (Sepolia + OxaChain) 合约地址等。⚠️ A2A Worker 签名私钥已废弃（2026-08-08）——链上 A2A 轨道由用户自己的钱包签名，Gateway 不再持有任何签名密钥。详见 [`gateway/.env.example`](gateway/.env.example)。

### Deploy (`gateway/deploy/.env.deploy.example`)

部署凭证模板。SSH 连接信息、私钥、RPC 端点通过环境变量注入，避免硬编码。详见 [`gateway/deploy/.env.deploy.example`](gateway/deploy/.env.deploy.example) 和 [`deploy_config.py`](gateway/deploy/deploy_config.py)。

### Frontend (`frontend/.env.production`)

合约地址通过 `NEXT_PUBLIC_*` 变量注入。Pinata 凭证已从仓库移除，部署时通过 Vercel Environment Variables 或 CI/CD secrets 注入。

---

## Documentation

| Doc | Content |
|-----|---------|
| [PROGRESS.md](./docs/PROGRESS.md) | **统一任务清单与进度**（P0–P4 全部任务状态 / 待办 / 生产环境 / 合约地址 / 验证记录） |
| [publish-subscribe-pay.md](./docs/publish-subscribe-pay.md) | **发布 / 订阅 / 付费 集成指南**（三轨支付 + 多 Agent 编排分层 + category 必填） |
| [integration-callers.md](./docs/integration-callers.md) | 调用方（业务团队）接入指南：Key / 会话任务 / MCP / 错误码 |
| [sdk-integration-example.md](./docs/sdk-integration-example.md) | 第三方服务接入样例：SDK / MCP / REST 三通道可运行示例 |
| [payment-architecture.md](./docs/payment-architecture.md) | 支付体系设计：渠道分成、法币订阅 (A1)、x402 按次付费 (A2)、决策树 |
| [INTEGRATION.md](./INTEGRATION.md) | SDK / Gateway / Contract integration guide |
| [CONVERSATION_SERVICE.md](./CONVERSATION_SERVICE.md) | Conversation Service server protocol (auth, SSE, BYOK, memory, A2A orchestration layering v0.10.0) |
| [AISERVICER_INTEGRATION.md](./AISERVICER_INTEGRATION.md) | Sample: external project integration (aiservicer) — final BYOK form |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Full production deployment guide |
| [SDK README](./sdk/README.md) | SDK API reference |
| [CONTRACTS.md](./contracts/CONTRACTS.md) | Smart contract addresses + ABIs |
| [MCP_SETUP.md](./MCP_SETUP.md) | MCP protocol configuration |
| [REFACTORING_NOTES.md](./REFACTORING_NOTES.md) | 2026-08 refactor: decoupling + dead-code cleanup notes |
| [CODE_REVIEW_REPORT.md](./CODE_REVIEW_REPORT.md) | Code review findings & fix tasklist (22 issues, all resolved) |
| [test-cases-consumer-c-end.md](./docs/test-cases-consumer-c-end.md) | C 端逐条用例库（369 条：支付/订阅/渠道归因/入驻申请/技能市场等，含生产实跑记录） |
| [test-cases-consumer-journeys.md](./docs/test-cases-consumer-journeys.md) | C 端完整用户旅程（J1–J10 旅程式操作路径 + UI 层逐页审计 + 链上订阅 fixture） |
| [e2e/](./e2e/) | C 端 UI 回归 + 链上订阅 E2E 套件（ui-audit/chat/subscribe + GitHub Actions e2e.yml 手动·nightly） |

---

## Smart Contracts

| # | Contract | Sepolia | OxaChain L1 |
|---|----------|---------|-------------|
| 1 | IdentityRegistry | `0xe94a...96e5F` | `0xbf5F...E212` |
| 2 | SubscriptionManager v3 | `0xC15f...7E63` | `0x019A...0E6B` |
| 3 | A2AProtocolRegistry v2 | `0x309C...7e9cB` | `0x7F42...Eb86` |
| 4 | ReputationRegistry | `0xeb6B...3DC9` | `0x6a18...843F` |
| 5 | ConfigurationRegistry | `0x68Dc...EA6c` | `0x0728...D2F8` |
| 6 | MultiEndpointRegistry | `0xEB5e...1Cb7` | `0xB361...4f8c` |

> **Note:** ERC-8004 standard contracts (`erc8004-core/` + `erc8004-extensions/`) are planned for future deployment. The current deployed contracts are the standalone versions. Migration path documented in source.

---

## Chain Info

| Chain | Chain ID | RPC | Native |
|-------|----------|-----|--------|
| **OxaChain L1** | **19505** | `https://rpc-oxa.0xainet.top` | OXA |
| Sepolia Testnet | 11155111 | `https://ethereum-sepolia-rpc.publicnode.com` | ETH |

---

## Knowledge Graph

项目已通过 [Understand-Anything](https://github.com/Lum1104/Understand-Anything) (v2.9.4) 生成交互式知识图谱。

- **输出**: [`.ua/knowledge-graph.json`](.ua/knowledge-graph.json) (453 KB)
- **规模**: 509 节点 · 451 边 · 8 架构层 · 8 步代码导览
- **格式**: 兼容 Understand-Anything Dashboard 可视化浏览

---

## Code Quality

代码审查已完成，22 项问题全部修复。详见 [CODE_REVIEW_REPORT.md](./CODE_REVIEW_REPORT.md)。

| 维度 | 修复前 | 修复后 |
|------|--------|--------|
| 合约冗余 | ❌ IdentityRegistry x2 · SubscriptionManager x2 | ✅ 添加 deprecation 标记 + 迁移路径 |
| 安全凭证 | ❌ 88 脚本硬编码密码/私钥 | ✅ 统一 `deploy_config.py` + `.env.deploy.example` |
| 接口隔离 | ❌ ValidationRegistry 耦合具体类型 | ✅ 改为 `IERC8004Identity` 接口 |
| 硬编码地址 | ❌ TokenPriceOracle 主网地址 | ✅ 移除，改为 `addToken()` 注入 |
| 配置完整性 | ❌ `.env.example` 缺 19 变量 | ✅ 补全至 26 个变量 |
| 集群认证 | ❌ auth challengeMap 内存存储 | ✅ 迁移到 Redis + 本地 fallback |
| 前端冗余 | ❌ 3 个 Dashboard · 2 个 useAgentRegistry | ✅ 统一入口 · 重命名消除歧义 |
| 错误处理 | ❌ 错误消息暴露内部信息 | ✅ 统一 AppError 层级 + globalErrorHandler |

---

## License

MIT — [sftgroup/Agentx](https://github.com/sftgroup/Agentx)
