# @agentxv2/sdk v0.10.0

**Decentralized AI Agent Platform SDK** — E2E encryption, on-chain subscriptions, ReAct AgentLoop, multi-tenant LLM providers, A2A multi-agent interop (off-chain + user-wallet-signed on-chain rails), IPFS upload, MCP remote tools, chain-data batch query, hosted conversation sessions & parallel tasks, agent application categories, unified multi-rail payments.

```
Agent = Prompt + Skills[] + MCP
```

---

## Installation

The current release **0.11.0** is built on the **0.10.0 complete feature release** (agent application categories, sessions & parallel tasks, streaming tool_call fix, typed `onchain_approval_required` SSE event, unified `/api/v1/payments` endpoint) — with the payment engine migrated to the InfraX-maintained `@0xinfrax/payments` (capabilities identical, dependency-source only). Install and use:

```bash
# latest (recommended) — 0.11.0
npm install @agentxv2/sdk

# or pin the exact release
npm install @agentxv2/sdk@0.11.0
```

### Peer Dependencies

| Package | Version | Required |
|---------|---------|----------|
| `react` | ^18 or ^19 | yes |
| `wagmi` | ^2.0 | optional (React hooks only) |
| `@tanstack/react-query` | ^5.0 | optional (React hooks only) |
| `viem` | ^2.0 | optional (chain reader only) |

---

## Quick Start

### 1. Use an Agent with AgentLoop (ReAct autonomous tool calling)

```ts
import { AgentRunner, AgentLoop, OpenAIProvider, GatewayProvider } from '@agentxv2/sdk'

const runner = new AgentRunner({ reader, wallet })
const ctx = await runner.useAgent(42)

// Mode A: Pure frontend — direct LLM API
const provider = new OpenAIProvider({ apiKey: 'sk-...', model: 'gpt-4o' })

// Mode B: SaaS multi-tenant — via AgentX Gateway (API key never in browser)
const provider = new GatewayProvider({
  gatewayUrl: 'http://localhost:3090',
  accessToken: 'jwt...',
  keySource: 'platform',
})

const loop = new AgentLoop({
  ctx,
  llmProvider: provider,
  maxIterations: 5,
  contextBudget: 8000,           // NEW: auto-summarize when exceeding token budget
  memory: { enabled: true },     // NEW: pgvector cross-session memory (default: disabled)
  trace: { enabled: true },      // NEW: structured observability (default: disabled)
  onTextDelta: (delta) => appendAssistantMessage(delta),
  onToolCall: ({ name, arguments: args }) => showToolBubble(name, args),
  onToolResult: ({ name, result }) => updateToolBubble(name, result),
})

await loop.run('Analyze this contract for vulnerabilities')
```

### 2. React Hook

```tsx
import { useAgentRunner } from '@agentxv2/sdk/react'

function ChatPage({ agentId }: { agentId: number }) {
  const { ctx, isLoading, error } = useAgentRunner({ agentId })
  if (isLoading) return <div>Loading...</div>
  return <ChatInterface prompt={ctx!.prompt} skills={ctx!.skills} />
}
```

### 3. Publish an Agent (IPFSUploader + publishAgent pipeline)

```ts
import { IPFSUploader, publishAgent } from '@agentxv2/sdk'

const uploader = new IPFSUploader({ pinataJwt: 'eyJ...' })

const result = await publishAgent({
  agent: {
    name: 'Solidity Auditor',
    description: 'AI agent that audits Solidity smart contracts',
    version: '1.0.0',
    tags: ['security', 'audit'],
    category: 'security',               // v0.9.4: application category — see AGENT_CATEGORIES
    capabilities: ['smart_contract_audit'],
    supportedTasks: ['audit'],
    communicationProtocol: 'mcp',
    authenticationMethod: 'ecdsa',
    pricing: { type: 'subscription', amount: '10', currency: '', period: 'month' },
    prompt: 'You are an expert Solidity auditor...',
    skills: [{ name: 'audit', description: 'Audit a contract', version: '1.0', inputSchema: {...} }],
    mcp: { type: 'http', url: 'https://my-mcp.example.com/mcp' },
  },
  publicKey: '0x04abc...',
  uploader,
})

// 3. Mint Agent NFT on-chain
await registry.register(`ipfs://${result.publicCid}`, [
  { key: 'encryptedPayloadCid', value: result.encryptedCid },
  { key: 'eciesEncryptedKey', value: result.eciesEncryptedKeyHex },
])
```

> **Application category (v0.9.4)** — publishing agents now takes a `category` field (one of `AGENT_CATEGORIES`: `operations` / `customer-service` / `sales` / `personal-assistant` / `coding` / `server-monitoring` / `airdrop` / `quant-trading` / `data-analysis` / `content` / `security` / `finance` / `other`). It is written into the public metadata + on-chain attrs and drives Marketplace category filtering. The Studio UI enforces it as required; SDK-level it is optional for backward compatibility (agents without it fall back to `other`). `getAllAgents()` / `getAgentMetadata()` return the resolved `category`.

---

## Encryption & Decryption (Core)

The SDK provides a full E2E encryption pipeline using AES-256-GCM + ECIES (secp256k1).

### Low-Level Crypto

```ts
import {
  aesEncrypt, aesDecrypt,
  eciesEncrypt, eciesDecrypt,
  generateAesKey, generateKeyPair,
  randomBytes,
} from '@agentxv2/sdk/core'

// Generate keys
const keyPair = generateKeyPair()
// → { privateKey: '0x...', publicKey: '0x04...' }
const aesKey = generateAesKey()
// → 64-char hex string (32 bytes)

// AES-256-GCM encrypt/decrypt
const ciphertext = aesEncrypt('Hello, AgentX!', aesKey)
const plaintext = aesDecrypt(ciphertext, aesKey)

// ECIES encrypt/decrypt (key wrapping)
const wrapped = eciesEncrypt(aesKey, keyPair.publicKey)
const unwrapped = eciesDecrypt(wrapped, keyPair.privateKey)
```

### High-Level Payload Encryption

```ts
import { encryptPayload, decryptPayload, packAgentForPublish } from '@agentxv2/sdk/core'

// Publisher: encrypt agent payload for a subscriber
const encrypted = encryptPayload({
  prompt: 'You are a DeFi analyst...',
  skills: [{ name: 'audit', ... }],
  mcp: { type: 'http', url: '...' },
}, subscriberPublicKey)
// → { aesKeyHex, eciesEncryptedKeyHex, encryptedCid }

