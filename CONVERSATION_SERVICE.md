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
| `MEMORY_CONFIDENCE_THRESHOLD` | `0.5` | Minimum confidence (0-1) for a fact to be stored in memory; lower-confidence facts are dropped |
| `CLARIFICATION_ENABLED` | `true` | Run the pre-loop clarification gate; `false` disables it |
| `CLARIFICATION_MODEL` | `gpt-4o-mini` | LLM model used by the clarification gate |
| `GATEWAY_URL` | `http://localhost:3090` | AgentX Gateway URL (last-resort fallback) |
| `MASTER_ENCRYPTION_KEY` | — | 64-char hex key for tenant API key encryption |
| `RPC_URL` | Sepolia public RPC | Blockchain RPC for agent data |
| `IDENTITY_REGISTRY` | Sepolia | IdentityRegistry contract address |

---

## API Endpoints

### POST /runs — SSE Agent Conversation

Executes an AgentLoop conversation and streams results via Server-Sent Events.

**Headers:**
```
X-Internal-Token: agentx-conv-internal-token-2026
X-Tenant-Address: 0x...
X-Llm-Api-Key: sk-...     # Optional: tenant's own key (Plan C)
X-End-User-Id: user_123  # Optional: per end-user memory isolation
```

> **End-user isolation:** When a tenant serves many end users, pass `X-End-User-Id` on every request. Long-term memory is then scoped to `(tenant + agent + end_user)` instead of `(tenant + agent)`. Users without this header share the `default` bucket. The caller is still responsible for maintaining per-user `history[]` short-term context.

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
| `clarification` | Request interrupted — the service asks the user to disambiguate (carries `question`) |
| `done` | Conversation complete (includes usage stats) |
| `error` | Error message |

**Clarification Interruption:** When `CLARIFICATION_ENABLED` (default `true`), the service runs a lightweight intent gate before the agent loop. If the user's request is genuinely ambiguous, it emits a `clarification` event with a `question` and ends the run — no tools are called and no memory is written. Callers should surface the question and re-submit with the clarified intent. The `chat()` helper returns it as `result.clarification`.

---

### Inline Mode — Call Without an AgentX Agent

External apps that are **not** registered on AgentX can call the service directly by supplying `prompt` + `skills` in the request body. This bypasses the Gateway agent lookup entirely; the skill `execution` configs are applied as-is (MCP JSON-RPC or plain HTTP).

**Request Body (inline):**
```json
{
  "message": "What is the balance of 0x1234...?",
  "prompt": "You are a blockchain assistant. Use the available tool to answer.",
  "skills": [
    {
      "name": "get_balance",
      "description": "Get token balance of an address",
      "inputSchema": {
        "type": "object",
        "properties": {
          "address": {"type": "string"},
          "chainId": {"type": "number"}
        },
        "required": ["address"]
      },
      "execution": {
        "type": "mcp",
        "endpoint": "https://my-mcp.example.com/mcp",
        "toolName": "get_balance"
      }
    }
  ],
  "enableMemory": false
}
```

| `execution.type` | Behavior |
|------------------|----------|
| `mcp` | POST JSON-RPC `tools/call` to `execution.endpoint` (or `{gatewayUrl}/mcp` when omitted) |
| `http` | POST the tool arguments as JSON to `execution.endpoint` |
| `a2a` | Emits an a2a delegation descriptor (caller handles the target agent) |

Notes:
- Either `agentId` **or** `prompt`/`skills` must be provided (both are allowed; inline wins when present).
- Inline runs use `agentId = 0` internally — long-term memory is still isolated by `X-Tenant-Address` + `X-End-User-Id`.
- The `X-Llm-Api-Key` header (BYOK) applies to inline mode exactly as it does to agentId mode.

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

## SDK Client (v0.7.0)

Tenants can call the hosted Conversation Service from their own app via `@agentxv2/sdk`'s new `ConversationClient` — no manual SSE parsing needed:

```bash
npm install @agentxv2/sdk@0.7.0
```

```typescript
import { ConversationClient } from '@agentxv2/sdk/conversation'

const client = new ConversationClient({
  gatewayUrl: 'http://43.159.60.46:3090',
  apiKey: 'agentx_abc123...',      // Tenant API Key (issued after registration)
  endUserId: 'user_123',           // Optional: per end-user memory isolation
  llmApiKey: 'sk-...',             // Optional: override LLM key (Plan C)
})

// One-shot chat (collects full result)
const result = await client.chat({
  agentId: 42,
  message: 'Analyze this contract',
  history: [...],                  // Caller maintains per-user short-term context
  enableMemory: true,
})

// Streaming (SSE events as they arrive)
for await (const event of client.stream({
  agentId: 42,
  message: 'Hello',
  enableMemory: true,
})) {
  switch (event.type) {
    case 'text':       console.log(event.content); break
    case 'tool_call':  console.log('calling', event.toolName); break
    case 'done':       console.log('usage:', event.usage); break
  }
}
```

**Auth:** the client sends `X-Api-Key: agentx_...` automatically. If you pass `llmApiKey`, it is forwarded as `X-Llm-Api-Key` so your own LLM key is used instead of the tenant's stored key.

---

## Authentication & Security

### Two call paths, two auth layers

| Call path | Endpoint | Authentication | Used by |
|-----------|----------|----------------|---------|
| **Public (recommended)** | `POST {gateway}:3090/api/v1/agent/runs` | `Authorization: Bearer <JWT>` (wallet login) **or** `X-Api-Key: agentx_...` (tenant API key) — enforced by Gateway `apiKeyAuth` + `authMiddleware` | SDK `ConversationClient`, frontend, external apps |
| **Internal** | `POST {conversation}:8100/runs` | `X-Internal-Token` (must equal service `INTERNAL_AUTH_TOKEN`) | Gateway `ConversationProxy` only |

`/health` is public (no auth). `/tenants/:address/llm-key` requires `X-Internal-Token` (same as `/runs`).

### Security notes

1. **`X-Internal-Token` is a single shared secret** — if leaked, anyone with direct access to `:8100` can run conversations (consuming your platform LLM key). Use a strong random value (min 32 chars) and rotate if compromised.
2. **Restrict `:8100` to the Gateway** — bind/allowlist port 8100 so only the Gateway host can reach it (see Production Checklist). External traffic must go through `:3090`, keeping the auth boundary at the Gateway.
3. **`X-Tenant-Address` is caller-supplied** — on the Gateway path this header is filled from the verified tenant identity (trusted). On the direct `:8100` path the service does not verify the address, so direct access must only happen on a trusted network.
4. **Inline mode (prompt/skills) is covered by the same auth** — when called via the Gateway it is protected by JWT/`X-Api-Key`; when called directly it requires `X-Internal-Token`.
5. **Endpoint access is delegated to the caller** — skill `execution.endpoint` (MCP/HTTP) is provided by the caller and reached directly by the service; the service never proxies those credentials, so the caller's tool auth stays under the caller's control.

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
