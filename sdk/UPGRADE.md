# @agentxv2/sdk Upgrade Guide

## v0.8.9 → v0.8.10

### What's New

| Feature | Description |
|---------|-------------|
| **Master-key crypto helpers** | `encryptWithKey()` / `decryptWithKey()` — AES-256-GCM with wire format `base64(IV[12] ‖ authTag[16] ‖ ciphertext)`, byte-for-byte compatible with the Gateway's legacy at-rest key encryption (`gateway/src/lib/crypto.ts`). Use them to read/write tenant key material stored encrypted with the Gateway master key. New code should prefer `aesEncrypt`/`aesDecrypt` unless data in this layout must be read. |
| **`parseTokenURIJSON` exported** | `import { parseTokenURIJSON } from '@agentxv2/sdk'` — the fault-tolerant tokenURI parser is now public (previously internal to the Gateway indexer / SDK `AgentRegistry`). |
| **`createTask()` raw-string input** | `A2AProtocol.createTask(agentId, taskType, input)` now accepts `input: string \| Record<string, unknown>`. Pass pre-serialized JSON or plain text directly; objects are still JSON-stringified. Fully backward compatible. |
| **Subscription status mapping fix** | `SubscriptionManager.getSubscription()` now maps the on-chain enum (`0=Inactive, 1=Active, 2=Expired, 3=Cancelled`) to the typed `AgentSubscription['status']` correctly. The previous positional array `['active','expired','cancelled','pending']` mislabeled `Inactive` as `active`, `Active` as `expired`, `Expired` as `cancelled`, and `Cancelled` as `pending` — a wrong status on essentially every subscription. Now `pending` / `active` / `expired` / `cancelled` match the contract. |

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.8.10   # or simply: npm install @agentxv2/sdk (latest = 0.8.10)
```

### Use Master-Key Crypto

```ts
import { encryptWithKey, decryptWithKey } from '@agentxv2/sdk'

const ciphertext = encryptWithKey(plaintext, masterKeyHex)   // base64(IV ‖ tag ‖ ciphertext)
const plain = decryptWithKey(ciphertext, masterKeyHex)
```

### Breaking Changes

None — all additions are new exports; the `createTask` input type is a widening, and the subscription status fix only corrects values that were previously wrong.

## v0.8.8 → v0.8.9

### What's New

Docs sync only — README Installation now points at **v0.8.8** ("just install to use the sessions & parallel-tasks client"). Same code as 0.8.8.

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.8.9   # or simply: npm install @agentxv2/sdk (latest = 0.8.9)
```

No breaking changes.

## v0.8.7 → v0.8.8

### What's New

Docs sync only — README updated to v0.8.7 (sessions & parallel tasks section + version history). Same code as 0.8.7.

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.8.8
```

No breaking changes.

## v0.8.6 → v0.8.7

### What's New

| Feature | Description |
|---------|-------------|
| **Parallel Tasks client** | `ConversationClient` gains session/task APIs: `createSession()`, `createTask()`, `getTask()`, `listTasks()`, `cancelTask()`, `getCapabilities()`. `createTask()` returns immediately with the task row (`status: queued`); execution runs in the background (DeerFlow Thread/Run model). |
| **Integrator capability gate (P9)** | `GET /api/v1/tenant/me` now returns `capabilities.parallel_tasks` + `parallel_tasks_override`. When the effective flag is false (plan feature or tenant override), `createTask()` is rejected with **HTTP 403** `{ error, code: "PARALLEL_TASKS_DISABLED" }` — surfaced as `ConversationTaskError` with `.status`/`.code`. Callers should degrade to single-turn `chat()`. |

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.8.7
```

### Use Parallel Tasks

```ts
import { ConversationClient, ConversationTaskError } from '@agentxv2/sdk/conversation'

const client = new ConversationClient({ gatewayUrl: 'https://...', accessToken })

// (optional) check the integrator's capability first
const caps = await client.getCapabilities()
if (!caps.parallelTasks) {
  // tenant/plan disallows multi-task → fall back to single-turn client.chat(...)
}

const session = await client.createSession({ title: 'Audit' })
const task = await client.createTask({
  sessionId: session.id,
  agentId: 42,
  message: 'Analyze this contract',
  enableMemory: false,
})
// task.status === 'queued' — poll getTask() or stream SSE events

try {
  await client.cancelTask(task.id)
} catch (err) {
  if (err instanceof ConversationTaskError && err.code === 'PARALLEL_TASKS_DISABLED') {
    // tenant not allowed to run parallel tasks
  }
}
```

