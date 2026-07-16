// ---------------------------------------------------------------------------
// AgentX Gateway — MCP Server (Model Context Protocol)
// ---------------------------------------------------------------------------
// Standard MCP JSON-RPC 2.0 endpoint. Supports:
//   POST /mcp
//     tools/list  → all 28 AgentX platform tools
//     tools/call  → execute a tool (read on-chain, write returns tx payload)
//
// Compatible with Claude Desktop, Cursor, and any MCP client.
//   Claude Desktop config:
//     { "mcpServers": { "agentx": { "url": "http://43.156.225.164:3090/mcp" } } }
// ---------------------------------------------------------------------------

import { Router, Request, Response } from 'express'
import { ethers } from 'ethers'
import { config } from '../config'

const router = Router()

// ── Minimal ABI Fragments (read-only) ──────────────────────────────────────

const ID_ABI = [
  'function getAgentsByOwner(address owner) view returns (uint256[])',
  'function getCurrentAgentId() view returns (uint256)',
  'function agentExists(uint256 agentId) view returns (bool)',
  'function tokenURI(uint256 tokenId) view returns (string)',
]

const SUB_ABI = [
  'function getPlan(uint256 planId) view returns (uint256,uint256,address,uint256,string,bool,address,uint256)',
  'function hasActiveSubscription(address subscriber, uint256 agentId) view returns (bool)',
  'function getSubscriptionDetail(uint256 subscriptionId) view returns (uint256,address,uint256,uint8,uint256,uint256,string,address,uint256,bool,uint256,bool)',
  'function getUserSubscriptions(address user) view returns (uint256[])',
  'function platformFeeBps() view returns (uint256)',
]

const A2A_ABI = [
  'function getTask(uint256 taskId) view returns (uint256,uint256,string,string,string,uint256,address,uint256,uint256)',
  'function getUserTasks(address user) view returns (uint256[])',
  'function getAgentCard(uint256 agentId) view returns (uint256,uint256,string,string,string,string[],string[],string,string,string,bool)',
]

const REP_ABI = [
  'function getRating(uint256 agentId) view returns (uint256,uint256)',
  'function getReviews(uint256 agentId) view returns (tuple(address,uint8,string,uint256)[])',
]

const CFG_ABI = [
  'function getConfig(uint256 agentId, string configKey) view returns (tuple(uint256,string,string,string,uint256,address))',
  'function getAgentConfigs(uint256 agentId) view returns (tuple(uint256,string,string,string,uint256,address)[])',
]

const EP_ABI = [
  'function getAgentEndpoints(uint256 agentId) view returns (tuple(uint256,uint256,string,string,string,string,string,bool,uint256,uint256,address)[])',
  'function getActiveAgentEndpoints(uint256 agentId) view returns (tuple(uint256,uint256,string,string,string,string,string,bool,uint256,uint256,address)[])',
]

// ── MCP Tool Definitions ───────────────────────────────────────────────────

interface MCPTool {
  name: string
  description: string
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
}

