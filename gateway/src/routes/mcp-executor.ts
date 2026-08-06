// ---------------------------------------------------------------------------
// AgentX Gateway — MCP Tool Executor (split from mcp.ts, R7)
// ---------------------------------------------------------------------------
// Chain config, cached providers, local ABIs and the executeToolCall switch
// that implements every AgentX MCP tool. Pure logic — no Express router here.
// ---------------------------------------------------------------------------

import { ethers } from 'ethers'
import type { Address } from 'viem'
import { config } from '../config'
import { chainDataReader } from '../services/chain-data-reader'
import { MCP_TOOLS } from './mcp-tools'

/** address(0) — native token / ETH sentinel for payToken. */
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

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

function chainKeyOf(args: Record<string, unknown>): ChainKey {
  return (args.chain as string)?.toLowerCase() === 'oxachain' ? 'oxachain' : 'sepolia'
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

// ── ABIs ────────────────────────────────────────────────────────────────────
// IdentityRegistry and SubscriptionManager reads are served by ChainDataReader
// (SDK-backed, see services/chain-data-reader.ts). Only the contracts the SDK
// does not wrap yet keep local ABI definitions here.

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

// ── Gateway API helpers (conversation / task tools) ─────────────────────────

const gatewayApiBase = `http://127.0.0.1:${config.port}/api/v1`

/** Resolve tenant auth from MCP args. R14: conversation/task tools accept ONLY
 * `access_token` (registered-user JWT). B-end `api_key` (agentx_...) is rejected —
 * B-end keys are limited to the REST chat service. */
function gatewayAuthHeaders(args: Record<string, unknown>): { headers: Record<string, string>; error?: string } {
  const token = args.access_token as string | undefined
  if (!token) {
    return { headers: {}, error: 'access_token (registered-user JWT) is required for this tool' }
  }
  return {
    headers: { Authorization: `Bearer ${token}` },
  }
}

/** POST to a gateway endpoint with JSON body; returns parsed JSON or {error}. */
async function gatewayPost(path: string, auth: Record<string, string>, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${gatewayApiBase}${path}`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let detail = ''
    try { detail = await res.text() } catch {}
    return { error: `HTTP ${res.status}`, detail: detail.slice(0, 2000), code: undefined }
  }
  return res.json()
}

/** GET a gateway endpoint; returns parsed JSON or {error}. */
async function gatewayGet(path: string, auth: Record<string, string>): Promise<unknown> {
  const res = await fetch(`${gatewayApiBase}${path}`, { headers: auth })
  if (!res.ok) {
    let detail = ''
    try { detail = await res.text() } catch {}
    return { error: `HTTP ${res.status}`, detail: detail.slice(0, 2000) }
  }
  return res.json()
}

/** DELETE a gateway endpoint; returns parsed JSON or {error}. */
async function gatewayDelete(path: string, auth: Record<string, string>): Promise<unknown> {
  const res = await fetch(`${gatewayApiBase}${path}`, { method: 'DELETE', headers: auth })
  if (!res.ok) {
    let detail = ''
    try { detail = await res.text() } catch {}
    return { error: `HTTP ${res.status}`, detail: detail.slice(0, 2000) }
  }
  return res.json()
}

/** Run a single-turn conversation (POST /agent/runs) and collect the SSE stream. */
async function collectChat(auth: Record<string, string>, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${gatewayApiBase}/agent/runs`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let detail = ''
    try { detail = await res.text() } catch {}
    return { error: `HTTP ${res.status}`, detail: detail.slice(0, 2000) }
  }
  const text = await res.text()
  let reply = ''
  const toolCalls: { name: string; arguments: Record<string, unknown> }[] = []
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue
    try {
      const ev = JSON.parse(line.slice(6)) as Record<string, any>
      if (ev.type === 'text') reply += ev.content ?? ''
      else if (ev.type === 'tool_call') toolCalls.push({ name: ev.toolName ?? '', arguments: ev.toolArgs ?? {} })
      else if (ev.type === 'error') return { error: ev.error || 'Conversation error' }
    } catch { /* ignore malformed SSE lines */ }
  }
  return { reply, tool_calls: toolCalls }
}

// ── Tool Executor ───────────────────────────────────────────────────────────

