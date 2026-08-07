# AgentX Deployment Guide

> Production: `43.159.60.46` (Gateway + Conversation + Frontend) · Last updated: 2026-08-08
> Server code: `~/Agentx` @ `9afda17` (main, 生产分支 `prod-patches-20260807` merge) · SDK published: `@agentxv2/sdk@0.9.4` (+ `@agentxv2/payments@0.2.2`)
> ⚠️ 测试策略（2026-08-07 起）：**所有功能/回归测试一律在生产环境 `43.159.60.46` 直接进行**（不再使用独立测试服务器）

---

## Production Server: 43.159.60.46

| Spec | Value |
|------|-------|
| **OS** | Ubuntu 22.04 LTS |
| **RAM** | 7.3 GB |
| **Disk** | 79 GB SSD (~40G used) |
| **Node.js** | v22.23.1 |
| **npm** | 10.9.8 |
| **PostgreSQL** | 14 |
| **Swap** | 2 GB |
| **Process manager** | pm2 (`agentx-gateway`, `agentx-conversation`, `agentx-frontend`) |

> **Repo layout:** the server uses the monorepo at `/home/ubuntu/Agentx/` (uppercase A, not `agentx-*`).
> pm2 launches `dist/index.js` from `gateway/` and `conversation-service/`. Update = `git pull --rebase` → rebuild → `pm2 restart`.

### Port Layout

```
43.159.60.46
├── :3100 → Next.js Frontend (standalone, calls Gateway API for agent data)
├── :3090 → Express Gateway (wallet auth / rate-limit / LLM proxy / MCP / Agents API / Admin)
├── :8100 → Conversation Service (agent dialogue microservice, SSE)
└── :5433 → PostgreSQL (localhost only, agentx_gateway + agentx_conversation DBs)
```

### Firewall — Ports to Open

```
sudo ufw allow 3090/tcp   # Gateway + MCP
sudo ufw allow 3100/tcp   # Frontend
sudo ufw allow 18545/tcp  # OxaChain RPC (REQUIRED for browser wallet RPC calls)
```

### SSH Access

```bash
# Direct: ssh ubuntu@43.159.60.46
# Via jump host:
ssh -J ubuntu@43.156.78.59 -i agentx_new_prod.pem ubuntu@43.159.60.46
```

---

## 1. Frontend Deploy

### Path: `/home/ubuntu/Agentx/frontend` (pm2: `agentx-frontend`)

```bash
cd /home/ubuntu/Agentx/frontend

# Install deps
npm install --legacy-peer-deps

# Build (Turbopack, ~3-5 min)
npx next build

# CRITICAL: Copy static files to standalone output
# Without this step, CSS/JS will 404 and the page appears completely black!
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/ 2>/dev/null  # public dir is optional

# Restart (pm2 manages the standalone server)
pm2 restart agentx-frontend
```

### `.env.production` (key values)

```
NEXT_PUBLIC_APP_URL=http://43.159.60.46:3100
NEXT_PUBLIC_SITE_URL=http://43.159.60.46:3100
NEXT_PUBLIC_AGENTX_GATEWAY_URL=http://43.159.60.46:3090
NEXT_PUBLIC_DEFAULT_CHAIN_ID=19505
NEXT_PUBLIC_OXACHAIN_RPC_URL=https://rpc-oxa.0xainet.top
NEXT_PUBLIC_OXACHAIN_EXPLORER=https://explorer-oxa.0xainet.top
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=b405f4f15938582260758473465a651b
```

### Wallet auto-switch to OxaChain L1

After connecting wallet, `WalletConnect.tsx` automatically calls `switchChain({ chainId: 19505 })`. MetaMask will prompt the user to add OxaChain L1 network if not already configured:

| Field | Value |
|-------|-------|
| Network Name | OxaChain L1 |
| Chain ID | 19505 |
| RPC URL | `https://rpc-oxa.0xainet.top` |
| Currency Symbol | OXA |
| Block Explorer | `https://explorer-oxa.0xainet.top` |

---

## 2. Gateway Deploy

### Path: `/home/ubuntu/Agentx/gateway` (pm2: `agentx-gateway`)