const MCP_TOOLS: MCPTool[] = [
  // ── IdentityRegistry (5) ────────────────────────────────────────────────
  {
    name: 'agentx_identity_list',
    description: 'List all Agent IDs owned by a wallet address. Returns an array of agent ID numbers.',
    inputSchema: { type: 'object', properties: { ownerAddress: { type: 'string', description: 'Ethereum wallet address (0x...)' } }, required: ['ownerAddress'] },
  },
  {
    name: 'agentx_identity_get',
    description: 'Get detailed information about an agent: tokenURI, metadata, and whether it exists.',
    inputSchema: { type: 'object', properties: { agentId: { type: 'integer', description: 'Agent numeric ID' } }, required: ['agentId'] },
  },
  {
    name: 'agentx_identity_exists',
    description: 'Check whether an agent ID exists on the blockchain.',
    inputSchema: { type: 'object', properties: { agentId: { type: 'integer', description: 'Agent ID' } }, required: ['agentId'] },
  },
  {
    name: 'agentx_identity_total_count',
    description: 'Get the total number of agents registered in the IdentityRegistry.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'agentx_identity_register',
    description: 'Register a new AI Agent on-chain. This is a WRITE operation — returns the transaction payload the client must sign and submit. Required: tokenURI (IPFS), encryptedPayloadCid, eciesEncryptedKey.',
    inputSchema: {
      type: 'object',
      properties: {
        tokenURI: { type: 'string', description: 'IPFS URI (ipfs://...)' },
        encryptedPayloadCid: { type: 'string', description: 'IPFS CID of encrypted payload' },
        eciesEncryptedKey: { type: 'string', description: 'Hex ECIES-encrypted AES key' },
      },
      required: ['tokenURI', 'encryptedPayloadCid', 'eciesEncryptedKey'],
    },
  },

  // ── SubscriptionManager (8) ─────────────────────────────────────────────
  {
    name: 'agentx_subscription_plans',
    description: 'Get subscription plan details: price, period, creator, pay token, trial days.',
    inputSchema: { type: 'object', properties: { planId: { type: 'integer', description: 'Plan ID' } }, required: ['planId'] },
  },
  {
    name: 'agentx_subscription_check',
    description: 'Check whether a wallet has an active subscription for a specific agent.',
    inputSchema: {
      type: 'object',
      properties: {
        subscriberAddress: { type: 'string', description: 'Wallet address' },
        agentId: { type: 'integer', description: 'Agent ID' },
      },
      required: ['subscriberAddress', 'agentId'],
    },
  },
  {
    name: 'agentx_subscription_detail',
    description: 'Get full subscription detail including trial, payment, escrow status.',
    inputSchema: { type: 'object', properties: { subscriptionId: { type: 'integer', description: 'Subscription ID' } }, required: ['subscriptionId'] },
  },
  {
    name: 'agentx_subscription_my_list',
    description: 'List all subscription IDs for a wallet address.',
    inputSchema: { type: 'object', properties: { userAddress: { type: 'string', description: 'Wallet address' } }, required: ['userAddress'] },
  },
  {
    name: 'agentx_subscription_subscribe',
    description: 'Subscribe to a plan. WRITE operation — returns transaction payload for the client to sign. For ETH plans, include the plan price as value.',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'integer', description: 'Plan ID to subscribe' },
        valueWei: { type: 'string', description: 'ETH amount in wei (only for ETH plans)' },
      },
      required: ['planId'],
    },
  },
  {
    name: 'agentx_subscription_cancel',
    description: 'Cancel a subscription. WRITE operation — returns transaction payload.',
    inputSchema: { type: 'object', properties: { subscriptionId: { type: 'integer', description: 'Subscription ID' } }, required: ['subscriptionId'] },
  },
  {
    name: 'agentx_subscription_release',
    description: 'Release escrowed funds to the creator after trial period. WRITE operation.',
    inputSchema: { type: 'object', properties: { subscriptionId: { type: 'integer', description: 'Subscription ID' } }, required: ['subscriptionId'] },
  },
  {
    name: 'agentx_subscription_fee',
    description: 'Get current platform fee in basis points (250 = 2.5%).',
    inputSchema: { type: 'object', properties: {} },
  },

  // ── A2AProtocol (5) ─────────────────────────────────────────────────────
  {
    name: 'agentx_a2a_create_task',
    description: 'Create an on-chain A2A task delegating work to another agent. WRITE operation.',
    inputSchema: {
      type: 'object',
      properties: {
        targetAgentId: { type: 'integer', description: 'Target agent ID' },
        taskType: { type: 'string', description: 'e.g. audit, analyze, generate' },
        inputData: { type: 'string', description: 'JSON task input' },
      },
      required: ['targetAgentId', 'taskType', 'inputData'],
    },
  },
  {
    name: 'agentx_a2a_get_task',
    description: 'Get full A2A task details: status, input, output, creator, timestamps.',
    inputSchema: { type: 'object', properties: { taskId: { type: 'integer', description: 'Task ID' } }, required: ['taskId'] },
  },
  {
    name: 'agentx_a2a_complete_task',
    description: 'Mark a task as completed with output data. WRITE operation.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'integer', description: 'Task ID' },
        outputData: { type: 'string', description: 'JSON output data' },
      },
      required: ['taskId', 'outputData'],
    },
  },
  {
    name: 'agentx_a2a_my_tasks',
    description: 'Get all A2A task IDs for a wallet address.',
    inputSchema: { type: 'object', properties: { userAddress: { type: 'string', description: 'Wallet address' } }, required: ['userAddress'] },
  },
  {
    name: 'agentx_a2a_agent_card',
    description: 'Get an agent\'s A2A card: name, capabilities, supported tasks.',
    inputSchema: { type: 'object', properties: { agentId: { type: 'integer', description: 'Agent ID' } }, required: ['agentId'] },
  },

  // ── ReputationRegistry (3) ──────────────────────────────────────────────
  {
    name: 'agentx_reputation_rate',
    description: 'Rate an agent (1-5) and leave a comment. WRITE operation.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'integer', description: 'Agent ID' },
        rating: { type: 'integer', description: 'Rating 1 (worst) to 5 (best)' },
        comment: { type: 'string', description: 'Review comment' },
      },
      required: ['agentId', 'rating'],
    },
  },
  {
    name: 'agentx_reputation_get',
    description: 'Get average rating and total review count for an agent.',
    inputSchema: { type: 'object', properties: { agentId: { type: 'integer', description: 'Agent ID' } }, required: ['agentId'] },
  },
  {
    name: 'agentx_reputation_reviews',
    description: 'Get all reviews for an agent with reviewer, rating, comment, timestamp.',
    inputSchema: { type: 'object', properties: { agentId: { type: 'integer', description: 'Agent ID' } }, required: ['agentId'] },
  },

  // ── ConfigurationRegistry (3) ───────────────────────────────────────────
  {
    name: 'agentx_config_get',
    description: 'Read a single config value for an agent by key.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'integer', description: 'Agent ID' },
        configKey: { type: 'string', description: 'Config key name' },
      },
      required: ['agentId', 'configKey'],
    },
  },
  {
    name: 'agentx_config_list',
    description: 'List all configuration entries for an agent.',
    inputSchema: { type: 'object', properties: { agentId: { type: 'integer', description: 'Agent ID' } }, required: ['agentId'] },
  },
  {
    name: 'agentx_config_set',
    description: 'Set a config value on-chain. WRITE operation.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'integer', description: 'Agent ID' },
        key: { type: 'string', description: 'Config key' },
        value: { type: 'string', description: 'Config value' },
        dataType: { type: 'string', description: 'Data type: string/number/boolean/json' },
      },
      required: ['agentId', 'key', 'value'],
    },
  },

  // ── MultiEndpointRegistry (3) ───────────────────────────────────────────
  {
    name: 'agentx_endpoint_list',
    description: 'Get all registered endpoints for an agent.',
    inputSchema: { type: 'object', properties: { agentId: { type: 'integer', description: 'Agent ID' } }, required: ['agentId'] },
  },
  {
    name: 'agentx_endpoint_active',
    description: 'Get only active (online) endpoints for an agent.',
    inputSchema: { type: 'object', properties: { agentId: { type: 'integer', description: 'Agent ID' } }, required: ['agentId'] },
  },
  {
    name: 'agentx_endpoint_best_mcp',
    description: 'Find the best available MCP endpoint URL for an agent.',
    inputSchema: { type: 'object', properties: { agentId: { type: 'integer', description: 'Agent ID' } }, required: ['agentId'] },
  },

  // ── Gateway (2) ──────────────────────────────────────────────────────────
  {
    name: 'agentx_gateway_tenant',
    description: 'Get the current tenant profile: plan, API keys, daily usage quota.',
    inputSchema: {
      type: 'object',
      properties: { accessToken: { type: 'string', description: 'Gateway JWT access token' } },
      required: ['accessToken'],
    },
  },
  {
    name: 'agentx_gateway_health',
    description: 'Check the AgentX Gateway health status.',
    inputSchema: { type: 'object', properties: {} },
  },
]