### Breaking Changes

None — all additions are new methods.

## v0.8.0 → v0.8.6

### What's New (0.8.1 → 0.8.6)

| Version | Feature | Description |
|---------|---------|-------------|
| **0.8.6** | **Stored BYOK (`tenantKeyId`)** | `ConversationChatParams` gains `tenantKeyId` — use a tenant-owned API key already saved & AES-encrypted on the Gateway (managed via Settings → Own LLM Keys, backed by `/tenant/keys`). The Gateway resolves the key server-side and injects it as `X-Llm-Api-Key` (priority over request-level headers) — the plaintext key never leaves the server. Complements the stateless `llmApiKey` override (request-level, highest priority). |
| **0.8.5** | Docs sync | Re-published with updated README (same code as 0.8.4). |
| **0.8.4** | Gateway JWT auth + abort + tool_result error | `ConversationClient` supports Gateway JWT auth (`accessToken` → `Authorization: Bearer`, alternative to `apiKey`) and external abort (`stream(params, { signal })`); `tool_result` event gains optional `error` field. |
| **0.8.3** | Install fix | `wagmi` promoted from optional to required peer dependency — directly usable via `npm install @agentxv2/sdk@0.8.3` (no manual `wagmi` install). |
| **0.8.2** | Write-op signing fix | `createPlan()` / `subscribe()` / `releaseFunds()` / `cancel()` resolve the full viem `walletClient.account` instead of a bare address string — local/private-key signers now work (`eth_sendRawTransaction`). |
| **0.8.1** | Fault-tolerant tokenURI | `parseTokenURIJSON()` aligned with Gateway indexer: base64 trailing garbage cleanup, unterminated JSON repair, regex fallback, explicit `ipfs://` handling. |

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.8.6
```

### Use Stored BYOK (v0.8.6)

```ts
import { ConversationClient } from '@agentxv2/sdk/conversation'

const client = new ConversationClient({
  gatewayUrl: 'https://gateway.example.com',
  apiKey: 'agentx_...',
})

// Use a tenant-owned key already saved in Settings → Own LLM Keys
// (plaintext key never leaves the server — Gateway decrypts and injects it)
const result = await client.chat({
  agentId: 42,
  message: 'Analyze this contract',
  tenantKeyId: 'key-01HX...',   // NEW: stored BYOK
})

// Streaming with external abort (v0.8.4) + stored BYOK
const controller = new AbortController()
for await (const event of client.stream(
  { agentId: 42, message: 'hello', tenantKeyId: 'key-01HX...' },
  { signal: controller.signal }
)) {
  if (event.type === 'text') console.log(event.content)
}
```

**LLM key resolution order (current)**:

```
1. tenantKeyId (stored tenant-owned key, server-side) — priority over request headers
2. X-Llm-Api-Key + X-Llm-Endpoint + X-Llm-Model (request-level, stateless BYOK — highest priority)
3. tenant_llm_configs (tenant-persisted key, encrypted storage)
4. OPENAI_API_KEY env (AgentX official key)
5. AgentX Gateway fallback
```

### Breaking Changes

None. 0.8.1 → 0.8.6 are purely additive — existing calls behave as before.

---

## v0.7.5 → v0.8.0

### What's New

| Feature | Description |
|---------|-------------|
| **IdentityRegistry batch query** | `getAllAgents(options)` — batch pull with `fromId`/`toId`/`activeOnly`/`capabilities` filters; `totalAgents()` reads the contract directly (no more binary search); `getAgentMetadata(agentId)` returns structured `{ name, description, encryptedPayloadCid, eciesEncryptedKey, publicPayloadCid, capabilities, skills, isActive }`. |
| **SubscriptionManager writes** | `createPlan()` now returns `planId` parsed from the `PlanCreated` event; `subscribe()` returns `subscriptionId/expiresAt/subscriber` parsed from the `Subscribed` event (previously always `0`). |
| **Typed period enum** | `createPlan({ period })` now only accepts `'day' | 'week' | 'month' | 'year'` (runtime-validated). These are the only values the contract maps to real durations — passing `'monthly'` / `'quarterly'` / `'yearly'` silently created a 30-day plan on-chain. |
| **subscribeToEvents()** | `import { subscribeToEvents } from '@agentxv2/sdk'` — viem-based event stream (`Transfer` / `AgentRegistered` / `PlanCreated` / `Subscribed`), returns an `unwatch()` function. Drop sync latency from 2-min polling to < 15s. |
| **createPlanAndSubscribe()** | One-shot `createPlan` + `subscribe` helper. |

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.8.0
```