```bash
cd /home/ubuntu/Agentx/gateway

# Install deps (if changed)
npm install

# Build TypeScript → dist/
npm run build

# Restart
pm2 restart agentx-gateway
```

### `.env` (all required variables)

```
PORT=3090
NODE_ENV=production
DATABASE_URL=postgresql://agentx:AgentX2024!Gateway@localhost:5432/agentx_gateway
REDIS_URL=redis://localhost:6379
JWT_SECRET=agentx-prod-jwt-secret-key-2026
MASTER_ENCRYPTION_KEY=agentx-master-encryption-key-32b
ADMIN_KEY=agentx-admin-key-2026
SESSION_TTL_SEC=86400
FREE_PLAN_ID=
CORS_ORIGIN=http://43.159.60.46:3100
RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
RPC_URL_OXACHAIN=http://localhost:18545
CHAIN_ID=11155111
CHAIN_ID_OXACHAIN=19505
IDENTITY_REGISTRY=0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F
IDENTITY_REGISTRY_OXACHAIN=0xbf5F9db266c8c97E3334466C88597Eb758AfE212
SUBSCRIPTION_MANAGER=0xC15fE80b9d800abb72121F353a6ae6d6E9077E63
SUBSCRIPTION_MANAGER_OXACHAIN=0x019AC9d945467478Dd371CDbD70cb2f325800E6B
A2A_PROTOCOL=0x309C7447d89f3087A9924BB686d88df020F7e9cB
A2A_PROTOCOL_OXACHAIN=0x7F42a7dC4A0F3C107664C3750bE1B5B6fa6BEb86
REPUTATION_REGISTRY=0xeb6B410ea71b8d9dA0c96f6A91d35027CE143DC9
REPUTATION_REGISTRY_OXACHAIN=0x6a18C2664E1b42063860d864b6448b824d7B843F
CONFIGURATION_REGISTRY=0x68DcE00e4C9077c94BC68016cD14B09557faEA6c
CONFIGURATION_REGISTRY_OXACHAIN=0x07280674ccc2898Fd038A9e3C22005CA83ffD2F8
MULTI_ENDPOINT=0xEB5e866f186d4B73F97aa0d70B86f2C6e2e21Cb7
MULTI_ENDPOINT_OXACHAIN=0xB361d04F49000013FC131D3C59C41c8486C64f8c

# A2A Worker wallet private key (for creating sub-tasks on-chain during multi-agent orchestration)
# Without this, the Worker can process tasks but cannot delegate to other agents
A2A_WORKER_PRIVATE_KEY=0x...
```

---
## 2.5 Agents API & Indexer (v0.2.0+)

The Gateway serves an **agent metadata index** via `GET /api/v1/agents` (public, no auth).  
Agents are synced from the IdentityRegistry contract (OxaChain L1) into the `agents` PostgreSQL table, and subscription plans from the SubscriptionManager `PlanCreated` events into `subscription_plans`.

### Initial Setup

```bash
# Create the agents + subscription_plans tables
psql -U agentx -d agentx_gateway -f db/migrations/002_agents.sql
psql -U agentx -d agentx_gateway -f db/migrations/005_agents_structured.sql
psql -U agentx -d agentx_gateway -f db/migrations/006_plans.sql

# Sync agents from chain to DB (plans backfill runs automatically on boot)
curl -X POST http://localhost:3090/api/v1/agents-sync
```

### API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/agents` | No | List agents — filters `activeOnly`, `capabilities` (comma-separated), `fromId`, `toId`; pagination `page`/`pageSize` (max 100) |
| `GET` | `/api/v1/agents/count` | No | `{ total, active, byCategory }` (byCategory derived from `capabilities` + `other`) |
| `GET` | `/api/v1/agents/:id` | No | Single agent detail incl. `subscriptionPlans[]` (wei decimal-string price) |
| `POST` | `/api/v1/agents-sync` | No | Trigger full chain→DB sync |
| `GET` | `/api/v1/health` | No | `{ status, services: { chain, database, lastSyncAt, syncedAgentCount } }` |

### Agent Indexer Features

