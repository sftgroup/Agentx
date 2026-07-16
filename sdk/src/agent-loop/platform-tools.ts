// ---------------------------------------------------------------------------
// @agentx/sdk — Platform Tools
// ---------------------------------------------------------------------------
// Exposes ALL AgentX platform capabilities as LLM-callable OpenAI function tools.
//
//   const tools = buildPlatformTools({ agentRunner, a2a, subscriptionManager, ... })
//   // → [{ type: "function", function: { name, description, parameters } }]
//
// When AgentLoop calls a tool:
//   platformExecutor(toolName, args, ctx) → result JSON
//
// Modules wrapped:
//   1. IdentityRegistry  — register / get / list / exists / metadata
//   2. SubscriptionManager — plans / subscribe / check / cancel / detail
//   3. A2AProtocol        — createTask / getTask / completeTask / getUserTasks / card
//   4. ReputationRegistry — rate / getRating / getReviews
//   5. ConfigurationRegistry — getConfig / getAgentConfigs / setConfig
//   6. MultiEndpointRegistry — getEndpoints / getBestEndpoint
//   7. Gateway API         — chat / tenant / history
// ---------------------------------------------------------------------------

import type { RunnableSkill } from '../agent/agent-runner'
import type { AgentRunner } from '../agent/agent-runner'
import type { A2AProtocol } from '../a2a/a2a'
import type { SubscriptionManager } from '../subscription/subscription'
import type { AgentRegistry } from '../registry/agent-registry'

// ── Tool Definition Types ──────────────────────────────────────────────────

export interface PlatformToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface PlatformToolContext {
  agentRunner: AgentRunner
  a2a: A2AProtocol
  subscriptionManager: SubscriptionManager
  agentRegistry: AgentRegistry
  reputationRegistry?: {
    rateAgent(agentId: number, rating: number, comment: string): Promise<unknown>
    getRating(agentId: number): Promise<{ averageRating: number; totalRatings: number }>
    getReviews(agentId: number): Promise<unknown[]>
  }
  configurationRegistry?: {
    getConfig(agentId: number, key: string): Promise<{ value: string; dataType: string }>
    getAgentConfigs(agentId: number): Promise<unknown[]>
    setConfig(agentId: number, key: string, value: string, dataType: string): Promise<unknown>
  }
  multiEndpointRegistry?: {
    getAgentEndpoints(agentId: number): Promise<unknown[]>
    getActiveAgentEndpoints(agentId: number): Promise<unknown[]>
    getBestMCPUrl(agentId: number): Promise<string>
  }
  gatewayUrl?: string
  gatewayToken?: string
  userAddress: string
}

// ── Schema Helpers ─────────────────────────────────────────────────────────

function required(keys: string[]): string[] { return keys }

function object(props: Record<string, Record<string, unknown>>, req?: string[]): Record<string, unknown> {
  const s: Record<string, unknown> = { type: 'object', properties: props }
  if (req) s.required = req
  return s
}

function str(desc: string, en?: string[]): Record<string, unknown> {
  const s: Record<string, unknown> = { type: 'string', description: desc }
  if (en) s.enum = en
  return s
}

function num(desc: string): Record<string, unknown> {
  return { type: 'number', description: desc }
}

function integer(desc: string): Record<string, unknown> {
  return { type: 'integer', description: desc }
}

function boolean(desc: string): Record<string, unknown> {
  return { type: 'boolean', description: desc }
}

function array(items: Record<string, unknown>, desc: string): Record<string, unknown> {
  return { type: 'array', items, description: desc }
}

// ── 1. IdentityRegistry Tools ──────────────────────────────────────────────

