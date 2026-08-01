# AgentX MCP Server

> v0.7.0 · Platform: `POST /mcp` (29 tools) · Agent Export: `POST /mcp/agent/:id` · Standard MCP JSON-RPC 2.0

---

## Overview

AgentX exposes its entire platform (6 smart contracts + Gateway API) as a standard **MCP (Model Context Protocol) Server**. Any MCP-compatible client — Claude Desktop, Cursor, VS Code, custom agents — can directly read on-chain data and interact with AgentX contracts through 29 built-in tools.

```
Claude Desktop / Cursor / Any MCP Client
         │                    ▲
         │ JSON-RPC 2.0       │ over HTTP POST
         ▼                    │
┌─────────────────────────────────────┐
│ AgentX Gateway (:3090)              │
│ ┌───────────────────────────────┐   │
│ │ POST /mcp                     │   │
│ │   tools/list    → 29 tools    │   │
│ │   tools/call    → execute     │   │
│ │   initialize    → handshake   │   │
│ └───────────────────────────────┘   │
│             │                       │
│             ▼                       │
│ ethers.JsonRpcProvider              │
│ ├─ Sepolia RPC                      │
│ └─ OxaChain L1 RPC                  │
│ 6 Smart Contracts (read + write)    │
└─────────────────────────────────────┘
```

---

## Quick Start

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agentx": {
      "url": "http://43.156.99.215:3090/mcp"
    }
  }
}
```

Restart Claude Desktop. AgentX tools appear automatically.

### Cursor / VS Code

In Cursor Settings → MCP → Add new MCP Server:

```
Name: agentx
Type: HTTP
URL:  http://43.156.99.215:3090/mcp
```

### curl (Manual Test)

```bash
# List all tools
curl -s -X POST http://43.156.99.215:3090/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Call a tool (read-only)
curl -s -X POST http://43.156.99.215:3090/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"agentx_reputation_get","arguments":{"agentId":1}}}'