- Reads `tokenURI(uint256)` + `getAgentOwner(uint256)` from IdentityRegistry
- Handles IPFS CIDs, base64 data URIs, and malformed/corrupt base64 (auto-repair)
- Upserts into `agents` table (`ON CONFLICT DO UPDATE`), structured metadata (`skills`, `is_active`, `agent_created_at`)
- **Event-driven incremental sync**: `Transfer` events (mint/transfer/burn) + `PlanCreated` events (plans table)
- **Full-sync fallback timer**: `AGENTS_SYNC_INTERVAL_SEC` (default 120s, 0 disables), re-entrancy guarded
- **Plans backfill on boot**: scans `PlanCreated` history from `PLANS_SYNC_FROM_BLOCK` (default 0)

### Cron Sync (optional — event watcher + fallback timer usually suffice)

```bash
# Sync every 5 minutes (redundant with the built-in fallback timer)
*/5 * * * * curl -s -X POST http://localhost:3090/api/v1/agents-sync > /dev/null
```

### Why Database Index?

```
Before:  Frontend → wagmi → RPC → Contract (fragile, contract missing functions)
After:   Frontend → Gateway API → PostgreSQL (fast, resilient)
              ↑
         Sync cron → RPC → Contract
```

The independent ERC-721 contract on L1 lacks `getCurrentAgentId()`, `agentExists()`, and `totalSupply()`.  
The Gateway indexer solves this by probing tokenURIs sequentially and storing results in PostgreSQL.

---

## 2.6 A2A Auto-Processing Worker v2 — ReAct AgentLoop + Multi-Agent Orchestration (v0.6.6)

The Gateway runs a background A2A Worker v2 that enables **true multi-agent orchestration** via LLM tool-calling:

> **编排分层（2026-08-08）**：链上 A2A Worker 是**可选轨道**（跨组织 / 可审计 taskId / 结算 / 信誉场景）。默认编排走**链下**——Conversation Service 注入 `agentx_list_agents` / `agentx_delegate` 平台工具，在对话通道内同步嵌套委派（零成本、实时），仅用户显式要求审计 / 结算时才经 `POST /api/v1/internal/orchestrate/create-task`（`ORCHESTRATE_TOKEN` 守卫）落到链上。访问边界两者一致：仅限「自己写的 + 已订阅（chain/fiat/x402）」Agent，无权限 403 `AGENT_ACCESS_DENIED`。详见 §2.7。

```
Agent A's task → Worker LLM(Agent A) analyzes
  → LLM decides: "I need Agent B for auditing"
  → calls agentx_a2a_create_task(Agent B, "audit", ...)
  → Worker submits tx on-chain, processes Agent B's task inline (recursive)
  → Agent B's result fed back to Agent A's LLM
  → LLM continues: "Now I need Agent C to summarize"
  → calls agentx_a2a_create_task(Agent C, "summarize", ...)
  → Worker processes Agent C's task inline
  → Agent A's LLM aggregates all results → final output
```

### Architecture

| Component | Location | Role |
|-----------|----------|------|
| **A2A Worker v2** | `gateway/src/services/a2a-worker.ts` | ReAct AgentLoop with A2A tools: polls contract → LLM with tools → processes inline |
| **A2A API** | `gateway/src/routes/a2a.ts` | Exposes task results + worker status (incl. `totalOrchestrated` counter) |
| **A2A Daemon** | `sdk/src/agent-loop/a2a-daemon.ts` | Agent owner's SDK process: polls → gets result → completeTask() on-chain |
| **useMyAgentIds** | `frontend/hooks/user/useMyAgentIds.ts` | Combines owned + subscribed agent IDs for tenant-scoped agent selection |

### Key Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| Poll interval | 30s | Contract poll frequency |
| Max batch size | 3 | Tasks per poll (reduced: each may spawn sub-tasks) |
| Max depth | 3 | Recursive delegation limit |
| Max ReAct iterations | 5 | LLM tool-call rounds per task |

### LLM Tools Available

| Tool | Description |
|------|-------------|
| `agentx_a2a_create_task` | Delegate sub-task to another agent (on-chain tx) |
| `agentx_a2a_get_task` | Check sub-task status/result |
| `agentx_list_agents` | List all available agents with names/descriptions |

### Prerequisites

- `A2A_WORKER_PRIVATE_KEY` in Gateway `.env` (wallet for `createTask` on-chain tx)
- Fund the worker wallet with OXA for gas
- Agent sync cron must be active (see section 2.5)

