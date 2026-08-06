// ---------------------------------------------------------------------------
// AgentX Gateway — MCP Tool Definitions (split from mcp.ts, R7)
// ---------------------------------------------------------------------------
// Declarative list of all 32 AgentX MCP tools with input schemas. Consumed by
// the MCP router (tools/list) and by the tool executor (name validation).
// ---------------------------------------------------------------------------

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
    name: 'agentx_identity_list_all',
    description: 'List all agents with structured metadata (name, capabilities, skills, isActive). Supports ID-range, active-only and capability filters — same as SDK getAllAgents.',
    inputSchema: {
      type: 'object',
      properties: {
        ...commonArgs(),
        fromId: { type: 'integer', description: 'Start Agent ID (default 1)' },
        toId: { type: 'integer', description: 'End Agent ID (default: last agent)' },
        activeOnly: { type: 'boolean', description: 'Only return isActive=true agents' },
        capabilities: { type: 'string', description: 'Comma-separated capability filter, e.g. "trading,analysis"' },
      },
    },
  },
  {
    name: 'agentx_identity_metadata',
    description: 'Get structured metadata for one agent: name, description, capabilities, skills, isActive, createdAt.',
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
  {
    name: 'agentx_subscription_create_plan',
    description: 'Create a subscription plan for an agent. WRITE operation. Note: period must be one of "day" | "week" | "month" | "year" (contract `_periodToSeconds` only recognizes these; anything else silently falls back to 30 days).',
    inputSchema: {
      type: 'object',
      properties: {
        ...commonArgs(),
        agentId: { type: 'integer', description: 'Agent ID' },
        price: { type: 'string', description: 'Price in wei (string)' },
        period: { type: 'string', description: '"day" | "week" | "month" | "year"' },
        payToken: { type: 'string', description: 'ERC20 token address; omit for native ETH' },
        trialDays: { type: 'integer', description: 'Trial days, 0-30 (default 0)' },
      },
      required: ['agentId', 'price', 'period'],
    },
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
  // ── Gateway Conversation & Tasks (P8/P9) ────────────────────────────
  // R14: all conversation/task tools require tenant auth via
  // `access_token` (registered-user JWT) only. B-end integration keys
  // (`agentx_...`) cannot call MCP — they are limited to the REST chat service.
  {
    name: 'agentx_gateway_chat',
    description: 'Single-turn conversation with an agent (SSE stream collected into a reply). Requires access_token (registered-user JWT).',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'User message' },
        agent_id: { type: 'integer', description: 'Agent ID (omit when using inline prompt)' },
        prompt: { type: 'string', description: 'Inline mode: caller-supplied system prompt (bypasses agent lookup)' },
        history: { type: 'array', description: 'Optional conversation history [{role, content}]' },
        tenant_key_id: { type: 'string', description: 'BYOK: id of a stored tenant-owned API key' },
        access_token: { type: 'string', description: 'Gateway JWT — registered-user auth (required)' },
      },
      required: ['message'],
    },
  },
  {
    name: 'agentx_gateway_create_session',
    description: 'Create a conversation session (dialog container; idempotent). Requires access_token (registered-user JWT).',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'integer', description: 'Agent ID' },
        title: { type: 'string', description: 'Optional session title' },
        access_token: { type: 'string', description: 'Gateway JWT — registered-user auth (required)' },
      },
    },
  },
  {
    name: 'agentx_gateway_create_task',
    description: 'Create a background task in a session (returns immediately with taskId; queued→running→done). May return 403 PARALLEL_TASKS_DISABLED. Requires access_token (registered-user JWT).',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Session ID (from agentx_gateway_create_session)' },
        message: { type: 'string', description: 'Task instruction' },
        agent_id: { type: 'integer', description: 'Agent ID (omit when using inline prompt)' },
        prompt: { type: 'string', description: 'Inline mode: caller-supplied system prompt' },
        tenant_key_id: { type: 'string', description: 'BYOK: id of a stored tenant-owned API key' },
        access_token: { type: 'string', description: 'Gateway JWT — registered-user auth (required)' },
      },
      required: ['session_id', 'message'],
    },
  },
  {
    name: 'agentx_gateway_get_task',
    description: 'Get task detail by id (status, result, error). Requires access_token (registered-user JWT).',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID' },
        access_token: { type: 'string', description: 'Gateway JWT — registered-user auth (required)' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'agentx_gateway_list_tasks',
    description: 'List all tasks of a session. Requires access_token (registered-user JWT).',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Session ID' },
        access_token: { type: 'string', description: 'Gateway JWT — registered-user auth (required)' },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'agentx_gateway_cancel_task',
    description: 'Cancel a task (queued → cancelled; running → aborted; terminal states are idempotent). Requires access_token (registered-user JWT).',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID' },
        access_token: { type: 'string', description: 'Gateway JWT — registered-user auth (required)' },
      },
      required: ['task_id'],
    },
  },
]

export { MCP_TOOLS }
export type { MCPTool }
