// ---------------------------------------------------------------------------
// @agentx/sdk — Agent Runner
// ---------------------------------------------------------------------------
// The unified entry point for "using" an Agent.
//
//   const runner = new AgentRunner({ reader, wallet })
//   const ctx = await runner.useAgent(42)
//   // ctx.prompt → system prompt for LLM
//   // ctx.skills → [{ name, description, inputSchema, execute }]
//   // ctx.mcp    → MCP connection info
//
//   对于 Open Skill：  直接本地执行（源码在解密后的 payload 里）
//   对于 Closed Skill：通过 MCP 远程调用 → 发布者服务器执行 + 校验订阅
// ---------------------------------------------------------------------------

import { eciesEncrypt, generateAesKey } from '../core/crypto'
import { unpackAgent } from '../core/crypto'
import { IPFSFetcher } from '../registry/ipfs-fetcher'
import type {
  AgentPayload, AgentPrivatePayload,
  EncryptedPayload, SkillDef,
  PackResult, SubscriptionRequired,
} from '../core/types'
import { AgentXError, AgentXErrorCode } from '../core/types'

// ── Injected Dependencies (viem / wagmi integration) ───────────────────────

/** Minimal on-chain reader interface — implement with viem. */
export interface OnChainReader {
  /** Read tokenURI from IdentityRegistry by tokenId. */
  getTokenURI(agentId: number): Promise<string>
  /** Get agent metadata attributes (returned as key-value pairs). */
  getAttributes(agentId: number): Promise<Record<string, string>>
  /** Check if `address` has an active subscription for `agentId`. */
  hasActiveSubscription(address: string, agentId: number): Promise<boolean>
}

/** Minimal wallet signer interface — implement with wagmi/viem. */
export interface WalletSigner {
  /** Sign a message (for authentication to MCP servers). */
  signMessage(message: string): Promise<string>
  /** Get the current wallet address. */
  getAddress(): Promise<string>
  /** Get the wallet's ECDSA private key (required for ECIES decryption). */
  getPrivateKey?(): Promise<string>
}

// ── Agent Runner Configuration ─────────────────────────────────────────────

export interface AgentRunnerConfig {
  /** On-chain data reader (injected from viem/wagmi). */
  reader: OnChainReader
  /** Wallet signer (injected from wagmi). */
  wallet: WalletSigner
  /** IPFS fetcher instance (creates default if omitted). */
  ipfsFetcher?: IPFSFetcher
  /** IPFS gateway list (overrides IPFSFetcher defaults). */
  ipfsGateways?: string[]
}

// ── Run Context (returned by useAgent) ─────────────────────────────────────

export interface AgentRunContext {
  /** Agent NFT token ID */
  agentId: number
  /** System prompt — inject into LLM conversation */
  prompt: string
  /** All skills with execution metadata */
  skills: RunnableSkill[]
  /** MCP connection info */
  mcp: {
    type: string
    url?: string
    toolFilter?: string[]
  }
  /** Subscription expiry timestamp (0 = unknown) */
  subscriptionExpiry: number
}

export interface RunnableSkill {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  /** Execution mode */
  mode: 'open' | 'mcp' | 'a2a'
  /** If mode='a2a', the on-chain Agent ID being delegated to */
  a2aTargetAgentId?: number
  /**
   * Execute this skill with the given input.
   * - Open: runs locally (caller provides implementation)
   * - MCP: POSTs to the publisher's MCP server
   * - A2A: loads target Agent context (prompt+skills) via AgentRunner
   */
  execute(input: Record<string, unknown>): Promise<unknown>
}

// ── A2A Delegation Result ────────────────────────────────────────────────

/**
 * Standard return type for A2A skill execution.
 * The calling LLM receives the sub-Agent's prompt and skills
 * and can inject them into the conversation.
 */
export interface A2ASkillResult {
  /** On-chain Agent ID that was delegated to */
  agentId: number
  /** Sub-Agent's decrypted system prompt */
  prompt: string
  /** Sub-Agent's skills (name + description + schema only, no execute) */
  skills: {
    name: string
    description: string
    inputSchema: Record<string, unknown>
  }[]
  /** The original input passed by the caller */
  callerInput: Record<string, unknown>
}

// ── Agent Runner ───────────────────────────────────────────────────────────

export class AgentRunner {
  private reader: OnChainReader
  private wallet: WalletSigner
  private ipfs: IPFSFetcher