### A2A API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/a2a/pending-tasks?agentId=X` | List completed task results for an agent |
| `GET` | `/api/v1/a2a/task-result/:taskId` | Single task LLM result (incl. Gateway processing status) |
| `GET` | `/api/v1/a2a/worker-status` | Worker health + `totalOrchestrated` + task counts |

### Tenant Isolation

- Worker queries `agents.owner` → matches `tenants` table
- Prefers agent owner's **BYOK key** for LLM processing (cost isolation)
- Falls back to platform shared pool
- Stores `tenant_id` in `a2a_task_results` for usage tracking

### Migration

```bash
psql -h localhost -U agentx -d agentx_gateway -f db/migrations/003_a2a_results.sql
```

### Health Check

```bash
curl -s http://43.159.60.46:3090/api/v1/a2a/worker-status
# → {"running":true,"totalOrchestrated":0,"taskCounts":{"completed":1,...}}
```

---

## 2.7 Conversation Service (v0.7.1 · SDK 0.8.11 · 链下编排默认)

Agent dialogue microservice — multi-tenant AgentLoop execution engine (Memory + Context + Skills + inline MCP/HTTP tools). Hosted on `43.159.60.46:8100`, called by Gateway via `ConversationProxy` (`POST /api/v1/agent/runs` → SSE pipe).

> **多 Agent 编排（2026-08-08）**：`AgentRunnerService` 注入平台工具 `agentx_list_agents`（列出调用方可委派 Agent，含 category）与 `agentx_delegate`（`mode: offchain | onchain`，默认 `offchain`，由 `ORCHESTRATE_DEFAULT_MODE` 控制）。链下委派经 Gateway 内部端点 `/api/v1/internal/orchestrate/*`（`ORCHESTRATE_TOKEN` 守卫）校验访问后同步递归执行；嵌套深度受 `ORCHESTRATE_MAX_DEPTH`（默认 4）限制，嵌套运行跳过澄清（子 Agent 无法与用户对话）。链上轨道复用 a2a-worker 的 `createTaskOnChain`。

### Deploy (pm2: `agentx-conversation`)

```bash
cd /home/ubuntu/Agentx/conversation-service

npm install
npm run build

# Restart
pm2 restart agentx-conversation
```

> **v0.7.1 inline mode:** `POST /runs` accepts `prompt` + `skills` (execution.type `mcp`/`http`/`a2a`) with no `agentId` — external apps can inject their own tools (e.g. RAG) without registering an AgentX agent. Gateway (`/api/v1/agent/runs`) forwards `prompt`/`skills` and `X-Llm-Api-Key`.

### `.env` (key values)

```
PORT=8100
DATABASE_URL=postgresql://agentx:AgentX2024!Gateway@localhost:5433/agentx_conversation
INTERNAL_AUTH_TOKEN=<same value as gateway CONVERSATION_SERVICE_TOKEN>
GATEWAY_URL=http://localhost:3090
OPENAI_API_KEY=sk-...                # platform fallback LLM key
MASTER_ENCRYPTION_KEY=<64-hex>       # required for tenant LLM key encryption (openssl rand -hex 32)
CONTEXT_CACHE_TTL_SEC=300
ORCHESTRATE_TOKEN=<same value as gateway ORCHESTRATE_TOKEN>   # off-chain orchestration (2026-08-08)
ORCHESTRATE_DEFAULT_MODE=offchain                            # offchain | onchain
ORCHESTRATE_MAX_DEPTH=4                                      # nested delegation limit
```

### Migrations (pgvector required)

```bash
for f in migrations/*.sql; do psql -h localhost -U agentx -d agentx_conversation -f "$f"; done
```

### Gateway `.env` — connect

```
CONVERSATION_SERVICE_URL=http://localhost:8100
CONVERSATION_SERVICE_TOKEN=<same value as conversation INTERNAL_AUTH_TOKEN>
ORCHESTRATE_TOKEN=<same value as conversation ORCHESTRATE_TOKEN>  # guards /api/v1/internal/orchestrate/*
```

