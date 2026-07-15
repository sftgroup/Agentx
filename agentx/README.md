# AgentX — Decentralized AI Agent Protocol

> Last updated: 2026-07-15 (SDK v0.6.1: AgentLoop ReAct engine + Gateway multi-tenant SaaS + dual-mode LLM providers)

```
Agent = Prompt + Skills[] + MCP
```

**AgentX lets you publish, monetize, and run AI Agents as on-chain, encrypted assets — with no backend, no platform lock-in, and no trust required.**

---

## What Problem Does This Solve?

| Problem | AgentX Solution |
|---------|-----------------|
| AI Agent monetization | On-chain subscription (ETH/ERC20) with escrow trials + platform fees |
| Code/IP protection | AES-256-GCM + ECIES dual encryption — payload is ciphertext on IPFS |
| Agent-to-Agent calling | A2A Protocol — audit → deploy → monitor, every step on-chain |
| Proprietary tool execution | MCP remote execution — subscribers run, creator's code never leaves their server |
| Centralized platform risk | 100% on-chain access control — no platform can de-platform your Agent |
| **Dumb LLM chat** | **AgentLoop ReAct engine — LLM autonomously thinks → calls tools → observes → repeats** |
| **API key leaks** | **Gateway multi-tenant proxy — API key never appears in browser** |

---

## What's New in v0.6.1

### AgentLoop — ReAct Autonomous Agent Engine

LLM now autonomously decides which tools to call and when. No more hardcoded keyword matching.

```
User: "Audit contract 0x1234"

AgentLoop Loop 1:
  LLM thinks → calls slither_audit({ contract: "0x1234" })
  ToolExecutor executes (MCP remote) → { vulnerabilities: [...] }

AgentLoop Loop 2:
  LLM thinks → calls forge_test({ contract: "0x1234" })
  → { testResults: [...] }

AgentLoop Loop 3:
  LLM summarizes: "Found 3 HIGH and 2 MEDIUM issues. Recommend fixing reentrancy..."
Done. (3 iterations)
```

### Gateway — Multi-Tenant SaaS LLM Proxy

```
┌──────────────────────────────────────────────────────┐
│                AgentX Gateway (Express)                │
│                                                        │
│  POST /api/v1/chat/completions                        │
│    ↑ Bearer JWT (EIP-191 wallet signature)             │
│                                                        │
│  → Auth → Rate Limit (Redis) → Resolve Key → Proxy     │
│    ├─ Platform Key: quota-deducted proxy               │
│    └─ Tenant Owned (BYOK): transparent proxy           │
│                                                        │
│  POST /api/v1/auth/challenge    → EIP-191 challenge    │
│  POST /api/v1/auth/verify       → JWT token           │
│  GET  /api/v1/tenant/me         → plan + keys + usage  │
│  POST /api/v1/tenant/keys       → upload BYOK key      │
│  GET  /api/v1/models             → available models     │
└──────────────────────────────────────────────────────┘
```

---

## Project Structure

