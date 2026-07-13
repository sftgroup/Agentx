# @agentxv2/sdk v0.2.0

**Decentralized AI Agent Platform SDK** — E2E encryption, on-chain subscriptions, MCP tool execution.

```
Agent = Prompt + Skills[] + MCP
```

## Installation

```bash
npm install @agentxv2/sdk
# or
pnpm add @agentxv2/sdk
```

### Peer Dependencies

| Package | Version | Required |
|---------|---------|----------|
| `react` | ^18 or ^19 | yes |
| `wagmi` | ^2.0 | optional (React hooks only) |
| `@tanstack/react-query` | ^5.0 | optional (React hooks only) |
| `viem` | ^2.0 | optional (chain reader only) |

## Quick Start

### 1. Use an Agent (End-to-End Encrypted)

```ts
import { AgentRunner } from '@agentxv2/sdk'
import type { OnChainReader, WalletSigner } from '@agentxv2/sdk'

// Implement these interfaces with your viem/wagmi setup
const reader: OnChainReader = { /* ... */ }
const wallet: WalletSigner = { /* ... */ }

const runner = new AgentRunner({ reader, wallet })
const ctx = await runner.useAgent(42)

// Inject into your LLM:
// ctx.prompt     → system prompt
// ctx.skills     → tools with execute() method
// ctx.mcp        → MCP server connection info
```

### 2. React Hook (with wagmi)

```tsx
import { useAgentRunner } from '@agentxv2/sdk/react'

function ChatPage({ agentId }: { agentId: number }) {
  const { ctx, isLoading, error, refetch } = useAgentRunner({ agentId })

  if (isLoading) return <div>Loading agent...</div>
  if (error) return <div>Error: {error.message}</div>

  // ctx.prompt → inject as LLM system prompt
  // ctx.skills → call skill.execute({ ... }) for tool invocations
  return <ChatInterface prompt={ctx!.prompt} skills={ctx!.skills} />
}
```

### 3. Publish an Agent

```ts
import { generateAesKey, encryptPayload, packAgentForPublish } from '@agentxv2/sdk'

const privatePayload = { prompt: '...', skills: [...], mcp: { type: 'http', url: '' } }

// AES-256-GCM encrypt
const aesKey = generateAesKey()
const encrypted = encryptPayload(privatePayload, aesKey)

// Pack for on-chain registration
const packResult = packAgentForPublish(agentPayload, publicKey, aesKey)
// → packResult.aesKeyHex, packResult.eciesEncryptedKeyHex

// Upload encrypted.data to IPFS, store aesKeyHex as NFT metadata on-chain
```

## Architecture

```
┌────────────────────────────────────────────────────┐
│                    @agentxv2/sdk                      │
├──────────┬──────────┬──────────┬──────────────────┤
│  Core    │  Agent   │  MCP     │  React           │
│ crypto   │ Runner   │ Connector│  useAgentRunner  │
│ types    │ useAgent │ callTool │                  │
├──────────┼──────────┼──────────┼──────────────────┤
│ Registry │ Subscrip │ A2A      │ Reputation       │
│ register │ subscribe│ protocol │ giveFeedback     │
│ query    │ verify   │          │                  │
└──────────┴──────────┴──────────┴──────────────────┘
```

## API Reference

### `@agentxv2/sdk` (Core)

| Export | Description |
|--------|-------------|
| `AgentRunner` | Main entry: decrypts + loads Agent context |
| `packForPublish` / `encryptPayload` / `decryptPayload` | AES-256-GCM encrypt/decrypt |
| `generateAesKey` / `generateKeyPair` | Key generation |
| `eciesEncrypt` / `eciesDecrypt` / `unpackAgent` | ECIES key wrapping |
| `MCPConnector` | MCP tool discovery + execution |
| `IPFSFetcher` | Fetch encrypted payloads from IPFS |
| `AgentRegistry` | Register and query agents on-chain |
| `SubscriptionManager` | Subscribe (ETH/ERC20), verify, cancel, trial refund, releaseFunds |
| `AgentX402` | Auto-subscription gate + X402 payment bridge |
| `A2AProtocol` | Agent-to-Agent task protocol |

### Agent Composition (A2A Skills)

An Agent's Skill can delegate to **another Agent**. Set `execution.type = "a2a"`:

```typescript
{
  name: "solidity_audit",
  description: "Delegate to Auditing Agent #42",
  execution: {
    type: "a2a",
    targetAgentId: 42,           // On-chain Agent ID
    skillFilter: ["slither"],    // Optional: restrict exposed skills
  },
}
```

When executed, the SDK loads Agent #42's prompt + skills, decrypts them,
and returns the full sub-Agent context to the calling LLM.
| `ReputationRegistry` | Give feedback + query reputation |

### `@agentxv2/sdk/react`

| Export | Description |
|--------|-------------|
| `useAgentRunner({ agentId })` | React hook: load + decrypt Agent |

### `@agentxv2/sdk/core`

| Export | Description |
|--------|-------------|
| All types: `AgentPayload`, `SkillDef`, `McpConnection`, `PricingInfo`, `AgentRunContext`, etc. | |
| All crypto: `encryptPayload`, `decryptPayload`, `generateAesKey`, `eciesEncrypt`, `eciesDecrypt` | |

## Encryption Pipeline

```
Publisher creates Agent
  │
  ├─ AgentPrivatePayload { prompt, skills, mcp }
  ├─ encryptPayload() → AES-256-GCM ciphertext
  ├─ Upload ciphertext to IPFS → get CID
  ├─ aesKey → stored as on-chain NFT metadata (aes_key_hex)
  └─ Mint Agent NFT via IdentityRegistry

Subscriber uses Agent
  │
  ├─ Verify on-chain subscription (SubscriptionManager)
  ├─ Fetch encrypted payload from IPFS (CID from NFT metadata)
  ├─ Read aes_key_hex from on-chain NFT attributes
  ├─ decryptPayload() → { prompt, skills, mcp }
  └─ skills[n].execute() → Open (local) or MCP (remote with signed auth)
```

## Closed Skill Execution (MCP Remote)

Skills with `execution.type === 'mcp'` execute on the publisher's server:

```
Client                          Publisher MCP Server
  │                                    │
  ├─ ECDSA sign(toolName + timestamp)  │
  ├─ POST { X-Subscriber-Address,      │
  │         X-Signature,               │
  │         X-Timestamp }             │
  │         + JSON-RPC tools/call      │
  │                                    ├─ Verify signature
  │                                    ├─ Check on-chain subscription
  │                                    ├─ Execute skill
  │◄── Return result ──────────────────┤
```

## Supported Chains

| Network | Chain ID | RPC | Status |
|---------|----------|-----|--------|
| Sepolia (Testnet) | 11155111 | `https://ethereum-sepolia-rpc.publicnode.com` | Active |
| **OxaChain L1** | **19505** | `http://43.156.99.215:18545` | **Mainnet** |

Auto-detected via `KNOWN_CHAINS[chainId]`. Pass `chainId` in AgentX constructor or use the default.

## On-Chain Contracts

| Contract | Sepolia | OxaChain L1 |
|----------|---------|-------------|
| IdentityRegistry | `0xe94a...96e5F` | `0x0292...3902` |
| SubscriptionManager v3 | `0xC15f...7E63` | `0x37BA...E249` |

## License

MIT