> Full API / SSE protocol / memory isolation: see [`CONVERSATION_SERVICE.md`](./CONVERSATION_SERVICE.md).

---

## 3. PostgreSQL Setup

```bash
sudo apt-get install -y postgresql postgresql-client
sudo systemctl start postgresql
sudo systemctl enable postgresql
sudo -u postgres psql -c "CREATE USER agentx WITH PASSWORD 'AgentX2024!Gateway' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE agentx_gateway OWNER agentx;"
sudo -u postgres psql -c "CREATE DATABASE agentx_conversation OWNER agentx;"
for f in db/migrations/*.sql; do psql -U agentx -d agentx_gateway -f "$f"; done
```

### Schema (28 tables, gateway DB)

| Table | Purpose |
|-------|---------|
| `plans` | Free / Pro tiers |
| `tenants` | Wallet address → plan binding |
| `platform_api_keys` | Encrypted platform LLM keys |
| `tenant_api_keys` | BYOK keys (encrypted, AES-256-GCM) |
| `usage_logs` | Per-request token + tool call tracking |
| `chat_messages` | Conversation history |
| `agents` | Agent metadata index from IdentityRegistry chain sync（`category` 列见迁移 020：链上 attrs 优先、tokenURI JSON 兜底） |
| `a2a_task_results` | Gateway A2A Worker LLM processing results (tenant-isolated) |
| `subscription_plans` | On-chain plan index (PlanCreated events) |
| `channels` | Distribution channels (revenue-share bps) |
| `channel_attributions` | Per-subscription channel attribution (+ `settled`/`settled_at`/`settlement_id`) |
| `channel_settlements` | Settlement ledger — one row per payout batch (tx_hash auditable) |
| `partner_applications` | B-end onboarding applications (pending/approved/rejected) |
| `fiat_subscriptions` | Stripe fiat subscriptions |
| `x402_payments` | x402 pay-per-call payments |

---

## 4. Contract Deployment (Foundry)

```bash
cd contracts/

# Install dependencies
forge install OpenZeppelin/openzeppelin-contracts@v5.0.2
forge install foundry-rs/forge-std@v1.9.2

# Compile (requires via_ir=true in foundry.toml for ReputationRegistry)
forge build

# Deploy (IdentityRegistry + SubscriptionManager)
forge script script/DeployOxaChain.s.sol \
  --rpc-url https://rpc-oxa.0xainet.top \
  --broadcast --legacy

# Full 6-contract suite
forge script script/DeployOxaChainFull.s.sol \
  --rpc-url https://rpc-oxa.0xainet.top \
  --broadcast --legacy
```

> `via_ir = true` required in `foundry.toml` (ReputationRegistry stack-too-deep).

### Gas Note

`subscribe()` needs **~615K** gas. SDK should use `gasLimit: 2_000_000`.

---

## 5. Health Checks

```bash
# Frontend
curl -sI http://43.159.60.46:3100/ | head -1

# Gateway
curl -s http://43.159.60.46:3090/api/v1/health

# Agents API
curl -s http://43.159.60.46:3090/api/v1/agents | jq '.total'

# MCP
curl -s -X POST http://43.159.60.46:3090/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# A2A Worker
curl -s http://43.159.60.46:3090/api/v1/a2a/worker-status

# Conversation Service
curl -s http://43.159.60.46:8100/health

# OxaChain RPC
curl -s -X POST https://rpc-oxa.0xainet.top \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# Processes
ss -tlnp | grep -E '3100|3090|8100'
```

---

## 6. Contract Addresses (Dual-Chain)

| # | Contract | Sepolia | OxaChain L1 |
|---|----------|---------|-------------|
| 1 | IdentityRegistry | `0xe94a...96e5F` | `0xbf5F...E212` |
| 2 | SubscriptionManager v3 | `0xC15f...7E63` | `0x019A...0E6B` |
| 3 | A2AProtocolRegistry v2 | `0x309C...7e9cB` | `0x7F42...Eb86` |
| 4 | ReputationRegistry | `0xeb6B...3DC9` | `0x6a18...843F` |
| 5 | ConfigurationRegistry | `0x68Dc...EA6c` | `0x0728...D2F8` |
| 6 | MultiEndpointRegistry | `0xEB5e...1Cb7` | `0xB361...4f8c` |

