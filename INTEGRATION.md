# AgentX Integration Guide

> SDK / Contracts / AgentLoop / Gateway — Complete third-party integration guide
> Version: v0.6.2 · Updated: 2026-07-17

## Overview

AgentX is a decentralized AI Agent platform providing: ReAct AgentLoop autonomous tool calling, multi-tenant SaaS LLM Gateway, E2E encrypted Agent distribution, on-chain subscription gating with multi-currency payments, escrow trial refunds, MCP remote tool execution, and A2A task protocol.

Third-party projects can integrate via the **SDK (npm package)**, **Gateway API**, or **direct contract calls**.

### Integration Path

| Path | When | Prerequisites |
|------|------|---------------|
| SDK (`@agentxv2/sdk`) | DApp / frontend / Node.js project | React 18+ (optional) · wagmi/viem (optional) |
| Gateway API | Multi-tenant SaaS integration | JWT from EIP-191 wallet signature |
| Contract Direct | Existing Solidity project / backend service | ABI + RPC URL |

---

## Architecture

```
Publisher creates Agent  →  encrypts  →  IPFS  →  registers on-chain (IdentityRegistry)
                                                     │
                                          creates plans (SubscriptionManager)
                                                     │
Subscriber  →  pays (ETH/ERC20)  →  verified  →  fetches encrypted package from IPFS
                                                   │
Subscriber  →  decrypts  →  AgentLoop (ReAct engine)  →  executes skills (local / MCP remote)
                   │
                   ├─ OpenAIProvider (direct, pure frontend mode)
                   │
                   └─ GatewayProvider (SaaS, API key never in browser)
                        └─ Gateway API (EIP-191 auth → JWT → proxy → LLM)
```

---

## Contract Addresses

### Sepolia Testnet (11155111) — 6 Core Contracts

| # | Contract | Address | Purpose |
|---|----------|---------|---------|
| 1 | IdentityRegistry | `0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F` | Agent NFT mint/register, encrypted key storage |
| 2 | SubscriptionManager v3 | `0xC15fE80b9d800abb72121F353a6ae6d6E9077E63` | Subscribe, trials, refunds, platform fees |
| 3 | ReputationRegistry | `0xeb6B410ea71b8d9dA0c96f6A91d35027CE143DC9` | Rating/review storage |
| 4 | A2AProtocolRegistry | `0xEdb0022c250B38e281B3EF1418037889fC5C6092` | Agent-to-Agent task coordination |
| 5 | ConfigurationRegistry | `0x68DcE00e4C9077c94BC68016cD14B09557faEA6c` | On-chain key-value config |
| 6 | MultiEndpointRegistry | `0xEB5e866f186d4B73F97aa0d70B86f2C6e2e21Cb7` | Multi-endpoint routing |

> Verified on Sepolia Blockscout. Source code in `contracts/src/`.
> Note: `PaymentGateway` and `AgentFactory` are **deprecated** — replaced by SubscriptionManager v3 + AgentX402.

### OxaChain L1 (Mainnet, Chain ID 19505) — 6 Core Contracts

| # | Contract | Address |
|---|----------|---------|
| 1 | IdentityRegistry | `0xbf5F9db266c8c97E3334466C88597Eb758AfE212` |
| 2 | SubscriptionManager v3 | `0x019AC9d945467478Dd371CDbD70cb2f325800E6B` |
| 3 | ReputationRegistry | `0x6a18C2664E1b42063860d864b6448b824d7B843F` |
| 4 | A2AProtocolRegistry | `0x61b7E7Eed21F013e35a90FC5de5c352780ec5169` |
| 5 | ConfigurationRegistry | `0x07280674ccc2898Fd038A9e3C22005CA83ffD2F8` |
| 6 | MultiEndpointRegistry | `0xB361d04F49000013FC131D3C59C41c8486C64f8c` |

> Full 6-contract deploy via `DeployOxaChainFull.s.sol`. Deployer: `0x8E869A0624fF9e766Df71b5B08897d00E4d260ba`.

---

## Method 1: SDK Integration

### Installation

```bash
npm install @agentxv2/sdk@0.6.1
```

### Core API

