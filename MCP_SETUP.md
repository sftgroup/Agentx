# AgentX MCP Server

> v0.6.4 · Production: `http://43.156.225.164:3090/mcp` · Standard MCP JSON-RPC 2.0

---

## Overview

AgentX exposes its entire platform (7 smart contracts + Gateway API) as a standard **MCP (Model Context Protocol) Server**. Any MCP-compatible client — Claude Desktop, Cursor, VS Code, custom agents — can directly read on-chain data and interact with AgentX contracts through 29 built-in tools.

```
Claude Desktop / Cursor / Any MCP Client
         │
         │  JSON-RPC 2.0 over HTTP POST
         ▼
┌─────────────────────────────────────┐
│  AgentX Gateway (:3090)             │
│  ┌─────────────────────────────┐    │
│  │  POST /mcp                  │    │
│  │    tools/list → 29 tools    │    │
│  │    tools/call → execute     │    │
│  │    initialize   → handshake │    │
│  └─────────────────────────────┘    │
│              │                       │
│              ▼                       │
│  ethers.JsonRpcProvider              │
│  → Sepolia RPC                      │
│  → 6 Smart Contracts (read)         │
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
      "url": "http://43.156.225.164:3090/mcp"
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
URL:  http://43.156.225.164:3090/mcp
```

### curl (Manual Test)

```bash
# List all tools
curl -s -X POST http://43.156.225.164:3090/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Call a tool (read-only)
curl -s -X POST http://43.156.225.164:3090/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"agentx_reputation_get","arguments":{"agentId":1}}}'

# Health check
curl -s -X POST http://43.156.225.164:3090/mcp \
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

### MCP Client Integration

```typescript
// Any MCP client can use the standard JSON-RPC 2.0 protocol
const res = await fetch('http://43.156.225.164:3090/mcp', {
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

---

## Smart Contract Addresses

| Contract | Sepolia | OxaChain L1 |
|----------|---------|-------------|
| IdentityRegistry | `0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F` | `0xbf5F9db266c8c97E3334466C88597Eb758AfE212` |
| SubscriptionManager | `0xC15fE80b9d800abb72121F353a6ae6d6E9077E63` | `0x019AC9d945467478Dd371CDbD70cb2f325800E6B` |
| A2AProtocolRegistry | `0x309C7447d89f3087A9924BB686d88df020F7e9cB` | `0xDF2939EFafEe6439eB2226DbEd07AD6F5Ae2112B` |
| ReputationRegistry | `0xeb6B410ea71b8d9dA0c96f6A91d35027CE143DC9` | `0x6a18C2664E1b42063860d864b6448b824d7B843F` |
| ConfigurationRegistry | `0x68DcE00e4C9077c94BC68016cD14B09557faEA6c` | `0x07280674ccc2898Fd038A9e3C22005CA83ffD2F8` |
| MultiEndpointRegistry | `0xEB5e866f186d4B73F97aa0d70B86f2C6e2e21Cb7` | `0xB361d04F49000013FC131D3C59C41c8486C64f8c` |

| Chain | Chain ID | RPC URL |
|-------|----------|---------|
| Sepolia (Testnet) | 11155111 | `https://ethereum-sepolia-rpc.publicnode.com` |
| OxaChain L1 (Mainnet) | 19505 | `http://43.156.99.215:18545` |

**Using OxaChain L1:** Pass `"chain": "oxachain"` in tool arguments. Default is Sepolia.

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

## Publisher MCP Servers (Closed Skills)

This is separate from the AgentX Platform MCP Server. Publishers who want to host proprietary tools (e.g. proprietary audit logic) should deploy their own MCP server and define it as a "closed skill" in the agent payload. Refer to the SDK's `MCPConnector` class (`sdk/src/mcp/connector.ts`) and `AgentRunner._executeMCPTool()` for the subscriber-side integration.
