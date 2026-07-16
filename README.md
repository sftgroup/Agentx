# AgentX — Decentralized AI Agent Platform

> SDK v0.6.2 · Contracts on Sepolia + OxaChain L1 · Production: `http://43.156.225.164:3000`

AgentX is a decentralized AI Agent platform that enables publishers to create, encrypt, and distribute AI Agents on-chain, while subscribers can purchase and run them with autonomous ReAct AgentLoop inference — all secured by E2E encryption and on-chain subscription gating.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   43.156.225.164 (Production)            │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ Next.js FE  │  │ Express GW   │  │  PostgreSQL 16 │  │
│  │   :3000     │  │   :3090      │  │    :5432       │  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
└──────────────────────────────────────────────────────────┘

Smart Contracts (dual-chain):
  Sepolia (11155111)                       OxaChain L1 (19505)
  ├─ IdentityRegistry                      ├─ IdentityRegistry
  ├─ SubscriptionManager v3                ├─ SubscriptionManager v3
  ├─ A2AProtocolRegistry v2 🆕             ├─ A2AProtocolRegistry v2 🆕
  ├─ ReputationRegistry                    ├─ ReputationRegistry
  ├─ ConfigurationRegistry                 ├─ ConfigurationRegistry
  └─ MultiEndpointRegistry                 └─ MultiEndpointRegistry
```

## Quick Start

```bash
npm install @agentxv2/sdk@0.6.2
```

```typescript
import { AgentLoop, AgentRunner, OpenAIProvider } from '@agentxv2/sdk'

const runner = new AgentRunner({ reader, wallet })
const ctx = await runner.useAgent(42)

const loop = new AgentLoop({
  ctx,
  llmProvider: new OpenAIProvider({ apiKey: 'sk-...', model: 'gpt-4o' }),
  maxIterations: 5,
  onTextDelta: (delta) => console.log(delta),
})

await loop.run('Audit this contract for vulnerabilities')
```

## Key Features

| Feature | Description |
|---------|-------------|
| **ReAct AgentLoop** | Autonomous Think→Tools→Observe→Repeat execution |
| **E2E Encryption** | AES-256-GCM + ECIES for agent distribution |
| **On-Chain Subscriptions** | Multi-currency (ETH/ERC20), escrow trial, auto-expiry |
| **Gateway SaaS** | Multi-tenant LLM proxy with EIP-191 wallet auth |
| **Dual-Mode LLM** | Platform quota + BYOK transparent proxy |
| **MCP Remote Tools** | Publisher-hosted tools with ECDSA auth |
| **A2A Protocol** | Agent-to-Agent task delegation |
| **Dual-Chain** | Sepolia (testnet) + OxaChain L1 (mainnet) |

## Production URLs

| Service | URL |
|---------|-----|
| **Frontend** | `http://43.156.225.164:3000` |
| **Gateway Health** | `http://43.156.225.164:3090/api/v1/health` |
| **SDK (npm)** | `npm install @agentxv2/sdk@0.6.2` |

## Documentation

| Doc | Content |
|-----|---------|
| [INTEGRATION.md](./INTEGRATION.md) | SDK / Gateway / Contract integration guide |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Full production deployment guide |
| [MCP_SETUP.md](./MCP_SETUP.md) | MCP remote tool server setup |
| [PROGRESS.md](./memory/AGENTX_PROGRESS.md) | Development progress tracker |
| [CONTRACTS.md](./contracts/CONTRACTS.md) | Smart contract addresses + ABIs |
| [SDK README](./sdk/README.md) | SDK API reference |

## Smart Contracts

| # | Contract | Sepolia | OxaChain L1 |
|---|----------|---------|-------------|
| 1 | IdentityRegistry | `0xe94a...96e5F` | `0xbf5F...E212` |
| 2 | SubscriptionManager v3 | `0xC15f...7E63` | `0x019A...0E6B` |
| 3 | A2AProtocolRegistry v2 | `0x309C...7e9cB` 🆕 | `0xDF29...112B` 🆕 |
| 4 | ReputationRegistry | `0xeb6B...3DC9` | `0x6a18...843F` |
| 5 | ConfigurationRegistry | `0x68Dc...EA6c` | `0x0728...D2F8` |
| 6 | MultiEndpointRegistry | `0xEB5e...1Cb7` | `0xB361...4f8c` |

## License

MIT — [sftgroup/Agentx](https://github.com/sftgroup/Agentx)