// Subscriber: decrypt with private key
const decrypted = decryptPayload(encrypted, subscriberPrivateKey)
// → { prompt, skills, mcp }

// Package agent ready for on-chain registration
const pack = packAgentForPublish(agentPayload, creatorPublicKey)
```

### Wire Format

```
AES-256-GCM:  base64( IV[12] || ciphertext || authTag[16] )
ECIES:        hex( ephemeralPub[33] || IV[16] || ciphertext || MAC[32] )
```

---

## IPFS Upload

```ts
import { IPFSUploader } from '@agentxv2/sdk/ipfs'
// or: import { IPFSUploader } from '@agentxv2/sdk'

const uploader = new IPFSUploader({
  pinataJwt: 'eyJ...',              // Pinata JWT token
  // customEndpoint: 'https://my-ipfs.example.com/api/v0/add',
  // customApiKey: '...',
  gatewayUrl: 'https://ipfs.io',     // default
  namePrefix: 'agentx-',
  timeoutMs: 30_000,                // request timeout
})

// Upload JSON
const { cid, url } = await uploader.uploadJSON(
  { hello: 'world' },
  { name: 'test-data', keyvalues: { app: 'agentx' } }
)

// Upload encrypted agent payload
const encrypted = await uploader.uploadEncryptedPayload(
  { encrypted: true, algorithm: 'AES-256-GCM', data: '...' },
  'my-agent'
)

// Get public gateway URL from CID
const publicUrl = uploader.getUrl('QmXxx...')
// → https://ipfs.io/ipfs/QmXxx...
```

---

## MCP Connector (Remote Tool Execution)

```ts
import { MCPConnector } from '@agentxv2/sdk/mcp'
// or: import { MCPConnector } from '@agentxv2/sdk'

// Connect to any MCP server
const connector = new MCPConnector({
  transport: 'http',                        // 'http' | 'sse' | 'stdio'
  url: 'https://my-mcp.example.com/mcp',
  authType: 'ecdsa',                        // optional: ecdsa signature auth
  privateKey: '0x...',                      // required for ecdsa auth
})

// Discover available tools
const tools = await connector.listTools()
// → [{ name: 'get_balance', description: '...', inputSchema: {...} }, ...]

// Execute a tool remotely
const result = await connector.callTool('get_balance', {
  address: '0x1234...',
  chainId: 19505,
})
// → { token: 'ETH', balance: '1.5' }
```

---

## ConversationClient (v0.8.7) — Remote Conversation Service

Streams agent conversations from the hosted **Conversation Service** via the Gateway (`POST /api/v1/agent/runs`, SSE). Auth requires **either** a tenant `apiKey` (`X-Api-Key`) **or** a Gateway `accessToken` (`Authorization: Bearer` — wallet-signed login). Both credentials unlock the **same** REST surface — single-turn chat plus sessions & parallel tasks — gated uniformly by the tenant's P9 capability bits; a B-end integration key (`agentx_...`) alone is sufficient, **no second key is needed** (only the MCP channel and on-chain operations require a registered-user JWT / the user's own wallet). The client also auto-sends `X-End-User-Id` (end-user memory isolation), `X-Llm-Api-Key` + `X-Llm-Endpoint` + `X-Llm-Model` (stateless BYOK override — **your own key AND endpoint AND model**, e.g. DeepSeek). **BYOK is the recommended pattern for callers**: traffic then runs against your own LLM account, and the platform fallback key is used only when no key is provided.

> **v0.8.6 — stored BYOK (`tenantKeyId`)**: each chat/stream request can pass `tenantKeyId` to use a tenant-owned API key already stored & AES-encrypted on the Gateway (managed via Settings → Own LLM Keys, backed by `/tenant/keys`). The Gateway resolves the key server-side and injects it as `X-Llm-Api-Key` (priority over request-level headers) — the plaintext key never leaves the server. This complements the stateless `llmApiKey` override (request-level, highest priority). **`tenantKeyId`s are strictly tenant-scoped**: after rotating your `agentx_` key or switching tenants, re-store a BYOK via `POST /api/v1/tenant/keys` with the new key and update your `tenantKeyId` — reusing another tenant's ID returns `400 Tenant API key not found or inactive`.
> **v0.8.7 — sessions & parallel tasks**: `createSession()` / `createTask()` (returns a `taskId` immediately, runs in the background) / `getTask()` / `listTasks()` / `cancelTask()` + `getCapabilities()`. When the tenant/plan disallows multi-task (P9 capability gate), `createTask()` is rejected with HTTP 403 `{ code: "PARALLEL_TASKS_DISABLED" }` — surfaced as `ConversationTaskError` (`.status` / `.code`); callers should degrade to single-turn `chat()`.
> **2026-08-08 — B-end keys clarified**: parallel-task capability is now **uniform for all tenants**. A B-end integration key (`agentx_...`) is no longer restricted to chat — it can create sessions/tasks exactly like a registered-user JWT, controlled by the same P9 capability bits (`effective = tenant.allow_parallel_tasks ?? plan.features.parallel_tasks ?? true`). `403 PARTNER_TASKS_DISABLED` no longer exists; a disabled tenant gets `403 PARALLEL_TASKS_DISABLED` and should fall back to `chat()` as above. **One `agentx_` key is enough** — callers do not need a second (wallet-signed) credential for sessions/tasks. Partner task creation additionally **requires a BYOK LLM key** (`X-Llm-Api-Key` header, `llmApiKey`, or stored `tenantKeyId`) — otherwise `400 { code: "LLM_KEY_REQUIRED" }` — so background work never drains the platform key budget. This gate applies to **parallel tasks created via REST/SDK** (`POST /sessions/:id/tasks`); platform-managed background paths (user schedules, orchestration triggers) bypass it and use the stored `tenantKeyId` or the platform fallback key.
>
> **MCP boundary (generic)**: the "registered-user `access_token` only" rule applies to the **AgentX platform MCP** (Gateway `/mcp`) — its 6 `agentx_gateway_*` conversation/task tools (`agentx_gateway_chat`, `create_session`, `create_task`, `get_task`, `list_tasks`, `cancel_task`) require a registered-user JWT and reject B-end `agentx_` keys (R14). MCP servers **you deploy yourself** (an in-house agent MCP, a RAG MCP, etc.) are outside this boundary — their auth is yours to configure (anonymous, tenant key, or anything else). Use REST or `ConversationClient` if you only hold a B-end key. **B-end end-users (e.g. aihunter's customers) are fully covered by REST + `X-End-User-Id: 0x<wallet>`** (end-user subscription proxying) — MCP stays JWT-only for B-end callers by design; bridging "B-end user → AgentX JWT" for MCP would be a separate design item.
>
> **B-end key vs user JWT — sessions/tasks behavior (v0.10.1)**: both credentials are gated by the same P9 capability bits and can create sessions/parallel tasks; the differences are (1) **access subject** — a B-end key authorizes as the partner tenant, or as a proxied end-user wallet when `endUserId` is a `0x` address; a JWT authorizes as the user's own wallet; (2) **task LLM key** — partner tasks **require BYOK** (`X-Llm-Api-Key` / `llmApiKey` / `tenantKeyId`, else `400 LLM_KEY_REQUIRED`), user tasks fall back to the platform key; (3) **platform MCP chat/task tools** and **on-chain A2A/publish/subscribe** are available to JWTs only. A B-end key covers all REST chat + parallel tasks; a JWT additionally covers MCP and on-chain.
>
> **`endUserId` is always optional — omitting it is NOT rejected** (2026-08-08 clarification): without it the access subject falls back to the **tenant's own wallet** — for a registered user (kind=user) that *is* the user's wallet (works naturally); for a partner tenant it simply means **no end-user proxying** (the `partner-*` address is not an on-chain address, so subscription-gated agents return `403 AGENT_ACCESS_DENIED` when the chain check fails — not a "missing endUserId" rejection). A non-`0x` `endUserId` is used for memory isolation only. There is **no "must send endUserId" enforcement** anywhere.

```ts
import { ConversationClient } from '@agentxv2/sdk/conversation'