const identityRegistryTools: PlatformToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'agentx_identity_register',
      description: 'Register a new AI Agent on the AgentX blockchain. Required before any agent can be published, subscribed to, or used.',
      parameters: object({
        tokenURI: str('IPFS URI of the agent public metadata (ipfs://...)'),
        encryptedPayloadCid: str('IPFS CID of the encrypted agent payload'),
        eciesEncryptedKey: str('Hex-encoded ECIES-encrypted AES key for the payload'),
        aesKeyHex: str('Hex-encoded AES key (stored as metadata)'),
      }, required(['tokenURI', 'encryptedPayloadCid', 'eciesEncryptedKey'])),
    },
  },
  {
    type: 'function',
    function: {
      name: 'agentx_identity_get',
      description: 'Get detailed information about a registered Agent by its ID. Returns owner, metadata URI, active status, and on-chain metadata attributes.',
      parameters: object({
        agentId: integer('The numeric agent ID to query'),
      }, required(['agentId'])),
    },
  },
  {
    type: 'function',
    function: {
      name: 'agentx_identity_list',
      description: 'List all Agent IDs owned by a specific wallet address.',
      parameters: object({
        ownerAddress: str('Ethereum wallet address to query'),
      }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'agentx_identity_exists',
      description: 'Check if a specific Agent ID exists on the blockchain.',
      parameters: object({
        agentId: integer('The agent ID to check'),
      }, required(['agentId'])),
    },
  },
  {
    type: 'function',
    function: {
      name: 'agentx_identity_total_count',
      description: 'Get the total number of agents registered in the IdentityRegistry.',
      parameters: object({}),
    },
  },
]

// ── 2. SubscriptionManager Tools ───────────────────────────────────────────

const subscriptionTools: PlatformToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'agentx_subscription_plans',
      description: 'Get plan details for a specific subscription plan by its ID. Returns price, period, creator, pay token, trial days, and active status.',
      parameters: object({
        planId: integer('The plan ID to fetch'),
      }, required(['planId'])),
    },
  },
  {
    type: 'function',
    function: {
      name: 'agentx_subscription_check',
      description: 'Check if a wallet address has an active subscription for a specific agent.',
      parameters: object({
        subscriberAddress: str('Wallet address to check'),
        agentId: integer('The agent ID'),
      }, required(['subscriberAddress', 'agentId'])),
    },
  },
  {
    type: 'function',
    function: {
      name: 'agentx_subscription_detail',
      description: 'Get full subscription details including trial info, payment token, amount paid, escrow status.',
      parameters: object({
        subscriptionId: integer('The subscription ID'),
      }, required(['subscriptionId'])),
    },
  },
  {
    type: 'function',
    function: {
      name: 'agentx_subscription_my_list',
      description: 'List all subscription IDs belonging to the current user.',
      parameters: object({}),
    },
  },
  {
    type: 'function',
    function: {
      name: 'agentx_subscription_subscribe',
      description: 'Subscribe to a plan. For ETH plans this will send ETH. For ERC20 plans, the token must already be approved. This is a blockchain transaction — the user must approve it in their wallet.',
      parameters: object({
        planId: integer('The plan ID to subscribe to'),
        valueWei: str('Amount of ETH in wei to send (for ETH plans). Example: "1000000000000000000" for 1 ETH'),
      }, required(['planId'])),
    },
  },
  {
    type: 'function',
    function: {
      name: 'agentx_subscription_cancel',
      description: 'Cancel an existing subscription. If within trial period, funds may be refunded.',
      parameters: object({
        subscriptionId: integer('The subscription ID to cancel'),
      }, required(['subscriptionId'])),
    },
  },
  {
    type: 'function',
    function: {
      name: 'agentx_subscription_release',
      description: 'Release escrowed subscription funds to the agent creator (after trial window). Only callable by the subscriber.',
      parameters: object({
        subscriptionId: integer('The subscription ID'),
      }, required(['subscriptionId'])),
    },
  },
  {
    type: 'function',
    function: {
      name: 'agentx_subscription_fee',
      description: 'Get the current platform fee in basis points (e.g. 250 = 2.5%).',
      parameters: object({}),
    },
  },
]

// ── 3. A2AProtocol Tools ───────────────────────────────────────────────────