// ── Lazy Provider ──────────────────────────────────────────────────────────

let _provider: ethers.JsonRpcProvider | null = null
function getProvider(): ethers.JsonRpcProvider {
  if (!_provider) _provider = new ethers.JsonRpcProvider(config.rpcUrl)
  return _provider
}

function getContract(address: string, abi: string[]): ethers.Contract {
  return new ethers.Contract(address, abi, getProvider())
}

// ── Format Helpers ─────────────────────────────────────────────────────────

function formatHexAddresses(arr: bigint[]): string[] { return arr.map(a => ethers.getAddress(ethers.toBeHex(a, 20))) }
function formatBigInts(arr: bigint[]): number[] { return arr.map(Number) }
function first(arr: any[]): any { return arr[0] }
function toObj(keys: string[], vals: any[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {}
  for (let i = 0; i < keys.length; i++) {
    const v = vals[i]
    obj[keys[i]] = typeof v === 'bigint' ? (v > 2n ** 53n ? v.toString() : Number(v)) : v
  }
  return obj
}

// ── Tool Executor ──────────────────────────────────────────────────────────

async function executeToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      // ── Identity ──────────────────────────────────
      case 'agentx_identity_list': {
        const owner = args.ownerAddress as string
        const c = getContract(config.identityRegistry, ID_ABI)
        const ids = await c.getAgentsByOwner(owner)
        return { agentIds: formatBigInts(ids), owner }
      }
      case 'agentx_identity_get': {
        const agentId = Number(args.agentId)
        const c = getContract(config.identityRegistry, ID_ABI)
        const [exists, tokenURI] = await Promise.all([
          c.agentExists(agentId).catch(() => false),
          c.tokenURI(agentId).catch(() => null),
        ])
        return { agentId, exists, tokenURI }
      }
      case 'agentx_identity_exists':
        return { exists: await getContract(config.identityRegistry, ID_ABI).agentExists(Number(args.agentId)) }
      case 'agentx_identity_total_count': {
        const total = await getContract(config.identityRegistry, ID_ABI).getCurrentAgentId()
        return { totalAgents: Number(total) }
      }
      case 'agentx_identity_register':
        return { _writeOp: true, message: 'This is a WRITE operation. Use the MCP with a wallet client that can sign and submit on-chain transactions. The platform MCP server provides transaction simulation data.', contract: config.identityRegistry, method: 'registerWithMetadata', args: [args.tokenURI, []] }

      // ── Subscription ──────────────────────────────
      case 'agentx_subscription_plans': {
        const planId = Number(args.planId)
        const c = getContract(config.subscriptionManager, SUB_ABI)
        const p = await c.getPlan(planId)
        return toObj(['planId', 'agentId', 'creator', 'price', 'period', 'active', 'payToken', 'trialDays'], p)
      }
      case 'agentx_subscription_check': {
        const ok = await getContract(config.subscriptionManager, SUB_ABI).hasActiveSubscription(args.subscriberAddress, Number(args.agentId))
        return { active: ok, subscriber: args.subscriberAddress, agentId: Number(args.agentId) }
      }
      case 'agentx_subscription_detail': {
        const sid = Number(args.subscriptionId)
        const c = getContract(config.subscriptionManager, SUB_ABI)
        const d = await c.getSubscriptionDetail(sid)
        return toObj(['subscriptionId', 'subscriber', 'agentId', 'status', 'startedAt', 'expiresAt', 'period', 'payToken', 'amountPaid', 'trialActive', 'trialEndsAt', 'fundsReleased'], d)
      }
      case 'agentx_subscription_my_list': {
        const ids = await getContract(config.subscriptionManager, SUB_ABI).getUserSubscriptions(args.userAddress as string)
        return { subscriptionIds: formatBigInts(ids), user: args.userAddress }
      }
      case 'agentx_subscription_subscribe':
        return { _writeOp: true, message: 'WRITE operation. Subscribe to a plan on-chain via a wallet client.', contract: config.subscriptionManager, method: 'subscribe', args: [args.planId] }
      case 'agentx_subscription_cancel':
        return { _writeOp: true, message: 'WRITE operation. Cancel subscription via a wallet client.', contract: config.subscriptionManager, method: 'cancelSubscription', args: [args.subscriptionId] }
      case 'agentx_subscription_release':
        return { _writeOp: true, message: 'WRITE operation. Release funds via a wallet client.', contract: config.subscriptionManager, method: 'releaseFunds', args: [args.subscriptionId] }
      case 'agentx_subscription_fee': {
        const fee = await getContract(config.subscriptionManager, SUB_ABI).platformFeeBps()
        return { platformFeeBps: Number(fee) }
      }

      // ── A2A ───────────────────────────────────────
      case 'agentx_a2a_get_task': {
        const tid = Number(args.taskId)
        const c = getContract(config.a2aProtocol, A2A_ABI)
        const t = await c.getTask(tid)
        return toObj(['taskId', 'agentId', 'taskType', 'inputData', 'outputData', 'status', 'clientAddress', 'createdAt', 'completedAt'], t)
      }
      case 'agentx_a2a_my_tasks': {
        const ids = await getContract(config.a2aProtocol, A2A_ABI).getUserTasks(args.userAddress as string)
        return { taskIds: formatBigInts(ids), user: args.userAddress }
      }
      case 'agentx_a2a_agent_card': {
        const c = getContract(config.a2aProtocol, A2A_ABI)
        const card = await c.getAgentCard(Number(args.agentId))
        const [, aId, name, , , capabilities, supportedTasks, comm, auth, , isActive] = card
        return { agentId: Number(aId), name, capabilities, supportedTasks, communicationProtocol: comm, authenticationMethod: auth, isActive }
      }
      case 'agentx_a2a_create_task':
        return { _writeOp: true, message: 'WRITE operation. Create an A2A task via a wallet client.', contract: config.a2aProtocol, method: 'createTask', args: [args.targetAgentId, args.taskType, args.inputData] }
      case 'agentx_a2a_complete_task':
        return { _writeOp: true, message: 'WRITE operation. Complete a task via a wallet client.', contract: config.a2aProtocol, method: 'completeTask', args: [args.taskId, args.outputData] }

      // ── Reputation ─────────────────────────────────
      case 'agentx_reputation_get': {
        const c = getContract(config.reputationRegistry, REP_ABI)
        const [avg, total] = await c.getRating(Number(args.agentId))
        return { agentId: Number(args.agentId), averageRating: Number(avg), totalRatings: Number(total) }
      }
      case 'agentx_reputation_reviews': {
        const c = getContract(config.reputationRegistry, REP_ABI)
        const reviews = await c.getReviews(Number(args.agentId))
        return { agentId: Number(args.agentId), reviews: reviews.map((r: any) => ({ reviewer: r[0], rating: Number(r[1]), comment: r[2], timestamp: Number(r[3]) })) }
      }
      case 'agentx_reputation_rate':
        return { _writeOp: true, message: 'WRITE operation. Rate an agent via a wallet client.', contract: config.reputationRegistry, method: 'rateAgent', args: [args.agentId, args.rating, args.comment ?? ''] }

      // ── Configuration ──────────────────────────────
      case 'agentx_config_get': {
        const c = getContract(config.configurationRegistry, CFG_ABI)
        const v = await c.getConfig(Number(args.agentId), args.configKey)
        return toObj(['agentId', 'key', 'value', 'dataType', 'updatedAt', 'updatedBy'], v)
      }
      case 'agentx_config_list': {
        const c = getContract(config.configurationRegistry, CFG_ABI)
        const configs = await c.getAgentConfigs(Number(args.agentId))
        return { agentId: Number(args.agentId), configs: configs.map((c: any) => toObj(['agentId', 'key', 'value', 'dataType', 'updatedAt', 'updatedBy'], c)) }
      }
      case 'agentx_config_set':
        return { _writeOp: true, message: 'WRITE operation. Set config via a wallet client.', contract: config.configurationRegistry, method: 'setAgentConfig', args: [args.agentId, args.key, args.value, args.dataType ?? 'string'] }

      // ── MultiEndpoint ──────────────────────────────
      case 'agentx_endpoint_list': {
        const c = getContract(config.multiEndpoint, EP_ABI)
        const eps = await c.getAgentEndpoints(Number(args.agentId))
        return { agentId: Number(args.agentId), endpoints: eps.map((e: any) => ({ endpointId: Number(e[0]), name: e[2], type: e[3], protocol: e[4], url: e[5], isActive: e[7] })) }
      }
      case 'agentx_endpoint_active': {
        const c = getContract(config.multiEndpoint, EP_ABI)
        const eps = await c.getActiveAgentEndpoints(Number(args.agentId))
        return { agentId: Number(args.agentId), endpoints: eps.map((e: any) => ({ endpointId: Number(e[0]), name: e[2], type: e[3], protocol: e[4], url: e[5] })) }
      }
      case 'agentx_endpoint_best_mcp': {
        const c = getContract(config.multiEndpoint, EP_ABI)
        const eps = await c.getActiveAgentEndpoints(Number(args.agentId))
        const mcp = eps.find((e: any) => e[3] === 'mcp' || e[4] === 'mcp')
        return { agentId: Number(args.agentId), mcpUrl: mcp ? mcp[5] : null }
      }

      // ── Gateway ────────────────────────────────────
      case 'agentx_gateway_tenant': {
        const token = args.accessToken as string
        if (!token) return { error: 'accessToken is required' }
        const res = await fetch(`http://127.0.0.1:${config.port}/api/v1/tenant/me`, { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) return { error: `HTTP ${res.status}`, detail: await res.text() }
        return res.json()
      }
      case 'agentx_gateway_health':
        return { status: 'ok', time: new Date().toISOString(), chainId: config.chainId, rpcUrl: config.rpcUrl, contracts: { identityRegistry: config.identityRegistry, subscriptionManager: config.subscriptionManager, a2aProtocol: config.a2aProtocol } }

      default:
        return { error: `Unknown tool: ${name}`, availableTools: MCP_TOOLS.map(t => t.name) }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { error: msg, tool: name }
  }
}

