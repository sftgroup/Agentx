// ---------------------------------------------------------------------------
// AgentX Gateway — MCP Server (Model Context Protocol)
// ---------------------------------------------------------------------------
// Standard MCP JSON-RPC 2.0 endpoint. Supports dual-chain (Sepolia + OxaChain L1).
//   POST /mcp
//     tools/list  → all 29 AgentX platform tools
//     tools/call  → params.name + params.arguments.{chain:"sepolia"|"oxachain"}
//     initialize  → handshake
//
// Claude Desktop config:
//   { "mcpServers": { "agentx": { "url": "http://43.156.225.164:3090/mcp" } } }
// ---------------------------------------------------------------------------

import { Router, Request, Response } from 'express'
import { ethers } from 'ethers'
import { config } from '../config'

const router = Router()

// ── Chain Config ───────────────────────────────────────────────────────────

type ChainKey = 'sepolia' | 'oxachain'

interface ChainInfo {
  rpcUrl: string
  chainId: number
  identityRegistry: string
  subscriptionManager: string
  a2aProtocol: string
  reputationRegistry: string
  configurationRegistry: string
  multiEndpoint: string
}

const CHAINS: Record<ChainKey, ChainInfo> = {
  sepolia: {
    rpcUrl: config.rpcUrl,
    chainId: config.chainId,
    identityRegistry: config.identityRegistry,
    subscriptionManager: config.subscriptionManager,
    a2aProtocol: config.a2aProtocol,
    reputationRegistry: config.reputationRegistry,
    configurationRegistry: config.configurationRegistry,
    multiEndpoint: config.multiEndpoint,
  },
  oxachain: {
    rpcUrl: config.rpcUrlOxaChain,
    chainId: config.chainIdOxaChain,
    identityRegistry: config.identityRegistryOxaChain,
    subscriptionManager: config.subscriptionManagerOxaChain,
    a2aProtocol: config.a2aProtocolOxaChain,
    reputationRegistry: config.reputationRegistryOxaChain,
    configurationRegistry: config.configurationRegistryOxaChain,
    multiEndpoint: config.multiEndpointOxaChain,
  },
}

function resolveChain(args: Record<string, unknown>): ChainInfo {
  const key = (args.chain as string)?.toLowerCase() === 'oxachain' ? 'oxachain' : 'sepolia'
  return CHAINS[key]
}

// ── Cached Providers ───────────────────────────────────────────────────────

const providers: Partial<Record<ChainKey, ethers.JsonRpcProvider>> = {}
function getProvider(chain: ChainKey): ethers.JsonRpcProvider {
  if (!providers[chain]) providers[chain] = new ethers.JsonRpcProvider(CHAINS[chain].rpcUrl)
  return providers[chain]!
}

function getContract(chain: ChainKey, address: string, abi: string[]): ethers.Contract {
  return new ethers.Contract(address, abi, getProvider(chain))
}

// ── MCP Tool Definitions ───────────────────────────────────────────────────

interface MCPTool {
  name: string
  description: string
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
}

function commonArgs(): Record<string, unknown> {
  return {
    chain: { type: 'string', description: 'Chain: "sepolia" (default) or "oxachain" for OxaChain L1 mainnet', enum: ['sepolia', 'oxachain'] },
  }
}

