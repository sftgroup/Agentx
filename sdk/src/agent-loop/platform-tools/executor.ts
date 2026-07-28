import type { PlatformToolDef, PlatformToolContext } from "./definitions"
import { buildPlatformTools } from "./definitions"
import type { RunnableSkill } from "../../agent/agent-runner"

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

      // ── IPFS ───────────────────────────────────────
      case 'agentx_ipfs_upload': {
        if (!ctx.ipfsUploader) throw new Error('IPFSUploader not configured')
        const data = typeof args.data === 'string' ? JSON.parse(args.data as string) : args.data
        const result = await ctx.ipfsUploader.uploadJSON(data, { name: args.name as string })
        return { cid: result.cid, url: result.url }
      }
      case 'agentx_ipfs_upload_encrypted': {
        if (!ctx.ipfsUploader) throw new Error('IPFSUploader not configured')
        const { generateAesKey, encryptPayload } = await import('../../core/crypto')
        const privatePayload = {
          prompt: args.prompt as string,
          skills: args.skillsJson ? JSON.parse(args.skillsJson as string) : [],
          mcp: args.mcpJson ? JSON.parse(args.mcpJson as string) : {},
        }
        const key = generateAesKey()
        const encrypted = encryptPayload(privatePayload, key)
        const result = await ctx.ipfsUploader.uploadEncryptedPayload(encrypted, args.agentName as string)
        return { cid: result.cid, url: result.url, aesKeyHex: key }
      }
      case 'agentx_ipfs_get_url': {
        const gateway = (args.gateway as string) ?? 'https://ipfs.io'
        return { url: `${gateway}/ipfs/${args.cid}` }
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
  modules?: ('identity' | 'subscription' | 'a2a' | 'reputation' | 'configuration' | 'endpoint' | 'gateway' | 'ipfs')[]
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
