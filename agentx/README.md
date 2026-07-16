# AgentX — Decentralized AI Agent Protocol

> Last updated: 2026-07-14 03:53 (25/25 P0-P3 done, SDK v0.5.4, dual-chain 18/19 PASS, P3 #22 chain switch complete)

```
Agent = Prompt + Skills[] + MCP（可选）
```

**AgentX lets you publish, monetize, and run AI Agents as on-chain, encrypted assets — with no backend, no platform lock-in, and no trust required.**

---

## What Problem Does This Solve?

| Problem | AgentX Solution |
|---------|-----------------|
| AI Agent monetization | On-chain subscription (ETH/ERC20) with escrow trials + platform fees |
| Code/IP protection | AES-256-GCM + ECIES dual encryption — payload is ciphertext on IPFS |
| Agent-to-Agent calling | A2A Protocol — audit → deploy → monitor, every step on-chain |
| Proprietary tool execution | MCP remote execution — subscribers run, creator's code never leaves their server |
| Centralized platform risk | 100% on-chain access control — no platform can de-platform your Agent |

---

## Project Structure

```
agentx/
│
├── README.md              ← 👈 you are here
├── PROPOSAL.md            ← Original project proposal
├── FRONTEND_PRD.md        ← Frontend PRD (product requirements)
├── INTEGRATION.md         ← Third-party integration guide (SDK + contracts)
├── DEPLOYMENT.md          ← Deployment workflow (Git MCP + Build MCP + SSH)
│
├── contracts/             ← Solidity smart contracts (Foundry)
│   ├── CONTRACTS.md       ← Contract reference (dual-chain addresses, deploy scripts)
│   ├── src/
│   │   ├── IdentityRegistry.sol      ← Agent NFT mint, encrypted key storage
│   │   ├── SubscriptionManager.sol   ← v3: subscribe (ETH/ERC20), trial, platform fees
│   │   ├── erc8004-core/             ← ERC-8004 base contracts (16 .sol)
│   │   ├── erc8004-extensions/       ← Extensions (some deprecated)
│   │   └── erc8004-interfaces/       ← Shared interfaces
│   ├── script/
│   │   ├── Deploy.s.sol              ← Sepolia single-contract deploy
│   │   ├── DeployOxaChain.s.sol      ← OxaChain L1 single-contract deploy
│   │   └── DeployOxaChainFull.s.sol  ← Full 6-contract dependency-aware deploy
│   ├── test/
│   │   └── AgentX.t.sol              ← 20 unit tests
│   └── foundry.toml
│
├── sdk/                   ← @agentxv2/sdk (npm package)
│   ├── README.md          ← SDK-specific docs (API reference, quickstart)
│   ├── src/
│   │   ├── index.ts               ← Main entry: re-exports all 11 modules
│   │   ├── core/                  ← crypto.ts (AES+GCM+ECIES) + types.ts
│   │   ├── agent/                 ← agent-runner.ts (AgentRunner)
│   │   ├── registry/              ← agent-registry.ts + ipfs-fetcher.ts
│   │   ├── subscription/          ← subscription.ts + agent-x402.ts
│   │   ├── a2a/                   ← a2a.ts (A2AProtocol)
│   │   ├── mcp/                   ← connector.ts (MCPConnector)
│   │   ├── reputation/            ← reputation.ts (ReputationRegistry)
│   │   ├── config/                ← config.ts (KNOWN_CHAINS, ChainConfig)
│   │   ├── endpoint/              ← multi-endpoint.ts (MultiEndpointClient)
│   │   ├── configuration/         ← configuration.ts (ConfigurationClient)
│   │   └── react/                 ← useAgentRunner.ts (React hook)
│   ├── dist/              ← Build output: CJS + ESM + DTS
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/              ← Next.js App (React + wagmi + WalletConnect)
│   ├── app/                       ← Next.js App Router pages
│   │   ├── page.tsx              ← Landing (marketing)
│   │   ├── layout.tsx            ← Root layout (WagmiProvider + ErrorBoundary)
│   │   ├── marketplace/          ← /marketplace + /marketplace/agent/[id]
│   │   ├── studio/               ← /studio (4-step wizard: basics/skills/encrypt/publish)
│   │   ├── user/                 ← /user/dashboard, /user/agents, /user/subscriptions, /user/chat/[agentId]
│   │   ├── a2a/                  ← /a2a (Agent-to-Agent tasks)
│   │   └── api/                  ← API routes (ipfs/upload-json)
│   ├── components/
│   │   ├── agent/dashboard/      ← AgentDashboard, AgentRegistration, RevenueDisplay, etc.
│   │   ├── aimarket/             ← AgentCard, AgentList, SearchFilters
│   │   ├── guard/                ← SubscriptionGuard (subscription gate component)
│   │   ├── layout/               ← AppLayout, Header, Sidebar, MobileNav
│   │   ├── providers/            ← WagmiProvider
│   │   ├── studio/               ← StepIndicator, StepNav, StudioContext, EncryptProgress
│   │   └── wallet/               ← WalletConnect, WalletStatus, NetworkSwitcher
│   ├── hooks/
│   │   ├── user/                 ← useUserSubscriptions, etc.
│   │   ├── sdk/                  ← SDK integration hooks
│   │   └── aimarket/             ← Marketplace hooks
│   ├── lib/
│   │   ├── wagmi/config.ts       ← Wagmi chain config (Sepolia + OxaChain L1)
│   │   └── ipfs/                 ← IPFS upload helpers
│   ├── .env.production           ← Dual-chain env vars (6 contracts each)
│   ├── next.config.js
│   └── package.json
│
└── test-reports/          ← Test output
    ├── REAL_WORLD_TEST_PLAN.md
    ├── REAL_WORLD_TEST_REPORT.md
    ├── SECURITY_REVIEW_REPORT.md
    └── QA_REVIEW_REPORT.md
```

---

## Code Stats

| Component | Files | Language | Key Tool |
|-----------|:-----:|----------|----------|
| Contracts | 25 .sol | Solidity 0.8.20-0.8.24 | Foundry / Forge |
| SDK | 26 .ts | TypeScript 5.x | tsup (CJS+ESM) |
| Frontend | 44 .tsx | React 18, Next.js 14 | Wagmi + WalletConnect |

---

## Architecture Diagram

```
                        ┌─────────────────────────────┐
                        │     AgentX Frontend          │
                        │  Next.js 14 + wagmi 2.x      │
                        │  8 pages, 25 components      │
                        └──────┬──────────┬────────────┘
                               │          │
              ┌────────────────▼──┐  ┌────▼──────────────────┐
              │   @agentxv2/sdk    │  │  wagmi / WalletConnect │
              │   11 modules       │  │  Sepolia + OxaChain L1  │
              │   E2E encryption   │  │  chain auto-detection   │
              └────────┬──────────┘  └─────────────────────────┘
                       │
        ┌──────────────┼──────────────┬──────────────┬──────────────┐
        ▼              ▼              ▼              ▼              ▼
   IdentityReg   SubscriptionMgr  ReputationReg  ConfigReg    EndpointReg
        │              │              │              │              │
   ─ ─ ─┼──────────────┼──────────────┼──────────────┼──────────────┼─
        │              │              │              │              │
   Sepolia           Sepolia        Sepolia        Sepolia       Sepolia
  (11155111)        (11155111)     (11155111)     (11155111)    (11155111)
        │              │              │              │              │
   OxaChain L1       OxaChain L1    OxaChain L1    OxaChain L1   OxaChain L1
    (19505)          (19505)        (19505)        (19505)       (19505)
        │              │              │              │              │
   ─ ─ ─┼──────────────┼──────────────┼──────────────┼──────────────┼─
        │              │              │              │              │
   A2AProtocolReg  + IPFS (metadata)  + MCP servers (remote tools)
```

---

## Contract Addresses (Dual-Chain)

| # | Contract | Sepolia (11155111) | OxaChain L1 (19505) |
|---|----------|--------|--------|
| 1 | IdentityRegistry | `0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F` | `0xbf5F9db266c8c97E3334466C88597Eb758AfE212` |
| 2 | SubscriptionManager v3 | `0xC15fE80b9d800abb72121F353a6ae6d6E9077E63` | `0x019AC9d945467478Dd371CDbD70cb2f325800E6B` |
| 3 | ReputationRegistry | `0xeb6B410ea71b8d9dA0c96f6A91d35027CE143DC9` | `0x6a18C2664E1b42063860d864b6448b824d7B843F` |
| 4 | A2AProtocolRegistry | `0xEdb0022c250B38e281B3EF1418037889fC5C6092` | `0x61b7E7Eed21F013e35a90FC5de5c352780ec5169` |
| 5 | ConfigurationRegistry | `0x68DcE00e4C9077c94BC68016cD14B09557faEA6c` | `0x07280674ccc2898Fd038A9e3C22005CA83ffD2F8` |
| 6 | MultiEndpointRegistry | `0xEB5e866f186d4B73F97aa0d70B86f2C6e2e21Cb7` | `0xB361d04F49000013FC131D3C59C41c8486C64f8c` |

**OxaChain L1**: Chain ID 19505, Clique PoA, gas token T0x
- RPC: `http://43.156.99.215:18545`
- Explorer: `http://43.156.99.215:18400`
- Deployer: `0x8E869A0624fF9e766Df71b5B08897d00E4d260ba`

---

## SDK API Reference

| Module | Sub-Path | Primary Class/Function | Description |
|--------|----------|----------------------|-------------|
| **Core** | `@agentxv2/sdk` | `encryptPayload`, `decryptPayload` | AES-256-GCM encryption |
| | | `generateKeyPair`, `eciesEncrypt`, `eciesDecrypt` | ECIES key wrapping (secp256k1) |
| | | `packForPublish`, `unpackAgent` | Full encrypt + pack flow |
| **Agent** | `.` | `AgentRunner` | Main entry: decrypt Agent context from chain |
| **Registry** | `.` | `AgentRegistry` | Register/query Agent NFTs on IdentityRegistry |
| | | `IPFSFetcher` | Fetch encrypted payloads from IPFS |
| **Subscription** | `.` | `SubscriptionManager` | Subscribe (ETH/ERC20), verify, cancel, trial refund, releaseFunds |
| | | `AgentX402` | Auto-subscription gate + X402 payment bridge |
| **A2A** | `.` | `A2AProtocol` | Agent-to-Agent task create/complete/query |
| **MCP** | `.` | `MCPConnector` | Discover + call MCP tools on remote servers |
| **Reputation** | `.` | `ReputationRegistry` | Give feedback + query agent ratings |
| **Config** | `.` | `KNOWN_CHAINS` | Chain config (RPC, contracts, chain IDs) |
| **Endpoint** | `.` | `MultiEndpointClient` | getActiveEndpoints, pickBestEndpoint |
| **Configuration** | `.` | `ConfigurationClient` | get, getAll, getKeys, exists (chain KV) |
| **React** | `@agentxv2/sdk/react` | `useAgentRunner` | React hook for loading + decrypting an Agent |

### Usage Patterns

```typescript
// 1. Subscribe to an Agent
const sm = new SubscriptionManager({ reader, wallet })
const tx = await sm.subscribe(agentId, planId)
const isActive = await sm.hasActiveSubscription(agentId, subscriberAddr)

// 2. Load and run an Agent
const runner = new AgentRunner({ reader, wallet })
const ctx = await runner.useAgent(agentId)
// → ctx.prompt (inject into LLM), ctx.skills[n].execute(), ctx.mcp

// 3. Publish an Agent
const { aesKeyHex, encrypted } = await packForPublish(payload, publicKey)
// upload encrypted.data → IPFS
// register via AgentRegistry → aesKeyHex stored on-chain

// 4. Agent-to-Agent delegation
const a2a = new A2AProtocol({ reader, wallet })
const taskId = await a2a.createTask({ fromAgentId, toAgentId, skillName, input })

// 5. Auto-subscription gate (X402)
const x402 = new AgentX402({ reader, wallet })
const receipt = await x402.requestAccess(agentId, subscriberAddr)
```

---

## MCP Integration

AgentX uses MCP (Model Context Protocol) for remote skill execution:

```
User's LLM
   │
   ├─ AgentRunner.useAgent(42) → decrypts payload
   │   └─ skills: [{ name: "audit", execution: { type: "mcp", url: "..." } }]
   │
   ├─ MCPConnector.callTool(agentId, "audit", { code: "..." })
   │   ├─ ECDSA sign(toolName + timestamp)
   │   ├─ POST → Publisher's MCP Server
   │   │   ├─ Verify signature (subscriber address)
   │   │   ├─ Check on-chain subscription (SubscriptionManager)
   │   │   ├─ Execute tool
   │   │   └─ Return result
   │   └─ → LLM receives result
```

### MCP Server Setup (for Agent Publishers)

Your MCP server must verify incoming requests:

1. Extract `X-Subscriber-Address`, `X-Signature`, `X-Timestamp` from headers
2. Recover signer from signature → verify it matches `X-Subscriber-Address`
3. Call `SubscriptionManager.hasActiveSubscription(agentId, subscriberAddress)` on-chain
4. If active → execute tool → return result
5. If not active → return 402 Payment Required

---

## Encryption Pipeline (Detailed)

```
┌─────────────────────────────────────────────────────────────┐
│                    PUBLISHER                                  │
│                                                              │
│  AgentPayload { prompt, skills, mcp }                        │
│       │                                                      │
│       ▼                                                      │
│  AES-256-GCM keygen → aesKey (32 bytes random)               │
│       │                                                      │
│       ▼                                                      │
│  encryptPayload(payload, aesKey) → { iv, ciphertext, tag }   │
│       │                                                      │
│       ▼                                                      │
│  Upload to IPFS → CID (content-addressed)                    │
│       │                                                      │
│       ▼                                                      │
│  eciesEncrypt(aesKey, subscriberPublicKey) → encryptedKey    │
│       │                                                      │
│       ▼                                                      │
│  IdentityRegistry.registerWithMetadata(CID, aesKey, pubKey)  │
│       → Agent NFT minted                                     │
│       → aesKey stored as NFT metadata attribute              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     SUBSCRIBER                               │
│                                                              │
│  SubscriptionManager.subscribe(agentId) → pay ETH/ERC20     │
│       │                                                      │
│       ▼                                                      │
│  IdentityRegistry.getAgent(agentId) → { metaUri, aesKey }    │
│       │                                                      │
│       ▼                                                      │
│  IPFSFetcher.fetch(CID) → encrypted payload                  │
│       │                                                      │
│       ▼                                                      │
│  eciesDecrypt(aesKey, subscriberPrivateKey) → rawAesKey      │
│       │                                                      │
│       ▼                                                      │
│  decryptPayload(ciphertext, rawAesKey) → AgentPayload        │
│       │                                                      │
│       ▼                                                      │
│  { prompt, skills, mcp } → inject into LLM                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Chain Configuration

| Network | Chain ID | RPC | Type | Explorer |
|---------|----------|-----|------|----------|
| **Sepolia** | 11155111 | `https://ethereum-sepolia-rpc.publicnode.com` | PoS Testnet | [Blockscout](https://eth-sepolia.blockscout.com) |
| **OxaChain L1** | 19505 | `http://43.156.99.215:18545` | Clique PoA Mainnet | [Explorer](http://43.156.99.215:18400) |

SDK auto-detects chain via `KNOWN_CHAINS[chainId]` in `sdk/src/config/config.ts`.

---

## SubscriptionManager v3 Key Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| `platformFeeBps` | 250 (2.5%) | Platform fee on subscription revenue |
| `trialDays` | 7 days (configurable) | Funds in escrow during trial |
| `cancelDuringTrial` | 100% refund | Full refund if cancelled during trial |
| `releaseFunds` | Auto/manual | Funds released to creator after trial |
| ReentrancyGuard | ✅ | OpenZeppelin `nonReentrant` on all state-changing methods |

---

## Deprecated / Archived Components

| Component | Reason | Location |
|-----------|--------|----------|
| PaymentGateway | Replaced by SM v3 + AgentX402 | `contracts/src/erc8004-extensions/` |
| AgentFactory | IR direct registration instead | `contracts/src/erc8004-extensions/` |
| AgentWallet | No per-agent wallet requirement | `contracts/src/erc8004-extensions/` |
| TokenPriceOracle | No multi-currency conversion | `contracts/src/erc8004-extensions/` |
| ValidationRegistry | No on-chain validation needed | `contracts/src/erc8004-extensions/` |
| BaseReputationRegistry | Abstract contract | `contracts/src/erc8004-core/` |
| `frontend/src/vendor/` | Old vendor copies, replaced by npm `@agentxv2/sdk` | `frontend/src/vendor/` |

---

## Links

| Resource | URL |
|----------|-----|
| **Main Repository** | https://github.com/sftgroup/Agentx |
| **Backup Repository** | https://github.com/sftgroup/erc8004 |
| **npm Package** | https://www.npmjs.com/package/@agentxv2/sdk |
| **Test Server** | http://43.156.78.59:8080 |
| **Integration Guide** | [INTEGRATION.md](INTEGRATION.md) |
| **Contract Reference** | [contracts/CONTRACTS.md](contracts/CONTRACTS.md) |
| **Deployment Guide** | [DEPLOYMENT.md](DEPLOYMENT.md) |
| **SDK README** | [sdk/README.md](sdk/README.md) |
| **Test Report** | [test-reports/REAL_WORLD_TEST_REPORT.md](test-reports/REAL_WORLD_TEST_REPORT.md) |
| **Progress Tracker** | [memory/AGENTX_PROGRESS.md](../memory/AGENTX_PROGRESS.md) |

---

## Version

| Component | Version | Date |
|-----------|---------|------|
| IdentityRegistry | v1 (ERC-8004) | 2026-07-13 |
| SubscriptionManager | v3 (ReentrancyGuard) | 2026-07-13 |
| SDK | 0.5.4 | 2026-07-14 |
| Frontend | — | 2026-07-14 |
| OxaChain L1 Deploy | Full 6-contract | 2026-07-14 |
| Sepolia Deploy | Full 6-contract | 2026-07-13 |

---

## License

MIT