const MCP_TOOLS: MCPTool[] = [
  // ── IdentityRegistry ────────────────────────────────────────────────────
  {
    name: 'agentx_identity_list',
    description: 'List all Agent IDs owned by a wallet address on Sepolia or OxaChain L1.',
    inputSchema: { type: 'object', properties: { ...commonArgs(), ownerAddress: { type: 'string', description: 'Ethereum wallet address (0x...)' } }, required: ['ownerAddress'] },
  },
  {
    name: 'agentx_identity_get',
    description: 'Get agent details — tokenURI, metadata, existence.',
    inputSchema: { type: 'object', properties: { ...commonArgs(), agentId: { type: 'integer', description: 'Agent numeric ID' } }, required: ['agentId'] },
  },
  {
    name: 'agentx_identity_exists',
    description: 'Check whether an agent ID exists on-chain.',
    inputSchema: { type: 'object', properties: { ...commonArgs(), agentId: { type: 'integer', description: 'Agent ID' } }, required: ['agentId'] },
  },
  {
    name: 'agentx_identity_total_count',
    description: 'Total number of agents registered.',
    inputSchema: { type: 'object', properties: { ...commonArgs() } },
  },
  {
    name: 'agentx_identity_register',
    description: 'Register a new Agent on-chain. WRITE operation — returns tx payload.',
    inputSchema: {
      type: 'object',
      properties: {
        ...commonArgs(),
        tokenURI: { type: 'string', description: 'IPFS URI (ipfs://...)' },
        encryptedPayloadCid: { type: 'string', description: 'IPFS CID of encrypted payload' },
        eciesEncryptedKey: { type: 'string', description: 'Hex ECIES-encrypted AES key' },
      },
      required: ['tokenURI', 'encryptedPayloadCid', 'eciesEncryptedKey'],
    },
  },

  // ── SubscriptionManager ─────────────────────────────────────────────────
  {
    name: 'agentx_subscription_plans',
    description: 'Get plan details: price, period, pay token, trial days.',
    inputSchema: { type: 'object', properties: { ...commonArgs(), planId: { type: 'integer', description: 'Plan ID' } }, required: ['planId'] },
  },
  {
    name: 'agentx_subscription_check',
    description: 'Check if a wallet has an active subscription for an agent.',
    inputSchema: {
      type: 'object',
      properties: { ...commonArgs(), subscriberAddress: { type: 'string', description: 'Wallet address' }, agentId: { type: 'integer', description: 'Agent ID' } },
      required: ['subscriberAddress', 'agentId'],
    },
  },
  {
    name: 'agentx_subscription_detail',
    description: 'Full subscription detail including trial info, escrow status.',
    inputSchema: { type: 'object', properties: { ...commonArgs(), subscriptionId: { type: 'integer', description: 'Subscription ID' } }, required: ['subscriptionId'] },
  },
  {
    name: 'agentx_subscription_my_list',
    description: 'List all subscription IDs for a wallet.',
    inputSchema: { type: 'object', properties: { ...commonArgs(), userAddress: { type: 'string', description: 'Wallet address' } }, required: ['userAddress'] },
  },
  {
    name: 'agentx_subscription_subscribe',
    description: 'Subscribe to a plan. WRITE operation.',
    inputSchema: {
      type: 'object',
      properties: { ...commonArgs(), planId: { type: 'integer', description: 'Plan ID' }, valueWei: { type: 'string', description: 'ETH in wei' } },
      required: ['planId'],
    },
  },
  {
    name: 'agentx_subscription_cancel',
    description: 'Cancel a subscription. WRITE operation.',
    inputSchema: { type: 'object', properties: { ...commonArgs(), subscriptionId: { type: 'integer', description: 'Subscription ID' } }, required: ['subscriptionId'] },
  },
  {
    name: 'agentx_subscription_release',
    description: 'Release escrowed funds. WRITE operation.',
    inputSchema: { type: 'object', properties: { ...commonArgs(), subscriptionId: { type: 'integer', description: 'Subscription ID' } }, required: ['subscriptionId'] },
  },
  {
    name: 'agentx_subscription_fee',
    description: 'Get current platform fee in bps.',
    inputSchema: { type: 'object', properties: { ...commonArgs() } },
  },

  // ── A2AProtocol ─────────────────────────────────────────────────────────
  {
    name: 'agentx_a2a_create_task',
    description: 'Create an on-chain A2A task. WRITE operation.',
    inputSchema: {
      type: 'object',
      properties: { ...commonArgs(), targetAgentId: { type: 'integer', description: 'Target agent ID' }, taskType: { type: 'string', description: 'e.g. audit, analyze' }, inputData: { type: 'string', description: 'JSON input' } },
      required: ['targetAgentId', 'taskType', 'inputData'],
    },
  },
  {
    name: 'agentx_a2a_get_task',
    description: 'Get A2A task details.',
    inputSchema: { type: 'object', properties: { ...commonArgs(), taskId: { type: 'integer', description: 'Task ID' } }, required: ['taskId'] },
  },
  {
    name: 'agentx_a2a_complete_task',
    description: 'Complete a task on-chain. WRITE operation.',
    inputSchema: {
      type: 'object',
      properties: { ...commonArgs(), taskId: { type: 'integer', description: 'Task ID' }, outputData: { type: 'string', description: 'JSON output' } },
      required: ['taskId', 'outputData'],
    },
  },
  {
    name: 'agentx_a2a_my_tasks',
    description: 'Get all task IDs for a wallet.',
    inputSchema: { type: 'object', properties: { ...commonArgs(), userAddress: { type: 'string', description: 'Wallet address' } }, required: ['userAddress'] },
  },
  {
    name: 'agentx_a2a_agent_card',
    description: 'Get agent A2A card: name, capabilities, supported tasks.',
    inputSchema: { type: 'object', properties: { ...commonArgs(), agentId: { type: 'integer', description: 'Agent ID' } }, required: ['agentId'] },
  },

  // ── ReputationRegistry ──────────────────────────────────────────────────
  {
    name: 'agentx_reputation_rate',
    description: 'Rate an agent (1-5). WRITE operation.',
    inputSchema: {
      type: 'object',
      properties: { ...commonArgs(), agentId: { type: 'integer', description: 'Agent ID' }, rating: { type: 'integer', description: '1-5' }, comment: { type: 'string', description: 'Review' } },
      required: ['agentId', 'rating'],
    },
  },
  {
    name: 'agentx_reputation_get',
    description: 'Average rating and review count.',
    inputSchema: { type: 'object', properties: { ...commonArgs(), agentId: { type: 'integer', description: 'Agent ID' } }, required: ['agentId'] },
  },
  {
    name: 'agentx_reputation_reviews',
    description: 'All reviews with reviewer, rating, comment, timestamp.',
    inputSchema: { type: 'object', properties: { ...commonArgs(), agentId: { type: 'integer', description: 'Agent ID' } }, required: ['agentId'] },
  },

  // ── ConfigurationRegistry ───────────────────────────────────────────────
  {
    name: 'agentx_config_get',
    description: 'Read a config value by key.',
    inputSchema: {
      type: 'object',
      properties: { ...commonArgs(), agentId: { type: 'integer', description: 'Agent ID' }, configKey: { type: 'string', description: 'Config key' } },
      required: ['agentId', 'configKey'],
    },
  },
  {
    name: 'agentx_config_list',
    description: 'List all configurations for an agent.',
    inputSchema: { type: 'object', properties: { ...commonArgs(), agentId: { type: 'integer', description: 'Agent ID' } }, required: ['agentId'] },
  },
  {
    name: 'agentx_config_set',
    description: 'Set config value on-chain. WRITE operation.',
    inputSchema: {
      type: 'object',
      properties: { ...commonArgs(), agentId: { type: 'integer', description: 'Agent ID' }, key: { type: 'string' }, value: { type: 'string' }, dataType: { type: 'string', enum: ['string', 'number', 'boolean', 'json'] } },
      required: ['agentId', 'key', 'value'],
    },
  },

  // ── MultiEndpointRegistry ───────────────────────────────────────────────
  {
    name: 'agentx_endpoint_list',
    description: 'All registered endpoints.',
    inputSchema: { type: 'object', properties: { ...commonArgs(), agentId: { type: 'integer', description: 'Agent ID' } }, required: ['agentId'] },
  },
  {
    name: 'agentx_endpoint_active',
    description: 'Only active endpoints.',
    inputSchema: { type: 'object', properties: { ...commonArgs(), agentId: { type: 'integer', description: 'Agent ID' } }, required: ['agentId'] },
  },
  {
    name: 'agentx_endpoint_best_mcp',
    description: 'Best available MCP endpoint URL.',
    inputSchema: { type: 'object', properties: { ...commonArgs(), agentId: { type: 'integer', description: 'Agent ID' } }, required: ['agentId'] },
  },

  // ── Gateway ─────────────────────────────────────────────────────────────
  {
    name: 'agentx_gateway_tenant',
    description: 'Get tenant profile, plan, quota.',
    inputSchema: { type: 'object', properties: { accessToken: { type: 'string', description: 'Gateway JWT token' } }, required: ['accessToken'] },
  },
  {
    name: 'agentx_gateway_health',
    description: 'Gateway health + chain contract addresses (both chains).',
    inputSchema: { type: 'object', properties: {} },
  },
]

