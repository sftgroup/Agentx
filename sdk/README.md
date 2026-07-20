# @agentxv2/sdk v0.6.4

**Decentralized AI Agent Platform SDK** — E2E encryption, on-chain subscriptions, ReAct AgentLoop, multi-tenant LLM providers.

```
Agent = Prompt + Skills[] + MCP
```

## Installation

```bash
npm install @agentxv2/sdk
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
  gatewayUrl: 'http://43.156.99.215:3090',
  accessToken: 'jwt...',
  keySource: 'platform',
})

const loop = new AgentLoop({
  ctx,
  llmProvider: provider,
  maxIterations: 5,
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

### 3. Publish an Agent (v0.6.4 — IPFSUploader + publishAgent pipeline)

```ts
import { IPFSUploader, publishAgent } from '@agentxv2/sdk'

// 1. Configure IPFS uploader (Pinata or custom endpoint)
const uploader = new IPFSUploader({ pinataJwt: 'eyJ...' })

// 2. One-shot: encrypt + upload both private payload & public metadata
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
  publicKey: '0x04abc...',  // creator's secp256k1 public key
  uploader,
})

// result = {
//   aesKeyHex, eciesEncryptedKeyHex,     // for on-chain metadata
//   encryptedCid, encryptedUrl,          // private payload on IPFS
//   publicCid, publicUrl,                // public metadata on IPFS
//   pack: { encryptedCid, publicCid, aesKeyHex, eciesEncryptedKeyHex },
// }

// 3. Mint Agent NFT on-chain with the CIDs
await registry.register(
  `ipfs://${result.publicCid}`,
  [
    { key: 'encryptedPayloadCid', value: result.encryptedCid },
    { key: 'eciesEncryptedKey', value: result.eciesEncryptedKeyHex },
  ]
)
```

### 4. IPFS Uploader (standalone)

```ts
import { IPFSUploader } from '@agentxv2/sdk/ipfs'
// or: import { IPFSUploader } from '@agentxv2/sdk'

const uploader = new IPFSUploader({
  pinataJwt: 'eyJ...',          // Pinata JWT token
  // customEndpoint: 'https://my-ipfs.example.com/api/v0/add',  // alternative
  // customApiKey: '...',       // for non-Pinata endpoints
  gatewayUrl: 'https://ipfs.io', // default
  namePrefix: 'agentx-',         // prefix for Pinata names
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

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     @agentxv2/sdk                         │
├──────────┬──────────┬──────────┬───────────────────────┤
│  Core    │  Agent   │ AgentLoop│  React                │
│ crypto   │ Runner   │ executor │  useAgentRunner       │
│ types    │ useAgent │ loop     │                       │
├──────────┼──────────┼──────────┼───────────────────────┤
│ Registry │ Subscrip │ A2A      │ Reputation            │
│ register │ subscribe│ protocol │ giveFeedback          │
│ query    │ verify   │          │                       │
├──────────┼──────────┼──────────┼───────────────────────┤
│ MCP      │ Config   │ Endpoint │ Configuration         │
│ Connector│ Chains   │ MultiEP  │ KV Store              │
│ LLM      │ Gateway  │ Factory  │ OpenAI Provider       │
└──────────┴──────────┴──────────┴───────────────────────┘
```

## API Reference

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
| `AgentX402` | subscription | Auto-subscription gate + X402 payment |
| `A2AProtocol` | a2a | Agent-to-Agent task delegation |
| `ReputationRegistry` | reputation | Feedback + reputation queries |
| `ConfigurationRegistry` | configuration | On-chain KV configuration |
| `MultiEndpointClient` | endpoint | Multi-endpoint routing |
| `IPFSUploader` | ipfs | Upload to IPFS via Pinata or custom endpoint |
| `publishAgent` | core | Full encrypt + IPFS upload + pack pipeline |
| `KNOWN_CHAINS` | config | Pre-configured chain configs |

### Sub-path Imports

| Path | Description |
|------|-------------|
| `@agentxv2/sdk` | All modules (main entry) |
| `@agentxv2/sdk/core` | Types, crypto (AES-256-GCM + ECIES) |
| `@agentxv2/sdk/react` | `useAgentRunner` React hook |
| `@agentxv2/sdk/agent-loop` | AgentLoop, executor, tool builder |
| `@agentxv2/sdk/llm` | OpenAIProvider, GatewayProvider, factory |
| `@agentxv2/sdk/endpoint` | MultiEndpointClient |
| `@agentxv2/sdk/configuration` | ConfigurationClient |
| `@agentxv2/sdk/ipfs` | IPFSUploader (Pinata + custom endpoint upload) |

---

## Encryption Pipeline

```
Publisher creates Agent:
  AgentPrivatePayload → AES-256-GCM encrypt → IPFS (CID)
  AES key → on-chain NFT metadata
  Mint Agent NFT via IdentityRegistry

Subscriber uses Agent:
  Verify subscription (SubscriptionManager)
  Fetch encrypted payload from IPFS
  Read aes_key_hex from on-chain NFT
  Decrypt → { prompt, skills, mcp }
  skills[n].execute() → Open (local) or MCP (remote with ECDSA auth)
```

---

## Supported Chains

| Network | Chain ID | RPC | Gas Token |
|---------|----------|-----|-----------|
| **OxaChain L1** | **19505** | `http://43.156.99.215:18545` | T0x |
| Sepolia (Testnet) | 11155111 | `https://ethereum-sepolia-rpc.publicnode.com` | ETH |

Auto-detected via `KNOWN_CHAINS[chainId]`.

---

## On-Chain Contracts

### OxaChain L1 (Mainnet)

| Contract | Address |
|----------|---------|
| IdentityRegistry | `0xbf5F9db266c8c97E3334466C88597Eb758AfE212` |
| SubscriptionManager v3 | `0x019AC9d945467478Dd371CDbD70cb2f325800E6B` |
| A2AProtocolRegistry v2 | `0xDF2939EFafEe6439eB2226DbEd07AD6F5Ae2112B` |
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

## Version History

| Version | Date | Highlights |
|---------|------|-----------|
| **0.6.4** | 2026-07-20 | IPFSUploader (Pinata + custom endpoint), publishAgent pipeline, IPFS platform tools |
| **0.6.3** | 2026-07-19 | Production deploy, wallet auto-switch to OxaChain L1, MCP dual-chain fixes |
| 0.6.1 | 2026-07-15 | AgentLoop ReAct, OpenAIProvider, GatewayProvider, ToolExecutor |
| 0.5.4 | 2026-07-14 | MultiEndpointClient, ConfigurationClient, OxaChain L1 dual-chain |
| 0.2.0 | 2026-07-13 | AgentRunner, SubscriptionManager v3, A2A Protocol, MCP Connector |

## License

MIT