  constructor(config: AgentRunnerConfig) {
    this.reader = config.reader
    this.wallet = config.wallet
    this.ipfs = config.ipfsFetcher ?? new IPFSFetcher({
      fallbackGateways: config.ipfsGateways ?? [
        'gateway.pinata.cloud',
        'dweb.link',
        'cf-ipfs.com',
      ],
    })
  }

  // ── Primary API: useAgent ────────────────────────────────────────────────

  /**
   * Load and decrypt an Agent, returning a run context ready to inject
   * into any LLM conversation.
   *
   * Steps:
   *   1. Verify on-chain subscription (frontend check)
   *   2. Fetch metadata → get encryptedPayloadCid + eciesEncryptedKey
   *   3. IPFS fetch encrypted payload
   *   4. ECIES decrypt AES key (using wallet private key)
   *   5. AES-256-GCM decrypt payload → { prompt, skills, mcp }
   *   6. Build RunnableSkill wrappers (Open: local stub, Closed: MCP remote)
   */
  async useAgent(agentId: number): Promise<AgentRunContext> {
    // 1. Subscription check (frontend — MCP server also checks)
    const address = await this.wallet.getAddress()
    const isActive = await this.reader.hasActiveSubscription(address, agentId)
    if (!isActive) {
      const err = new AgentXError(
        AgentXErrorCode.NOT_SUBSCRIBED,
        `No active subscription for Agent #${agentId}. ` +
        `Check error.paymentInfo for auto-subscribe via wallet/X402.`,
      )
      ;(err as AgentXError & { paymentInfo: SubscriptionRequired }).paymentInfo = {
        agentId,
      }
      throw err
    }

    // 2. Read on-chain metadata
    const attrs = await this.reader.getAttributes(agentId)
    const encryptedPayloadCid = attrs.encryptedPayloadCid
    const eciesEncryptedKey = attrs.eciesEncryptedKey

    if (!encryptedPayloadCid || !eciesEncryptedKey) {
      throw new AgentXError(
        AgentXErrorCode.AGENT_NOT_FOUND,
        `Agent #${agentId} metadata incomplete — missing encryptedPayloadCid or eciesEncryptedKey`
      )
    }

    // 3. Fetch encrypted payload from IPFS
    let encryptedPayload: EncryptedPayload
    try {
      encryptedPayload = await this.ipfs.fetchEncryptedPayload(encryptedPayloadCid)
    } catch (e) {
      throw new AgentXError(
        AgentXErrorCode.IPFS_FETCH_FAILED,
        `Failed to fetch encrypted payload for agent #${agentId}: ${e}`
      )
    }

    // 4 + 5. ECIES + AES decrypt
    let privatePayload: AgentPrivatePayload
    try {
      const privKey = await this._getPrivateKey()
      privatePayload = unpackAgent(encryptedPayload, eciesEncryptedKey, privKey)
    } catch (e) {
      throw new AgentXError(
        AgentXErrorCode.DECRYPTION_FAILED,
        `Failed to decrypt agent #${agentId}: ${e}`
      )
    }

    // 6. Build runnable skills
    const skills = privatePayload.skills.map(s => this._wrapSkill(s))

    return {
      agentId,
      prompt: privatePayload.prompt,
      skills,
      mcp: {
        type: privatePayload.mcp.type,
        url: privatePayload.mcp.url,
        toolFilter: privatePayload.mcp.toolFilter,
      },
      subscriptionExpiry: 0,
    }
  }

  // ── Publishing ───────────────────────────────────────────────────────────

  /**
   * Pack an AgentPayload for publishing (encryption only, no IPFS upload).
   * Caller is responsible for IPFS upload and on-chain registration.
   */
  packForPublish(payload: AgentPayload, publicKey: string): PackResult {
    const key = generateAesKey()
    return {
      encryptedCid: '',
      publicCid: '',
      aesKeyHex: key,
      eciesEncryptedKeyHex: eciesEncrypt(key, publicKey),
    }
  }

  // ── Internals ────────────────────────────────────────────────────────────

