# AgentX Progress Tracker

> Last updated: 2026-07-17 — Production server unified (164) + Gateway migrated ✅

---

## ✅ Complete — 30/30 P0-P3 Tasks

| Phase | # | Task | Status |
|-------|---|------|:--:|
| P0 | #1 | Chat SDK E2E 加密链路 (AES-256-GCM + ECIES) | ✅ |
| P0 | #5 | IdentityRegistry v1 + SubscriptionManager v3 合约 | ✅ |
| P1 | #6 | A2A 协议实现 | ✅ |
| P1 | #7-11 | Dashboard, My Agents, Subscriptions, Skill Schema, Reviews | ✅ |
| P2 | #14-17 | SubscriptionGuard, useSubscription v2, Studio, EncryptProgress | ✅ |
| P3 | #18-23 | Marketplace, Revenue, AgentX402, npm, dual-chain toggle, deploy | ✅ |

---

## 🔧 2026-07-16 — A2A Bug Fix & Redeploy (IN PROGRESS)

### Bugs Discovered & Fixed

#### Bug #1: Wrong contract address in A2A page
| Detail | Value |
|--------|-------|
| **File** | `frontend/app/a2a/page.tsx:14` |
| **Bug** | `const A2A_REGISTRY = process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS` |
| **Root Cause** | A2A 页面所有链上调用发到了 IdentityRegistry（`0xe94a...96e5F`），而非 A2AProtocolRegistry |
| **Fix** | → `NEXT_PUBLIC_A2A_PROTOCOL_ADDRESS` |
| **Status** | ✅ Fixed + 前端重新构建部署 |

#### Bug #2: Missing `getUserTasks()` in Solidity
| Detail | Value |
|--------|-------|
| **File** | `contracts/src/erc8004-extensions/A2AProtocolRegistry.sol` |
| **Bug** | `mapping(address => uint256[]) private _userTasks` 存在，但没有 `getUserTasks(address)` 函数 |
| **Impact** | 地址修复后仍会 revert — 旧 bytecode 不含该函数选择器 |
| **Fix** | 添加 `function getUserTasks(address) external view returns (uint256[])` |
| **Status** | ✅ 源码已修复，Sepolia 已重新部署（见下方） |

#### Bug #3 (Side): Deprecated PaymentGateway in SDK ChainConfig
| Detail | Value |
|--------|-------|
| **File** | `sdk/src/config/config.ts`, `sdk/src/core/types.ts` |
| **Bug** | Sepolia `paymentGateway: 0x59eA58c0...` — PaymentGateway 已被 SM v3 + AgentX402 取代 |
| **Fix** | 删除 `paymentGateway` 字段 + 类型定义 |
| **Status** | ✅ Fixed in SDK v0.6.1 |

---

### A2AProtocolRegistry Redeploy (Sepolia + OxaChain L1)