const a2aTools: PlatformToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'agentx_a2a_create_task',
      description: 'Create an on-chain Agent-to-Agent task. This delegates work to another AgentX agent. The target agent will see this as a pending task they can complete.',
      parameters: object({
        targetAgentId: integer('The Agent ID to delegate work to'),
        taskType: str('Type of task, e.g. "audit", "analyze", "generate", "review"'),
        inputData: str('JSON string of the task input. Include all details the target agent needs.'),
      }, required(['targetAgentId', 'taskType', 'inputData'])),
    },
  },
  {
    type: 'function',
    function: {
      name: 'agentx_a2a_get_task',
      description: 'Get full details of an A2A task by its ID — status, input, output, creator, timestamps.',
      parameters: object({
        taskId: integer('The A2A task ID'),
      }, required(['taskId'])),
    },
  },
  {
    type: 'function',
    function: {
      name: 'agentx_a2a_complete_task',
      description: 'Mark an A2A task as completed and submit the output data on-chain.',
      parameters: object({
        taskId: integer('The task ID to complete'),
        outputData: str('JSON string of the task output/result'),
      }, required(['taskId', 'outputData'])),
    },
  },
  {
    type: 'function',
    function: {
      name: 'agentx_a2a_my_tasks',
      description: 'Get all A2A task IDs assigned to or created by the current user.',
      parameters: object({}),
    },
  },
  {
    type: 'function',
    function: {
      name: 'agentx_a2a_agent_card',
      description: 'Get an agent\'s A2A card — name, capabilities, supported task types, protocol info.',
      parameters: object({
        agentId: integer('The agent ID'),
      }, required(['agentId'])),
    },
  },
]

// ── 4. ReputationRegistry Tools ────────────────────────────────────────────

const reputationTools: PlatformToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'agentx_reputation_rate',
      description: 'Rate an agent (1-5) and leave a comment on-chain.',
      parameters: object({
        agentId: integer('The agent ID to rate'),
        rating: integer('Rating from 1 (worst) to 5 (best)'),
        comment: str('Optional review comment'),
      }, required(['agentId', 'rating'])),
    },
  },
  {
    type: 'function',
    function: {
      name: 'agentx_reputation_get',
      description: 'Get the average rating and total number of ratings for an agent.',
      parameters: object({
        agentId: integer('The agent ID'),
      }, required(['agentId'])),
    },
  },
  {
    type: 'function',
    function: {
      name: 'agentx_reputation_reviews',
      description: 'Get all reviews for an agent (reviewer address, rating, comment, timestamp).',
      parameters: object({
        agentId: integer('The agent ID'),
      }, required(['agentId'])),
    },
  },
]

// ── 5. ConfigurationRegistry Tools ─────────────────────────────────────────

const configurationTools: PlatformToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'agentx_config_get',
      description: 'Read a single configuration value for an agent by key.',
      parameters: object({
        agentId: integer('The agent ID'),
        configKey: str('The configuration key name'),
      }, required(['agentId', 'configKey'])),
    },
  },
  {
    type: 'function',
    function: {
      name: 'agentx_config_list',
      description: 'List all configuration entries for an agent.',
      parameters: object({
        agentId: integer('The agent ID'),
      }, required(['agentId'])),
    },
  },
  {
    type: 'function',
    function: {
      name: 'agentx_config_set',
      description: 'Set or update a configuration value for an agent on-chain. Only the agent owner can write.',
      parameters: object({
        agentId: integer('The agent ID'),
        key: str('Configuration key name'),
        value: str('Configuration value'),
        dataType: str('Data type: "string", "number", "boolean", "json"', ['string', 'number', 'boolean', 'json']),
      }, required(['agentId', 'key', 'value'])),
    },
  },
]

// ── 6. MultiEndpointRegistry Tools ─────────────────────────────────────────

const endpointTools: PlatformToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'agentx_endpoint_list',
      description: 'Get all registered endpoints for an agent (MCP URLs, API endpoints, etc.).',
      parameters: object({
        agentId: integer('The agent ID'),
      }, required(['agentId'])),
    },
  },
  {
    type: 'function',
    function: {
      name: 'agentx_endpoint_active',
      description: 'Get only active endpoints for an agent. Useful for finding available MCP or API servers.',
      parameters: object({
        agentId: integer('The agent ID'),
      }, required(['agentId'])),
    },
  },
  {
    type: 'function',
    function: {
      name: 'agentx_endpoint_best_mcp',
      description: 'Find the best available MCP endpoint URL for an agent. Automatically picks the healthiest active endpoint.',
      parameters: object({
        agentId: integer('The agent ID'),
      }, required(['agentId'])),
    },
  },
]