const client = new ConversationClient({
  gatewayUrl: 'https://gateway.example.com',   // Gateway base URL (not the conversation service directly)
  apiKey: 'agentx_...',                         // tenant API key issued after registration (OR accessToken below)
  // accessToken: 'eyJ...',                     // gateway JWT from wallet-signed login (alternative to apiKey)
  endUserId: 'user-123',                        // optional: per-end-user memory isolation
  llmApiKey: 'sk-...',                          // optional: BYOK — your own LLM key (highest priority)
  llmEndpoint: 'https://api.deepseek.com/v1',   // optional: endpoint for llmApiKey (default OpenAI)
  llmModel: 'deepseek-v4-pro',                  // optional: model for llmApiKey (default gpt-4o)
  timeoutMs: 120_000,                           // optional: stream timeout (default 120s)
})

// Stream events (text / tool_call / tool_result / thinking / clarification / onchain_approval_required / done / error)
const controller = new AbortController()        // optional: external stop (user "Stop" button)
for await (const event of client.stream({
  agentId: 42,
  message: 'Analyze this contract',
  enableMemory: true,
  history: [{ role: 'user', content: 'hi' }],
  tenantKeyId: 'key-01HX...',               // v0.8.6: BYOK via a stored tenant-owned API key (Settings → Own LLM Keys)
}, { signal: controller.signal })) {
  switch (event.type) {
    case 'text':           appendDelta(event.content!); break
    case 'tool_call':      showToolBubble(event.toolName!, event.toolArgs); break
    case 'tool_result':    updateToolBubble(event.toolName!, event.toolResult); break
    case 'thinking':       setThinking(event.content!); break
    case 'clarification':  askUser(event.question!); break  // request was ambiguous — prompt the user
    case 'onchain_approval_required':
      // v0.9.6+: the agent requested an auditable on-chain A2A delegation.
      // The USER must approve it in their own wallet (they pay the gas and
      // become the on-chain client). Show a wallet modal with
      // event.approval = { targetAgentId, taskType, inputData }.
      openWalletModal(event.approval!); break
    case 'done':           onDone(event.usage); break
    case 'error':          onError(event.error!); break
  }
}

// Or aggregate into a single result
const result = await client.chat({ agentId: 42, message: 'Hello' })
// → { text, toolCalls: [{ name, arguments, result }], usage, iterations }
// When the service interrupts an ambiguous request, result.clarification carries
// the clarifying question and no tools were run:
if (result.clarification) {
  const answer = await promptUser(result.clarification)
  const retry = await client.chat({ agentId: 42, message: answer, history: [...prevHistory, ...] })
}

// Inline mode — no AgentX agent needed; inject your own MCP/HTTP tools (e.g. RAG)
const ragResult = await client.chat({
  message: '根据知识库回答：AgentX 支持哪些链？',
  prompt: '你是客服助手，回答前先调用 rag_query 检索知识库。',
  skills: [{
    name: 'rag_query',
    description: 'Retrieve relevant chunks from the knowledge base',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    execution: { type: 'mcp', endpoint: 'https://your-rag-mcp.example.com/mcp', toolName: 'rag_query' },
  }],
  enableMemory: false,
})
```

> Auth: the `apiKey` set in the constructor is sent automatically as `X-Api-Key` (tenant API key) — the RAG example above needs no per-request credentials. Your RAG MCP/HTTP `execution.endpoint` stays under your control: secure it with your own auth, the service only forwards the call (30s timeout).
> Sub-path import: `@agentxv2/sdk/conversation`. Server-side API & headers documented in [`CONVERSATION_SERVICE.md`](../CONVERSATION_SERVICE.md).

### Sessions & Parallel Tasks (v0.8.7)

Create a dialog session, fire multiple tasks into it, poll them in the background and cancel when needed:

```ts
import { ConversationClient, ConversationTaskError } from '@agentxv2/sdk/conversation'

const client = new ConversationClient({ gatewayUrl: 'https://gateway.example.com', accessToken: 'eyJ...' })

// (optional) check the integrator's capability first — when false, use single-turn chat() instead
const caps = await client.getCapabilities()
if (!caps.parallelTasks) {
  const r = await client.chat({ agentId: 42, message: 'hello' })
}

const session = await client.createSession({ title: 'Audit' })          // dialog container (idempotent)
const t1 = await client.createTask({ sessionId: session.id, agentId: 42, message: 'Analyze contract A' })
const t2 = await client.createTask({ sessionId: session.id, agentId: 42, message: 'Analyze contract B' })
// → both return immediately with { id, status: 'queued' } — execution runs in the background
const tasks = await client.listTasks(session.id)                        // all tasks of the session

let task = await client.getTask(t1.id)                                  // poll until terminal
// task.status: queued → running → done / error / cancelled