async function executeToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
  const chain = resolveChain(args) as ChainInfo
  const ck: ChainKey = chainKeyOf(args)
  const chainLabel = ck === 'oxachain' ? 'OxaChain L1' : 'Sepolia'
  const chainId = ck === 'oxachain' ? config.chainIdOxaChain : config.chainId

  try {
    switch (name) {
      // ── Identity (SDK-backed via ChainDataReader) ─────────────────
      case 'agentx_identity_list': {
        const owner = args.ownerAddress as string
        const ids = await chainDataReader.getAgentsByOwner(ck, owner as Address)
        return { agentIds: ids, owner, chain: chainLabel, chainId }
      }
      case 'agentx_identity_get': {
        const agentId = Number(args.agentId)
        const exists = await chainDataReader.agentExists(ck, agentId)
        let tokenURI: string | null = null
        if (exists) {
          const [a] = await chainDataReader.listAgents(ck, { fromId: agentId, toId: agentId, batchSize: 1 })
          tokenURI = a?.tokenURI ?? null
        }
        return { agentId, exists, tokenURI, chain: chainLabel, chainId }
      }
      case 'agentx_identity_exists':
        return { exists: await chainDataReader.agentExists(ck, Number(args.agentId)), chain: chainLabel, chainId }
      case 'agentx_identity_total_count': {
        const total = await chainDataReader.totalAgents(ck)
        return { totalAgents: total, chain: chainLabel, chainId }
      }
      case 'agentx_identity_list_all': {
        const total = await chainDataReader.totalAgents(ck)
        if (total <= 0) return { agents: [], total: 0, chain: chainLabel, chainId }
        const fromId = Math.max(1, Number(args.fromId ?? 1))
        const toId = Math.min(total, Number(args.toId ?? total))
        const activeOnly = args.activeOnly === true || args.activeOnly === 'true'
        const capabilities = String(args.capabilities ?? '')
          .split(',').map(s => s.trim()).filter(Boolean)

        const agents = await chainDataReader.listAgents(ck, {
          fromId,
          toId,
          activeOnly,
          capabilities: capabilities.length > 0 ? capabilities : undefined,
          batchSize: config.agentsIndexBatchSize,
        })
        return { agents, total: agents.length, range: { fromId, toId }, chain: chainLabel, chainId }
      }
      case 'agentx_identity_metadata': {
        const agentId = Number(args.agentId)
        const [a] = await chainDataReader.listAgents(ck, { fromId: agentId, toId: agentId, batchSize: 1 })
        if (!a) return { agentId, exists: false, chain: chainLabel, chainId }
        return { ...a, exists: true, chain: chainLabel, chainId }
      }
      case 'agentx_identity_register':
        return { _writeOp: true, message: `WRITE. Use a wallet client to sign and submit to ${chainLabel}.`, contract: chain.identityRegistry, chain: chainLabel, chainId }

      // ── Subscription (SDK-backed via ChainDataReader) ──────────────
      case 'agentx_subscription_plans': {
        const planId = Number(args.planId)
        const plan = await chainDataReader.getPlan(ck, planId)
        return { planId: plan.planId, agentId: plan.agentId, creator: plan.creator, price: plan.price.toString(), period: plan.period, active: plan.active, payToken: plan.payToken, trialDays: plan.trialDays, chain: chainLabel, chainId }
      }
      case 'agentx_subscription_check': {
        // Accept both 'subscriberAddress' and 'subscriber' parameter names
        const subscriber = (args.subscriberAddress || args.subscriber || args.subscriber_address) as string
        const subscriberAddr = ethers.getAddress(subscriber)
        const ok = await chainDataReader.hasActiveSubscription(ck, subscriberAddr as Address, Number(args.agentId))
        return { active: ok, subscriber: subscriberAddr, agentId: Number(args.agentId), chain: chainLabel, chainId }
      }
      case 'agentx_subscription_detail': {
        const d = await chainDataReader.getSubscriptionDetail(ck, Number(args.subscriptionId))
        if (!d) return { error: `Subscription ${args.subscriptionId} not found`, chain: chainLabel, chainId }
        return {
          subscriptionId: d.subscriptionId, subscriber: d.subscriber, agentId: d.agentId, status: d.status,
          startedAt: d.startedAt, expiresAt: d.expiresAt, period: d.period, payToken: d.payToken,
          amountPaid: d.amountPaid > 2n ** 53n ? d.amountPaid.toString() : Number(d.amountPaid),
          trialActive: d.trialActive, trialEndsAt: d.trialEndsAt, fundsReleased: d.fundsReleased,
          chain: chainLabel, chainId,
        }
      }
      case 'agentx_subscription_my_list': {
        const user = args.userAddress as string
        const ids = await chainDataReader.getUserSubscriptions(ck, user as Address)
        return { subscriptionIds: ids, user, chain: chainLabel, chainId }
      }
      case 'agentx_subscription_subscribe':
        return { _writeOp: true, message: `WRITE. Subscribe via wallet client on ${chainLabel}.`, contract: chain.subscriptionManager, chain: chainLabel, chainId }
      case 'agentx_subscription_cancel':
        return { _writeOp: true, message: `WRITE. Cancel via wallet client on ${chainLabel}.`, contract: chain.subscriptionManager, chain: chainLabel, chainId }
      case 'agentx_subscription_release':
        return { _writeOp: true, message: `WRITE. Release via wallet client on ${chainLabel}.`, contract: chain.subscriptionManager, chain: chainLabel, chainId }
      case 'agentx_subscription_fee': {
        const fee = await chainDataReader.platformFeeBps(ck)
        return { platformFeeBps: fee, chain: chainLabel, chainId }
      }
      case 'agentx_subscription_create_plan':
        return {
          _writeOp: true,
          message: `WRITE. Create plan via wallet client on ${chainLabel}.`,
          contract: chain.subscriptionManager,
          args: {
            agentId: Number(args.agentId),
            price: String(args.price),
            period: String(args.period),
            payToken: args.payToken ? String(args.payToken) : ZERO_ADDRESS,
            trialDays: Number(args.trialDays ?? 0),
          },
          chain: chainLabel,
          chainId,
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

      // ── Gateway Conversation & Tasks (P8/P9) ────────────────────────
      case 'agentx_gateway_chat': {
        const message = args.message as string
        if (!message) return { error: 'message is required' }
        const auth = gatewayAuthHeaders(args)
        if (auth.error) return { error: auth.error }
        const body: Record<string, unknown> = { message }
        if (args.agent_id !== undefined) body.agentId = Number(args.agent_id)
        if (args.prompt !== undefined) body.prompt = args.prompt
        if (args.history !== undefined) body.history = args.history
        if (args.tenant_key_id !== undefined) body.tenantKeyId = args.tenant_key_id
        return collectChat(auth.headers, body)
      }
      case 'agentx_gateway_create_session': {
        const auth = gatewayAuthHeaders(args)
        if (auth.error) return { error: auth.error }
        const body: Record<string, unknown> = {}
        if (args.agent_id !== undefined) body.agentId = Number(args.agent_id)
        if (args.title !== undefined) body.title = args.title
        return gatewayPost('/sessions', auth.headers, body)
      }
      case 'agentx_gateway_create_task': {
        const sessionId = args.session_id as string
        const message = args.message as string
        if (!sessionId || !message) return { error: 'session_id and message are required' }
        const auth = gatewayAuthHeaders(args)
        if (auth.error) return { error: auth.error }
        const body: Record<string, unknown> = { message }
        if (args.agent_id !== undefined) body.agentId = Number(args.agent_id)
        if (args.prompt !== undefined) body.prompt = args.prompt
        if (args.tenant_key_id !== undefined) body.tenantKeyId = args.tenant_key_id
        return gatewayPost(`/sessions/${encodeURIComponent(sessionId)}/tasks`, auth.headers, body)
      }
      case 'agentx_gateway_get_task': {
        const taskId = args.task_id as string
        if (!taskId) return { error: 'task_id is required' }
        const auth = gatewayAuthHeaders(args)
        if (auth.error) return { error: auth.error }
        return gatewayGet(`/tasks/${encodeURIComponent(taskId)}`, auth.headers)
      }
      case 'agentx_gateway_list_tasks': {
        const sessionId = args.session_id as string
        if (!sessionId) return { error: 'session_id is required' }
        const auth = gatewayAuthHeaders(args)
        if (auth.error) return { error: auth.error }
        return gatewayGet(`/sessions/${encodeURIComponent(sessionId)}/tasks`, auth.headers)
      }
      case 'agentx_gateway_cancel_task': {
        const taskId = args.task_id as string
        if (!taskId) return { error: 'task_id is required' }
        const auth = gatewayAuthHeaders(args)
        if (auth.error) return { error: auth.error }
        return gatewayDelete(`/tasks/${encodeURIComponent(taskId)}`, auth.headers)
      }

      default:
        return { error: `Unknown tool: ${name}`, availableTools: MCP_TOOLS.map(t => t.name) }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { error: msg, tool: name, chain: chainLabel }
  }
}

export { executeToolCall }