| Module | Method/Class | Description |
|--------|-------------|-------------|
| **AgentRunner** | `useAgent(agentId)` | Decrypt + load full Agent context |
| **AgentLoop** | `run(userMessage, history)` | ReAct engine: Think → Call Tools → Observe → Repeat |
| **ToolExecutor** | `executeBatch(calls)` | Parallel tool execution (Open/MCP/A2A) |
| **buildTools** | `buildTools(skills)` | Convert skills to OpenAI function-calling format |
| **OpenAIProvider** | `chatStream(request)` | Direct LLM (OpenAI/DeepSeek) SSE streaming |
| **GatewayProvider** | `chatStream(request)` | Multi-tenant SaaS proxy via Gateway |
| **createLLMProvider** | `createLLMProvider(config)` | Provider factory |
| SubscriptionManager | `subscribe(planId)` | ETH/ERC20 subscription |
| SubscriptionManager | `hasActiveSubscription(subscriber, agentId)` | Verify subscription |
| SubscriptionManager | `releaseFunds(subId)` / `cancelSubscription(subId)` | Escrow management |
| AgentRegistry | `register(metadata)` | Register agent on-chain |
| A2AProtocol | `createTask(agentId, params)` | Agent-to-Agent task |
| MCPConnector | `callTool(name, args)` | Remote MCP tool execution |
| Crypto | `encryptPayload()` / `decryptPayload()` | AES-256-GCM |
| Crypto | `packForPublish()` | ECIES key wrapping |

---

### Quick Examples

#### AgentLoop — ReAct Autonomous Tool Calling

```typescript
import { AgentRunner, AgentLoop, OpenAIProvider, GatewayProvider } from '@agentxv2/sdk'

const runner = new AgentRunner({ reader, wallet })
const ctx = await runner.useAgent(42)

// Direct LLM mode (API key in browser — dev only)
const provider = new OpenAIProvider({ apiKey: 'sk-...', model: 'gpt-4o' })

// SaaS mode (API key never in browser — Gateway handles it)
const gatewayProvider = new GatewayProvider({
  gatewayUrl: 'https://gateway.agentx.io',
  accessToken: jwt,
  keySource: 'platform',   // Use platform's key pool
})

const loop = new AgentLoop({
  ctx,
  llmProvider: provider,
  maxIterations: 5,
  onTextDelta: (delta) => streamToUI(delta),
  onToolCall: ({ name, arguments: args }) => showToolUI(name, args),
  onToolResult: ({ name, result }) => updateToolUI(name, result),
})

const result = await loop.run('Audit contract 0x1234')
console.log(result.finalText)  // "Found 3 vulnerabilities: ..."
console.log(`Used ${result.totalIterations} iterations, ${result.toolCalls.length} tool calls`)
```

#### React Hook

```tsx
import { useAgentRunner } from '@agentxv2/sdk/react'

function ChatPage({ agentId }: { agentId: number }) {
  const { ctx, isLoading, error } = useAgentRunner({ agentId })

  if (isLoading) return <div>Loading agent...</div>
  if (error) return <div>Error: {error.message}</div>

  return <ChatInterface prompt={ctx!.prompt} skills={ctx!.skills} />
}
```

#### Subscribe (ETH + ERC20)

```typescript
import { SubscriptionManager } from '@agentxv2/sdk'

const mgr = new SubscriptionManager(config)

// ETH subscription
await mgr.subscribe(planId)

// ERC20 — auto-approve + subscribe
await mgr.subscribe(planId, { approveTokenFirst: true })

// Query subscription detail (12 fields)
const detail = await mgr.getSubscriptionDetail(sid)
```

#### Publish an Agent

```typescript
import { generateAesKey, encryptPayload, packAgentForPublish } from '@agentxv2/sdk'

const privatePayload = { prompt: '...', skills: [...], mcp: {} }
const aesKey = generateAesKey()

const encrypted = encryptPayload(privatePayload, aesKey)
const cid = await uploadToIPFS(encrypted.data)
const { aesKeyHex, eciesEncryptedKeyHex } = packAgentForPublish(payload, publicKey, aesKey)

await registry.register({ cid, aesKeyHex, eciesEncryptedKeyHex, ... })
```

---

## Method 2: Gateway API (Multi-Tenant SaaS)

### Authentication

The Gateway uses EIP-191 wallet signature authentication:

```
1. GET /api/v1/auth/challenge?address=0x...
   → { challenge: "agentx:auth:{timestamp}:{nonce}" }

2. Wallet signs: ethers.signMessage(wallet, challenge)

3. POST /api/v1/auth/verify
   { wallet_address, signature, timestamp, nonce }
   → { access_token: "...", expires_in: 86400, tenant: {...} }

4. All subsequent requests: Authorization: Bearer <access_token>
```