try {
  await client.cancelTask(t2.id)                                        // cancel queued/running task
} catch (err) {
  if (err instanceof ConversationTaskError && err.code === 'PARALLEL_TASKS_DISABLED') {
    // tenant/plan disallows multi-task → fall back to single-turn chat()
  }
}
```

> **B-end subscription proxying** (v0.10.1, Gateway 2026-08-08): a partner caller can authorize by an end-user's subscription by passing that user's wallet via `endUserId` (`0x<wallet>`; `createSession` / `createTask` params, or `X-End-User-Id` header). The Gateway then checks ownership/subscription against that wallet instead of the partner tenant itself — so "my end-user already subscribed → I may chat on their behalf". Non-`0x` end-user ids remain memory-isolation-only. `stream(params)` accepts `params.endUserId` too (per-request override of the constructor-level id).

---

## On-Chain Data (v0.8.1) — Batch Query + Subscription Writes + Event Stream

Replaces hand-rolled ethers.js + manual ABI/parseLog code. All methods accept viem `PublicClient` / `WalletClient` (chain-agnostic).

> 完整接入样例（SDK / MCP / REST 三通道 + 关键约定）：[docs/sdk-integration-example.md](../docs/sdk-integration-example.md)
> 可运行的 SDK 链上读取完整样例（生产地址）：[examples/sdk-chain-read.ts](../examples/sdk-chain-read.ts)
> 可运行的 SDK 写操作样例（创建套餐，需私钥）：[examples/sdk-create-plan.ts](../examples/sdk-create-plan.ts)

### IdentityRegistry — batch read

```ts
import { AgentRegistry } from '@agentxv2/sdk'

const registry = new AgentRegistry({ contractAddress, publicClient, walletClient })

const total = await registry.totalAgents()            // reads totalAgents() — replaces binary search

const agents = await registry.getAllAgents({
  fromId: 1,                  // default 1
  // toId: 100,               // default: totalAgents()
  activeOnly: true,           // default false — metadata.isActive === true
  capabilities: ['trading'],  // AND filter on metadata.capabilities
  batchSize: 10,              // RPC batching (default 10)
})
// → [{ agentId, owner, tokenURI, metadata: { name, description, capabilities, skills, isActive }, createdAt }]

const meta = await registry.getAgentMetadata(1)
// → { name, description, encryptedPayloadCid, eciesEncryptedKey, publicPayloadCid,
//     capabilities, skills, isActive }
```

> **v0.8.1 容错解析**：tokenURI 可能因合约 bug 损坏（base64 尾部垃圾 / JSON 未闭合）。
> `getAllAgents()` / `getAgentMetadata()` 会自动清理尾部垃圾、补齐未闭合引号/花括号，
> 仍失败时以 regex 兜底提取 `name`，最终回退为 `Agent {id}`——与 Gateway indexer 行为一致，
> 不会因单条损坏数据导致整批查询失败。

### SubscriptionManager — write + event-parsed results

```ts
import { SubscriptionManager } from '@agentxv2/sdk'

const sm = new SubscriptionManager({ contractAddress, publicClient, walletClient })

// period MUST be one of 'day' | 'week' | 'month' | 'year' — the only values the
// contract maps to real durations. 'monthly'/'quarterly'/'yearly' silently become
// 30 days on-chain, so they are rejected at runtime.
const { planId, txHash } = await sm.createPlan({
  agentId: 42,
  price: 5000000000000000n,   // wei
  period: 'month',
  payToken: '0x0000...',      // default: native token
  trialDays: 0,
})

const sub = await sm.subscribe(planId, { valueWei: 5000000000000000n })
// → { subscriptionId, txHash, subscriber, agentId, expiresAt }  // parsed from Subscribed event

const combined = await sm.createPlanAndSubscribe({ agentId: 42, price: 1n, period: 'day' })
// → { planId, subscriptionId, txHash, subscriber, agentId, expiresAt }
```

> **v0.8.2 写操作签名修复**：`createPlan()` / `subscribe()` / `releaseFunds()` / `cancel()`
> 现在优先使用完整的 viem `walletClient.account`（含签名能力），支持**本地私钥签名**场景
> （`privateKeyToAccount` → `eth_sendRawTransaction`）；浏览器钱包（MetaMask 等，
> json-rpc account）行为不变。此前传入裸地址字符串会走 `eth_sendTransaction`
> （仅节点托管账户），本地签名时被 RPC 拒绝（`unknown account`）。
> 写操作完整样例：[examples/sdk-create-plan.ts](../examples/sdk-create-plan.ts)

### subscribeToEvents — event-driven sync (< 15s vs 2min polling)

```ts
import { subscribeToEvents } from '@agentxv2/sdk'

const unwatch = await subscribeToEvents(publicClient, {
  identityRegistryAddress,
  subscriptionManagerAddress,
  events: ['Transfer', 'AgentRegistered', 'PlanCreated', 'Subscribed'],
  fromBlock: 123456,
  onEvent: ({ type, args, txHash }) => {
    if (type === 'AgentRegistered') syncAgent(Number(args.agentId))
  },
})
// ... later: unwatch()
```

---

## A2A Daemon — Multi-Agent Interop

```ts
import { A2ADaemon } from '@agentxv2/sdk/agent-loop'

const a2a = new A2AProtocol({
  contractAddress: '0x7F42a7dC4A0F3C107664C3750bE1B5B6fa6BEb86',
  publicClient,
  walletClient,
})

// Start daemon — auto-processes incoming A2A tasks
const daemon = new A2ADaemon({
  agentId: 53,
  a2a,
  gatewayUrl: 'http://localhost:3090',
  pollIntervalMs: 15000,
  autoComplete: true,
})

daemon.on('taskCompleted', (result) => {
  console.log(`Task #${result.task.taskId} completed!`, result.txHash)
})