```
agentx/
│
├── README.md              ← you are here
├── PROPOSAL.md            ← Original project proposal
├── FRONTEND_PRD.md        ← Frontend PRD
├── INTEGRATION.md         ← Third-party integration guide (SDK + contracts)
├── DEPLOYMENT.md          ← Deployment workflow
│
├── contracts/             ← Solidity smart contracts (Foundry)
│   ├── CONTRACTS.md       ← Contract reference (dual-chain addresses)
│   ├── src/
│   │   ├── IdentityRegistry.sol      ← Agent NFT mint, encrypted key storage
│   │   ├── SubscriptionManager.sol   ← v3: subscribe (ETH/ERC20), trial, fees
│   │   ├── erc8004-core/             ← ERC-8004 base contracts
│   │   ├── erc8004-extensions/       ← Extensions (some deprecated)
│   │   └── erc8004-interfaces/       ← Shared interfaces
│   ├── script/                       ← Deploy scripts
│   ├── test/                         ← Unit tests
│   └── foundry.toml
│
├── sdk/                   ← @agentxv2/sdk v0.6.1 (npm)
│   ├── README.md          ← SDK-specific docs
│   ├── src/
│   │   ├── index.ts               ← Main entry: all modules
│   │   ├── core/                  ← crypto + types
│   │   ├── agent/                 ← AgentRunner (decrypt + load)
│   │   ├── agent-loop/            ← AgentLoop (ReAct engine), ToolExecutor, buildTools
│   │   ├── llm/                   ← OpenAIProvider, GatewayProvider, factory
│   │   ├── registry/              ← AgentRegistry + IPFSFetcher
│   │   ├── subscription/          ← SubscriptionManager + AgentX402
│   │   ├── a2a/                   ← A2AProtocol
│   │   ├── mcp/                   ← MCPConnector
│   │   ├── reputation/            ← ReputationRegistry
│   │   ├── config/                ← KNOWN_CHAINS
│   │   ├── endpoint/              ← MultiEndpointClient
│   │   ├── configuration/         ← ConfigurationClient
│   │   └── react/                 ← useAgentRunner hook
│   ├── dist/                      ← CJS + ESM + DTS
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/              ← Next.js 14 App (React + wagmi + WalletConnect)
│   ├── app/
│   │   ├── page.tsx              ← Landing
│   │   ├── marketplace/          ← /marketplace + /marketplace/agent/[id]
│   │   ├── studio/               ← /studio (4-step wizard)
│   │   ├── user/                 ← /user/dashboard, /user/chat/[agentId], etc.
│   │   ├── a2a/                  ← /a2a (Agent-to-Agent tasks)
│   │   └── api/                  ← API routes (ipfs upload)
│   ├── components/
│   │   ├── chat/                 ← ToolCallBubble (NEW: collapsible tool call UI)
│   │   ├── agent/dashboard/      ← AgentDashboard, Registration, etc.
│   │   ├── aimarket/             ← AgentCard, AgentList, SearchFilters
│   │   ├── guard/                ← SubscriptionGuard
│   │   ├── layout/               ← AppLayout, Header, Sidebar
│   │   ├── studio/               ← StepIndicator, EncryptProgress
│   │   └── wallet/               ← WalletConnect, NetworkSwitcher
│   ├── hooks/
│   │   ├── useGatewayAuth.ts     ← NEW: EIP-191 wallet auth → Gateway JWT
│   │   ├── user/                 ← useUserSubscriptions
│   │   └── aimarket/             ← Marketplace hooks
│   └── .env.production
│
├── gateway/               ← AgentX Gateway (NEW: multi-tenant SaaS backend)
│   ├── src/
│   │   ├── index.ts              ← Express entry (helmet, cors, rate-limit)
│   │   ├── config.ts             ← Environment config
│   │   ├── lib/
│   │   │   ├── crypto.ts         ← AES-256-GCM API key encryption
│   │   │   └── db.ts             ← PostgreSQL pool
│   │   ├── middleware/
│   │   │   ├── auth.ts           ← EIP-191 wallet auth + JWT + auto tenant creation
│   │   │   └── rate-limiter.ts   ← 3-layer: IP + per-tenant RPM + daily quota + concurrency
│   │   └── routes/
│   │       ├── chat.ts           ← POST /api/v1/chat/completions (dual-mode proxy)
│   │       ├── tenant.ts         ← CRUD /keys, /usage, /models, /me
│   │       └── history.ts        ← Cloud chat history CRUD
│   ├── db/migrations/            ← Schema: plans, tenants, keys, usage_logs, chat_messages
│   ├── ecosystem.config.js       ← PM2 cluster (2 instances)
│   └── package.json
│
└── test-reports/          ← Test output
    ├── REAL_WORLD_TEST_PLAN.md
    ├── REAL_WORLD_TEST_REPORT.md
    ├── SECURITY_REVIEW_REPORT.md
    └── QA_REVIEW_REPORT.md
```

---

## Code Stats

| Component | Files | Language | Key Tool |
|-----------|:-----:|----------|----------|
| Contracts | 25 .sol | Solidity 0.8.20-0.8.24 | Foundry / Forge |
| SDK | 35 .ts | TypeScript 5.x | tsup (CJS+ESM) |
| Gateway | 15 .ts | TypeScript 5.x | Express + PostgreSQL + Redis |
| Frontend | 48 .tsx | React 18, Next.js 14 | Wagmi + WalletConnect |

---

## Architecture Diagram