| Chain | Chain ID | RPC URL |
|-------|----------|---------|
| Sepolia (Testnet) | 11155111 | `https://ethereum-sepolia-rpc.publicnode.com` |
| **OxaChain L1 (Mainnet)** | **19505** | `https://rpc-oxa.0xainet.top` |

---

## 7. npm SDK Publish

```bash
cd sdk/
npm run build
npm version patch
npm publish --access public --registry https://registry.npmjs.org/
```

Current: `@agentxv2/sdk@0.9.4` (+ `@agentxv2/payments@0.2.2`)

### SDK v0.9.4 New Features (agent category + orchestration layering)

| Feature | Module | Description |
|---------|--------|-------------|
| **Agent application categories** | `@agentxv2/sdk` | `AgentPayload.category` + `AGENT_CATEGORIES` / `AgentCategory`（13 枚举）；写入 public metadata + 链上 attrs；`getAllAgents()` / `getAgentMetadata()` 解析 `category`；Gateway `?category=` 过滤 + byCategory 聚合；DB 迁移 `020_agents_category`（2026-08-08 生产已执行） |
| **Off-chain orchestration** | Conversation Service + Gateway | 主 Agent 默认**链下**同步委派（`agentx_list_agents` / `agentx_delegate`，零成本）；显式要求审计 / 结算时走链上 A2A（`POST /api/v1/internal/orchestrate/create-task`）；`ORCHESTRATE_TOKEN` / `ORCHESTRATE_DEFAULT_MODE` / `ORCHESTRATE_MAX_DEPTH` |
| **payments 0.2.2** | `@agentxv2/payments` | 归属元数据（author / repository / homepage），SDK `^0.2.0` 自动解析到 0.2.2；无 API 变化 |

### SDK v0.8.10 / v0.8.11 New Features

| Feature | Module | Description |
|---------|--------|-------------|
| **encryptWithKey / decryptWithKey** | `@agentxv2/sdk/core` | AES-256-GCM master-key 格式加解密（`base64(IV[12]∥authTag[16]∥ciphertext)`），与 Gateway 遗留 at-rest key 加密（`gateway/src/lib/crypto.ts`）byte-for-byte 兼容 — SDK 可解密 Gateway 已存储的加密数据 |

> 注：`0.8.10` 与 `0.8.11` 为同一构建重发（gitHead `9dd7303`），功能一致。

### SDK v0.8.7 New Features (sessions & parallel tasks)

| Feature | Module | Description |
|---------|--------|-------------|
| **createSession** | `@agentxv2/sdk/conversation` | 创建会话上下文（会话级记忆隔离） |
| **createTask / getTask / listTasks / cancelTask** | `@agentxv2/sdk/conversation` | 后台并行任务：`createTask` 立即返回 `taskId` 后台执行，可查询/取消；受 P9 门卫控制（`plans.features.parallel_tasks` + `tenants.allow_parallel_tasks`，禁用时 403 `PARALLEL_TASKS_DISABLED`） |
| **getCapabilities** | `@agentxv2/sdk/conversation` | 查询租户可用能力（并行任务开关等） |
| **ConversationTaskError** | `@agentxv2/sdk/conversation` | 任务级错误类型 |

### SDK v0.8.6 New Features

| Feature | Module | Description |
|---------|--------|-------------|
| **Stored BYOK (`tenantKeyId`)** | `@agentxv2/sdk/conversation` | `ConversationChatParams` gains optional `tenantKeyId` — use a tenant-owned API key stored & AES-encrypted on the Gateway (`/tenant/keys`, managed via Settings → Own LLM Keys); the Gateway resolves it server-side and injects it as `X-Llm-Api-Key` (plaintext key never leaves the server) |

### SDK v0.8.4 / v0.8.5 New Features

| Feature | Module | Description |
|---------|--------|-------------|
| **Gateway JWT auth** | `@agentxv2/sdk/conversation` | `ConversationClient` supports `accessToken` (`Authorization: Bearer`, wallet-signed login) as alternative to `apiKey` |
| **External abort** | `@agentxv2/sdk/conversation` | `stream(params, { signal })` supports `AbortController` — user "Stop" button |
| **tool_result error field** | `@agentxv2/sdk/conversation` | optional `error` field on `tool_result` events |
| **v0.8.5** | — | Docs sync (same code as 0.8.4) |