// ── 7. Gateway API Tools ───────────────────────────────────────────────────

const gatewayTools: PlatformToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'agentx_gateway_chat',
      description: 'Call an LLM through the AgentX Gateway using platform quota or BYOK key. Supports OpenAI models via SSE streaming.',
      parameters: object({
        model: str('LLM model name, e.g. "gpt-4o", "gpt-4o-mini"'),
        messages: array(
          object({
            role: str('Message role', ['system', 'user', 'assistant', 'tool']),
            content: str('Message content text'),
          }),
          'Array of conversation messages'
        ),
        keySource: str('API key source', ['platform', 'tenant_owned']),
        tenantKeyId: str('BYOK key UUID (required when key_source is "tenant_owned")'),
        temperature: num('Sampling temperature 0-2'),
        max_tokens: integer('Maximum tokens in the response'),
      }, required(['model', 'messages'])),
    },
  },
  {
    type: 'function',
    function: {
      name: 'agentx_gateway_tenant_me',
      description: 'Get the current tenant (user) profile: plan info, API keys, today\'s usage quota.',
      parameters: object({}),
    },
  },
  {
    type: 'function',
    function: {
      name: 'agentx_gateway_tenant_usage',
      description: 'Get usage history for the current tenant: token consumption, tool calls by day.',
      parameters: object({
        days: integer('Number of days of history (default 30)'),
      }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'agentx_gateway_tenant_keys',
      description: 'List all BYOK API keys registered for the current tenant.',
      parameters: object({}),
    },
  },
  {
    type: 'function',
    function: {
      name: 'agentx_gateway_models',
      description: 'List available LLM models: both platform-provided and tenant-owned models.',
      parameters: object({}),
    },
  },
]

// ── Build All Tools ─────────────────────────────────────────────────────────

export function buildPlatformTools(
  available?: ('identity' | 'subscription' | 'a2a' | 'reputation' | 'configuration' | 'endpoint' | 'gateway')[]
): PlatformToolDef[] {
  const modules = available ?? ['identity', 'subscription', 'a2a', 'reputation', 'configuration', 'endpoint', 'gateway']
  const tools: PlatformToolDef[] = []

  for (const mod of modules) {
    switch (mod) {
      case 'identity': tools.push(...identityRegistryTools); break
      case 'subscription': tools.push(...subscriptionTools); break
      case 'a2a': tools.push(...a2aTools); break
      case 'reputation': tools.push(...reputationTools); break
      case 'configuration': tools.push(...configurationTools); break
      case 'endpoint': tools.push(...endpointTools); break
      case 'gateway': tools.push(...gatewayTools); break
    }
  }

  return tools
}

export function getAllPlatformToolNames(): string[] {
  return buildPlatformTools().map(t => t.function.name)
}

// ── Tool Executor ───────────────────────────────────────────────────────────

