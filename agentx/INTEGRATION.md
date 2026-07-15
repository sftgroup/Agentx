# AgentX Integration Guide

> SDK / Contracts / Integration for third-party developers
> Version: v5 · Updated: 2026-07-14 (25/25 tasks done, SDK v0.5.4, P3 #22 chain switch complete)

## Overview

AgentX is a decentralized AI Agent platform providing: E2E encrypted Agent distribution, on-chain subscription gating with multi-currency payments, escrow trial refunds, platform fees, MCP remote tool execution, and A2A task protocol.

Third-party projects can integrate via the **SDK (npm package)** or **direct contract calls**.

### Integration Path

| Path | When | Prerequisites |
|------|------|---------------|
| SDK (`@agentxv2/sdk`) | DApp / frontend / Node.js project | React 18+ (optional) · wagmi/viem (optional) |
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
Subscriber  →  decrypts  →  injects prompt into LLM  →  executes skills (local or MCP remote)
```

---

## Contract Addresses

### Core Platform (6 contracts) — Dual-Chain

| # | Contract | Sepolia | OxaChain L1 | Purpose |
|---|----------|---------|-------------|---------|
| 1 | IdentityRegistry | `0xe94a...96e5F` | `0xbf5F...E212` | Agent NFT mint/register, encrypted key storage |
| 2 | SubscriptionManager v3 | `0xC15f...7E63` | `0x019A...0E6B` | Subscribe, trials, refunds, platform fees |
| 3 | ReputationRegistry | `0xeb6B...3DC9` | `0x6a18...843F` | Rating/review storage |
| 4 | A2AProtocolRegistry | `0xEdb0...6092` | `0x61b7...5169` | Agent-to-Agent task coordination |
| 5 | ConfigurationRegistry | `0x68Dc...EA6c` | `0x0728...D2F8` | On-chain key-value config |
| 6 | MultiEndpointRegistry | `0xEB5e...21Cb7` | `0xB361...f64c` | Multi-endpoint routing |

> Full addresses in SDK `KNOWN_CHAINS[chainId]` or see [CONTRACTS.md](contracts/CONTRACTS.md).

### Chains

| Chain | Chain ID | RPC | Explorer |
|-------|----------|-----|----------|
| Sepolia | 11155111 | `https://ethereum-sepolia-rpc.publicnode.com` | blockscout.com |
| **OxaChain L1** | **19505** | `http://43.156.99.215:18545` | http://43.156.99.215:18400 |

> SDK auto-detects chain via `KNOWN_CHAINS[chainId]`. No manual RPC/contract address config needed.

## Method 1: SDK Integration

### Installation

```bash
npm install @agentxv2/sdk
# or
pnpm add @agentxv2/sdk
```

### Core API

| Module | Method | Description |
|--------|--------|-------------|
| AgentRunner | `useAgent(agentId)` | Decrypt + load full Agent context: `{ prompt, skills, mcp }` |
| SubscriptionManager | `subscribe(planId, opts)` | ETH/ERC20 subscription payment |
| SubscriptionManager | `releaseFunds(subId)` | Release escrowed funds after trial |
| SubscriptionManager | `cancelSubscription(subId)` | Cancel subscription (full refund if in trial) |
| SubscriptionManager | `hasActiveSubscription(subscriber, agentId)` | Verify subscription status |
| SubscriptionManager | `getSubscriptionDetail(subId)` | Full detail with trial/escrow/payToken fields |
| SubscriptionManager | `getPlatformFeeBps()` | Query current platform fee rate |
| SubscriptionManager | `isTokenWhitelisted(token)` | Check ERC20 token whitelist |
| AgentRegistry | `register(metadata)` | Register agent on-chain |
| AgentRegistry | `getById(id)` | Query agent metadata |
| A2AProtocol | `createTask(agentId, params)` | Agent-to-Agent task protocol |
| ReputationRegistry | `giveFeedback(agentId, score, comment)` | Rating & review |
| Crypto (Core) | `encryptPayload()` / `decryptPayload()` | AES-256-GCM encryption |
| Crypto (Core) | `packForPublish()` | ECIES key wrapping for on-chain registration |
| MultiEndpointClient | `getActiveEndpoints(agentId)` | Active endpoint records |
| MultiEndpointClient | `pickBestEndpoint(agentId)` | Best HTTP endpoint for agent |
| ConfigurationClient | `get(agentId, key)` | Agent on-chain config value |
| ConfigurationClient | `getAll(agentId)` | All configs for agent |

### Quick Examples

#### Load and Use an Agent

```typescript
import { AgentRunner } from '@agentxv2/sdk'

const runner = new AgentRunner({ reader, wallet })
const ctx = await runner.useAgent(42)

// ctx.prompt  → inject as LLM system prompt
// ctx.skills  → tool list, each has execute() method
// ctx.mcp     → MCP server connection info
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
const sid = await mgr.subscribe(planId)

// ERC20 — auto-approve + subscribe
await mgr.subscribe(planId, { approveTokenFirst: true })

// Query subscription detail (12 fields)
const detail = await mgr.getSubscriptionDetail(sid)
// detail.trialActive / detail.trialEndsAt / detail.fundsReleased

// Release escrowed funds after trial
await mgr.releaseFunds(sid)
```

#### Publish an Agent

```typescript
import {
  generateAesKey, encryptPayload, packAgentForPublish,
  AgentRegistry, IPFSFetcher
} from '@agentxv2/sdk'

const privatePayload = { prompt: '...', skills: [...], mcp: {} }
const aesKey = generateAesKey()

// Step 1: AES-256-GCM encrypt
const encrypted = encryptPayload(privatePayload, aesKey)

// Step 2: Upload encrypted package to IPFS (requires Pinata JWT)
const cid = await uploadToIPFS(encrypted.data)

// Step 3: Pack for on-chain (ECIES key wrapping)
const { aesKeyHex, eciesEncryptedKeyHex } = packAgentForPublish(
  payload, publicKey, aesKey
)

// Step 4: Register on-chain
const registry = new AgentRegistry(config)
await registry.register({ cid, aesKeyHex, eciesEncryptedKeyHex, ... })
```

#### Auto-Subscribe via AgentX402

AgentX SDK does NOT bundle wallet or X402 — it provides structured
subscription errors that payment layers can react to:

```typescript
import { AgentRunner, AgentX402 } from '@agentxv2/sdk'

try {
  const ctx = await runner.useAgent(42)
} catch (err) {
  if (err.paymentInfo) {
    // err.paymentInfo.agentId  → 42
    // err.paymentInfo.plans[]  → [{planId, price, period, payToken, trialDays}]

    // ── X402 / wallet auto-pay layer ──
    const x402 = new AgentX402({
      subscriptionManagerAddress: SM_ADDRESS,
      publicClient,
      walletClient,
    })

    // 1. Check + load plan info
    await x402.requireSubscription(42, address, {
      planIds: err.paymentInfo.plans?.map(p => p.planId)
    })
    // ↑ this throws if still not subscribed (with plans populated)

    // 2. For ERC20: approve token spend (use X402 SDK or wagmi)
    // await approveERC20(token, SM_ADDRESS, price)

    // 3. Subscribe
    const sid = await x402.subscribeAndWait(planId, price, payToken)

    // 4. Retry
    const ctx = await runner.useAgent(42)
  }
}
```

**Separation of concerns:**

| Layer | Who | What |
|-------|-----|------|
| Wallet | wagmi / MetaMask / Phantom | Sign messages, send transactions |
| Payment | X402 SDK / wagmi useWriteContract | ERC20 approve + transfer |
| AgentX | @agentxv2/sdk | Subscribe gate, decrypt, run agent |

---

## Method 2: Direct Contract Calls (Solidity)

### IdentityRegistry ABI

```solidity
// Check agent exists
function isRegistered(uint256 agentId) external view returns (bool);

// Get full agent info (includes encryption metadata)
function getAgent(uint256 agentId) external view returns (
    address owner, string metaUri, bytes data,
    bool active, bool locked, uint256 createdAt
);

// List agents by owner
function getAgentsByOwner(address owner) external view returns (uint256[] memory);
```

### SubscriptionManager ABI (v2)

#### Read Functions (no wallet signature)

```solidity
// Subscription status (by subscriber + agentId)
function hasActiveSubscription(
    address subscriber, uint256 agentId
) external view returns (bool);

// Full subscription detail — 12 fields
function getSubscriptionDetail(uint256 subscriptionId) external view returns (
    uint256 subscriptionId, address subscriber, uint256 agentId,
    uint8 status,           // 0=Inactive, 1=Active, 2=Expired, 3=Cancelled
    uint256 startedAt, uint256 expiresAt, string period,
    address payToken,       // address(0) = ETH
    uint256 amountPaid,
    bool trialActive,       // refundable during trial
    uint256 trialEndsAt,    // timestamp when trial window closes
    bool fundsReleased      // whether creator has been paid
);

// Query plan details
function getPlan(uint256 planId) external view returns (
    uint256 planId, uint256 agentId, address creator,
    uint256 price, string period, bool active,
    address payToken, uint256 trialDays
);

// Platform fee rate (bps, 0-2000 = 0%-20%)
function platformFeeBps() external view returns (uint256);

// Token whitelist check
function tokenWhitelist(address token) external view returns (bool);

// User's subscriptions
function getUserSubscriptions(address user) external view returns (uint256[] memory);

// Get subscription by subscriber + agentId
function getSubscription(
    address subscriber, uint256 agentId
) external view returns (
    uint256 subscriptionId, address subscriber, uint256 agentId,
    uint8 status, uint256 startedAt, uint256 expiresAt, string period
);
```

#### Write Functions (wallet signature required)

```solidity
// Create pricing plan
function createPlan(
    uint256 agentId,    // Agent ID
    uint256 price,      // Price in wei or token minimum unit
    string period,      // "day" | "week" | "month" | "quarter" | "year"
    address payToken,   // address(0) = ETH, else ERC20 token address
    uint256 trialDays   // Trial days, 0 = no trial
) external returns (uint256 planId);

// Subscribe (payable — ETH value sent automatically)
function subscribe(uint256 planId) external payable returns (uint256 subscriptionId);

// Release escrowed funds to creator after trial
function releaseFunds(uint256 subscriptionId) external;

// Cancel subscription (full refund during trial, pro-rata after)
function cancelSubscription(uint256 subscriptionId) external;
```

#### Events

```solidity
event PlanCreated(uint256 indexed planId, uint256 indexed agentId, uint256 price, string period, address payToken, uint256 trialDays);
event Subscribed(uint256 indexed subscriptionId, address indexed subscriber, uint256 indexed agentId, uint256 expiresAt);
event SubscriptionCancelled(uint256 indexed subscriptionId);
event SubscriptionExpired(uint256 indexed subscriptionId);
event TrialRefunded(uint256 indexed subscriptionId, address indexed subscriber, uint256 amount, address payToken);
event FundsReleased(uint256 indexed subscriptionId, address indexed creator, uint256 amount, address payToken);
event PlatformFeeUpdated(uint256 oldFee, uint256 newFee);
event TokenWhitelistUpdated(address indexed token, bool allowed);
event PlatformFeeCollected(address indexed token, uint256 amount);
```

---

## Encryption Pipeline

```
Publisher:
  1. Agent private content → AES-256-GCM encrypt
  2. Encrypted package → upload to IPFS → get CID
  3. AES key → store on-chain as NFT metadata (aes_key_hex)
  4. Register Agent via IdentityRegistry

Subscriber:
  1. Verify on-chain subscription (SubscriptionManager)
  2. Fetch encrypted package from IPFS (CID from NFT metadata)
  3. Read aes_key_hex from on-chain NFT attributes
  4. Decrypt → { prompt, skills, mcp }
  5. Inject prompt into LLM, execute skills locally

Closed Skill (MCP Remote):
  1. Subscriber signs (toolName + timestamp) with ECDSA
  2. POST JSON-RPC tools/call with headers:
     X-Subscriber-Address, X-Signature, X-Timestamp
  3. Publisher's MCP server verifies:
     - ECDSA signature against publisher's on-chain public key
     - Active subscription on SubscriptionManager
  4. Execute skill → return result
```

---

## Agent Composition (A2A Skills)

AgentX's killer feature: **an Agent's Skill can be another Agent.**

In the encrypted payload, a `SkillDef` can declare `execution.type = "a2a"`,
pointing to another Agent's on-chain token ID.  When the LLM calls that skill,
the SDK:

1. Loads the target Agent via `AgentRunner.useAgent(targetAgentId)`
2. Decrypts the target Agent's prompt + skills (requires subscription)
3. Returns the target Agent's context to the calling LLM
4. The LLM injects the sub-Agent's system prompt and calls its skills

```
┌──────────────┐    execute("a2a", agentId=42)    ┌──────────────┐
│  Trading     │ ─────────────────────────────────▶│  Auditing    │
│  Agent #7    │                                   │  Agent #42   │
│              │◀──── { prompt, skills[] } ────────│              │
│  Skills:     │                                   │  Skills:     │
│  - analyze   │                                   │  - sol_scan  │
│  - audit▶#42 │  ← A2A delegation                 │  - forge_test│
└──────────────┘                                   └──────────────┘
```

### Skill Definition (Publisher side)

```typescript
import type { SkillDef } from '@agentxv2/sdk'

const agentPayload = {
  prompt: "You are a Trading agent...",
  skills: [
    {
      name: "solidity_audit",
      description: "Delegate to Auditing Agent #42 for contract audit",
      version: "1.0.0",
      inputSchema: {
        type: "object",
        properties: {
          task: { type: "string", description: "What to audit" },
          severity: { type: "string", enum: ["critical", "all"] },
        },
        required: ["task"],
      },
      execution: {
        type: "a2a",
        targetAgentId: 42,           // On-chain Agent ID
        skillFilter: ["slither", "forge_test"],  // Optional: restrict skills
        promptOverride: undefined,   // Optional: custom sub-Agent prompt
      },
    } as SkillDef,
  ],
  mcp: { type: "http", url: "https://..." },
}
```

### Execution Flow (Subscriber side)

```typescript
import { AgentRunner } from '@agentxv2/sdk'

const runner = new AgentRunner({ reader, wallet })
const ctx = await runner.useAgent(7) // Trading Agent #7

// Find the A2A skill
const a2aSkill = ctx.skills.find(s => s.mode === 'a2a')

// LLM calls it → SDK loads Agent #42 and returns its context
const result = await a2aSkill.execute({ task: "audit ERC20 token", severity: "all" })
// result = {
//   agentId: 42,
//   prompt: "You are a smart contract auditor...",
//   skills: [{ name: "slither", ... }, { name: "forge_test", ... }],
//   callerInput: { task: "audit ERC20 token", severity: "all" },
// }

// LLM now has Agent #42's full context available as tools
```

### Standard Interface

| Direction | Type | Description |
|-----------|------|-------------|
| Input | `{ task: string, ... }` | Task description + optional params (JSON Schema defined by publisher) |
| Output | `A2ASkillResult` | `{ agentId, prompt, skills[], callerInput }` — sub-Agent context |

### Security

1. **Subscription chain**: Subscriber must hold active subscription to BOTH agents
2. **Encryption**: Target Agent's payload is ECIES+AES decrypted, same pipeline
3. **Skill filter**: Publisher can restrict which sub-Agent skills are exposed
4. **Prompt override**: Optional; sub-Agent's original prompt is used by default

### Use Cases

| Pattern | Example |
|---------|---------|
| Expert delegation | Trading Agent delegates audit to Auditing Agent |
| Pipeline orchestration | Data Agent → Analysis Agent → Report Agent |
| Marketplace economics | Each Agent earns subscription revenue independently |
| Multi-vendor workflows | User subscribes to 3 Agents, LLM orchestrates them |

---

## Subscription State Machine

| State | Value | Meaning | Actions Available |
|-------|-------|---------|-------------------|
| Inactive | 0 | Non-existent or cleaned up | — |
| Active | 1 | Valid subscription | `releaseFunds()` · `cancelSubscription()` |
| Expired | 2 | Auto-marked on expiry | Re-subscribe |
| Cancelled | 3 | Manually cancelled | Re-subscribe |

### Escrow Mechanism

- `trialDays = 0`: Payment goes directly to creator (no escrow)
- `trialDays > 0`: Funds held in contract until `releaseFunds()` is called
  - Cancel during trial → 100% refund (including platform fee)
  - Cancel after trial → pro-rata refund
  - `releaseFunds()` → transfers to creator (minus platform fee)

---

## Platform Fee

- `platformFeeBps`: Deducted from each subscription payment (0-2000 bps = 0%-20%)
- Stored in contract, withdrawable by contract owner via `withdrawPlatformFees(token, to)`
- Adjustable by contract owner via `setPlatformFee(bps)`
- Refunded in full on trial cancellations

---

## RPC Endpoint

| Network | RPC URL |
|---------|---------|
| Sepolia (Testnet) | `https://ethereum-sepolia-rpc.publicnode.com` |
| OxaChain L1 (Mainnet) | `http://43.156.99.215:18545` (Chain ID 19505) |
| zkSync / Polygon / Base | Planned (multi-chain, P3) |

---

## Inline Frontend Hooks (AgentX Platform)

When developing within the AgentX platform, use local hooks directly:

```typescript
import { useSubscription } from '@/components/agent/hooks/useSubscription'

const {
  subscribe,              // ETH subscribe (payable)
  cancelSubscription,     // cancel by subscription ID
  releaseFunds,           // release escrow after trial ends
  hasActiveSubscription,  // verify subscriber + agent ID
  getSubscriptionDetail,  // 12-field detail (trial/escrow/payToken)
  getPlatformFeeBps,      // query current platform fee
  isTokenWhitelisted,     // check ERC20 whitelist
  getUserSubscriptions,   // list all user subscriptions
} = useSubscription()
```

---

## Repository

- **GitHub (Main)**: [github.com/sftgroup/Agentx](https://github.com/sftgroup/Agentx)
- **GitHub (Backup)**: [github.com/sftgroup/erc8004](https://github.com/sftgroup/erc8004)
- **SDK**: `agentx/sdk/` — npm: [`@agentxv2/sdk@0.5.4`](https://www.npmjs.com/package/@agentxv2/sdk)
- **Contracts**: `agentx/contracts/` — Foundry + Solidity 0.8.20-0.8.24
- **Frontend**: `agentx/frontend/` — Next.js 14 + wagmi 2.x
- **Test Server**: http://43.156.78.59:8080
- **Full README**: See [README.md](README.md) for architecture, code structure, and MCP details

---

## FAQ

**Q: How to subscribe with ERC20 tokens?**
A: Before calling `subscribe(planId)`, approve the SubscriptionManager contract address for your token spend. The SDK's `subscribe(planId, { approveTokenFirst: true })` handles this automatically.

**Q: Can I get a refund if I cancel during trial?**
A: Yes — 100% refund including platform fee. After trial expiry, refunds are pro-rata.

**Q: Why is ECDSA signing required for MCP Remote Skills?**
A: Subscription verification happens on the publisher's MCP server. ECDSA signature (against publisher's on-chain public key) + on-chain subscription status check provides dual verification to prevent unauthorized access.

**Q: Does the SDK require React?**
A: Core modules (AgentRunner, SubscriptionManager, crypto) are pure TypeScript with zero React dependency. Only `@agentxv2/sdk/react` requires React ≥18 + wagmi.

**Q: What if hasActiveSubscription returns false but getSubscriptionDetail shows an active subscription?**
A: `hasActiveSubscription` takes `(subscriber, agentId)` while `getSubscriptionDetail` takes `(subscriptionId)`. Make sure you're using the correct subscription ID. Each user can have multiple subscriptions to different agents.