### SDK v0.7.1 New Features

| Feature | Module | Description |
|---------|--------|-------------|
| **Inline mode** | `@agentxv2/sdk/conversation` | `ConversationChatParams` gains optional `prompt` + `skills` (inject MCP/HTTP tools e.g. RAG); `agentId` now optional; Gateway forwards `X-Llm-Api-Key` |
| **ConversationSkillDef** | `@agentxv2/sdk/conversation` | Type-safe skill definitions (name/description/inputSchema/execution) for inline runs |

### SDK v0.7.0 New Features

| Feature | Module | Description |
|---------|--------|-------------|
| **ConversationClient** | `@agentxv2/sdk/conversation` | Remote Conversation Service client: SSE streaming via Gateway `POST /api/v1/agent/runs`, auto-sends `X-Api-Key` / `X-End-User-Id` / `X-Llm-Api-Key` |
| **Direct MCP Skill Execution** | Gateway `/mcp/agent/:id` | `tools/call` executes the agent's skill directly (execution.type mcp/http), no LLM second-pass |

### SDK v0.6.6 New Features

| Feature | Module | Description |
|---------|--------|-------------|
| **A2A Worker v2 (ReAct)** | Gateway | Full ReAct AgentLoop: LLM gets A2A tools, can autonomously delegate sub-tasks to other agents |
| **Multi-Agent Orchestration** | Gateway | Agent A → LLM decides → createTask(Agent B/C) → recursive inline processing → result aggregation (max depth 3) |
| **A2A Daemon** | `@agentxv2/sdk` | `A2ADaemon` class: SDK process polls Gateway → auto-completes tasks on-chain |
| **A2A Tenant Isolation** | Gateway | Agent owner BYOK key preferred for LLM costs, tenant_id tracking |
| **useMyAgentIds Hook** | Frontend | Shared hook: owned + subscribed agent IDs for tenant-scoped filtering |
| **My Agents + Subscriptions** | Frontend | "My Agents" now includes subscribed agents; A2A selector restricted to owned/subscribed |
| **A2A Live Status** | Frontend | Real-time Gateway processing status per task (Processing / Result Ready / Orchestrated) |
| **Multi-Language (i18n)** | Frontend | EN / 繁體中文 toggle across all pages |
| **completeTask ABI Fix** | SDK | Updated from 2-param to 3-param (taskId, outputData, status) |
| **getAgentTasks** | SDK `A2AProtocol` | New method: query all tasks for an agent by agentId |

### SDK v0.6.5 New Features

| Feature | Module | Description |
|---------|--------|-------------|
| **Admin Dashboard** | Gateway + Frontend | Web UI for platform key/plan/tenant/usage management |
| **DeepSeek Platform Key** | Gateway | Add DeepSeek as platform LLM provider |
| **Auth Fix** | Gateway | Case-insensitive wallet address lookup |
| **A2A L1 Redeploy** | L1 | A2AProtocolRegistry v2 redeployed at `0x7F42...` |

### SDK v0.6.4 New Features

| Feature | Module | Description |
|---------|--------|-------------|
| `IPFSUploader` | `@agentxv2/sdk/ipfs` | Upload to IPFS via Pinata API or custom endpoint |
| `publishAgent()` | `@agentxv2/sdk` | One-shot encrypt + IPFS upload + pack pipeline |
| IPFS Platform Tools | AgentLoop | `agentx_ipfs_upload` / `upload_encrypted` / `get_url` |

### PINATA_JWT Configuration

For IPFS upload functionality, set the Pinata JWT in the Gateway `.env`:

```bash
PINATA_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
IPFS_GATEWAY_URL=https://ipfs.io
```

---

## 8. Admin Dashboard

### Access
`http://43.159.60.46:3100/admin`

### Admin Key
Set `ADMIN_KEY` in Gateway `.env`:
```bash
ADMIN_KEY=agentx-admin-key-2026
```

