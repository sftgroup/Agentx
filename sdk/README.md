# @agentxv2/sdk v0.6.1

**Decentralized AI Agent Platform SDK** — E2E encryption, on-chain subscriptions, ReAct AgentLoop, multi-tenant LLM providers.

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
  gatewayUrl: 'https://gateway.agentx.io',
  accessToken: 'jwt...',
  keySource: 'platform', // or 'tenant_owned' for BYOK
})

const loop = new AgentLoop({
  ctx,
  llmProvider: provider,
  maxIterations: 5,
  onTextDelta: (delta) => appendAssistantMessage(delta),
  onToolCall: ({ name, arguments: args }) => showToolBubble(name, args),
  onToolResult: ({ name, result }) => updateToolBubble(name, result),
})

const result = await loop.run('Analyze this contract for vulnerabilities')
// AgentLoop automatically: thinks → calls slither_audit → gets results → summarizes
```

### 2. React Hook (with wagmi)

```tsx
import { useAgentRunner } from '@agentxv2/sdk/react'

function ChatPage({ agentId }: { agentId: number }) {
  const { ctx, isLoading, error, refetch } = useAgentRunner({ agentId })

  if (isLoading) return <div>Loading agent...</div>
  if (error) return <div>Error: {error.message}</div>

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

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     @agentxv2/sdk                         │
├──────────┬──────────┬──────────┬───────────────────────┤
│  Core    │  Agent   │  AgentLoop│  React                │
│ crypto   │ Runner   │ ToolExec  │  useAgentRunner       │
│ types    │ useAgent │ LLM Prov  │                       │
│          │          │ GatewayPr │                       │
├──────────┼──────────┼──────────┼───────────────────────┤
│ Registry │ Subscrip │ A2A      │ Reputation            │
│ register │ subscribe│ protocol │ giveFeedback          │
│ query    │ verify   │          │                       │
├──────────┼──────────┼──────────┼───────────────────────┤
│ MCP      │ Config   │ Endpoint │ Configuration         │
│ Connector│ Chains   │ MultiEP  │                       │
└──────────┴──────────┴──────────┴───────────────────────┘
```

## API Reference

### `@agentxv2/sdk` (Main Entry)

| Export | Description |
|--------|-------------|
| `AgentRunner` | Decrypt + load Agent context from chain |
| `AgentLoop` | ReAct agent loop engine: Think → Call Tools → Observe → Repeat |
| `ToolExecutor` | Dispatch tool calls to Open/MCP/A2A skills |
| `buildTools` | Convert `RunnableSkill[]` → OpenAI function-calling format |
| `OpenAIProvider` | Direct LLM provider (OpenAI/DeepSeek/compat) with SSE streaming |
| `GatewayProvider` | Multi-tenant SaaS LLM provider via AgentX Gateway (API key never in browser) |
| `createLLMProvider` | Provider factory: auto-select OpenAI or Gateway based on config |
| `MCPConnector` | MCP tool discovery + remote execution |
| `IPFSFetcher` | Fetch encrypted payloads from IPFS |
| `AgentRegistry` | Register and query agents on-chain |
| `SubscriptionManager` | Subscribe (ETH/ERC20), verify, cancel, trial refund, releaseFunds |
| `AgentX402` | Auto-subscription gate + X402 payment bridge |
| `A2AProtocol` | Agent-to-Agent task protocol |
| `ReputationRegistry` | Give feedback + query reputation |
| `ConfigurationRegistry` | On-chain KV configuration |
| `KNOWN_CHAINS` | Pre-configured chain configs (Sepolia + OxaChain L1) |

### Sub-path Imports

| Path | Description |
|------|-------------|
| `@agentxv2/sdk` | All modules (main entry) |
| `@agentxv2/sdk/core` | Types, AES-256-GCM + ECIES crypto |
| `@agentxv2/sdk/react` | `useAgentRunner` React hook |
| `@agentxv2/sdk/agent-loop` | `AgentLoop`, `ToolExecutor`, `buildTools` |
| `@agentxv2/sdk/llm` | `OpenAIProvider`, `GatewayProvider`, `createLLMProvider` |

---

## AgentLoop — ReAct Autonomous Agent Engine

`AgentLoop` enables LLMs to autonomously think, call tools, observe results, and iterate — without manual keyword matching.

```
User: "Audit contract 0x1234"

AgentLoop Loop 1:
  LLM thinks → calls slither_audit({ contract: "0x1234" })
  ToolExecutor executes (MCP remote) → result: { vulnerabilities: [...] }

AgentLoop Loop 2:
  LLM thinks → result looks clean, no more tools needed
  LLM outputs: "Found 3 issues: reentrancy in transfer(), overflow in calc(), ..."

Done. (2 iterations)
```

### Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `maxIterations` | 5 | Max tool-calling rounds |
| `timeoutMs` | 120000 | Total loop timeout |
| `onTextDelta` | — | Streaming text callback |
| `onToolCall` | — | Tool invocation callback |
| `onToolResult` | — | Tool result callback |
| `onThinking` | — | Reasoning state callback |
| `onComplete` | — | Loop completion callback |
| `onError` | — | Error callback |

---

## LLM Providers — Dual-Mode AI Access

### Mode 1: Platform Key (SaaS multi-tenant)

```ts
import { GatewayProvider } from '@agentxv2/sdk'

const provider = new GatewayProvider({
  gatewayUrl: 'https://gateway.agentx.io',
  accessToken: jwtToken,
  keySource: 'platform',   // Use platform's API key pool
  model: 'gpt-4o',
})

// API key never appears in browser — Gateway handles injection
loop.run('Hello', [])
```

### Mode 2: BYOK (Bring Your Own Key)

```ts
const provider = new GatewayProvider({
  gatewayUrl: 'https://gateway.agentx.io',
  accessToken: jwtToken,
  keySource: 'tenant_owned', // Use tenant's own API key
  tenantKeyId: 'uuid-xxx',   // Which of tenant's keys to use
})

// Or use direct OpenAI provider (pure frontend mode, no Gateway)
const provider = new OpenAIProvider({ apiKey: 'sk-...', model: 'gpt-4o' })
```

---

## Agent Composition (A2A Skills)

An Agent's Skill can delegate to **another Agent**. Set `execution.type = "a2a"`:

```typescript
{
  name: "solidity_audit",
  description: "Delegate to Auditing Agent #42",
  execution: {
    type: "a2a",
    targetAgentId: 42,
    skillFilter: ["slither"],
  },
}
```

When executed, the SDK loads Agent #42's prompt + skills, decrypts them, and returns the full sub-Agent context to the calling LLM.

---

## Encryption Pipeline

```
Publisher creates Agent
  │
  ├─ AgentPrivatePayload { prompt, skills, mcp }
  ├─ encryptPayload() → AES-256-GCM ciphertext
  ├─ Upload ciphertext to IPFS → get CID
  ├─ aesKey → stored as on-chain NFT metadata
  └─ Mint Agent NFT via IdentityRegistry

Subscriber uses Agent
  │
  ├─ Verify on-chain subscription (SubscriptionManager)
  ├─ Fetch encrypted payload from IPFS (CID from NFT metadata)
  ├─ Read aes_key_hex from on-chain NFT attributes
  ├─ decryptPayload() → { prompt, skills, mcp }
  └─ skills[n].execute() → Open (local) or MCP (remote with signed auth)
```

---

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

---

## Supported Chains

| Network | Chain ID | RPC | Status |
|---------|----------|-----|--------|
| Sepolia (Testnet) | 11155111 | `https://ethereum-sepolia-rpc.publicnode.com` | Active |
| **OxaChain L1** | **19505** | `http://43.156.99.215:18545` | **Mainnet** |

Auto-detected via `KNOWN_CHAINS[chainId]`.

---

## On-Chain Contracts

| Contract | Sepolia | OxaChain L1 |
|----------|---------|-------------|
| IdentityRegistry | `0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F` | `0xbf5F9db266c8c97E3334466C88597Eb758AfE212` |
| SubscriptionManager v3 | `0xC15fE80b9d800abb72121F353a6ae6d6E9077E63` | `0x019AC9d945467478Dd371CDbD70cb2f325800E6B` |
| ReputationRegistry | `0xeb6B410ea71b8d9dA0c96f6A91d35027CE143DC9` | `0x6a18C2664E1b42063860d864b6448b824d7B843F` |
| A2AProtocolRegistry | `0xEdb0022c250B38e281B3EF1418037889fC5C6092` | `0x61b7E7Eed21F013e35a90FC5de5c352780ec5169` |
| ConfigurationRegistry | `0x68DcE00e4C9077c94BC68016cD14B09557faEA6c` | `0x07280674ccc2898Fd038A9e3C22005CA83ffD2F8` |
| MultiEndpointRegistry | `0xEB5e866f186d4B73F97aa0d70B86f2C6e2e21Cb7` | `0xB361d04F49000013FC131D3C59C41c8486C64f8c` |

---

## Version History

| Version | Date | Highlights |
|---------|------|-----------|
| **0.6.1** | 2026-07-15 | AgentLoop ReAct engine, OpenAIProvider, GatewayProvider (dual-mode), ToolExecutor, buildTools. Fixed paymentGateway cleanup. |
| 0.5.4 | 2026-07-14 | MultiEndpointClient, ConfigurationClient, OxaChain L1 dual-chain, SDK flat entries |
| 0.2.0 | 2026-07-13 | AgentRunner, SubscriptionManager v3, A2A Protocol, MCP Connector |

## License

MIT
