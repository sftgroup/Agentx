# AgentX MCP Server Setup

> MCP (Model Context Protocol) Remote Tool Execution for AgentX Agents

---

## Overview

MCP servers allow Agent publishers to host specialized tools on their own infrastructure. When an AgentLoop calls a "closed" skill, the SDK routes execution to the publisher's MCP server, which verifies the subscriber's on-chain subscription before executing.

```
                     ECDSA-signed request
Subscriber AgentLoop ──────────────────→ Publisher MCP Server
                                         │
                                         1. Verify ECDSA signature
                                         2. Check on-chain subscription
                                         3. Execute tool (local code)
                                         4. Return result
                     ◄──────────────────
```

---

## Architecture

| Component | Location | Auth |
|-----------|----------|------|
| **MCP Server** | Publisher's server | Validates subscriber signature + on-chain sub |
| **MCP Client** | Inside AgentX SDK `Skill.execute()` | Signs requests with subscriber ECDSA key |
| **Subscription Check** | SubscriptionManager v3 on-chain | `hasActiveSubscription(subscriber, agentId)` |

---

## Quick Start (Publisher)

### 1. Install MCP SDK

```bash
npm install @modelcontextprotocol/sdk express
```

### 2. Create Server

```typescript
// mcp-server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import express from 'express'
import { ethers } from 'ethers'

const server = new McpServer({
  name: 'agentx-tool-server',
  version: '1.0.0',
})

// Define a tool
server.tool('solidity_audit', {
  contractAddress: 'string',
  severity: 'enum(low,medium,high)'
}, async ({ contractAddress, severity }) => {
  // Your audit logic here
  const result = await runSlither(contractAddress, severity)
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }]
  }
})

// Verify subscriber signature + subscription
async function verifySubscriber(
  subscriberAddress: string,
  signature: string,
  timestamp: number,
  agentId: number,
) {
  // 1. Verify ECDSA
  const message = `agentx:mcp:call:${timestamp}`
  const recovered = ethers.verifyMessage(message, signature)
  if (recovered.toLowerCase() !== subscriberAddress.toLowerCase()) {
    throw new Error('Invalid signature')
  }
  
  // 2. Check on-chain subscription
  const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com')
  const sm = new ethers.Contract(
    '0xC15fE80b9d800abb72121F353a6ae6d6E9077E63',
    ['function hasActiveSubscription(address,uint256) view returns (bool)'],
    provider
  )
  const active = await sm.hasActiveSubscription(subscriberAddress, agentId)
  if (!active) throw new Error('No active subscription')
  
  return true
}

// Express wrapper with auth middleware
const app = express()
app.use(express.json())

app.post('/tools/call', async (req, res) => {
  try {
    const { toolName, args, agentId } = req.body
    const subscriber = req.headers['x-subscriber-address'] as string
    const signature = req.headers['x-signature'] as string
    const timestamp = parseInt(req.headers['x-timestamp'] as string)
    
    await verifySubscriber(subscriber, signature, timestamp, agentId)
    
    // Execute tool
    const result = await server.execute(toolName, args)
    res.json({ success: true, result })
  } catch (e: any) {
    res.status(403).json({ error: e.message })
  }
})

app.listen(4190, () => console.log('MCP Server on :4190'))
```

### 3. Define in Agent Skill

```typescript
// In Agent encrypted payload:
const skills: SkillDef[] = [
  {
    name: 'solidity_audit',
    description: 'Run Slither-based smart contract audit',
    execution: {
      type: 'mcp_remote',
      endpoint: 'https://publisher-server.example.com:4190/tools/call',
      method: 'solidity_audit',
    },
    inputSchema: {
      contractAddress: { type: 'string' },
      severity: { type: 'enum', values: ['low', 'medium', 'high'] },
    },
  },
]
```

---

## How AgentLoop Calls MCP Tools

```typescript
// Inside SDK — Skill.execute() for closed skills:
async execute(input: Record<string, unknown>) {
  if (this.definition.execution.type === 'mcp_remote') {
    const timestamp = Date.now()
    const message = `agentx:mcp:call:${timestamp}`
    const signature = await this.wallet.signMessage(message)
    
    const res = await fetch(this.definition.execution.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Subscriber-Address': this.wallet.address,
        'X-Signature': signature,
        'X-Timestamp': String(timestamp),
        'X-Agent-Id': String(this.agentId),
      },
      body: JSON.stringify({
        toolName: this.definition.execution.method,
        args: input,
        agentId: this.agentId,
      }),
    })
    
    return res.json()
  }
}
```

---

## Security

| Layer | Mechanism |
|-------|-----------|
| **Auth** | ECDSA signature over `agentx:mcp:call:{timestamp}` |
| **Replay Protection** | Timestamp within 60s window |
| **Authorization** | On-chain `hasActiveSubscription(subscriber, agentId)` check |
| **Rate Limit** | Publisher-configurable per-subscriber RPM |

---

## Testing

```bash
# Start MCP server
npx tsx mcp-server.ts

# Test with curl (requires ECDSA signature)
curl -X POST http://localhost:4190/tools/call \
  -H "Content-Type: application/json" \
  -H "X-Subscriber-Address: 0x..." \
  -H "X-Signature: 0x..." \
  -H "X-Timestamp: 1721000000000" \
  -H "X-Agent-Id: 1" \
  -d '{"toolName":"solidity_audit","args":{"contractAddress":"0x...","severity":"high"},"agentId":1}'
```
