# AgentX Conversation Service

> v0.1.0 · Microservice for Agent conversation execution (AgentLoop + Memory + Context + Skills)

---

## Overview

The Conversation Service is an **independent microservice** that handles all AI agent conversation execution. It was extracted from the Gateway to provide:

- **Fault isolation** — Gateway stays operational even if agent conversations fail
- **Independent scaling** — conversation workloads can scale separately from the control plane
- **B2B monetization** — tenants can bring their own LLM API key for lower fees

```
Frontend / MCP Client
         │
         ▼
┌─────────────────────────────┐
│ Gateway (:3090)              │
│ Authenticate → Forward       │
│ X-Internal-Token header      │
│ X-Tenant-Address header      │
└──────────┬──────────────────┘
           │ SSE proxy
           ▼
┌─────────────────────────────┐
│ Conversation Service (:8100) │
│ ┌─────────────────────────┐ │
│ │ POST /runs               │ │
│ │   AgentLoop (ReAct)      │ │
│ │   Memory (pgvector)      │ │
│ │   Context (compaction)   │ │
│ │   Skills (execution)     │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ POST/DELETE              │ │
│ │ /tenants/:addr/llm-key   │ │
│ └─────────────────────────┘ │
└──────────┬──────────────────┘
           │
    ┌──────┴──────┐
    │ PostgreSQL  │   OpenRouter
    │ + pgvector  │   / OpenAI
    └─────────────┘
```

---

## Prerequisites

| Dependency | Version | Purpose |
|------------|---------|---------|
| Node.js | 20+ | Runtime |
| PostgreSQL | 16+ | Primary database |
| pgvector | 0.7+ | Vector similarity search |
| Docker | 24+ | Code sandbox (Phase 6, optional) |

---

## Quick Start

### 1. Start PostgreSQL with pgvector

```bash
docker run -d \
  --name agentx-pg \
  --restart unless-stopped \
  -e POSTGRES_USER=agentx \
  -e POSTGRES_PASSWORD=your-secure-password \
  -e POSTGRES_DB=agentx_conversation \
  -p 127.0.0.1:5433:5432 \
  pgvector/pgvector:pg17
```

### 2. Clone & Install

```bash
git clone https://github.com/sftgroup/Agentx.git
cd Agentx/conversation-service
cp .env.example .env
# Edit .env with your values (see Configuration section below)
npm install
```

### 3. Run Migrations

```bash
# Install PostgreSQL client if needed
sudo apt-get install -y postgresql-client

# Run all migrations
PGPASSWORD=your-password psql -h 127.0.0.1 -p 5433 -U agentx -d agentx_conversation \
  -f migrations/001_memory.sql
PGPASSWORD=your-password psql -h 127.0.0.1 -p 5433 -U agentx -d agentx_conversation \
  -f migrations/002_traces.sql
PGPASSWORD=your-password psql -h 127.0.0.1 -p 5433 -U agentx -d agentx_conversation \
  -f migrations/003_tenant_llm_config.sql
```

### 4. Build & Start

```bash
npx tsc                          # Build TypeScript
node dist/index.js               # Start directly, or
pm2 start dist/index.js --name agentx-conversation   # Start with PM2
```

### 5. Verify

```bash
curl http://localhost:8100/health
# → {"status":"ok","service":"agentx-conversation","time":"..."}
```

---

## Configuration

All values via environment variables. Copy `.env.example` to `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8100` | Service listen port |
| `NODE_ENV` | `development` | `production` or `development` |
| `DATABASE_URL` | `postgresql://localhost:5432/agentx_conversation` | PostgreSQL connection string |
| `INTERNAL_AUTH_TOKEN` | — | Shared token for Gateway-to-Service auth |
| `OPENAI_API_KEY` | — | AgentX official OpenAI API key (fallback) |
| `EMBEDDING_MODEL` | `text-embedding-ada-002` | Model for memory embeddings |
| `EMBEDDING_API_URL` | `https://api.openai.com/v1/embeddings` | Embedding API endpoint |
| `COMPACT_MODEL` | `gpt-4o-mini` | LLM model for context summarization |
| `GATEWAY_URL` | `http://localhost:3090` | AgentX Gateway URL (last-resort fallback) |
| `MASTER_ENCRYPTION_KEY` | — | 64-char hex key for tenant API key encryption |
| `RPC_URL` | Sepolia public RPC | Blockchain RPC for agent data |
| `IDENTITY_REGISTRY` | Sepolia | IdentityRegistry contract address |
| `SANDBOX_DOCKER_IMAGE` | `node:20-alpine` | Docker image for code sandbox |
| `SANDBOX_TIMEOUT_SEC` | `30` | Sandbox execution timeout |
| `SANDBOX_MAX_MEMORY_MB` | `256` | Sandbox max memory |

---

## API Endpoints

### POST /runs — SSE Agent Conversation

Executes an AgentLoop conversation and streams results via Server-Sent Events.

**Headers:**
```
X-Internal-Token: agentx-conv-internal-token-2026
X-Tenant-Address: 0x...
X-Llm-Api-Key: sk-...     # Optional: tenant's own key (Plan C)
```

**Request Body:**
```json
{
  "agentId": 42,
  "message": "Analyze this contract for vulnerabilities",
  "enableMemory": true,
  "contextBudget": 8000,
  "history": [
    {"role": "user", "content": "Hello"},
    {"role": "assistant", "content": "Hi! How can I help?"}
  ]
}
```

**SSE Event Types:**