export async function executePlatformTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: PlatformToolContext
): Promise<unknown> {
  try {
    switch (toolName) {
      // ── Identity ──────────────────────────────────
      case 'agentx_identity_register': {
        const { tokenURI, encryptedPayloadCid, eciesEncryptedKey, aesKeyHex } = args as any
        const metadata = [
          { key: 'encryptedPayloadCid', value: encryptedPayloadCid },
          { key: 'eciesEncryptedKey', value: eciesEncryptedKey },
        ]
        if (aesKeyHex) metadata.push({ key: 'aesKeyHex', value: aesKeyHex })
        return ctx.agentRegistry.register(tokenURI, metadata)
      }
      case 'agentx_identity_get':
        return {
          tokenURI: await ctx.agentRegistry.tokenURI(args.agentId as number),
          attributes: await ctx.agentRegistry.getAttributes(args.agentId as number),
          exists: await ctx.agentRegistry.agentExists(args.agentId as number),
        }
      case 'agentx_identity_list':
        return ctx.agentRegistry.getAgentsByOwner((args.ownerAddress ?? ctx.userAddress) as `0x${string}`)
      case 'agentx_identity_exists':
        return ctx.agentRegistry.agentExists(args.agentId as number)
      case 'agentx_identity_total_count':
        return { totalAgents: await ctx.agentRegistry.getCurrentAgentId() }

      // ── Subscription ──────────────────────────────
      case 'agentx_subscription_plans':
        return ctx.subscriptionManager.getPlan(args.planId as number)
      case 'agentx_subscription_check':
        return ctx.subscriptionManager.hasActiveSubscription(
          (args.subscriberAddress ?? ctx.userAddress) as `0x${string}`,
          args.agentId as number
        )
      case 'agentx_subscription_detail':
        return ctx.subscriptionManager.getSubscriptionDetail(args.subscriptionId as number)
      case 'agentx_subscription_my_list':
        return ctx.subscriptionManager.getUserSubscriptions(ctx.userAddress as `0x${string}`)
      case 'agentx_subscription_subscribe': {
        const valueWei = args.valueWei ? BigInt(args.valueWei as string) : undefined
        return ctx.subscriptionManager.subscribe(args.planId as number, { valueWei })
      }
      case 'agentx_subscription_cancel':
        return ctx.subscriptionManager.cancel(args.subscriptionId as number)
      case 'agentx_subscription_release':
        return ctx.subscriptionManager.releaseFunds(args.subscriptionId as number)
      case 'agentx_subscription_fee':
        return { platformFeeBps: await ctx.subscriptionManager.getPlatformFeeBps() }

      // ── A2A ───────────────────────────────────────
      case 'agentx_a2a_create_task':
        return ctx.a2a.createTask(
          args.targetAgentId as number,
          args.taskType as string,
          typeof args.inputData === 'string' ? JSON.parse(args.inputData as string) : args.inputData as Record<string, unknown>
        )
      case 'agentx_a2a_get_task':
        return ctx.a2a.getTask(args.taskId as number)
      case 'agentx_a2a_complete_task':
        return ctx.a2a.completeTask(args.taskId as number, args.outputData as string)
      case 'agentx_a2a_my_tasks':
        return ctx.a2a.getUserTasks(ctx.userAddress as `0x${string}`)
      case 'agentx_a2a_agent_card':
        return ctx.a2a.getAgentCard(args.agentId as number)

      // ── Reputation ─────────────────────────────────
      case 'agentx_reputation_rate':
        if (!ctx.reputationRegistry) throw new Error('ReputationRegistry not configured')
        return ctx.reputationRegistry.rateAgent(args.agentId as number, args.rating as number, (args.comment as string) ?? '')
      case 'agentx_reputation_get':
        if (!ctx.reputationRegistry) throw new Error('ReputationRegistry not configured')
        return ctx.reputationRegistry.getRating(args.agentId as number)
      case 'agentx_reputation_reviews':
        if (!ctx.reputationRegistry) throw new Error('ReputationRegistry not configured')
        return ctx.reputationRegistry.getReviews(args.agentId as number)

      // ── Configuration ──────────────────────────────
      case 'agentx_config_get':
        if (!ctx.configurationRegistry) throw new Error('ConfigurationRegistry not configured')
        return ctx.configurationRegistry.getConfig(args.agentId as number, args.configKey as string)
      case 'agentx_config_list':
        if (!ctx.configurationRegistry) throw new Error('ConfigurationRegistry not configured')
        return ctx.configurationRegistry.getAgentConfigs(args.agentId as number)
      case 'agentx_config_set':
        if (!ctx.configurationRegistry) throw new Error('ConfigurationRegistry not configured')
        return ctx.configurationRegistry.setConfig(
          args.agentId as number, args.key as string,
          args.value as string, (args.dataType as string) ?? 'string'
        )

      // ── MultiEndpoint ──────────────────────────────
      case 'agentx_endpoint_list':
        if (!ctx.multiEndpointRegistry) throw new Error('MultiEndpointRegistry not configured')
        return ctx.multiEndpointRegistry.getAgentEndpoints(args.agentId as number)
      case 'agentx_endpoint_active':
        if (!ctx.multiEndpointRegistry) throw new Error('MultiEndpointRegistry not configured')
        return ctx.multiEndpointRegistry.getActiveAgentEndpoints(args.agentId as number)
      case 'agentx_endpoint_best_mcp':
        if (!ctx.multiEndpointRegistry) throw new Error('MultiEndpointRegistry not configured')
        return { mcpUrl: await ctx.multiEndpointRegistry.getBestMCPUrl(args.agentId as number) }

      // ── Gateway ────────────────────────────────────
      case 'agentx_gateway_chat': {
        if (!ctx.gatewayUrl || !ctx.gatewayToken) throw new Error('Gateway not configured')
        const body: Record<string, unknown> = {
          model: args.model ?? 'gpt-4o',
          messages: args.messages,
          stream: false,
          key_source: args.keySource ?? 'platform',
        }
        if (args.temperature !== undefined) body.temperature = args.temperature
        if (args.max_tokens) body.max_tokens = args.max_tokens
        if (args.tenantKeyId) body.tenant_key_id = args.tenantKeyId

        const res = await fetch(`${ctx.gatewayUrl}/api/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ctx.gatewayToken}`,
          },
          body: JSON.stringify(body),
        })
        return res.json()
      }
      case 'agentx_gateway_tenant_me': {
        if (!ctx.gatewayUrl || !ctx.gatewayToken) throw new Error('Gateway not configured')
        const res = await fetch(`${ctx.gatewayUrl}/api/v1/tenant/me`, {
          headers: { 'Authorization': `Bearer ${ctx.gatewayToken}` },
        })
        return res.json()
      }
      case 'agentx_gateway_tenant_usage': {
        if (!ctx.gatewayUrl || !ctx.gatewayToken) throw new Error('Gateway not configured')
        const res = await fetch(`${ctx.gatewayUrl}/api/v1/tenant/usage?days=${args.days ?? 30}`, {
          headers: { 'Authorization': `Bearer ${ctx.gatewayToken}` },
        })
        return res.json()
      }
      case 'agentx_gateway_tenant_keys': {
        if (!ctx.gatewayUrl || !ctx.gatewayToken) throw new Error('Gateway not configured')
        const res = await fetch(`${ctx.gatewayUrl}/api/v1/tenant/keys`, {
          headers: { 'Authorization': `Bearer ${ctx.gatewayToken}` },
        })
        return res.json()
      }
      case 'agentx_gateway_models': {
        if (!ctx.gatewayUrl || !ctx.gatewayToken) throw new Error('Gateway not configured')
        const res = await fetch(`${ctx.gatewayUrl}/api/v1/models`, {
          headers: { 'Authorization': `Bearer ${ctx.gatewayToken}` },
        })
        return res.json()
      }

      default:
        throw new Error(`Unknown platform tool: ${toolName}`)
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message, tool: toolName }
  }
}

// ── Agent Loop Integration ──────────────────────────────────────────────────

/**
 * Merge platform tools into an AgentLoop's skill list.
 * When AgentLoop calls execute(toolName, args), the platform executor handles it.
 */
export function wrapPlatformToolsAsSkills(
  ctx: PlatformToolContext,
  modules?: ('identity' | 'subscription' | 'a2a' | 'reputation' | 'configuration' | 'endpoint' | 'gateway')[]
): RunnableSkill[] {
  const toolDefs = buildPlatformTools(modules)

  return toolDefs.map(def => ({
    name: def.function.name,
    description: def.function.description,
    inputSchema: def.function.parameters as Record<string, unknown>,
    mode: 'open' as const,
    execute: async (input: Record<string, unknown>) => {
      return executePlatformTool(def.function.name, input, ctx)
    },
  }))
}
