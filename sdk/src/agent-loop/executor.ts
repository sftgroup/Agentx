// ---------------------------------------------------------------------------
// @agentx/sdk — Tool Executor
// ---------------------------------------------------------------------------
// Dispatches LLM tool calls to the correct RunnableSkill and executes.
// Supports parallel execution of multiple tools in a single iteration.
// ---------------------------------------------------------------------------

import type { RunnableSkill } from '../agent/agent-runner'
import type { ToolCallRecord } from './types'

export interface ExecuteOptions {
  skills: RunnableSkill[]
  timeoutMs?: number
}

export class ToolExecutor {
  private skills: Map<string, RunnableSkill>
  private timeoutMs: number

  constructor(opts: ExecuteOptions) {
    this.skills = new Map()
    for (const s of opts.skills) {
      this.skills.set(s.name, s)
    }
    this.timeoutMs = opts.timeoutMs ?? 30_000
  }

  executeSingle(
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolCallRecord> {
    const startTime = Date.now()
    const skill = this.skills.get(name)

    if (!skill) {
      return Promise.resolve({
        callId: '',
        name,
        arguments: args,
        result: null,
        error: `Unknown tool: ${name}`,
        durationMs: Date.now() - startTime,
      })
    }

    const executePromise = skill.execute(args)

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Tool "${name}" timed out after ${this.timeoutMs}ms`)), this.timeoutMs),
    )

    return Promise.race([executePromise, timeoutPromise])
      .then(result => ({
        callId: '',
        name,
        arguments: args,
        result: this.normalizeResult(result),
        durationMs: Date.now() - startTime,
      }))
      .catch(err => ({
        callId: '',
        name,
        arguments: args,
        result: null,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startTime,
      }))
  }

  async executeBatch(
    calls: { callId: string; name: string; arguments: Record<string, unknown> }[],
  ): Promise<ToolCallRecord[]> {
    const results = await Promise.all(
      calls.map(async c => {
        const record = await this.executeSingle(c.name, c.arguments)
        record.callId = c.callId
        return record
      }),
    )
    return results
  }

  hasTool(name: string): boolean {
    return this.skills.has(name)
  }

  getToolNames(): string[] {
    return Array.from(this.skills.keys())
  }

  private normalizeResult(result: unknown): unknown {
    if (result === undefined || result === null) return null
    if (typeof result === 'string' || typeof result === 'number' || typeof result === 'boolean') {
      return result
    }
    if (result instanceof Error) return { error: result.message }
    return result
  }
}