  /** Wrap a SkillDef into a RunnableSkill with execute(). */
  private _wrapSkill(skill: SkillDef): RunnableSkill {
    let mode: RunnableSkill['mode'] = 'open'
    let executeFn: (input: Record<string, unknown>) => Promise<unknown>

    if (skill.execution) {
      if (skill.execution.type === 'mcp') {
        mode = 'mcp'
        const endpoint = skill.execution.endpoint ?? ''
        const toolName = skill.execution.toolName ?? skill.name
        executeFn = async (input: Record<string, unknown>) => {
          return this._executeMCPTool(endpoint, toolName, input)
        }
      } else if (skill.execution.type === 'a2a') {
        mode = 'a2a'
        executeFn = async (input: Record<string, unknown>) => {
          return this._executeA2ASkill(skill, input)
        }
      } else {
        throw new AgentXError(
          AgentXErrorCode.INVALID_SCHEMA,
          `Unknown execution type "${(skill.execution as Record<string,string>).type}" for skill "${skill.name}"`
        )
      }
    } else {
      executeFn = async () => {
        throw new AgentXError(
          AgentXErrorCode.INVALID_SCHEMA,
          `Open skill "${skill.name}" has no local executor. ` +
          `Implement execute() or switch to execution.type = "mcp" or "a2a".`
        )
      }
    }

    return {
      name: skill.name,
      description: skill.description,
      inputSchema: skill.inputSchema as unknown as Record<string, unknown>,
      outputSchema: skill.outputSchema as unknown as Record<string, unknown>,
      mode,
      execute: executeFn,
      /** If A2A, carry delegation metadata so the LLM can see it */
      a2aTargetAgentId: skill.execution?.type === 'a2a' ? (skill.execution as import('../core/types').A2ASkillExecution).targetAgentId : undefined,
    }
  }

  /** Call a tool on the publisher's MCP server (Closed skill). */
  private async _executeMCPTool(
    endpoint: string,
    toolName: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const address = await this.wallet.getAddress()

    const timestamp = Math.floor(Date.now() / 1000)
    const message = `agentx:mcp:${toolName}:${timestamp}`
    const signature = await this.wallet.signMessage(message)

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Subscriber-Address': address,
        'X-Signature': signature,
        'X-Timestamp': String(timestamp),
      },
      body: JSON.stringify({
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: params,
        },
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      if (res.status === 403) {
        throw new AgentXError(
          AgentXErrorCode.SUBSCRIPTION_EXPIRED,
          `MCP server rejected request: subscription may have expired. ${text}`
        )
      }
      throw new AgentXError(
        AgentXErrorCode.TX_FAILED,
        `MCP tool "${toolName}" failed (HTTP ${res.status}): ${text}`
      )
    }

    const data = await res.json() as { content?: { type: string; text?: string }[] }
    const content = data.content?.[0]
    if (content?.type === 'text' && content.text) {
      try {
        return JSON.parse(content.text)
      } catch {
        return content.text
      }
    }
    return data
  }

  /**
   * Execute an A2A skill — delegate to another AgentX Agent.
   *
   * Standard Interface:
   *   Input:  { task, ...taskSpecificParams }
   *   Output: { agentId, prompt, skills[] }
   *
   * The caller (LLM) receives the sub-Agent's prompt + skill list.
   * The LLM then decides how to use the sub-Agent — typically by
   * injecting the sub-Agent's system prompt and calling its skills.
   */
  private async _executeA2ASkill(
    skill: SkillDef,
    input: Record<string, unknown>
  ): Promise<A2ASkillResult> {
    const exec = skill.execution as import('../core/types').A2ASkillExecution
    if (!exec || exec.type !== 'a2a') {
      throw new AgentXError(
        AgentXErrorCode.INVALID_SCHEMA,
        `Skill "${skill.name}" is not an A2A delegation skill`
      )
    }

    const targetAgentId = exec.targetAgentId

    // Load the target Agent's full context
    let subContext: AgentRunContext
    try {
      subContext = await this.useAgent(targetAgentId)
    } catch (e) {
      throw new AgentXError(
        AgentXErrorCode.AGENT_NOT_FOUND,
        `A2A delegation failed: cannot load Agent #${targetAgentId}. ${e}`
      )
    }

    // Apply skill filter if specified
    if (exec.skillFilter && exec.skillFilter.length > 0) {
      const filterSet = new Set(exec.skillFilter)
      subContext = {
        ...subContext,
        skills: subContext.skills.filter(s => filterSet.has(s.name)),
      }
    }

    // Apply prompt override if specified
    if (exec.promptOverride) {
      subContext = { ...subContext, prompt: exec.promptOverride }
    }

    return {
      agentId: targetAgentId,
      prompt: subContext.prompt,
      skills: subContext.skills.map(s => ({
        name: s.name,
        description: s.description,
        inputSchema: s.inputSchema,
      })),
      // Pass the caller's input to the sub-agent's context
      callerInput: input,
    }
  }

  private async _getPrivateKey(): Promise<string> {
    if (this.wallet.getPrivateKey) return this.wallet.getPrivateKey()
    throw new AgentXError(
      AgentXErrorCode.WALLET_NOT_CONNECTED,
      'Wallet must support getPrivateKey() for ECIES decryption.'
    )
  }
}