```
                        ┌─────────────────────────────┐
                        │     AgentX Frontend          │
                        │  Next.js 14 + wagmi 2.x      │
                        │  8 pages, 30 components      │
                        └──────┬──────────┬────────────┘
                               │          │
              ┌────────────────▼──┐  ┌────▼────────────────────────┐
              │   @agentxv2/sdk    │  │     AgentX Gateway           │
              │   v0.6.1           │  │     (multi-tenant SaaS)       │
              │   AgentLoop        │  │                               │
              │   LLM Providers    │  │  Auth (EIP-191 → JWT)        │
              │   E2E encryption   │  │  Rate limit (IP + tenant)     │
              └────────┬──────────┘  │  API key proxy (never in FE)  │
                       │             │  Usage tracking               │
                       │             └───────────────────────────────┘
        ┌──────────────┼──────────────┬──────────────┬──────────────┐
        ▼              ▼              ▼              ▼              ▼
   IdentityReg   SubscriptionMgr  ReputationReg  ConfigReg    EndpointReg
        │              │              │              │              │
   ─ ─ ─┼──────────────┼──────────────┼──────────────┼──────────────┼─
        │              │              │              │              │
   Sepolia           Sepolia        Sepolia        Sepolia       Sepolia
  (11155111)        (11155111)     (11155111)     (11155111)    (11155111)
        │              │              │              │              │
   OxaChain L1       OxaChain L1    OxaChain L1    OxaChain L1   OxaChain L1
    (19505)          (19505)        (19505)        (19505)       (19505)
        │              │              │              │              │
   ─ ─ ─┼──────────────┼──────────────┼──────────────┼──────────────┼─
        │              │              │              │              │
   A2AProtocolReg  + IPFS (metadata)  + MCP servers (remote tools)
```

---

## Contract Addresses (Dual-Chain)

| # | Contract | Sepolia (11155111) | OxaChain L1 (19505) |
|---|----------|--------|--------|
| 1 | IdentityRegistry | `0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F` | `0xbf5F9db266c8c97E3334466C88597Eb758AfE212` |
| 2 | SubscriptionManager v3 | `0xC15fE80b9d800abb72121F353a6ae6d6E9077E63` | `0x019AC9d945467478Dd371CDbD70cb2f325800E6B` |
| 3 | ReputationRegistry | `0xeb6B410ea71b8d9dA0c96f6A91d35027CE143DC9` | `0x6a18C2664E1b42063860d864b6448b824d7B843F` |
| 4 | A2AProtocolRegistry | `0xEdb0022c250B38e281B3EF1418037889fC5C6092` | `0x61b7E7Eed21F013e35a90FC5de5c352780ec5169` |
| 5 | ConfigurationRegistry | `0x68DcE00e4C9077c94BC68016cD14B09557faEA6c` | `0x07280674ccc2898Fd038A9e3C22005CA83ffD2F8` |
| 6 | MultiEndpointRegistry | `0xEB5e866f186d4B73F97aa0d70B86f2C6e2e21Cb7` | `0xB361d04F49000013FC131D3C59C41c8486C64f8c` |

**OxaChain L1**: Chain ID 19505, Clique PoA, gas token T0x
- RPC: `http://43.156.99.215:18545`
- Explorer: `http://43.156.99.215:18400`
- Deployer: `0x8E869A0624fF9e766Df71b5B08897d00E4d260ba`

---

## Deployment

| Component | Server | URL | Status |
|-----------|--------|-----|--------|
| **Gateway** | 101.33.109.117:3090 | `http://101.33.109.117:3090/api/v1/health` | ✅ Online |
| **Frontend** | 43.156.78.59:8080 | `http://43.156.78.59:8080` | ✅ Online |

Gateway API endpoints:
- `POST /api/v1/chat/completions` — LLM proxy (streaming SSE)
- `GET /api/v1/auth/challenge?address=0x...` — EIP-191 challenge
- `POST /api/v1/auth/verify` — Verify signature → JWT
- `GET /api/v1/models` — Available models (platform + tenant-owned)

---

## SDK API Reference