daemon.start()
// daemon.stop()
```

**Flow:**
```
Agent A → createTask(Agent B) on-chain
Gateway Worker → detects → LLM processes → stores result
SDK A2A Daemon → polls Gateway → gets result → completeTask() on-chain
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      @agentxv2/sdk                           │
├──────────┬──────────┬──────────┬───────────────────────────┤
│  Core    │  Agent   │ AgentLoop│  React                    │
│ crypto   │ Runner   │ executor │  useAgentRunner           │
│ types    │ useAgent │ loop     │                           │
├──────────┼──────────┼──────────┼───────────────────────────┤
│ Registry │ Subscrip │ A2A      │ Reputation                │
│ register │ subscribe│ protocol │ giveFeedback              │
│ query    │ verify   │ daemon   │                           │
├──────────┼──────────┼──────────┼───────────────────────────┤
│ MCP      │ IPFS     │ LLM      │ Config                    │
│ Connector│ Uploader │ Factory  │ Chains                    │
│          │          │ OpenAI   │                           │
│          │          │ Gateway  │                           │
├──────────┼──────────┼──────────┼───────────────────────────┤
│ Endpoint │ConfigReg │ Payment  │ AgentWallet               │
│ MultiEP  │ KV Store │ Gateway  │                           │
└──────────┴──────────┴──────────┴───────────────────────────┘
```

---

## API Reference

### Main Exports

| Export | Module | Description |
|--------|--------|-------------|
| `AgentRunner` | agent | Decrypt + load Agent context from chain |
| `AgentLoop` | agent-loop | ReAct engine: Think → Tools → Observe → Repeat |
| `OpenAIProvider` | llm | Direct LLM provider with SSE streaming |
| `GatewayProvider` | llm | Multi-tenant SaaS LLM via AgentX Gateway |
| `createLLMProvider` | llm | Auto-select provider based on config |
| `MCPConnector` | mcp | MCP tool discovery + remote execution |
| `AgentRegistry` | registry | Register and query agents on-chain |
| `SubscriptionManager` | subscription | Subscribe (ETH/ERC20), verify, cancel, trial |
| `subscribeToEvents` | events | Contract event stream (Transfer/AgentRegistered/PlanCreated/Subscribed) |
| `AgentX402` | subscription | Auto-subscription gate + X402 payment |
| `A2AProtocol` | a2a | Agent-to-Agent task delegation |
| `A2ADaemon` | agent-loop | Background daemon for auto-processing A2A tasks |
| `ReputationRegistry` | reputation | Feedback + reputation queries |
| `ConfigurationRegistry` | configuration | On-chain KV configuration |
| `MultiEndpointClient` | endpoint | Multi-endpoint routing |
| `IPFSUploader` | ipfs | Upload to IPFS via Pinata or custom endpoint |
| `publishAgent` | core | Full encrypt + IPFS upload + pack pipeline |
| `KNOWN_CHAINS` | config | Pre-configured chain configs |

### Crypto Exports (from `@agentxv2/sdk/core`)

| Export | Description |
|--------|-------------|
| `aesEncrypt(plaintext, keyHex)` | AES-256-GCM encrypt → base64 |
| `aesDecrypt(ciphertext, keyHex)` | AES-256-GCM decrypt |
| `generateAesKey()` | Generate random 256-bit AES key (hex) |
| `eciesEncrypt(dataHex, publicKey)` | ECIES encrypt with secp256k1 public key |
| `eciesDecrypt(dataHex, privateKey)` | ECIES decrypt with secp256k1 private key |
| `encryptPayload(payload, pubKey)` | One-shot: AES encrypt + ECIES wrap |
| `decryptPayload(encrypted, privKey)` | One-shot: ECIES unwrap + AES decrypt |
| `packAgentForPublish(payload, pubKey)` | Package agent for on-chain registration |
| `publishAgent(config)` | Full pipeline: encrypt + IPFS upload |
| `generateKeyPair()` | Generate secp256k1 key pair |
| `getPublicKey(privateKey)` | Derive public key from private key |
| `randomBytes(length)` | CSPRNG random bytes (cross-runtime) |

### Sub-path Imports

| Path | Description |
|------|-------------|
| `@agentxv2/sdk` | All modules (main entry) |
| `@agentxv2/sdk/core` | Types, crypto (AES-256-GCM + ECIES) |
| `@agentxv2/sdk/react` | `useAgentRunner` React hook |
| `@agentxv2/sdk/agent-loop` | AgentLoop, executor, tool builder, A2A daemon |
| `@agentxv2/sdk/llm` | OpenAIProvider, GatewayProvider, factory |
| `@agentxv2/sdk/endpoint` | MultiEndpointClient |
| `@agentxv2/sdk/configuration` | ConfigurationClient |
| `@agentxv2/sdk/ipfs` | IPFSUploader (Pinata + custom endpoint upload) |
| `@agentxv2/sdk/memory` | MemoryProvider interface + types (v0.6.9) |
| `@agentxv2/sdk/traces` | TraceEmitter interface + types (v0.6.9) |
| `@agentxv2/sdk/skills` | Browser control skill utilities (v0.6.9) |
| `@agentxv2/sdk/conversation` | ConversationClient — remote Conversation Service client (v0.7.0) |

---

## Encryption Pipeline

```
Publisher creates Agent:
  AgentPayload → AES-256-GCM encrypt → IPFS (CID)
  AES key → ECIES wrap → on-chain NFT metadata
  Mint Agent NFT via IdentityRegistry

Subscriber uses Agent:
  Verify subscription (SubscriptionManager)
  Fetch encrypted payload from IPFS
  Read ECIES-wrapped key from on-chain NFT
  Decrypt → { prompt, skills, mcp }
  skills[n].execute() → Open (local) or MCP (remote with ECDSA auth)
```

---

## Supported Chains

| Network | Chain ID | RPC | Gas Token |
|---------|----------|-----|-----------|
| **OxaChain L1** | **19505** | `https://rpc-oxa.0xainet.top` | OXA |
| Sepolia (Testnet) | 11155111 | `https://ethereum-sepolia-rpc.publicnode.com` | ETH |

---

## On-Chain Contracts

### OxaChain L1 (Mainnet)

| Contract | Address |
|----------|---------|
| IdentityRegistry | `0xbf5F9db266c8c97E3334466C88597Eb758AfE212` |
| SubscriptionManager v3 | `0x019AC9d945467478Dd371CDbD70cb2f325800E6B` |
| A2AProtocolRegistry v2 | `0x7F42a7dC4A0F3C107664C3750bE1B5B6fa6BEb86` |
| ReputationRegistry | `0x6a18C2664E1b42063860d864b6448b824d7B843F` |
| ConfigurationRegistry | `0x07280674ccc2898Fd038A9e3C22005CA83ffD2F8` |
| MultiEndpointRegistry | `0xB361d04F49000013FC131D3C59C41c8486C64f8c` |

### Sepolia (Testnet)

| Contract | Address |
|----------|---------|
| IdentityRegistry | `0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F` |
| SubscriptionManager v3 | `0xC15fE80b9d800abb72121F353a6ae6d6E9077E63` |
| A2AProtocolRegistry v2 | `0x309C7447d89f3087A9924BB686d88df020F7e9cB` |
| ReputationRegistry | `0xeb6B410ea71b8d9dA0c96f6A91d35027CE143DC9` |
| ConfigurationRegistry | `0x68DcE00e4C9077c94BC68016cD14B09557faEA6c` |
| MultiEndpointRegistry | `0xEB5e866f186d4B73F97aa0d70B86f2C6e2e21Cb7` |