// ── ABIs ────────────────────────────────────────────────────────────────────

const ID_ABI = [
  'function getAgentsByOwner(address owner) view returns (uint256[])',
  'function getCurrentAgentId() view returns (uint256)',
  'function agentExists(uint256 agentId) view returns (bool)',
  'function tokenURI(uint256 tokenId) view returns (string)',
]
const SUB_ABI = [
  // No named params — avoids ethers.js v6 struct decoding issues with mixed static/dynamic fields
  'function getPlan(uint256) view returns (uint256,uint256,address,uint256,string,bool,address,uint256)',
  'function hasActiveSubscription(address,uint256) view returns (bool)',
  'function getSubscription(address,uint256) view returns (uint256,address,uint256,uint8,uint256,uint256,string)',
  'function getSubscriptionDetail(uint256) view returns (uint256,address,uint256,uint8,uint256,uint256,string,address,uint256,bool,uint256,bool)',
  'function getUserSubscriptions(address) view returns (uint256[])',
  'function platformFeeBps() view returns (uint256)',
]
const A2A_ABI = [
  'function getTask(uint256) view returns (uint256,uint256,string,string,string,uint256,address,uint256,uint256)',
  'function getUserTasks(address) view returns (uint256[])',
  'function getAgentCard(uint256) view returns (uint256,uint256,string,string,string,string[],string[],string,string,string,bool)',
]
const REP_ABI = [
  'function getReputationSummary(uint256 agentId, address[] clientAddresses, bytes32 tag1, bytes32 tag2) view returns (uint64 count, uint8 averageScore)',
  'function readFeedback(uint256 agentId, address clientAddress, uint64 index) view returns (uint8 score, bytes32 tag1, bytes32 tag2, bool isRevoked)',
  'function getClients(uint256 agentId) view returns (address[])',
  'function getLastIndex(uint256 agentId, address clientAddress) view returns (uint64)',
]
const CFG_ABI = [
  'function getConfig(uint256 agentId, string configKey) view returns (tuple(uint256 configId, uint256 agentId, string configKey, string configValue, string dataType, string description, bool isActive, uint256 createdAt, uint256 updatedAt, address createdBy))',
  'function getAgentConfigs(uint256 agentId) view returns (tuple(uint256 configId, uint256 agentId, string configKey, string configValue, string dataType, string description, bool isActive, uint256 createdAt, uint256 updatedAt, address createdBy)[])',
  'function getConfigKeys(uint256 agentId) view returns (string[])',
]
const EP_ABI = [
  'function getAgentEndpoints(uint256) view returns (tuple(uint256,uint256,string,string,string,string,string,bool,uint256,uint256,address)[])',
  'function getActiveAgentEndpoints(uint256) view returns (tuple(uint256,uint256,string,string,string,string,string,bool,uint256,uint256,address)[])',
]

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatBigInts(arr: bigint[]): number[] { return arr.map(Number) }
function toObj(keys: string[], vals: any[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {}
  for (let i = 0; i < keys.length; i++) {
    const v = vals[i]
    obj[keys[i]] = typeof v === 'bigint' ? (v > 2n ** 53n ? v.toString() : Number(v)) : v
  }
  return obj
}

// ── Tool Executor ───────────────────────────────────────────────────────────

async function executeToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
  const chain = resolveChain(args) as ChainInfo
  const ck: ChainKey = (args.chain as string)?.toLowerCase() === 'oxachain' ? 'oxachain' : 'sepolia'
  const chainLabel = ck === 'oxachain' ? 'OxaChain L1' : 'Sepolia'
  const chainId = ck === 'oxachain' ? config.chainIdOxaChain : config.chainId

  try {
    switch (name) {
      // ── Identity ──────────────────────────────────
      case 'agentx_identity_list': {
        const owner = args.ownerAddress as string
        const ids = await getContract(ck, chain.identityRegistry, ID_ABI).getAgentsByOwner(owner)
        return { agentIds: formatBigInts(ids), owner, chain: chainLabel, chainId }
      }
      case 'agentx_identity_get': {
        const agentId = Number(args.agentId)
        const c = getContract(ck, chain.identityRegistry, ID_ABI)
        const [exists, tokenURI] = await Promise.all([
          c.agentExists(agentId).catch(() => false),
          c.tokenURI(agentId).catch(() => null),
        ])
        return { agentId, exists, tokenURI, chain: chainLabel, chainId }
      }
      case 'agentx_identity_exists':
        return { exists: await getContract(ck, chain.identityRegistry, ID_ABI).agentExists(Number(args.agentId)), chain: chainLabel, chainId }
      case 'agentx_identity_total_count': {
        const total = await getContract(ck, chain.identityRegistry, ID_ABI).getCurrentAgentId()
        return { totalAgents: Number(total), chain: chainLabel, chainId }
      }
      case 'agentx_identity_register':
        return { _writeOp: true, message: `WRITE. Use a wallet client to sign and submit to ${chainLabel}.`, contract: chain.identityRegistry, chain: chainLabel, chainId }

      // ── Subscription ──────────────────────────────
      case 'agentx_subscription_plans': {
        // raw eth_call to avoid ethers.js v6 struct-decoding bug with bool+string mix
        const planId = Number(args.planId)
        const abiCoder = ethers.AbiCoder.defaultAbiCoder()
        const data = new ethers.Interface(SUB_ABI).encodeFunctionData('getPlan', [planId])
        const raw = await getProvider(ck).call({ to: chain.subscriptionManager, data })
        const decoded = abiCoder.decode(['uint256','uint256','address','uint256','string','bool','address','uint256'], raw)
        return { planId: Number(decoded[0]), agentId: Number(decoded[1]), creator: decoded[2], price: Number(decoded[3]), period: decoded[4], active: decoded[5], payToken: decoded[6], trialDays: Number(decoded[7]), chain: chainLabel, chainId }
      }
      case 'agentx_subscription_check': {
        // Accept both 'subscriberAddress' and 'subscriber' parameter names
        const subscriber = (args.subscriberAddress || args.subscriber || args.subscriber_address) as string
        const subscriberAddr = ethers.getAddress(subscriber)
        const ok = await getContract(ck, chain.subscriptionManager, SUB_ABI).hasActiveSubscription(subscriberAddr, Number(args.agentId))
        return { active: ok, subscriber: subscriberAddr, agentId: Number(args.agentId), chain: chainLabel, chainId }
      }
      case 'agentx_subscription_detail': {
        const d = await getContract(ck, chain.subscriptionManager, SUB_ABI).getSubscriptionDetail(Number(args.subscriptionId))
        return { ...toObj(['subscriptionId', 'subscriber', 'agentId', 'status', 'startedAt', 'expiresAt', 'period', 'payToken', 'amountPaid', 'trialActive', 'trialEndsAt', 'fundsReleased'], d), chain: chainLabel, chainId }
      }
      case 'agentx_subscription_my_list': {
        const ids = await getContract(ck, chain.subscriptionManager, SUB_ABI).getUserSubscriptions(args.userAddress as string)
        return { subscriptionIds: formatBigInts(ids), user: args.userAddress, chain: chainLabel, chainId }
      }
      case 'agentx_subscription_subscribe':
        return { _writeOp: true, message: `WRITE. Subscribe via wallet client on ${chainLabel}.`, contract: chain.subscriptionManager, chain: chainLabel, chainId }
      case 'agentx_subscription_cancel':
        return { _writeOp: true, message: `WRITE. Cancel via wallet client on ${chainLabel}.`, contract: chain.subscriptionManager, chain: chainLabel, chainId }
      case 'agentx_subscription_release':
        return { _writeOp: true, message: `WRITE. Release via wallet client on ${chainLabel}.`, contract: chain.subscriptionManager, chain: chainLabel, chainId }
      case 'agentx_subscription_fee': {
        const fee = await getContract(ck, chain.subscriptionManager, SUB_ABI).platformFeeBps()
        return { platformFeeBps: Number(fee), chain: chainLabel, chainId }
      }

      // ── A2A ───────────────────────────────────────
      case 'agentx_a2a_get_task': {
        const t = await getContract(ck, chain.a2aProtocol, A2A_ABI).getTask(Number(args.taskId))
        return { ...toObj(['taskId', 'agentId', 'taskType', 'inputData', 'outputData', 'status', 'clientAddress', 'createdAt', 'completedAt'], t), chain: chainLabel, chainId }
      }
      case 'agentx_a2a_my_tasks': {
        const ids = await getContract(ck, chain.a2aProtocol, A2A_ABI).getUserTasks(args.userAddress as string)
        return { taskIds: formatBigInts(ids), user: args.userAddress, chain: chainLabel, chainId }
      }
      case 'agentx_a2a_agent_card': {
        const card = await getContract(ck, chain.a2aProtocol, A2A_ABI).getAgentCard(Number(args.agentId))
        const [, aId, name, , , capabilities, supportedTasks, comm, auth, , isActive] = card
        return { agentId: Number(aId), name, capabilities, supportedTasks, communicationProtocol: comm, authenticationMethod: auth, isActive, chain: chainLabel, chainId }
      }
      case 'agentx_a2a_create_task':
        return { _writeOp: true, message: `WRITE. Create task via wallet client on ${chainLabel}.`, contract: chain.a2aProtocol, chain: chainLabel, chainId }
      case 'agentx_a2a_complete_task':
        return { _writeOp: true, message: `WRITE. Complete task via wallet client on ${chainLabel}.`, contract: chain.a2aProtocol, chain: chainLabel, chainId }

      // ── Reputation ─────────────────────────────────
      case 'agentx_reputation_get': {
        const [count, avgScore] = await getContract(ck, chain.reputationRegistry, REP_ABI).getReputationSummary(Number(args.agentId), [], ethers.ZeroHash, ethers.ZeroHash)
        return { agentId: Number(args.agentId), averageScore: Number(avgScore), reviewCount: Number(count), chain: chainLabel, chainId }
      }
      case 'agentx_reputation_reviews': {
        const clients = await getContract(ck, chain.reputationRegistry, REP_ABI).getClients(Number(args.agentId))
        const reviews: any[] = []
        for (const client of clients.map(String)) {
          const lastIdx = await getContract(ck, chain.reputationRegistry, REP_ABI).getLastIndex(Number(args.agentId), client).then(n => Number(n)).catch(() => 0)
          for (let i = 1; i <= lastIdx; i++) {
            try {
              const fb = await getContract(ck, chain.reputationRegistry, REP_ABI).readFeedback(Number(args.agentId), client, i)
              reviews.push({ reviewer: client, score: Number(fb[0]), tag1: fb[1], tag2: fb[2], isRevoked: fb[3] })
            } catch { /* skip */ }
          }
        }
        return { agentId: Number(args.agentId), reviews, chain: chainLabel, chainId }
      }
      case 'agentx_reputation_rate':
        return { _writeOp: true, message: `WRITE. Rate via wallet client on ${chainLabel}.`, contract: chain.reputationRegistry, chain: chainLabel, chainId }

      // ── Configuration ──────────────────────────────
      case 'agentx_config_get': {
        const v = await getContract(ck, chain.configurationRegistry, CFG_ABI).getConfig(Number(args.agentId), args.configKey as string)
        return { agentId: Number(args.agentId), configKey: v.configKey, configValue: v.configValue, dataType: v.dataType, description: v.description, isActive: v.isActive, chain: chainLabel, chainId }
      }
      case 'agentx_config_list': {
        const configs = await getContract(ck, chain.configurationRegistry, CFG_ABI).getAgentConfigs(Number(args.agentId))
        return { agentId: Number(args.agentId), configs: configs.map((c: any) => ({ configKey: c.configKey, configValue: c.configValue, dataType: c.dataType, description: c.description, isActive: c.isActive })), chain: chainLabel, chainId }
      }
      case 'agentx_config_set':
        return { _writeOp: true, message: `WRITE. Set config via wallet client on ${chainLabel}.`, contract: chain.configurationRegistry, chain: chainLabel, chainId }

      // ── MultiEndpoint ──────────────────────────────
      case 'agentx_endpoint_list': {
        const eps = await getContract(ck, chain.multiEndpoint, EP_ABI).getAgentEndpoints(Number(args.agentId))
        return { agentId: Number(args.agentId), endpoints: eps.map((e: any) => ({ endpointId: Number(e[0]), name: e[2], type: e[3], protocol: e[4], url: e[5], isActive: e[7] })), chain: chainLabel, chainId }
      }
      case 'agentx_endpoint_active': {
        const eps = await getContract(ck, chain.multiEndpoint, EP_ABI).getActiveAgentEndpoints(Number(args.agentId))
        return { agentId: Number(args.agentId), endpoints: eps.map((e: any) => ({ endpointId: Number(e[0]), name: e[2], type: e[3], protocol: e[4], url: e[5] })), chain: chainLabel, chainId }
      }
      case 'agentx_endpoint_best_mcp': {
        const eps = await getContract(ck, chain.multiEndpoint, EP_ABI).getActiveAgentEndpoints(Number(args.agentId))
        const mcp = eps.find((e: any) => e[3] === 'mcp' || e[4] === 'mcp')
        return { agentId: Number(args.agentId), mcpUrl: mcp ? mcp[5] : null, chain: chainLabel, chainId }
      }

      // ── Gateway ────────────────────────────────────
      case 'agentx_gateway_tenant': {
        const token = args.accessToken as string
        if (!token) return { error: 'accessToken required' }
        const res = await fetch(`http://127.0.0.1:${config.port}/api/v1/tenant/me`, { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) return { error: `HTTP ${res.status}`, detail: await res.text() }
        return res.json()
      }
      case 'agentx_gateway_health':
        return {
          status: 'ok',
          time: new Date().toISOString(),
          chains: {
            sepolia: { chainId: config.chainId, rpcUrl: config.rpcUrl, identityRegistry: config.identityRegistry, subscriptionManager: config.subscriptionManager, a2aProtocol: config.a2aProtocol, reputationRegistry: config.reputationRegistry, configurationRegistry: config.configurationRegistry, multiEndpoint: config.multiEndpoint },
            oxachain: { chainId: config.chainIdOxaChain, rpcUrl: config.rpcUrlOxaChain, identityRegistry: config.identityRegistryOxaChain, subscriptionManager: config.subscriptionManagerOxaChain, a2aProtocol: config.a2aProtocolOxaChain, reputationRegistry: config.reputationRegistryOxaChain, configurationRegistry: config.configurationRegistryOxaChain, multiEndpoint: config.multiEndpointOxaChain },
          },
        }

      default:
        return { error: `Unknown tool: ${name}`, availableTools: MCP_TOOLS.map(t => t.name) }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { error: msg, tool: name, chain: chainLabel }
  }
}

// ── MCP Router ──────────────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  const { jsonrpc, id, method, params } = req.body

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

        if (!MCP_TOOLS.some(t => t.name === toolName)) {
          res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${toolName}` } })
          return
        }

        const result = await executeToolCall(toolName, toolArgs)
        res.json({
          jsonrpc: '2.0', id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            isError: result && typeof result === 'object' && 'error' in result,
          },
        })
        return
      }

      case 'initialize':
        res.json({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', serverInfo: { name: 'agentx-gateway', version: '0.2.0' }, capabilities: { tools: {} } } })
        return

      case 'notifications/initialized':
        res.json({ jsonrpc: '2.0', id, result: {} })
        return

      default:
        res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } })
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    res.json({ jsonrpc: '2.0', id: id ?? null, error: { code: -32603, message: `Internal error: ${msg}` } })
  }
})

export default router
export { MCP_TOOLS }