| Module | Sub-Path | Primary Class/Function | Description |
|--------|----------|----------------------|-------------|
| **Core** | `@agentxv2/sdk` | `encryptPayload`, `decryptPayload` | AES-256-GCM encryption |
| | | `generateKeyPair`, `eciesEncrypt`, `eciesDecrypt` | ECIES key wrapping |
| | | `packForPublish`, `unpackAgent` | Full encrypt + pack flow |
| **Agent** | `.` | `AgentRunner` | Decrypt Agent context from chain |
| **AgentLoop** | `@agentxv2/sdk/agent-loop` | `AgentLoop` | ReAct engine: Think → Call Tools → Observe → Repeat |
| | | `ToolExecutor` | Dispatch tool calls to Open/MCP/A2A skills |
| | | `buildTools` | Convert skills to OpenAI function-calling format |
| **LLM** | `@agentxv2/sdk/llm` | `OpenAIProvider` | Direct LLM (OpenAI/DeepSeek) with SSE streaming |
| | | `GatewayProvider` | Multi-tenant SaaS proxy (API key never in browser) |
| | | `createLLMProvider` | Provider factory |
| **Registry** | `.` | `AgentRegistry` | Register/query Agent NFTs |
| | | `IPFSFetcher` | Fetch encrypted payloads from IPFS |
| **Subscription** | `.` | `SubscriptionManager` | Subscribe, verify, cancel, trial, releaseFunds |
| | | `AgentX402` | Auto-subscription gate + X402 bridge |
| **A2A** | `.` | `A2AProtocol` | Agent-to-Agent task protocol |
| **MCP** | `.` | `MCPConnector` | Discover + call MCP tools on remote servers |
| **Reputation** | `.` | `ReputationRegistry` | Give feedback + query ratings |
| **Config** | `.` | `KNOWN_CHAINS` | Chain config (RPC, contracts, chain IDs) |
| **Endpoint** | `.` | `MultiEndpointClient` | getActiveEndpoints, pickBestEndpoint |
| **Configuration** | `.` | `ConfigurationClient` | get, getAll, getKeys, exists (chain KV) |
| **React** | `@agentxv2/sdk/react` | `useAgentRunner` | React hook for loading + decrypting an Agent |

---

## MCP Integration

AgentX uses MCP (Model Context Protocol) for remote skill execution:

```
User's LLM (via AgentLoop)
   │
   ├─ AgentRunner.useAgent(42) → decrypts payload
   │   └─ skills: [{ name: "audit", execution: { type: "mcp", url: "..." } }]
   │
   ├─ AgentLoop autonomously decides → calls MCPConnector.callTool("audit", { code: "..." })
   │   ├─ ECDSA sign(toolName + timestamp)
   │   ├─ POST → Publisher's MCP Server
   │   │   ├─ Verify signature (subscriber address)
   │   │   ├─ Check on-chain subscription (SubscriptionManager)
   │   │   ├─ Execute tool
   │   │   └─ Return result
   │   └─ → LLM receives result, decides next action (AgentLoop iteration)
```

### MCP Server Setup (for Agent Publishers)

Your MCP server must verify incoming requests:

1. Extract `X-Subscriber-Address`, `X-Signature`, `X-Timestamp` from headers
2. Recover signer from signature → verify it matches `X-Subscriber-Address`
3. Call `SubscriptionManager.hasActiveSubscription(agentId, subscriberAddress)` on-chain
4. If active → execute tool → return result
5. If not active → return 402 Payment Required

---

## Deprecated / Archived Components

| Component | Reason |
|-----------|--------|
| PaymentGateway | Replaced by SM v3 + AgentX402 |
| AgentFactory | IR direct registration instead |
| AgentWallet | No per-agent wallet requirement |
| TokenPriceOracle | No multi-currency conversion |
| ValidationRegistry | No on-chain validation needed |

---

## Version

| Component | Version | Date |
|-----------|---------|------|
| IdentityRegistry | v1 (ERC-8004) | 2026-07-13 |
| SubscriptionManager | v3 (ReentrancyGuard) | 2026-07-13 |
| **SDK** | **0.6.1** | **2026-07-15** |
| Gateway | 0.1.0 | 2026-07-15 |
| Frontend | — | 2026-07-15 |
| OxaChain L1 Deploy | Full 6-contract | 2026-07-14 |
| Sepolia Deploy | Full 6-contract | 2026-07-13 |

---

## Links

| Resource | URL |
|----------|-----|
| **Main Repository** | https://github.com/sftgroup/Agentx |
| **Backup Repository** | https://github.com/sftgroup/erc8004 |
| **npm Package** | https://www.npmjs.com/package/@agentxv2/sdk |
| **Gateway Server** | http://101.33.109.117:3090 |
| **Frontend Server** | http://43.156.78.59:8080 |
| **Integration Guide** | [INTEGRATION.md](INTEGRATION.md) |
| **Frontend PRD** | [FRONTEND_PRD.md](FRONTEND_PRD.md) |
| **Contract Reference** | [contracts/CONTRACTS.md](contracts/CONTRACTS.md) |
| **Deployment Guide** | [DEPLOYMENT.md](DEPLOYMENT.md) |

---

## License

MIT