### Chat Completions Proxy

```
POST /api/v1/chat/completions
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "model": "gpt-4o",
  "messages": [...],
  "tools": [...],
  "stream": true,
  "key_source": "platform",        // "platform" | "tenant_owned"
  "tenant_key_id": "uuid-xxx"      // required for BYOK mode
}

Response: SSE stream (OpenAI-compatible)
```

### Tenant Management

```
GET    /api/v1/tenant/me                      → tenant info + plan + keys + today's usage
GET    /api/v1/tenant/keys                    → list own API keys
POST   /api/v1/tenant/keys                    → upload BYOK key
       { provider, endpoint, api_key, model, label }
DELETE /api/v1/tenant/keys/:keyId             → revoke key
POST   /api/v1/tenant/keys/:keyId/validate    → test key validity
GET    /api/v1/tenant/usage?days=30           → usage history
GET    /api/v1/models                         → platform + owned models
```

### Rate Limiting

Three-layer rate limiting:
1. **Global IP**: 1000 req/min (express-rate-limit)
2. **Per-tenant RPM**: 5 (Free) / 30 (Pro) / 100 (Enterprise) — Redis sliding window
3. **Per-tenant daily quota**: 0 (Free, BYOK only) / 500K (Pro) / 5M (Enterprise)
4. **Concurrency**: 1 (Free) / 3 (Pro) / 10 (Enterprise) agent loops

429 responses include: `{ error: "...", limit_type: "rpm|daily_quota|concurrency", retry_after: 60 }`

---

## Method 3: Direct Contract Calls (Solidity)

### IdentityRegistry ABI

```solidity
function getAgent(uint256 agentId) external view returns (
    address owner, string metaUri, bytes data,
    bool active, bool locked, uint256 createdAt
);

function getAgentsByOwner(address owner) external view returns (uint256[] memory);
```

### SubscriptionManager v3 ABI

#### Read

```solidity
function hasActiveSubscription(address subscriber, uint256 agentId) external view returns (bool);
function getSubscriptionDetail(uint256 subscriptionId) external view returns (
    uint256 subscriptionId, address subscriber, uint256 agentId,
    uint8 status, uint256 startedAt, uint256 expiresAt, string period,
    address payToken, uint256 amountPaid,
    bool trialActive, uint256 trialEndsAt, bool fundsReleased
);
function getPlan(uint256 planId) external view returns (...);
function platformFeeBps() external view returns (uint256);
function tokenWhitelist(address token) external view returns (bool);
function getUserSubscriptions(address user) external view returns (uint256[] memory);
```

#### Write

```solidity
function createPlan(uint256 agentId, uint256 price, string period, address payToken, uint256 trialDays) external returns (uint256 planId);
function subscribe(uint256 planId) external payable returns (uint256 subscriptionId);
function releaseFunds(uint256 subscriptionId) external;
function cancelSubscription(uint256 subscriptionId) external;
```

---

## AgentLoop — ReAct Engine Integration

```typescript
import { AgentLoop, AgentRunner, OpenAIProvider } from '@agentxv2/sdk'

const runner = new AgentRunner({ reader, wallet })
const ctx = await runner.useAgent(42)

const loop = new AgentLoop({
  ctx,
  llmProvider: new OpenAIProvider({ apiKey: 'sk-...', model: 'gpt-4o' }),
  maxIterations: 5,
  onTextDelta: (delta) => { /* streaming text */ },
  onToolCall: (call) => { /* tool started */ },
  onToolResult: (result) => { /* tool finished */ },
  onComplete: (result) => { /* loop done */ },
})

// With chat history
const history = [
  { role: 'user', content: 'What can you do?' },
  { role: 'assistant', content: 'I can audit contracts, deploy, and more.' },
]

const result = await loop.run('Check 0x1234 for vulnerabilities', history)
// result = { finalText, toolCalls[], totalIterations, totalDuration, usage }
```

---

## Encryption Pipeline

```
Publisher:
  1. Agent private content → AES-256-GCM encrypt
  2. Encrypted package → upload to IPFS → get CID
  3. AES key → store on-chain as NFT metadata
  4. Register Agent via IdentityRegistry

Subscriber:
  1. Verify on-chain subscription (SubscriptionManager)
  2. Fetch encrypted package from IPFS
  3. Read aes_key_hex from on-chain NFT attributes
  4. Decrypt → { prompt, skills, mcp }
  5. AgentLoop: LLM autonomously calls skills via execute()
```