| Type | Description |
|------|-------------|
| `text` | Text delta from agent response |
| `tool_call` | Agent is calling a tool |
| `tool_result` | Tool execution result |
| `thinking` | Agent status update |
| `done` | Conversation complete (includes usage stats) |
| `error` | Error message |

**Example SSE stream:**
```
data: {"type":"thinking","content":"Recalling memory..."}
data: {"type":"text","content":"Looking at"}
data: {"type":"text","content":" the contract,"}
data: {"type":"tool_call","toolName":"audit","toolArgs":{"code":"0x..."}}
data: {"type":"tool_result","toolName":"audit","toolResult":{"risk":"high"}}
data: {"type":"text","content":" I found a vulnerability."}
data: {"type":"done","usage":{"totalTokens":1250},"iterations":2}
```

### POST /tenants/:address/llm-key — Save Tenant LLM Key

Tenants can configure their own LLM API key (Plan C hybrid mode). The key is encrypted at rest with AES-256-GCM.

```bash
curl -X POST http://localhost:8100/tenants/0xAbC.../llm-key \
  -H "Content-Type: application/json" \
  -H "X-Internal-Token: agentx-conv-internal-token-2026" \
  -d '{
    "apiKey": "sk-...",
    "provider": "openai",
    "model": "gpt-4o",
    "endpointUrl": "https://api.openai.com/v1"
  }'
```

### DELETE /tenants/:address/llm-key — Remove Tenant Key

Restores to AgentX official key fallback.

```bash
curl -X DELETE http://localhost:8100/tenants/0xAbC.../llm-key \
  -H "X-Internal-Token: agentx-conv-internal-token-2026"
```

### GET /health — Health Check

```bash
curl http://localhost:8100/health
# → {"status":"ok","service":"agentx-conversation","time":"..."}
```

---

## LLM Key Resolution (Plan C)

The service supports hybrid LLM key resolution, allowing tenants to choose between convenience and cost:

```
Priority chain:
  1. X-Llm-Api-Key header   → Tenant's ephemeral key (per-request, not stored)
  2. tenant_llm_configs DB   → Tenant's persistent key (encrypted at rest)
  3. OPENAI_API_KEY env      → AgentX official key (platform default)
  4. GATEWAY_URL             → AgentX Gateway as last-resort LLM proxy
```

| Mode | Description | Billing |
|------|-------------|---------|
| **Managed** (default) | Uses AgentX official key | Pay per token (covers LLM + platform) |
| **BYOK** (optional) | Tenant provides own API key | Pay only platform fee |

---

## Database Schema

### memories
| Column | Type | Description |
|--------|------|-------------|
| subscriber | VARCHAR(42) | Wallet address |
| agent_id | INTEGER | Agent ID |
| fact | TEXT | Extracted fact |
| embedding | VECTOR(1536) | OpenAI ada-002 embedding |
| created_at | TIMESTAMPTZ | Creation time |

### traces
| Column | Type | Description |
|--------|------|-------------|
| session_id | VARCHAR(64) | Conversation session ID |
| agent_id | INTEGER | Agent ID |
| tenant_id | VARCHAR(42) | Tenant wallet |
| type | VARCHAR(32) | Event type |
| data | JSONB | Event payload |
| created_at | TIMESTAMPTZ | Event time |

### tenant_llm_configs
| Column | Type | Description |
|--------|------|-------------|
| tenant_address | VARCHAR(42) PK | Tenant wallet |
| provider | VARCHAR(20) | `openai` / `deepseek` / `custom` |
| encrypted_key | TEXT | AES-256-GCM encrypted API key |
| model | VARCHAR(50) | Override model (optional) |
| endpoint_url | VARCHAR(255) | Custom endpoint (optional) |

---

## Gateway Integration

The Gateway forwards agent conversation requests to the Conversation Service via `ConversationProxy`:

```typescript
// gateway/src/services/conversation-proxy.ts

const proxy = new ConversationProxy(
  'http://127.0.0.1:8100',                    // Service URL
  'agentx-conv-internal-token-2026',           // Shared token
)

// Proxy SSE stream from Conversation Service to client
const upstream = await proxy.streamRun({
  agentId: 42,
  message: 'Hello',
  tenantAddress: '0x...',
  enableMemory: true,
})

// Pipe to client response
res.writeHead(200, { 'Content-Type': 'text/event-stream' })
upstream.body?.pipeTo(res)
```

**Gateway env configuration:**
```bash
CONVERSATION_SERVICE_URL=http://127.0.0.1:8100
CONVERSATION_SERVICE_TOKEN=agentx-conv-internal-token-2026
```

---

## Docker Deployment

The service includes a `Dockerfile` for containerized deployment:

```bash
# Build
docker build -t agentx-conversation .

# Run
docker run -d \
  --name agentx-conversation \
  --env-file .env \
  -p 8100:8100 \
  --restart unless-stopped \
  agentx-conversation
```

---

## PM2 Deployment (Production)

```bash
# Build
cd conversation-service && npx tsc

# Start
pm2 start dist/index.js --name agentx-conversation

# Auto-restart on reboot
pm2 save
pm2 startup
```

---

## Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Set strong `INTERNAL_AUTH_TOKEN` (min 32 chars)
- [ ] Set strong `MASTER_ENCRYPTION_KEY` (64 hex chars)
- [ ] Configure `OPENAI_API_KEY` (for platform fallback)
- [ ] Change PostgreSQL password from default
- [ ] Bind PostgreSQL to `127.0.0.1` only
- [ ] Configure firewall to allow port 8100 from Gateway IP only
- [ ] Set up PM2 auto-restart
- [ ] Enable PostgreSQL WAL archiving for backups