# Health check
curl -s -X POST http://43.156.99.215:3090/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"agentx_gateway_health","arguments":{}}}'
```

---

## All 29 Tools

### IdentityRegistry (5)

| Tool | Type | Description |
|------|------|-------------|
| `agentx_identity_list` | READ | List agent IDs owned by a wallet |
| `agentx_identity_get` | READ | Get agent tokenURI + metadata |
| `agentx_identity_exists` | READ | Check if agent ID exists |
| `agentx_identity_total_count` | READ | Total agents registered |
| `agentx_identity_register` | WRITE | Register a new agent (returns tx payload) |

### SubscriptionManager (8)

| Tool | Type | Description |
|------|------|-------------|
| `agentx_subscription_plans` | READ | Get plan details (price, period, trial) |
| `agentx_subscription_check` | READ | Check active subscription |
| `agentx_subscription_detail` | READ | Full subscription detail |
| `agentx_subscription_my_list` | READ | User's subscription IDs |
| `agentx_subscription_subscribe` | WRITE | Subscribe to plan |
| `agentx_subscription_cancel` | WRITE | Cancel subscription |
| `agentx_subscription_release` | WRITE | Release escrow funds |
| `agentx_subscription_fee` | READ | Platform fee in bps |

### A2AProtocol (5)

| Tool | Type | Description |
|------|------|-------------|
| `agentx_a2a_create_task` | WRITE | Create A2A delegation task |
| `agentx_a2a_get_task` | READ | Get task details |
| `agentx_a2a_complete_task` | WRITE | Complete task with output |
| `agentx_a2a_my_tasks` | READ | User's task IDs |
| `agentx_a2a_agent_card` | READ | Agent card (name, capabilities) |

### ReputationRegistry (3)

| Tool | Type | Description |
|------|------|-------------|
| `agentx_reputation_rate` | WRITE | Rate agent (1-5) |
| `agentx_reputation_get` | READ | Average rating + count |
| `agentx_reputation_reviews` | READ | All reviews with details |

### ConfigurationRegistry (3)

| Tool | Type | Description |
|------|------|-------------|
| `agentx_config_get` | READ | Get single config value |
| `agentx_config_list` | READ | All configs for agent |
| `agentx_config_set` | WRITE | Set config value |

### MultiEndpointRegistry (3)

| Tool | Type | Description |
|------|------|-------------|
| `agentx_endpoint_list` | READ | All endpoints for agent |
| `agentx_endpoint_active` | READ | Active endpoints only |
| `agentx_endpoint_best_mcp` | READ | Best MCP URL for agent |

### Gateway API (2)

| Tool | Type | Description |
|------|------|-------------|
| `agentx_gateway_tenant` | READ | Tenant profile + quota |
| `agentx_gateway_health` | READ | Server health + chain info |

> **READ** tools execute immediately and return JSON data.  
> **WRITE** tools return a transaction payload that the MCP client must sign and submit on-chain.

---

## Agent-as-MCP Export (v0.7.0)

Any AgentX agent can be exported as its own MCP server at `POST /mcp/agent/:id`. The agent's skills become MCP tools:

```bash
# List tools for Agent #42
curl -s -X POST http://localhost:3090/mcp/agent/42 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Call a tool exposed by Agent #42
curl -s -X POST http://localhost:3090/mcp/agent/42 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"audit","arguments":{"code":"..."}}}'
```

**Method** | **Description**
`tools/list` | Returns agent's skills as MCP tool definitions
`tools/call` | Executes the skill directly (no LLM re-decision)
`initialize` | MCP handshake

**Direct skill execution (v0.7.0):** `tools/call` executes the skill's own executor instead of sending it through the AgentLoop again. How a skill executes depends on its `execution` config:

| `execution.type` | Behavior |
|---|---|
| `mcp` | POST JSON-RPC `tools/call` to `execution.endpoint` |
| `http` | POST arguments to `execution.endpoint` |
| *(none)* | Error — open skills have no remote executor |

```json
{
  "name": "audit",
  "description": "Proprietary smart contract audit",
  "execution": {
    "type": "mcp",
    "endpoint": "https://my-private-mcp.example.com/mcp",
    "toolName": "audit"
  },
  "inputSchema": {
    "type": "object",
    "properties": { "contractCode": { "type": "string" } }
  }
}
```

**Backend flow:** Gateway reads skill `execution` config → POSTs directly to the skill's endpoint → returns result.

This allows any AgentX agent to serve as a drop-in MCP server for Claude Desktop, Cursor, or custom MCP clients.

**Claude Desktop config for Agent #42:**
```json
{
  "mcpServers": {
    "agentx-agent-42": {
      "url": "http://43.159.60.46:3090/mcp/agent/42"
    }
  }
}
```

---

## Example Conversations

### Claude Desktop Example

```
User: How many agents are registered on AgentX?
Claude: [calls agentx_identity_total_count]
        There are currently 12 agents registered.

User: What's Agent #3's reputation?
Claude: [calls agentx_reputation_get with agentId=3]
        Agent #3 has a 4.7/5 rating from 23 reviews.

User: Check if 0xAbC... has a subscription to Agent #5
Claude: [calls agentx_subscription_check]
        Yes, 0xAbC... has an active subscription to Agent #5.
```

### MCP Client Integration (TypeScript)

```typescript
// Any MCP client can use the standard JSON-RPC 2.0 protocol
const res = await fetch('http://43.156.99.215:3090/mcp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'agentx_subscription_check',
      arguments: {
        subscriberAddress: '0x...',
        agentId: 42,
      },
    },
  }),
})
const { result } = await res.json()
// result.content[0].text = JSON of on-chain data
```

### Using the SDK's MCPConnector

```typescript
import { MCPConnector } from '@agentxv2/sdk'

const mcp = new MCPConnector({
  transport: 'http',
  url: 'http://43.156.99.215:3090/mcp',
})

// List all 29 platform tools
const tools = await mcp.listTools()

// Query on-chain data
const health = await mcp.callTool('agentx_gateway_health', {})
const agents = await mcp.callTool('agentx_identity_list', {
  ownerAddress: '0x...',
  chain: 'oxachain',
})
```

---

## Dual-Chain Support

| Chain | Chain ID | Flag | RPC URL |
|-------|----------|------|---------|
| Sepolia (Testnet) | 11155111 | (default) | `https://ethereum-sepolia-rpc.publicnode.com` |
| **OxaChain L1** | **19505** | `"chain": "oxachain"` | `https://rpc-oxa.0xainet.top` |

