# @agentxv2/sdk v0.8.6

**Decentralized AI Agent Platform SDK** — E2E encryption, on-chain subscriptions, ReAct AgentLoop, multi-tenant LLM providers, A2A multi-agent interop, IPFS upload, MCP remote tools, chain-data batch query.

```
Agent = Prompt + Skills[] + MCP
```

---

## Installation

```bash
npm install @agentxv2/sdk@0.8.6
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

## ConversationClient (v0.8.4) — Remote Conversation Service

Streams agent conversations from the hosted **Conversation Service** via the Gateway (`POST /api/v1/agent/runs`, SSE). Auth requires **either** a tenant `apiKey` (`X-Api-Key`) **or** a Gateway `accessToken` (`Authorization: Bearer` — wallet-signed login). Also auto-sends `X-End-User-Id` (end-user memory isolation), `X-Llm-Api-Key` + `X-Llm-Endpoint` + `X-Llm-Model` (stateless BYOK override — your own key AND endpoint AND model, e.g. DeepSeek).

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

// Stream events (thinking / tool_call / tool_result / text / clarification / done / error)
const controller = new AbortController()        // optional: external stop (user "Stop" button)
for await (const event of client.stream({
  agentId: 42,
  message: 'Analyze this contract',
  enableMemory: true,
  history: [{ role: 'user', content: 'hi' }],
}, { signal: controller.signal })) {
  switch (event.type) {
    case 'text':           appendDelta(event.content!); break
    case 'tool_call':      showToolBubble(event.toolName!, event.toolArgs); break
    case 'tool_result':    updateToolBubble(event.toolName!, event.toolResult); break
    case 'thinking':       setThinking(event.content!); break
    case 'clarification':  askUser(event.question!); break  // request was ambiguous — prompt the user
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

## Version History

| Version | Date | Highlights |
|---------|------|-----------|
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