### Closed Skill (MCP Remote) with AgentLoop

```
AgentLoop Loop N:
  LLM decides → skill.execute({ ... })
    → SDK signs: ECDSA(toolName + timestamp)
    → POST JSON-RPC tools/call
      Headers: X-Subscriber-Address, X-Signature, X-Timestamp
    → Publisher MCP Server:
        1. Verify ECDSA signature
        2. Check on-chain subscription
        3. Execute tool
    → Return result to LLM

AgentLoop Loop N+1:
  LLM sees result → decides next action or outputs final answer
```

---

## Agent Composition (A2A Skills)

```typescript
// Publishers define A2A skills in encrypted payload:
const skill: SkillDef = {
  name: "solidity_audit",
  description: "Delegate to Auditing Agent #42",
  execution: {
    type: "a2a",
    targetAgentId: 42,
    skillFilter: ["slither", "forge_test"],
  },
}

// When AgentLoop calls it:
const result = await a2aSkill.execute({ task: "audit ERC20", severity: "all" })
// result = { agentId: 42, prompt: "...", skills: [...], callerInput: {...} }
// LLM now has sub-Agent's full context and can use its tools
```

---

## Subscription State Machine

| State | Value | Meaning | Actions Available |
|-------|-------|---------|-------------------|
| Inactive | 0 | Non-existent | — |
| Active | 1 | Valid subscription | `releaseFunds()` · `cancelSubscription()` |
| Expired | 2 | Auto-marked on expiry | Re-subscribe |
| Cancelled | 3 | Manually cancelled | Re-subscribe |

---

## RPC Endpoints

| Network | Chain ID | RPC URL |
|---------|----------|---------|
| Sepolia (Testnet) | 11155111 | `https://ethereum-sepolia-rpc.publicnode.com` |
| OxaChain L1 (Mainnet) | 19505 | `http://43.156.99.215:18545` |

## Production Gateway

| Endpoint | Description |
|----------|-------------|
| `http://43.156.225.164:3090/api/v1/health` | Health check |
| `http://43.156.225.164:3090/api/v1/auth/challenge` | Wallet auth challenge |
| `http://43.156.225.164:3090/api/v1/chat/completions` | LLM proxy (SSE) |
| `http://43.156.225.164:3090/api/v1/tenant/me` | Tenant info |
| `http://43.156.225.164:3090/api/v1/tenant/usage` | Usage history |

---

## Repository

- **GitHub**: [github.com/sftgroup/Agentx](https://github.com/sftgroup/Agentx)
- **SDK**: `agentx/sdk/` · npm: `@agentxv2/sdk@0.6.2`
- **Contracts**: `agentx/contracts/`
- **Frontend**: `agentx/frontend/` (production: `http://43.156.225.164:3000`)
- **Gateway**: `agentx/gateway/` (Express, PostgreSQL) — production health: `http://43.156.225.164:3090/api/v1/health`

---

## FAQ

**Q: What's the difference between AgentLoop and direct skill.execute()?**
A: Direct `skill.execute()` requires your code to determine WHICH skill to call. AgentLoop lets the LLM autonomously decide when and which tools to use — essential for complex multi-step tasks like "audit this contract and fix all issues."

**Q: How does the Gateway protect API keys?**
A: API keys are stored AES-256-GCM encrypted in PostgreSQL. The Gateway decrypts in-memory, injects into the LLM request header, and proxies the response. The key never leaves the server. Tenants authenticate via EIP-191 wallet signature.

**Q: Can I use both Platform Key and BYOK?**
A: Yes. A single tenant can have platform quota (from subscription) and multiple personal API keys. The Chat UI shows both in the model selector.

**Q: Does the SDK require React?**
A: Core modules (AgentRunner, AgentLoop, providers, subscription, crypto) are pure TypeScript. Only `@agentxv2/sdk/react` requires React + wagmi.

**Q: What if hasActiveSubscription returns false but getSubscriptionDetail shows active?**
A: `hasActiveSubscription` takes `(subscriber, agentId)` while `getSubscriptionDetail` takes `(subscriptionId)`. Make sure you're using the correct subscription ID.