Pass `"chain": "oxachain"` in tool arguments to query OxaChain L1. Default is Sepolia.

```json
// List agents on OxaChain L1
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "agentx_identity_list",
    "arguments": { "ownerAddress": "0x...", "chain": "oxachain" }
  }
}
```

---

## Smart Contract Addresses

| Contract | Sepolia | OxaChain L1 |
|----------|---------|-------------|
| IdentityRegistry | `0xe94a...96e5F` | `0xbf5F...E212` |
| SubscriptionManager | `0xC15f...7E63` | `0x019A...0E6B` |
| A2AProtocolRegistry | `0x309C...7e9cB` | `0x7F42...Eb86` |
| ReputationRegistry | `0xeb6B...3DC9` | `0x6a18...843F` |
| ConfigurationRegistry | `0x68Dc...EA6c` | `0x0728...D2F8` |
| MultiEndpointRegistry | `0xEB5e...1Cb7` | `0xB361...4f8c` |

Full addresses are available in [contracts/CONTRACTS.md](./contracts/CONTRACTS.md).

---

## Publisher MCP Servers (Closed Skills)

This is separate from the AgentX Platform MCP Server. Publishers who want to host proprietary tools (e.g. proprietary audit logic) should deploy their own MCP server and define it as a "closed skill" in the agent payload.

### Setup

```typescript
import { encryptPayload, generateAesKey } from '@agentxv2/sdk/core'

// Define your agent with a closed skill pointing to your MCP server
const agent = {
  prompt: 'You are a proprietary audit agent...',
  skills: [{
    name: 'audit',
    description: 'Proprietary smart contract audit',
    version: '1.0',
    execution: 'mcp',
    mcp: {
      transport: 'http',
      url: 'https://my-private-mcp.example.com/mcp',
      authType: 'ecdsa',  // ECDSA signature-based auth
    },
    inputSchema: {
      type: 'object',
      properties: {
        contractCode: { type: 'string', description: 'Solidity source code' },
      },
      required: ['contractCode'],
    },
  }],
}

// Encrypt and publish on-chain (subscribers see only encrypted payload)
const aesKey = generateAesKey()
const encrypted = await encryptPayload(agent, '0x04...')
```

### Subscriber-Side Usage

When a subscriber runs your agent via `@agentxv2/sdk`:

1. AgentRunner fetches encrypted payload from IPFS
2. Reads ECIES-wrapped AES key from on-chain NFT metadata
3. Decrypts to get `{ prompt, skills, mcp }`
4. When the agent tries to call your `audit` tool, `MCPConnector` is invoked:
   - Signs the request with subscriber's secp256k1 key (ECDSA auth)
   - Your server verifies the signature against the subscriber's wallet address
   - If valid, executes the proprietary logic
   - Returns result (subscriber never sees your source code)

---

## Authentication

### Gateway JWT Auth

The AgentX MCP server does not require authentication for read-only tools. For write tools, the MCP client must provide a valid JWT token obtained via the Gateway's EIP-191 wallet signature flow:

```bash
# 1. Get challenge
curl http://43.156.99.215:3090/api/v1/auth/challenge?address=0x...

# 2. Sign the challenge with your wallet
# 3. Verify and get JWT
curl -X POST http://43.156.99.215:3090/api/v1/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"wallet_address":"0x...","signature":"0x...","timestamp":...,"nonce":"..."}'

# 4. Use JWT in MCP requests
curl -X POST http://43.156.99.215:3090/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",...}'
```

> Note: The Gateway uses Redis-backed challenge storage (v0.1.1+) for PM2 cluster compatibility.

---

## Deployment

The MCP server is built into the Gateway. Install and run:

```bash
npm install @agentxv2/gateway@0.1.2

# Configure 26 environment variables (see gateway/.env.example)
cp gateway/.env.example .env
# Edit .env with your values

# Build and start
cd gateway
npm run build
npx pm2 start ecosystem.config.js
```

The MCP endpoint is available at `http://localhost:3090/mcp`.