### Breaking Changes

1. **`createPlan({ period })`** — TypeScript now rejects values outside `day|week|month|year`, and a runtime guard throws for anything else. If you previously passed `'monthly'`/`'quarterly'`/`'yearly'`, map them to `'month'`/`'month'`(quarterly is not expressible in 30-day units)/`'year'` — or better, fix the contract duration expectations.
2. **`subscribe()` return type** — now includes `subscriptionId`, `expiresAt`, `subscriber`, `agentId`. No field was removed.
3. Everything else is purely additive.

### Example

```ts
import { AgentRegistry, SubscriptionManager } from '@agentxv2/sdk'

const registry = new AgentRegistry({ contractAddress, publicClient, walletClient })
const total = await registry.totalAgents()
const agents = await registry.getAllAgents({ activeOnly: true, capabilities: ['trading'] })

const sm = new SubscriptionManager({ contractAddress, publicClient, walletClient })
const { planId } = await sm.createPlan({ agentId: 1, price: 1n, period: 'month' })
const sub = await sm.subscribe(planId)
console.log(sub.subscriptionId, sub.expiresAt)
```

---

## v0.7.4 → v0.7.5

### What's New

| Feature | Description |
|---------|-------------|
| **AgentLoop respects provider model** | `AgentLoop` no longer forces `ctx.model ?? 'gpt-4o'` on every LLM call. Model priority is now `ctx.model` → `provider.model` → `gpt-4o`. Any provider configured with a non-default model (e.g. BYOK DeepSeek `deepseek-v4-pro`) now works inside the loop. |