---

## Gateway Integration

For multi-tenant SaaS deployments, the Gateway package (`@agentxv2/gateway`) provides:

```
npm install @agentxv2/gateway@0.1.2
```

Features: wallet-based auth (EIP-191 + JWT), rate limiting (IP + tenant), LLM proxy (OpenAI/DeepSeek), MCP server, A2A background worker, admin dashboard API, PostgreSQL + Redis persistence.

Configuration: 26 environment variables — see `gateway/.env.example`.

---

## Multi-Rail Subscription Payments (v0.9.4)

`SubscriptionPayments` is the single entry point for subscribing across every AgentX payment rail — chain (on-chain escrow), fiat (Stripe card via the Gateway) and x402 (native-token period payment). `fiat` / `x402` / `hasAccess()` go through the unified `/api/v1/payments` endpoint (the `@0xinfrax/payments` engine); `chain` works fully off-Gateway.

```ts
import { SubscriptionManager, SubscriptionPayments } from '@agentxv2/sdk'

const sm = new SubscriptionManager({ contractAddress, publicClient, walletClient })
const payments = new SubscriptionPayments({
  gatewayUrl: 'https://gw.example.com', // required for fiat / x402 rails
  subscriptionManager: sm,              // required for chain rail & x402 auto-funding
  walletClient,
  chain: 'oxachain',
})

await payments.pay({ method: 'chain', planId: 1, agentId: 3 })            // on-chain escrow
const { sessionUrl } = await payments.pay({                               // Stripe redirect
  method: 'fiat', planId: 1, agentId: 3, subscriber: '0xabc',
})                                                                        // amount auto-priced from plan
await payments.pay({ method: 'x402', planId: 1, agentId: 3, subscriber: '0xabc' }) // auto-funded native payment
const ok = await payments.hasAccess(3, '0xabc')                           // unified chain-OR-fiat/x402 check
```

- `pay({ method })` returns a discriminated result: `{ method: 'chain', subscriptionId, txHash }` / `{ method: 'fiat', sessionUrl, sessionId, redirect: true }` / `{ method: 'x402', subscriptionId, txHash, creditedWei }`.
- For `fiat`, `amountCents` is optional — the Gateway derives the USD amount from the on-chain plan price (`FIAT_TOKEN_USD_PRICE`). Supply `amountCents` to override.
- For `x402` without `txHash`, the payment is sent automatically from `walletClient` (max of plan price / protocol price), then verified & registered by the Gateway.

### Protocol Clients (v0.9.3)

Since **0.9.3** the SDK re-exports the generic engine's protocol clients from the root, so integrators can drive the P2-P4 rails directly against any Gateway deployment (AgentX-hosted or your own):

```ts
import { MPPClient, A2AClient, PeriodClient, X402Client, PaymentsClient } from '@agentxv2/sdk'

const base = { baseUrl: 'https://gw.example.com', accessToken: 'jwt...' } // accessToken optional

const mpp    = new MPPClient(base)      // payment channels
const a2a    = new A2AClient(base)      // two-phase paymentId (create → settle)
const period = new PeriodClient(base)   // period authorizations (charge / state)
const x402   = new X402Client(base)     // x402 v2 protocol (quote / pay / verify / balance)
const uni    = new PaymentsClient(base) // unified create / verify / access / info / quote
```

| Client | Endpoints | Typical flow |
|--------|-----------|--------------|
| `MPPClient` | `/api/v1/payments/mpp/{open,voucher,topup,settle,close,session}` | open a channel → submit signed cumulative vouchers (`voucher`, idempotent `mode: 'reuse'`) → auto-settle / close |
| `A2AClient` | `/api/v1/payments/a2a`, `/api/v1/payments/a2a/settle` | `create({ payer, amountWei })` → payer pays on-chain → `settle({ paymentId, txHash })` (idempotent) |
| `PeriodClient` | `/api/v1/payments/period/charge`, `/period/authorization` | one-time pre-authorization for N periods, then `charge(authorizationId)` per period — no re-signing |
| `X402Client` | `/api/v1/x402/{info,verify,balance}`, `quote`/`pay` (v2 headers) | `quote(url)` fetches the `PAYMENT-REQUIRED` challenge; `pay({ url, walletClient, account })` funds + signs + replays in one call |
| `PaymentsClient` | `/api/v1/payments` + `/verify` `/access` `/info` `/quote` | `create({ method: 'fiat'|'x402'|... })`, `verify(txHash)`, `access(subscriber, agentId)`, `info()` rails discovery |