| Item | Sepolia | OxaChain L1 |
|------|---------|-------------|
| **Old Address** | `0xEdb00...6092` | `0x61b7E...5169` |
| **New Address** | **`0x309C7447d89f3087A9924BB686d88df020F7e9cB`** | **`0xDF2939EFafEe6439eB2226DbEd07AD6F5Ae2112B`** |
| **`getUserTasks`** | ✅ selector `0x95d57660` | ✅ selector `0x95d57660` |
| **Blockscout** | [Verified](https://eth-sepolia.blockscout.com/address/0x309C7447d89f3087A9924BB686d88df020F7e9cB) | Explorer: `http://43.156.99.215:18400` |
| **Deployer** | `0x4F7744F97AaC9Ad7f0a67de75b149aDb87464103` | same |
| **Gas** | 0.008 ETH | 0.007 T0x |
| **SDK config.ts** | ✅ Updated | ✅ Updated |
| **.env.production** | ✅ Updated | ✅ Updated |

### Frontend Fix Deployed

| Detail | Value |
|--------|-------|
| **A2A page** | `A2A_REGISTRY` → now reads `NEXT_PUBLIC_A2A_PROTOCOL_ADDRESS` |
| **Build** | ✅ Incremental rebuild + deploy to `43.156.78.59:8080` |
| **Status** | ✅ Live |

---

## 🧠 2026-07-15 — AgentLoop + Gateway (COMPLETE)

| # | Task | Status |
|---|------|:--:|
| 1 | SDK v0.6.1: AgentLoop ReAct engine (Think → Call Tools → Observe → Repeat) | ✅ |
| 2 | SDK v0.6.1: ToolExecutor (parallel tool dispatch) + buildTools (Skill→OpenAI) | ✅ |
| 3 | SDK v0.6.1: OpenAIProvider (direct LLM SSE streaming) | ✅ |
| 4 | SDK v0.6.1: GatewayProvider (multi-tenant SaaS, API key never in browser) | ✅ |
| 5 | SDK v0.6.1: createLLMProvider (factory) | ✅ |
| 6 | SDK v0.6.1: Sub-path exports fix (agent-loop, llm) | ✅ |
| 7 | SDK v0.6.1: Bug fix — removed deprecated PaymentGateway | ✅ |
| 8 | SDK v0.6.1: Bug fix — multi-endpoint.ts TS2322 null-safety | ✅ |
| 9 | npm publish: `@agentxv2/sdk@0.6.1` (52 files, 1.4MB) | ✅ |
| 10 | Gateway: Express (auth, rate-limit, chat proxy, tenant, history) | ✅ |
| 11 | Gateway: DB schema (6 tables: plans, tenants, keys, usage_logs, chat) | ✅ |
| 12 | Gateway: EIP-191 wallet auth → JWT + auto tenant creation | ✅ |
| 13 | Gateway: Dual-mode LLM proxy (platform quota vs BYOK transparent) | ✅ |
| 14 | Gateway: 3-layer rate limit (IP + RPM + daily quota + concurrency) | ✅ |
| 15 | Gateway: Deployed `101.33.109.117:3090` (PM2×2) | ✅ |
| 16 | Frontend: useGatewayAuth hook (EIP-191 → JWT) | ✅ |
| 17 | Frontend: ToolCallBubble (collapsible tool call UI) | ✅ |
| 18 | Frontend: Chat page (AgentLoop + dual-mode model selector) | ✅ |
| 19 | Docs: SDK README / Main README / INTEGRATION / PROGRESS | ✅ |
| 20 | GitHub: Force push `main` + tag `v0.6.1` | ✅ |

---

## 📜 2026-07-14 — OxaChain L1 + Dual-Chain (COMPLETE)

| # | Task | Status |
|---|------|:--:|
| 1 | ERC-8004 full source recovery (Blockscout + 43.163.105.172) | ✅ |
| 2 | AgentX independent repo (sftgroup/Agentx) | ✅ |
| 3 | 12-contract audit vs PRD → 6 core confirmed | ✅ |
| 4 | DeployOxaChainFull.s.sol (6-contract dependency-aware) | ✅ |
| 5 | OxaChain L1 6 contracts deployed (via-ir, 6 txns) | ✅ |
| 6 | SDK v0.5.0-0.5.4: KNOWN_CHAINS, MultiEndpoint, Configuration | ✅ |
| 7 | Frontend .env.production dual-chain rewrite | ✅ |
| 8 | Wagmi OxaChain L1 config + WalletConnect | ✅ |
| 9 | NetworkSwitcher OxaChain L1 name fix | ✅ |
| 10 | Studio route fix + test server Turbopack config | ✅ |
| 11 | Test server deploy — 5 pages 200 OK | ✅ |
| 12 | Dual-chain test: 18/19 PASS | ✅ |

---

## 🗺️ Contract Addresses

### Sepolia (11155111)

| # | Contract | Address | Version |
|---|----------|---------|---------|
| 1 | IdentityRegistry | `0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F` | v1 |
| 2 | SubscriptionManager v3 | `0xC15fE80b9d800abb72121F353a6ae6d6E9077E63` | v3 |
| 3 | ReputationRegistry | `0xeb6B410ea71b8d9dA0c96f6A91d35027CE143DC9` | v1 |
| 4 | **A2AProtocolRegistry** 🆕 | **`0x309C7447d89f3087A9924BB686d88df020F7e9cB`** | **v2** |
| 5 | ConfigurationRegistry | `0x68DcE00e4C9077c94BC68016cD14B09557faEA6c` | v1 |
| 6 | MultiEndpointRegistry | `0xEB5e866f186d4B73F97aa0d70B86f2C6e2e21Cb7` | v1 |

🆕 = Redeployed 2026-07-16 (adds `getUserTasks(addr)` query)
> Deprecated: PaymentGateway `0x59eA58c0...`, AgentFactory `0xc93eCc80...`

### OxaChain L1 (19505)

| # | Contract | Address | Version |
|---|----------|---------|---------|
| 1 | IdentityRegistry | `0xbf5F9db266c8c97E3334466C88597Eb758AfE212` | v1 |
| 2 | SubscriptionManager v3 | `0x019AC9d945467478Dd371CDbD70cb2f325800E6B` | v3 |
| 3 | ReputationRegistry | `0x6a18C2664E1b42063860d864b6448b824d7B843F` | v1 |
| 4 | **A2AProtocolRegistry** 🆕 | `0xDF2939EFafEe6439eB2226DbEd07AD6F5Ae2112B` | **v2** |
| 5 | ConfigurationRegistry | `0x07280674ccc2898Fd038A9e3C22005CA83ffD2F8` | v1 |
| 6 | MultiEndpointRegistry | `0xB361d04F49000013FC131D3C59C41c8486C64f8c` | v1 |


---

## 🚀 Deployment Status

| Component | Server | Port | Health Check | Status |
|-----------|--------|------|-------------|--------|
| **Frontend** | 43.156.225.164 | 3000 | `curl -sI http://localhost:3000/` → HTTP 200 | ✅ Online |
| **Gateway API** | 43.156.225.164 | 3090 | `/api/v1/health` → `{"status":"ok"}` | ✅ Online |
| **PostgreSQL** | 43.156.225.164 | 5432 | `agentx_gateway` DB (6 tables + seed data) | ✅ Online |
| ~~Gateway (old)~~ | ~~101.33.109.117~~ | ~~3090~~ | Decommissioned — migrated to 164 | ❌ Off |
| ~~Test Frontend~~ | ~~43.156.78.59~~ | ~~8080~~ | Legacy — replaced by 164:3000 | ⚠️ Stale |

### Full-Stack Architecture on 164

```
43.156.225.164
├── 3000 → Next.js Frontend (standalone, Turbopack)
│          └── .env.production → NEXT_PUBLIC_AGENTX_GATEWAY_URL=http://43.156.225.164:3090
├── 3090 → Express Gateway (TypeScript → Node.js dist/)
│          ├── Wallet auth (EIP-191 → JWT)
│          ├── 3-layer rate limiting
│          ├── Dual-mode LLM proxy (platform / BYOK)
│          ├── SSE streaming proxy
│          └── Usage logging
└── 5432 → PostgreSQL (6 tables)
           ├── plans (Free / Pro)
           ├── tenants
           ├── platform_api_keys
           ├── tenant_api_keys
           ├── usage_logs
           └── chat_messages
```

---

## 📦 npm

```bash
npm install @agentxv2/sdk@0.6.2
```

| Stat | Value |
|------|-------|
| Version | 0.6.2 |
| Modules | 13 (core, agent, agent-loop, llm, registry, subscription, a2a, mcp, reputation, config, endpoint, configuration, react) |
| Format | CJS + ESM + DTS |
| Files | 52 |
| Unpacked | 1.4 MB |
| Changed in 0.6.2 | Updated Sepolia + OxaChain L1 A2AProtocolRegistry v2 addresses |

---

## 🔗 Links

| Resource | URL |
|----------|-----|
| **GitHub** | [sftgroup/Agentx](https://github.com/sftgroup/Agentx) |
| **Backup** | [sftgroup/erc8004](https://github.com/sftgroup/erc8004) |
| **npm** | [@agentxv2/sdk](https://www.npmjs.com/package/@agentxv2/sdk) |
| **Frontend** | `http://43.156.225.164:3000` |
| **Gateway Health** | `http://43.156.225.164:3090/api/v1/health` |
| **Integration Guide** | [INTEGRATION.md](../INTEGRATION.md) |
| **Sepolia A2A (new)** | [Blockscout](https://eth-sepolia.blockscout.com/address/0x309C7447d89f3087A9924BB686d88df020F7e9cB) |

---

## ⏳ Next Actions

| Priority | Task | Status |
|----------|------|--------|
| **P2** | GitHub push latest fixes + tag v0.6.2 | pending |
| **Done** | A2A page address fix + Solidity getUserTasks + dual-chain redeploy | ✅ |