### Admin API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/admin/platform-keys` | List platform LLM keys |
| `POST` | `/api/v1/admin/platform-keys` | Add platform LLM key |
| `PATCH` | `/api/v1/admin/platform-keys/:id` | Edit key (provider/endpoint/api_key/models/weight/is_active/plan_slugs) |
| `DELETE` | `/api/v1/admin/platform-keys/:id` | Delete platform LLM key |
| `GET` | `/api/v1/admin/plans` | List subscription plans |
| `GET` | `/api/v1/admin/tenants?page=1&limit=20` | List tenants (paginated) |
| `PATCH` | `/api/v1/admin/tenants/:id` | Update tenant plan/status |
| `GET` | `/api/v1/admin/usage` | Usage stats (30-day) |
| `GET` | `/api/v1/admin/system` | System health overview |
| `GET` | `/api/v1/admin/revenue` | Revenue aggregation (on-chain fees) |
| `GET` | `/api/v1/admin/payments` | Payments overview (Stripe / x402 / channels) |
| `GET` | `/api/v1/admin/channels` | List channels (with attribution counts) |
| `POST` | `/api/v1/admin/channels` | Create channel (id/name/share_bps/wallet) |
| `PATCH` | `/api/v1/admin/channels/:id` | Update channel (name/share_bps/wallet/active) |
| `DELETE` | `/api/v1/admin/channels/:id` | Delete channel (deactivates if it has attributions) |
| `GET` | `/api/v1/admin/channels/:id/report` | Channel detail report (attributions + settlement ledger) |
| `POST` | `/api/v1/admin/channels/:id/settle` | Record settlement batch (`tx_hash`) → `channel_settlements` + settled markers |
| `GET` | `/api/v1/admin/applications?status=` | List B-end partner applications |
| `POST` | `/api/v1/admin/applications/:id/decide` | Approve/reject (approval auto-creates the channel) |

Auth: `Authorization: Bearer <ADMIN_KEY>` or `X-Admin-Key: <ADMIN_KEY>`

### Platform LLM Key Setup (DeepSeek example)

```bash
curl -X POST http://43.159.60.46:3090/api/v1/admin/platform-keys \
  -H 'X-Admin-Key: agentx-admin-key-2026' \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": "deepseek",
    "endpoint": "https://api.deepseek.com/v1",
    "api_key": "sk-...",
    "models": ["deepseek-v4-pro"],
    "plan_slugs": ["pro", "enterprise"]
  }'
```

---

## 9. Database Migrations

### Gateway (`gateway/db/migrations/`)

```bash
cd /home/ubuntu/Agentx/gateway
export PGPASSWORD='AgentX2024!Gateway'
for f in db/migrations/*.sql; do
  psql -h localhost -U agentx -d agentx_gateway -f "$f"
done
```

Migration files (020): `001_init` (core auth/billing) → `002_agents` → `003_a2a_results` → `004_tenant_platform_api_key` → `005_agents_structured` → `006_plans` → `007_channel_attributions` (channels + attributions) → `008_fiat_subscriptions` → `009_x402` → `010_channel_admin` (**P7**: `channel_settlements` ledger + `settled_at`/`settlement_id` on attributions) → `011_partner_applications` (**P7**: B-end onboarding applications) → `012_parallel_tasks_control` → `014_integration_partners` → `015_developer_applications` → `016_tenant_kind` → `017_schedules` → `018_chain_subscriptions` → `019_payments_mpp_period` → `020_agents_category` (**category 列 + 索引，2026-08-08 生产已执行**).

### Conversation Service (`conversation-service/migrations/`)

```bash
cd /home/ubuntu/Agentx/conversation-service
for f in migrations/*.sql; do
  psql -h localhost -U agentx -d agentx_conversation -f "$f"
done
```

Migration files (004): `001_memory` (pgvector) → `002_traces` → `003_tenant_llm_config` → `004_end_user_isolation`.

---

## Legacy Servers

| Server | Role | Status |
|--------|------|--------|
| `43.156.99.215` | Previous Full-Stack (FE :3100 + GW :3090) | Gateway/Conversation migrated to `43.159.60.46` (frontend :3100 still reachable) |
| `43.156.225.164` | Old Production | Migrated |
| `43.156.78.59:8080` | Test Frontend | Stale |
| `101.33.109.117:3090` | Old Gateway | Retired |