> **Dependency note**: the clients come from [`@0xinfrax/payments`](https://www.npmjs.com/package/@0xinfrax/payments) `^0.1.0` (currently **0.1.0**, InfraX-maintained — the former AgentX-maintained `@agentxv2/payments` is deprecated), auto-installed as a dependency of `@agentxv2/sdk`. `PAYMENT_VERSION` (`'0.1.0'` — the aligned engine API version) is also exported from the SDK root. **Browser/bundler safe**: the engine uses only the Web Crypto API — no Node built-ins (`node:crypto` / `Buffer`) — so webpack/Next.js builds no longer fail on `UnhandledSchemeError`. Endpoints must be exposed by the Gateway the client points at (MPP/period/a2a routes exist on AgentX Gateway `/api/v1/payments/*`).

---

## Multi-Agent Orchestration Layering (v0.10.0)

Multi-agent delegation follows a **two-rail layering strategy** so integrators get real-time, zero-cost orchestration by default and only pay for on-chain guarantees when they need them:

| Rail | When to use | Cost | Guarantees |
|------|-------------|------|-----------|
| **off-chain** (default) | same-platform, high-frequency, real-time conversational delegation | zero (no on-chain writes) | result returns synchronously in the conversation channel |
| **on-chain** (opt-in) | cross-org, settlement / reconciliation, reputation accumulation, third-party verification | gas paid by the **user's wallet** + task tx | auditable A2A taskId, on-chain record, settlement & reputation hooks |

> **v0.10.0 gas model (2026-08-08):** on-chain rail costs are **never paid by the platform**. When the user explicitly requests an auditable / settled delegation, the Conversation Service emits an `onchain_approval_required` SSE event and the **user's own wallet** submits `createTask` — they pay the gas and become the on-chain `clientAddress` (the contract records `clientAddress = msg.sender`). The Gateway no longer holds any signing key (`A2A_WORKER_PRIVATE_KEY` removed) and never writes to the chain; sub-tasks created by the a2a-worker run **off-chain inline** (local negative pseudo taskIds), so only the top-level task the user signs is on-chain.

Inside a conversation run, the main agent is given two platform tools (injected by the Conversation Service, same access boundary as chat — only agents the caller owns or is subscribed to):

- `agentx_list_agents` — discover the agents the caller may delegate to (id / name / description / category).
- `agentx_delegate` — `{ targetAgentId, message, mode? }`. **Default `mode: "offchain"`**: the sub-agent runs synchronously inside the conversation channel and its final answer returns to the main agent in real time. **When the user explicitly requests an auditable / settled / on-chain delegation** (e.g. "上链", "可审计", "结算", "on-chain", "audit"), use `mode: "onchain"`: the service emits `onchain_approval_required` and the **user signs the A2A `createTask` in their own wallet** (they pay the gas); the returned `taskId` is the audit trail, picked up by the Gateway A2A worker and recorded in `a2a_task_results`.

Platform configuration (Conversation Service env):

```bash
ORCHESTRATE_TOKEN=...                 # must match the Gateway's ORCHESTRATE_TOKEN
ORCHESTRATE_DEFAULT_MODE=offchain     # default rail: offchain | onchain
ORCHESTRATE_MAX_DEPTH=4               # max nested delegation depth
```

> The SDK `A2AProtocol` / `A2ADaemon` remain the explicit on-chain rail for integrators who want settlement & reputation without the chat channel — same principle: the caller's own wallet signs `createTask`.

---

## Version History

| Version | Date | Highlights |
|---------|------|-----------|
| **0.11.1** | 2026-08-10 | **首次跟随演练（F2）** — 跟随 infraX `@0xinfrax/payments` `^0.1.1`（补丁版：新增 `createWebhookForwarder` 事件出站转发 + `ChainAdapter` `rpcHeaders`）；解耦回归 19 项断言通过（消费已安装 npm 包）、sdk 32/32 全绿；`PAYMENT_VERSION` 对齐 `0.1.1`。`SubscriptionPayments` + 协议客户端 API 不变。**No breaking changes** |
| **0.11.0** | 2026-08-10 | **Payment engine migrated** — the underlying engine moved from the AgentX-maintained `@agentxv2/payments` (now **deprecated**) to the InfraX-maintained [`@0xinfrax/payments`](https://www.npmjs.com/package/@0xinfrax/payments) `^0.1.0`; capabilities identical (chain / Stripe fiat / x402 v1+v2 / MPP channels / stablecoin EIP-3009+Permit2 / period authorizations / a2a-pay), dependency-source only; `PAYMENT_VERSION` aligned to `0.1.0`. `SubscriptionPayments` + protocol clients (MPP/A2A/Period/X402/Payments) API unchanged. **No breaking changes** (see UPGRADE.md) |
| **0.10.1** | 2026-08-08 | **Released** — per-request `endUserId` on `createTask` (body) / `stream` (header) for B-end subscription proxying; B-end key vs user JWT behavior documented (identical P9 capability bits; partner tasks **require BYOK** → `400 LLM_KEY_REQUIRED`; platform MCP & on-chain are JWT-only); MCP boundary note (platform `/mcp` vs self-hosted MCP). Non-breaking additive change (see UPGRADE.md) |
| **0.10.0** | 2026-08-08 | **Complete feature release** — consolidates the 0.9.x line into a stable baseline: typed `onchain_approval_required` SSE event + `OnChainApprovalRequest` (user-wallet-signed on-chain delegation, no platform gas), agent categories, unified payments rails, sessions & parallel tasks, streaming tool_call fix. **No breaking changes** |
| **0.9.6** | 2026-08-08 | **Typed on-chain approval event** — `ConversationSSEEvent` adds `'onchain_approval_required'` + `OnChainApprovalRequest { targetAgentId, taskType, inputData }` so consumers no longer need `as unknown as` narrowing when the agent requests an auditable on-chain A2A delegation (the user's wallet signs `createTask` and pays the gas). Frontend `useAgentChat` updated to the typed event (also resolves the pre-existing `AgentPayload.category` error). **No breaking changes** |
| **0.9.5** | 2026-08-08 | **Fix: streaming tool_call arguments dropped** — DeepSeek/OpenAI argument-delta chunks carry only an `index` (no `id`); `GatewayProvider` / `OpenAIProvider` now keep an `index→id` map so accumulated tool arguments attach to the real call (previously silently discarded). **No breaking changes** (see UPGRADE.md) |
| **0.9.4** | 2026-08-07 | **Agent application categories** — `AgentPayload.category` + `AGENT_CATEGORIES` / `AgentCategory` (13 enums); written to public metadata + on-chain attrs; `getAllAgents()` / `getAgentMetadata()` resolve `category`; Gateway `?category=` filter + byCategory aggregation; frontend Studio requires it, Marketplace categorizes by it. `@agentxv2/payments` resolved to **0.2.2** (ownership metadata). **No breaking changes** (see UPGRADE.md) |
| **0.9.3** | 2026-08-07 | **P2-P4 rails aligned** — `@agentxv2/payments` bumped to `^0.2.0` (MPP payment channels / stablecoin EIP-3009+Permit2 / period authorizations / a2a-pay); re-exports `MPPClient` / `A2AClient` / `PeriodClient` / `X402Client` / `PaymentsClient` from the SDK root. **No breaking changes** — `SubscriptionPayments` API unchanged (see UPGRADE.md) |
| **0.9.2** | 2026-08-07 | **Unified payments endpoint** — `SubscriptionPayments` fiat / x402 / `hasAccess()` now go through the Gateway's `/api/v1/payments` via the decoupled `@agentxv2/payments` engine (`^0.1.0`, new dependency); `fetchX402Info()` reads the rails-discovery `/info`. **No breaking changes** — `pay()` / `hasAccess()` / result types unchanged (see UPGRADE.md) |
| **0.9.0** | 2026-08-06 | Browser Control Skill extension: new actions `hover` / `press` / `select` (select+checkbox+radio) / `back` / `forward` / `getInfo` (url/title/viewport); `extractAccessibleDOM` now includes `name`/`role`/`aria-label`/input `value`/checkbox `checked`/anchor `target`; new `sleep(ms)` async pacing helper; `findElement` also matches `name` attr |
| **0.8.11** | 2026-08-07 | **Multi-rail subscription payments** — new `SubscriptionPayments` class (`pay({ method })` for `chain` / `fiat` / `x402`, `hasAccess()` unified chain-OR-fiat/x402 check, `fetchX402Info()` discovery); fiat `amountCents` now optional (Gateway auto-prices from the on-chain plan); x402 auto-funding from a configured `walletClient` |
| **0.8.10** | 2026-08-06 | Master-key crypto helpers `encryptWithKey()` / `decryptWithKey()` (AES-256-GCM, `base64(IV‖tag‖ciphertext)`, byte-compatible with Gateway at-rest key encryption); `parseTokenURIJSON` exported from the main entry; `A2AProtocol.createTask()` accepts raw string `input`; **subscription status mapping fix** (on-chain enum `0/1/2/3` → `pending/active/expired/cancelled`, previously shifted) |
| **0.8.9** | 2026-08-06 | Docs sync — Installation section points at v0.8.8 ("just install to use the new capabilities"); same code as 0.8.8 |
| **0.8.8** | 2026-08-06 | Docs sync — README updated for 0.8.7 (sessions & parallel tasks section) |
| **0.8.7** | 2026-08-06 | `ConversationClient` gains sessions & parallel tasks: `createSession()` / `createTask()` (returns `taskId` immediately, background execution) / `getTask()` / `listTasks()` / `cancelTask()` / `getCapabilities()`. New `ConversationTaskError` (`.status` / `.code`) — `createTask()` on a P9-disabled tenant/plan rejects with HTTP 403 `PARALLEL_TASKS_DISABLED`; used by the frontend parallel-task chat UI |
| **0.8.6** | 2026-08-06 | `ConversationChatParams` gains `tenantKeyId` — BYOK via a stored tenant-owned API key, resolved server-side by the Gateway (plaintext key never leaves the server); used by the new frontend own-key settings flow |
| **0.8.5** | 2026-08-06 | Docs sync — re-published with updated README (same code as 0.8.4) |
| **0.8.4** | 2026-08-06 | `ConversationClient` now supports Gateway JWT auth (`accessToken` → `Authorization: Bearer`, alternative to `apiKey`) and external abort (`stream(params, { signal })`); `tool_result` event gains optional `error` field. Frontend chat hook unified onto it (single SSE client implementation) |
| **0.8.3** | 2026-08-05 | Install fix: `wagmi` promoted from optional to required peer dependency — the package is now directly usable via `npm install @agentxv2/sdk@0.8.3` (no manual `wagmi` install); verified from a clean install (ESM + CJS, chain reads OK) |
| **0.8.2** | 2026-08-05 | Write-op fix: `createPlan()` / `subscribe()` / `releaseFunds()` / `cancel()` resolve the full viem `walletClient.account` instead of a bare address string — local/private-key signers now work (`eth_sendRawTransaction`); browser wallets unchanged. Verified on-chain (OxaChain L1) |
| **0.8.1** | 2026-08-04 | `parseTokenURIJSON()` fault-tolerant parsing aligned with Gateway indexer: base64 trailing garbage cleanup, unterminated JSON repair, regex fallback, explicit `ipfs://` handling |
| **0.8.0** | 2026-08-04 | Chain-data capabilities: `getAllAgents()` / `totalAgents()` / `getAgentMetadata()` on IdentityRegistry; `createPlan()` (typed period `day|week|month|year`) / `subscribe()` (event-parsed result) / `createPlanAndSubscribe()`; `subscribeToEvents()` event stream |
| **0.7.5** | 2026-08-04 | Fix AgentLoop forcing `ctx.model ?? 'gpt-4o'` over provider model — priority now `ctx.model ?? provider.model ?? default` |
| **0.7.4** | 2026-08-04 | `ConversationClient` adds `llmModel` (forwarded as `X-Llm-Model`) — BYOK now covers key + endpoint + model (e.g. `deepseek-v4-pro`) |
| **0.7.3** | 2026-08-04 | Stateless BYOK: `ConversationClient` adds `llmEndpoint` (forwarded as `X-Llm-Endpoint`) so callers supply their own LLM key + endpoint (e.g. DeepSeek) per request — no AgentX-side key storage needed |
| **0.7.2** | 2026-08-03 | Clarification interruption: `ConversationSSEEvent` adds `clarification` + `question`; `chat()` returns `result.clarification` when the service interrupts an ambiguous request |
| **0.7.1** | 2026-08-03 | ConversationClient inline mode: `prompt` + `skills` params (inject MCP/HTTP tools e.g. RAG), `agentId` now optional; Gateway forwards `X-Llm-Api-Key` |
| **0.7.0** | 2026-08-01 | **ConversationClient** (`@agentxv2/sdk/conversation`) — remote Conversation Service client: SSE streaming via Gateway, auto `X-Api-Key` / `X-End-User-Id` / `X-Llm-Api-Key`; Gateway Agent-as-MCP `tools/call` now executes skills directly (no LLM second-pass) |
| **0.6.9** | 2026-08-01 | Microservice Agent Conversation — 6-Phase Optimization: Conversation Service (Memory + Context + Sandbox), Observability (TraceEmitter), Skills Marketplace, Agent-as-MCP Export, Browser Control Skill, 3 new sub-path exports (memory/traces/skills) |
| **0.6.8** | 2026-07-28 | Fixed import paths in platform-tools (definitions.ts, executor.ts, index.ts) after module split; Frontend: 3 God Components modularized (AgentCardManager→5 files, AgentRegistration→4 files, RevenueDisplay→5 files) |
| **0.6.7** | 2026-07-27 | Code review: 22 fixes across contracts/gateway/frontend/sdk; Redis-backed auth; unified error handler; i18n agent dashboard; barrel exports; custom errors in SubscriptionManager; ValidationRegistry interface fix; TokenPriceOracle de-hardcoded |
| **0.6.6** | 2026-07-22 | A2A Worker + Daemon multi-agent interop, A2A tenant isolation, i18n EN/繁體中文, completeTask ABI fix, getAgentTasks |
| **0.6.5** | 2026-07-21 | Admin dashboard, A2A L1 redeploy, DeepSeek platform key, auth case-insensitive fix |
| **0.6.4** | 2026-07-20 | IPFSUploader (Pinata + custom endpoint), publishAgent pipeline, IPFS platform tools |
| 0.6.3 | 2026-07-19 | Production deploy, wallet auto-switch to OxaChain L1, MCP dual-chain fixes |
| 0.6.1 | 2026-07-15 | AgentLoop ReAct, OpenAIProvider, GatewayProvider, ToolExecutor |
| 0.5.4 | 2026-07-14 | MultiEndpointClient, ConfigurationClient, OxaChain L1 dual-chain |
| 0.2.0 | 2026-07-13 | AgentRunner, SubscriptionManager v3, A2A Protocol, MCP Connector |

---

## License

MIT
