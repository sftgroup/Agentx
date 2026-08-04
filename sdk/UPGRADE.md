# @agentxv2/sdk Upgrade Guide

## v0.7.5 → v0.8.0

### What's New

| Feature | Description |
|---------|-------------|
| **IdentityRegistry batch query** | `getAllAgents(options)` — batch pull with `fromId`/`toId`/`activeOnly`/`capabilities` filters; `totalAgents()` reads the contract directly (no more binary search); `getAgentMetadata(agentId)` returns structured `{ name, description, encryptedPayloadCid, eciesEncryptedKey, publicPayloadCid, capabilities, skills, isActive }`. |
| **SubscriptionManager writes** | `createPlan()` now returns `planId` parsed from the `PlanCreated` event; `subscribe()` returns `subscriptionId/expiresAt/subscriber` parsed from the `Subscribed` event (previously always `0`). |
| **Typed period enum** | `createPlan({ period })` now only accepts `'day' | 'week' | 'month' | 'year'` (runtime-validated). These are the only values the contract maps to real durations — passing `'monthly'` / `'quarterly'` / `'yearly'` (as aihunter-saas did) silently created a 30-day plan on-chain. |
| **subscribeToEvents()** | `import { subscribeToEvents } from '@agentxv2/sdk'` — viem-based event stream (`Transfer` / `AgentRegistered` / `PlanCreated` / `Subscribed`), returns an `unwatch()` function. Drop sync latency from 2-min polling to < 15s. |
| **createPlanAndSubscribe()** | One-shot `createPlan` + `subscribe` helper. |

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.8.0
```

### Breaking Changes

1. **`createPlan({ period })`** — TypeScript now rejects values outside `day|week|month|year`, and a runtime guard throws for anything else. If you previously passed `'monthly'`/`'quarterly'`/`'yearly'`, map them to `'month'`/`'month'`(quarterly is not expressible in 30-day units)/`'year'` — or better, fix the contract duration expectations. See [aihunter-saas-integration-requirements](../docs/aihunter-saas-integration-requirements.md).
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
