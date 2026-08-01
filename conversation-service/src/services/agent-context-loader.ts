// AgentX Conversation Service — Agent Context Loader
// Fetches agent metadata + skills from Gateway, builds runnable context.

import type { AgentRunContext } from '@agentxv2/sdk/react'
import { config } from '../config'
import type { ToolExecutor } from './tool-executor'

interface GatewayAgent {
  id: number
  owner: string
  name: string
  description: string
  metadata_json: Record<string, unknown>
}

interface AgentSkillDef {
  name: string
  description: string
  version?: string
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
  outputSchema?: Record<string, unknown>
  execution?: {
    type: 'mcp' | 'a2a'
    endpoint?: string
    toolName?: string
    targetAgentId?: number
    skillFilter?: string[]
    promptOverride?: string
  }
}

export interface RunnableSkill {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  execute(input: Record<string, unknown>): Promise<unknown>
}

export interface LoadedAgentContext {
  agentId: number
  prompt: string
  skills: RunnableSkill[]
  owner: string
}

export class AgentContextLoader {
  private cache = new Map<number, { ctx: LoadedAgentContext; ts: number }>()

  constructor(
    private readonly gatewayUrl: string = config.gatewayUrl,
    private readonly ttlMs: number = config.contextCacheTtlSec * 1000,
    private readonly toolExecutor?: ToolExecutor,
  ) {}

  /** Load agent context from Gateway, with memory cache */
  async load(agentId: number): Promise<LoadedAgentContext> {
    const cached = this.cache.get(agentId)
    if (cached && Date.now() - cached.ts < this.ttlMs) {
      return cached.ctx
    }

    const ctx = await this.fetchAndBuild(agentId)
    this.cache.set(agentId, { ctx, ts: Date.now() })
    return ctx
  }

  /** Invalidate cached context (e.g. after agent update) */
  invalidate(agentId: number): void {
    this.cache.delete(agentId)
  }

  // ── Private ────────────────────────────────────────────────────────────

  private async fetchAndBuild(agentId: number): Promise<LoadedAgentContext> {
    const agent = await this.fetchAgent(agentId)
    const skills = this.parseSkills(agent.metadata_json).map(s => this.wrapSkill(s))

    return {
      agentId,
      prompt: agent.description || agent.name || '',
      skills,
      owner: agent.owner,
    }
  }

  private async fetchAgent(agentId: number): Promise<GatewayAgent> {
    const res = await fetch(`${this.gatewayUrl}/api/v1/agents/${agentId}`)
    if (!res.ok) {
      throw new Error(`Agent ${agentId} not found (Gateway HTTP ${res.status})`)
    }
    return res.json() as Promise<GatewayAgent>
  }

  /** Parse skills array from metadata_json */
  private parseSkills(metadata: Record<string, unknown> | null | undefined): AgentSkillDef[] {
    if (!metadata) return []
    const raw = metadata.skills || (metadata.attributes as Record<string, unknown>)?.skills
    if (!Array.isArray(raw)) return []
    return raw as AgentSkillDef[]
  }

  /** Wrap an AgentSkillDef into a RunnableSkill with execute() */
  private wrapSkill(skill: AgentSkillDef): RunnableSkill {
    let executeFn: (input: Record<string, unknown>) => Promise<unknown>

    const exec = skill.execution
    if (exec?.type === 'mcp') {
      const endpoint = exec.endpoint || `${this.gatewayUrl}/mcp`
      const toolName = exec.toolName || skill.name
      executeFn = async (input) => {
        if (this.toolExecutor) {
          return this.toolExecutor.executeMCP(endpoint, toolName, input)
        }
        return this.executeMCPDirect(endpoint, toolName, input)
      }
    } else if (exec?.type === 'a2a') {
      executeFn = async (input) => {
        return {
          type: 'a2a_delegation',
          targetAgentId: exec.targetAgentId,
          skillFilter: exec.skillFilter,
          promptOverride: exec.promptOverride,
          callerInput: input,
          note: 'A2A delegation: load target agent context and inject into conversation',
        }
      }
    } else {
      // No execution defined — return stub that explains the limitation
      executeFn = async () => ({
        error: `Skill "${skill.name}" has no remote execution configured. Add execution.type="mcp" with an endpoint.`,
      })
    }

    return {
      name: skill.name,
      description: skill.description,
      inputSchema: skill.inputSchema as unknown as Record<string, unknown>,
      execute: executeFn,
    }
  }

  /** Direct MCP JSON-RPC call (fallback when no ToolExecutor injected) */
  private async executeMCPDirect(
    endpoint: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      throw new Error(`MCP tool "${toolName}" failed: HTTP ${res.status}`)
    }

    const data = await res.json() as {
      result?: { content?: { type: string; text?: string }[] }
      error?: { message: string }
    }

    if (data.error) {
      throw new Error(`MCP error: ${data.error.message}`)
    }

    // Extract text content from MCP result
    const content = data.result?.content
    if (content?.[0]?.type === 'text' && content[0].text) {
      try {
        return JSON.parse(content[0].text)
      } catch {
        return content[0].text
      }
    }
    return data.result ?? data
  }
}
