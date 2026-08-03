# AgentX Deployment Guide

> Production: `43.159.60.46` (Gateway + Conversation + Frontend) · Last updated: 2026-08-04
> Server code: `~/Agentx` @ `7efc505` (main) · SDK published: `@agentxv2/sdk@0.7.5`

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
├── :3090 → Express Gateway (wallet auth / rate-limit / LLM proxy / MCP / Agents API)
├── :8100 → Conversation Service (agent dialogue microservice, SSE)
└── :5432 → PostgreSQL (localhost only, agentx_gateway DB)
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
## 2.5 Agents API & Indexer (v0.6.5)

The Gateway serves an **agent metadata index** via `GET /api/v1/agents` (public, no auth).  
Agents are synced from the IdentityRegistry contract (OxaChain L1) into the `agents` PostgreSQL table.

### Initial Setup

```bash
# Create the agents table
psql -U agentx -d agentx_gateway -f db/migrations/002_agents.sql

# Sync agents from chain to DB
curl -X POST http://localhost:3090/api/v1/agents-sync
```

### API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/agents` | No | List all agents (JSON) |
| `GET` | `/api/v1/agents/:id` | No | Single agent detail |
| `POST` | `/api/v1/agents-sync` | No | Trigger chain→DB sync |

### Agent Indexer Features

- Reads `tokenURI(uint256)` + `ownerOf(uint256)` from IdentityRegistry
- Handles IPFS CIDs, base64 data URIs, and malformed/corrupt base64 (auto-repair)
- Stops after 8 consecutive empty tokenURIs (gap detection)
- Upserts into `agents` table (`ON CONFLICT DO UPDATE`)

### Cron Sync (recommended)

```bash
# Sync every 5 minutes
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

## 2.7 Conversation Service (v0.7.1)

Agent dialogue microservice — multi-tenant AgentLoop execution engine (Memory + Context + Skills + inline MCP/HTTP tools). Hosted on `43.159.60.46:8100`, called by Gateway via `ConversationProxy` (`POST /api/v1/agent/runs` → SSE pipe).

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
DATABASE_URL=postgresql://agentx:AgentX2024!Gateway@localhost:5432/agentx_conversation
INTERNAL_AUTH_TOKEN=<same value as gateway CONVERSATION_SERVICE_TOKEN>
GATEWAY_URL=http://localhost:3090
OPENAI_API_KEY=sk-...                # platform fallback LLM key
MASTER_ENCRYPTION_KEY=<64-hex>       # required for tenant LLM key encryption (openssl rand -hex 32)
CONTEXT_CACHE_TTL_SEC=300
```

### Migrations (pgvector required)

```bash
for f in migrations/*.sql; do psql -h localhost -U agentx -d agentx_conversation -f "$f"; done
```

### Gateway `.env` — connect

```
CONVERSATION_SERVICE_URL=http://localhost:8100
CONVERSATION_SERVICE_TOKEN=<same value as conversation INTERNAL_AUTH_TOKEN>
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
psql -U agentx -d agentx_gateway -f db/migrations/001_init.sql
psql -U agentx -d agentx_gateway -f db/migrations/002_agents.sql
psql -U agentx -d agentx_gateway -f db/migrations/003_a2a_results.sql
```

### Schema (8 tables)

| Table | Purpose |
|-------|---------|
| `plans` | Free / Pro tiers |
| `tenants` | Wallet address → plan binding |
| `platform_api_keys` | Encrypted platform keys |
| `tenant_api_keys` | BYOK keys (encrypted) |
| `usage_logs` | Per-request token + tool call tracking |
| `chat_messages` | Conversation history |
| `agents` | Agent metadata index from IdentityRegistry chain sync |
| `a2a_task_results` | Gateway A2A Worker LLM processing results (tenant-isolated) |

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

Current: `@agentxv2/sdk@0.7.5`

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
| `DELETE` | `/api/v1/admin/platform-keys/:id` | Delete platform LLM key |
| `GET` | `/api/v1/admin/plans` | List subscription plans |
| `GET` | `/api/v1/admin/tenants?page=1&limit=20` | List tenants (paginated) |
| `PATCH` | `/api/v1/admin/tenants/:id` | Update tenant plan/status |
| `GET` | `/api/v1/admin/usage` | Usage stats (30-day) |

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
    "models": ["deepseek-chat"],
    "plan_slugs": ["pro", "enterprise"]
  }'
```

---

## 9. Database Migrations

### Initial Setup

```bash
cd /home/ubuntu/Agentx/gateway
export PGPASSWORD='AgentX2024!Gateway'
psql -h localhost -U agentx -d agentx_gateway -f db/migrations/001_init.sql
psql -h localhost -U agentx -d agentx_gateway -f db/migrations/002_agents.sql
psql -h localhost -U agentx -d agentx_gateway -f db/migrations/003_a2a_results.sql
```

Creates tables: `plans`, `tenants`, `platform_api_keys`, `tenant_api_keys`, `usage_logs`, `chat_messages`, `agents`, `a2a_task_results`

---

## Legacy Servers

| Server | Role | Status |
|--------|------|--------|
| `43.156.99.215` | Previous Full-Stack (FE :3100 + GW :3090) | Gateway/Conversation migrated to `43.159.60.46` (frontend :3100 still reachable) |
| `43.156.225.164` | Old Production | Migrated |
| `43.156.78.59:8080` | Test Frontend | Stale |
| `101.33.109.117:3090` | Old Gateway | Retired |