// ── MCP Router ──────────────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  const { jsonrpc, id, method, params } = req.body

  // Validate JSON-RPC
  if (jsonrpc !== '2.0') {
    res.status(400).json({ jsonrpc: '2.0', id: id ?? null, error: { code: -32600, message: 'Invalid Request: jsonrpc must be "2.0"' } })
    return
  }

  try {
    switch (method) {
      case 'tools/list': {
        const tools = MCP_TOOLS.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        }))
        res.json({ jsonrpc: '2.0', id, result: { tools } })
        return
      }

      case 'tools/call': {
        const toolName = params?.name as string
        const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>

        if (!toolName) {
          res.json({ jsonrpc: '2.0', id, error: { code: -32602, message: 'Invalid params: missing tool "name"' } })
          return
        }

        const tool = MCP_TOOLS.find(t => t.name === toolName)
        if (!tool) {
          res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${toolName}`, data: { available: MCP_TOOLS.map(t => t.name) } } })
          return
        }

        const result = await executeToolCall(toolName, toolArgs)

        res.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            isError: result && typeof result === 'object' && 'error' in result,
          },
        })
        return
      }

      case 'initialize': {
        res.json({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: {
              name: 'agentx-gateway',
              version: '0.1.0',
            },
            capabilities: { tools: {} },
          },
        })
        return
      }

      case 'notifications/initialized': {
        res.json({ jsonrpc: '2.0', id, result: {} })
        return
      }

      default:
        res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } })
        return
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    res.json({ jsonrpc: '2.0', id: id ?? null, error: { code: -32603, message: `Internal error: ${msg}` } })
  }
})

export default router
export { MCP_TOOLS }
