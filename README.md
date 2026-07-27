# AgentX — Decentralized AI Agent Platform

> SDK v0.6.7 · Contracts on Sepolia + OxaChain L1 · Production: `http://43.156.99.215:3100` · Last updated: 2026-07-28

AgentX is a decentralized AI Agent platform that enables publishers to create, encrypt, and distribute AI Agents on-chain, while subscribers can purchase and run them with autonomous ReAct AgentLoop inference — all secured by E2E encryption and on-chain subscription gating.

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
├── frontend/            # Next.js 14 前端
│   ├── app/             #   — 15 个页面路由
│   ├── components/      #   — layout, studio, wallet, chat, guard, providers
│   │   └── agent/       #   — hooks/, dashboard/ (Agent 仪表板组件)
│   ├── hooks/           #   — aimarket/, user/ 数据获取 hooks
│   └── lib/             #   — i18n, ipfs, wagmi 配置
├── .ua/                 # 知识图谱 (Understand-Anything v2.9.4)
│   └── knowledge-graph.json  # 509 节点 · 451 边 · 8 架构层 · 8 步导览
├── CODE_REVIEW_REPORT.md # 代码审查报告与修复任务清单
└── memory/              # 项目进度记录
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│              43.156.99.215 (Production)                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ Next.js FE  │  │ Express GW   │  │  PostgreSQL 14 │  │
│  │   :3100     │  │   :3090      │  │    :5432       │  │
│  │             │  │  + MCP Srv   │  │                │  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
│  ┌──────────────────────────────────────────────────┐   │
│  │ OxaChain L1 Geth Node  :18545  (Clique PoA)     │   │
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
npm install @agentxv2/sdk@0.6.7
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

---

## Key Features

| Feature | Description |
|---------|-------------|
| **ReAct AgentLoop** | Autonomous Think → Tools → Observe → Repeat execution |
| **E2E Encryption** | AES-256-GCM + ECIES for agent distribution |
| **On-Chain Subscriptions** | ETH/ERC20 subscription with escrow trial, auto-expiry |
| **Gateway SaaS** | Multi-tenant LLM proxy with EIP-191 wallet auth + JWT |
| **Dual-Mode LLM** | Platform quota (DeepSeek/OpenAI) + BYOK transparent proxy |
| **Admin Dashboard** | Web UI for platform key/plan/tenant/usage management |
| **MCP Remote Tools** | Publisher-hosted tools with ECDSA auth |
| **A2A Protocol** | Agent-to-Agent task delegation with auto-processing Worker + SDK Daemon |
| **IPFS / Pinata** | Encrypted payload + metadata upload to IPFS via Pinata |
| **Dual-Chain** | Sepolia (testnet) + OxaChain L1 (mainnet, default) |
| **i18n** | English / 繁體中文 language switcher |
| **Cluster-Ready** | PM2 cluster mode with Redis-backed auth challenges |

---

## Production URLs

| Service | URL |
|---------|-----|
| **Frontend** | `http://43.156.99.215:3100` |
| **Admin Panel** | `http://43.156.99.215:3100/admin` |
| **Gateway Health** | `http://43.156.99.215:3090/api/v1/health` |
| **MCP Server** | `http://43.156.99.215:3090/mcp` |
| **OxaChain RPC** | `https://rpc-oxa.0xainet.top` |
| **OxaChain Explorer** | `https://explorer-oxa.0xainet.top` |
| **SDK (npm)** | `npm install @agentxv2/sdk@0.6.7` |

---

## Configuration

### Gateway (`gateway/.env.example`)

完整配置模板包含 26 个环境变量，覆盖：服务器、数据库、Redis、JWT、双链 (Sepolia + OxaChain) 合约地址、A2A Worker 私钥等。详见 [`gateway/.env.example`](gateway/.env.example)。

### Deploy (`gateway/deploy/.env.deploy.example`)

部署凭证模板。SSH 连接信息、私钥、RPC 端点通过环境变量注入，避免硬编码。详见 [`gateway/deploy/.env.deploy.example`](gateway/deploy/.env.deploy.example) 和 [`deploy_config.py`](gateway/deploy/deploy_config.py)。

### Frontend (`frontend/.env.production`)

合约地址通过 `NEXT_PUBLIC_*` 变量注入。Pinata 凭证已从仓库移除，部署时通过 Vercel Environment Variables 或 CI/CD secrets 注入。

---

## Documentation

| Doc | Content |
|-----|---------|
| [INTEGRATION.md](./INTEGRATION.md) | SDK / Gateway / Contract integration guide |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Full production deployment guide |
| [SDK README](./sdk/README.md) | SDK API reference |
| [CONTRACTS.md](./contracts/CONTRACTS.md) | Smart contract addresses + ABIs |
| [MCP_SETUP.md](./MCP_SETUP.md) | MCP protocol configuration |
| [CODE_REVIEW_REPORT.md](./CODE_REVIEW_REPORT.md) | Code review findings & fix tasklist (22 issues, all resolved) |

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
