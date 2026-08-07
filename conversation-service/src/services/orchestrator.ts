// AgentX Conversation Service — Orchestrator
// Multi-agent delegation layering (2026-08-07):
//   off-chain (default): synchronous nested agent run through the conversation
//     channel — real-time, zero on-chain cost, no on-chain writes.
//   on-chain (opt-in):   creates an A2A protocol task via the Gateway internal
//     endpoint — audit trail / settlement / reputation.
//
// All access decisions are delegated to the Gateway (agent-access boundary):
// a caller may only delegate to agents they own or have an active subscription
// to (chain / fiat / x402).

import { config } from '../config'
import type { AgentRunnerService } from './agent-runner'

export interface SubAgentInfo {
  id: number
  name: string
  description: string
  category: string
}

export interface DelegateOffChainParams {
  targetAgentId: number
  message: string
  tenantAddress: string
  endUserId?: string
  depth: number
}

export class OrchestratorService {
  private runner: AgentRunnerService | null = null

  constructor(
    private readonly gatewayUrl: string = config.gatewayUrl,
    private readonly token: string = config.orchestrateToken,
  ) {}

  /** Wire the runner after construction (avoids circular dependency). */
  setRunner(runner: AgentRunnerService): void {
    this.runner = runner
  }

  get configured(): boolean {
    return Boolean(this.token)
  }

  private async call(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.token) {
      throw new Error('Orchestration not configured (ORCHESTRATE_TOKEN missing)')
    }
    const res = await fetch(`${this.gatewayUrl}/api/v1/internal/orchestrate${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Orchestrate-Token': this.token,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      throw new Error(`Orchestration ${path} failed (HTTP ${res.status})`)
    }
    return res.json() as Promise<Record<string, unknown>>
  }

  /** Agents the caller may delegate to (owned or subscribed). */
  async listAgents(tenantAddress: string): Promise<SubAgentInfo[]> {
    if (!tenantAddress || tenantAddress === 'unknown') return []
    const data = await this.call('/list', { tenantAddress })
    const agents = data.agents
    return Array.isArray(agents) ? (agents as SubAgentInfo[]) : []
  }

  /** Can the caller delegate to this agent? */
  async checkAccess(tenantAddress: string, agentId: number): Promise<boolean> {
    if (!tenantAddress || tenantAddress === 'unknown') return false
    const data = await this.call('/check', { tenantAddress, agentId })
    return Boolean(data.allowed)
  }

  /** Off-chain rail: synchronously run the target agent and return its final text. */
  async delegateOffChain(params: DelegateOffChainParams): Promise<string> {
    if (!this.runner) throw new Error('Orchestrator runner not wired')
    if (params.depth >= config.orchestrateMaxDepth) {
      throw new Error(`Max orchestration depth (${config.orchestrateMaxDepth}) reached`)
    }
    const allowed = await this.checkAccess(params.tenantAddress, params.targetAgentId)
    if (!allowed) {
      throw new Error(
        `No access to Agent #${params.targetAgentId} — only agents you own or have an active subscription to can be delegated to`
      )
    }
    return this.runner.runToText(
      {
        agentId: params.targetAgentId,
        message: params.message,
        tenantAddress: params.tenantAddress,
        endUserId: params.endUserId,
        enableMemory: false,
      },
      { depth: params.depth + 1 }
    )
  }

  /** On-chain rail: create an A2A task (audit trail / settlement / reputation). */
  async delegateOnChain(params: {
    tenantAddress: string
    targetAgentId: number
    message: string
    taskType: string
  }): Promise<{ taskId: number; status: string }> {
    const data = await this.call('/create-task', {
      tenantAddress: params.tenantAddress,
      targetAgentId: params.targetAgentId,
      taskType: params.taskType,
      inputData: params.message,
    })
    return { taskId: Number(data.taskId), status: String(data.status ?? 'queued') }
  }
}