**Why this matters**: previously a provider built with `model: 'deepseek-v4-pro'` still sent `gpt-4o` to the model API inside the loop (the loop's `request.model` always won), so non-OpenAI providers errored with `you passed gpt-4o`. This also silently broke the Conversation Service tenant DB model config.

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.7.5
```

No breaking changes — explicit `ctx.model` still takes precedence; only the fallback behavior changed.

---

## v0.7.3 → v0.7.4

### What's New

| Feature | Description |
|---------|-------------|
| **BYOK model override** | `ConversationClient` adds `llmModel` — forwarded as `X-Llm-Model`. Combined with `llmApiKey` + `llmEndpoint`, callers now control key + endpoint + model per request (e.g. DeepSeek `deepseek-v4-pro`). |

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.7.4
```

### Example

```ts
const client = new ConversationClient({
  gatewayUrl: 'https://gateway.example.com',
  apiKey: 'agentx_...',
  llmApiKey: 'sk-deepseek-...',
  llmEndpoint: 'https://api.deepseek.com/v1',
  llmModel: 'deepseek-v4-pro',          // NEW
})

const result = await client.chat({ message: 'hello' })
```

No breaking changes — existing calls behave as before.

---

## v0.7.2 → v0.7.3

### What's New

| Feature | Description |
|---------|-------------|
| **Stateless BYOK (key + endpoint)** | `ConversationClient` adds `llmEndpoint` — forwarded as `X-Llm-Endpoint` alongside `X-Llm-Api-Key`. Callers now supply their own LLM key **and** endpoint (e.g. DeepSeek `https://api.deepseek.com/v1`) per request, with zero AgentX-side configuration or key storage. |

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.7.3
```

### Use Your Own LLM Key + Endpoint (DeepSeek example)

```ts
const client = new ConversationClient({
  gatewayUrl: 'https://gateway.example.com',
  apiKey: 'agentx_...',
  llmApiKey: 'sk-deepseek-...',
  llmEndpoint: 'https://api.deepseek.com/v1',   // NEW
})

const result = await client.chat({ message: 'hello' })
```

No breaking changes — existing calls behave as before.

---

## v0.7.1 → v0.7.2

### What's New

| Feature | Description |
|---------|-------------|
| **Clarification Interruption** | `ConversationSSEEvent` adds `clarification` + `question`; `chat()` returns `result.clarification` when the service interrupts an ambiguous request instead of running tools. |

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.7.2
```

### Handle Clarification

```ts
const result = await client.chat({ agentId: 42, message: 'help me' })
if (result.clarification) {
  // surface the question to the user, re-submit with clarified intent
  showPrompt(result.clarification)
} else {
  console.log(result.text)
}
```

No breaking changes — existing calls behave as before.

---

## v0.6.9 → v0.7.0

### What's New

| Feature | Description |
|---------|-------------|
| **ConversationClient** | `@agentxv2/sdk/conversation` — remote Conversation Service client. SSE streaming via Gateway `POST /api/v1/agent/runs`; auto-sends `X-Api-Key`, `X-End-User-Id` (end-user memory isolation), `X-Llm-Api-Key` (BYOK). |
| **Direct MCP Skill Execution** | Gateway Agent-as-MCP `tools/call` executes the agent's skill directly (`execution.type`: `mcp` / `http`) instead of a second LLM pass. |

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.7.0
```

### 1. Use ConversationClient

```ts
import { ConversationClient } from '@agentxv2/sdk/conversation'

const client = new ConversationClient({
  gatewayUrl: 'https://gateway.example.com',
  apiKey: 'agentx_...',
  endUserId: 'user-123',   // optional: per-end-user memory isolation
})
const result = await client.chat({ agentId: 42, message: 'Hello' })
```

### Breaking Changes

None. v0.7.0 is purely additive (new `conversation` module + Gateway-side behavior change). All v0.6.9 APIs remain fully compatible.

---

## v0.6.8 → v0.6.9

### What's New

| Feature | Description |
|---------|-------------|
| **AgentLoop Memory** | Cross-session memory with `memory: { enabled: true }` config. Stores/recalls facts via MemoryProvider interface. |
| **Context Engineering** | Token budget management via `contextBudget` config. Auto-summarizes old conversation turns when exceeded. |
| **Observability** | TraceEmitter interface — structured trace events for tool_call, tool_result, session_complete. Noop fallback when disabled. |
| **Browser Control Skill** | `@agentxv2/sdk/skills` — `executeBrowserAction()`, `extractAccessibleDOM()` for browser-based agent actions. |
| **New Sub-path Exports** | `@agentxv2/sdk/memory`, `@agentxv2/sdk/traces`, `@agentxv2/sdk/skills` |
| **Conversation Service** | New independent microservice (`@agentxv2/conversation`) for AgentLoop execution with pgvector memory |
| **Skills Marketplace** | Gateway endpoints for skill CRUD (public GET, JWT POST, admin review) |
| **Agent-as-MCP** | JSON-RPC 2.0 endpoint `POST /mcp/agent/:id` exports any AgentX agent as an MCP server |

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.6.9
```

### 1. Enable Memory in AgentLoop

```ts
const loop = new AgentLoop({
  ctx,
  llmProvider: provider,
  memory: {
    enabled: true,
    provider: new HttpMemoryProvider({ baseUrl: 'http://localhost:8100' }),
    storeOnSessionEnd: true,
  },
})
```

### 2. Enable Trace Observability

```ts
import { HttpTraceEmitter } from '@agentxv2/sdk/traces'

const loop = new AgentLoop({
  ctx,
  llmProvider: provider,
  trace: {
    enabled: true,
    emitter: new HttpTraceEmitter({ endpoint: 'http://localhost:8100/traces' }),
  },
})
```

### 3. Context Budget (auto-compaction)

```ts
const loop = new AgentLoop({
  ctx,
  llmProvider: provider,
  contextBudget: 8000,  // auto-summarize when token budget exceeded
})
```

### Breaking Changes

None. All v0.6.8 APIs remain fully compatible.

### New API Routes (Gateway)

| Route | Method | Description |
|-------|--------|-------------|
| `/api/v1/agent/runs` | POST | SSE-streamed Agent conversation (proxied to Conversation Service) |
| `/api/v1/agent/skills` | GET/POST | Skills marketplace CRUD |
| `/mcp/agent/:agentId` | POST | JSON-RPC 2.0 agent-as-MCP export |
| `/api/v1/traces/sessions` | GET | List trace sessions |
| `/api/v1/traces/session/:sessionId` | GET | Session trace details |

---

## v0.6.7 → v0.6.8

### What's New

| Feature | Description |
|---------|-------------|
| **Platform Tools Fix** | Fixed broken import paths in `platform-tools/` after module split (definitions.ts, executor.ts, index.ts). All 8 entry points now build correctly (CJS + ESM + DTS). |
| **Frontend Modularization** | 3 God Components split into 14 focused files: AgentCardManager (5 files), AgentRegistration (4 files), RevenueDisplay (5 files). No SDK API changes. |

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.6.8
```

### Breaking Changes

None. All v0.6.7 APIs remain fully compatible. This is a patch release with only internal build fixes.

### Technical Details

The platform-tools module was previously split into `platform-tools/definitions.ts` and `platform-tools/executor.ts` with a `platform-tools/index.ts` barrel. However, the sibling `platform-tools.ts` re-export file created a name collision with the directory, causing DTS generation to fail. The fix:

- `agent-loop/index.ts`: Import from `./platform-tools/index` instead of `./platform-tools`
- `agent-loop/platform-tools.ts`: Re-export `./platform-tools/index` explicitly  
- `platform-tools/definitions.ts`: Fixed import paths (added `../` prefix for correct depth)
- `platform-tools/executor.ts`: Fixed import paths + added missing `RunnableSkill` and `buildPlatformTools` imports

---

## v0.6.3 → v0.6.4

### What's New

| Feature | Description |
|---------|-------------|
| **IPFSUploader** | Upload to IPFS via Pinata REST API or custom endpoint. Supports JSON, files, and encrypted payload upload. |
| **publishAgent()** | One-shot pipeline: encrypt agent private payload → upload to IPFS → return CIDs ready for on-chain minting. |
| **IPFS Platform Tools** | AgentLoop tools: `agentx_ipfs_upload`, `agentx_ipfs_upload_encrypted`, `agentx_ipfs_get_url` |
| **Sub-path Export** | `@agentxv2/sdk/ipfs` — tree-shakeable IPFSUploader import |

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.6.4
```

### 1. Replace manual IPFS upload with publishAgent()

**Before (v0.6.3):**

```ts
import { generateAesKey, encryptPayload, packAgentForPublish } from '@agentxv2/sdk'

const aesKey = generateAesKey()
const encrypted = encryptPayload(privatePayload, aesKey)
const packResult = packAgentForPublish(agentPayload, publicKey, aesKey)
// Manually upload encrypted.data to IPFS (not provided by SDK)
// Manually upload agent metadata to IPFS (not provided by SDK)
```

**After (v0.6.4):**

```ts
import { IPFSUploader, publishAgent } from '@agentxv2/sdk'

const uploader = new IPFSUploader({ pinataJwt: 'eyJ...' })

const result = await publishAgent({ agent, publicKey, uploader })
// result.encryptedCid, result.publicCid — ready for on-chain minting
```

### 2. Use IPFSUploader directly

```ts
import { IPFSUploader } from '@agentxv2/sdk/ipfs'

const uploader = new IPFSUploader({
  pinataJwt: 'eyJ...',           // required for Pinata
  // customEndpoint: '...',      // alternative to Pinata
  gatewayUrl: 'https://ipfs.io', // default
})

// Upload JSON
const { cid, url } = await uploader.uploadJSON({ key: 'value' })

// Upload encrypted agent payload
const { cid } = await uploader.uploadEncryptedPayload(encryptedPayload, 'agent-name')
```

### 3. AgentLoop IPFS tools

The following tools are now available in AgentLoop:

| Tool Name | Description |
|-----------|-------------|
| `agentx_ipfs_upload` | Upload JSON data to IPFS |
| `agentx_ipfs_upload_encrypted` | Encrypt and upload agent payload |
| `agentx_ipfs_get_url` | Build public gateway URL from CID |

### Breaking Changes

None. All v0.6.3 APIs remain fully compatible.

### Pinata Setup

1. Go to [pinata.cloud](https://pinata.cloud) → API Keys
2. Create a key with `pinFileToIPFS` and `pinJSONToIPFS` permissions
3. Copy the JWT token
4. Pass it to `IPFSUploader({ pinataJwt: '...' })`
