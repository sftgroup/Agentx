// ---------------------------------------------------------------------------
// @agentx/sdk — AgentLoop
// ---------------------------------------------------------------------------
// ReAct-style agent loop engine.
//
//   const loop = new AgentLoop({ ctx, llmProvider, maxIterations: 5 })
//   const result = await loop.run(userMessage, history)
//
// Flow:
//   [Memory Recall] → User Input → LLM Thinks → [Context Check] → Tool Call → Execute → Result → LLM Thinks → ...
//   Until: LLM stops calling tools, max iterations reached, or timeout.
//   [Memory Store]
// ---------------------------------------------------------------------------

import type { RunnableSkill } from '../agent/agent-runner'
import type {
  AgentLoopConfig,
  AgentLoopResult,
  ChatStreamEvent,
  LLMMessage,
  LLMToolCall,
  ToolCallRecord,
} from './types'
import type { TraceEvent } from '../traces/types'
import { buildTools, buildSystemPrompt } from './tool-builder'
import { ToolExecutor } from './executor'

const DEFAULT_MAX_ITERATIONS = 5
const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_MODEL = 'gpt-4o'

function generateCallId(): string {
  return `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export class AgentLoop {
  private config: AgentLoopConfig
  private executor: ToolExecutor
  private tools: ReturnType<typeof buildTools>
  private systemPrompt: string
  private aborted = false
  private abortController: AbortController | null = null
  private sessionId = ''

  constructor(config: AgentLoopConfig) {
    this.config = {
      ...config,
      maxIterations: config.maxIterations ?? DEFAULT_MAX_ITERATIONS,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    }

    this.executor = new ToolExecutor({ skills: config.ctx.skills })
    this.tools = buildTools(config.ctx.skills)
    this.systemPrompt = buildSystemPrompt(config.ctx.prompt, config.ctx.skills)
  }

  abort(): void {
    this.aborted = true
    this.abortController?.abort()
  }

  async run(
    userMessage: string,
    history: { role: 'user' | 'assistant'; content: string }[] = [],
  ): Promise<AgentLoopResult> {
    const startTime = Date.now()
    const toolCalls: ToolCallRecord[] = []
    const totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    let finalText = ''
    let iterations = 0

    let messages: LLMMessage[] = [
      { role: 'system', content: this.systemPrompt },
      ...history.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: userMessage },
    ]

    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    this.sessionId = sessionId

    // [NEW] Memory recall — inject remembered facts into system prompt
    if (this.config.memory?.enabled && this.config.ctx.subscriberAddress && this.config.ctx.agentId) {
      try {
        const facts = await this.config.memory.provider.recall({
          subscriberAddress: this.config.ctx.subscriberAddress,
          agentId: this.config.ctx.agentId,
          query: userMessage,
          limit: this.config.memory.recallLimit ?? 5,
        })
        if (facts.length > 0 && messages[0]) {
          const memoryContext = '\n\n## Relevant Memory\n' + facts.map(f => `- ${f.fact}`).join('\n')
          messages[0].content = (messages[0].content || '') + memoryContext
        }
      } catch (err) {
        console.warn('[AgentLoop] Memory recall failed:', (err as Error).message)
      }
    }

    this.aborted = false
    this.abortController = new AbortController()

    try {
      while (iterations < this.config.maxIterations!) {
        if (this.aborted) {
          if (this.config.onThinking) {
            this.config.onThinking('Aborted by user')
          }
          break
        }

        iterations++

        if (this.config.onThinking && iterations > 1) {
          this.config.onThinking(`Thinking... (round ${iterations}/${this.config.maxIterations!})`)
        }

        // [NEW] Context compaction — check budget before each iteration
        if (this.config.contextBudget && this.estimateTokens(messages) > this.config.contextBudget) {
          messages = await this.compactMessages(messages)
        }

        const iterationResult = await this.runIteration(messages)

        finalText += iterationResult.text
        toolCalls.push(...iterationResult.toolCallRecords)
        totalUsage.promptTokens += iterationResult.usage.promptTokens
        totalUsage.completionTokens += iterationResult.usage.completionTokens
        totalUsage.totalTokens += iterationResult.usage.totalTokens

        if (iterationResult.toolCalls.length === 0) {
          break
        }

        const assistantMsg: LLMMessage = {
          role: 'assistant',
          content: iterationResult.text || null,
          tool_calls: iterationResult.toolCalls,
        }
        messages.push(assistantMsg)

        for (let i = 0; i < iterationResult.toolCalls.length; i++) {
          const tc = iterationResult.toolCalls[i]!
          const record = iterationResult.toolCallRecords[i]!
          let toolContent: string

          if (record.error) {
            toolContent = `Error: ${record.error}`
          } else {
            toolContent = typeof record.result === 'string'
              ? record.result
              : JSON.stringify(record.result)
          }

          messages.push({
            role: 'tool',
            content: toolContent,
            tool_call_id: tc.id,
          })
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      if (this.config.onError) {
        this.config.onError(error)
      }
      if (finalText === '' && toolCalls.length === 0) {
        finalText = `Agent loop error: ${error.message}`
      }
    } finally {
      this.abortController = null
    }

    const result: AgentLoopResult = {
      finalText: finalText || 'No response generated.',
      toolCalls,
      totalIterations: iterations,
      totalDuration: Date.now() - startTime,
      usage: totalUsage,
    }

    // [NEW] Memory store — extract and store facts on session end
    if (this.config.memory?.enabled && this.config.memory.storeOnSessionEnd !== false
        && this.config.ctx.subscriberAddress && this.config.ctx.agentId) {
      try {
        const facts = await this.extractFacts(userMessage, result.finalText)
        for (const fact of facts) {
          await this.config.memory.provider.store({
            subscriberAddress: this.config.ctx.subscriberAddress,
            agentId: this.config.ctx.agentId,
            fact,
          })
        }
      } catch (err) {
        console.warn('[AgentLoop] Memory store failed:', (err as Error).message)
      }
    }

    // [NEW] Trace emit — session complete
    this.emitTrace({
      tenantId: this.config.ctx.subscriberAddress || 'unknown',
      agentId: this.config.ctx.agentId,
      sessionId: this.sessionId,
      type: 'session_complete',
      data: {
        totalIterations: iterations,
        totalDuration: Date.now() - startTime,
        totalTokens: totalUsage.totalTokens,
        toolCallCount: toolCalls.length,
      },
    })

    if (this.config.onComplete) {
      this.config.onComplete(result)
    }

    return result
  }

  private async runIteration(
    messages: LLMMessage[],
  ): Promise<{
    text: string
    toolCalls: LLMToolCall[]
    toolCallRecords: ToolCallRecord[]
    usage: { promptTokens: number; completionTokens: number; totalTokens: number }
  }> {
    const model = this.config.ctx.model ?? DEFAULT_MODEL
    const temperature = this.config.ctx.temperature ?? 0.7
    const maxTokens = this.config.ctx.maxTokens ?? 4096

    const stream = this.config.llmProvider.chatStream(
      {
        model,
        messages,
        tools: this.tools.length > 0 ? this.tools : undefined,
        temperature,
        maxTokens,
      },
      this.abortController?.signal,
    )

    let text = ''
    const toolCallsAccum: Map<string, { name: string; arguments: string }> = new Map()
    const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

    for await (const event of stream) {
      if (this.aborted) break

      switch (event.type) {
        case 'text_delta':
          text += event.content
          if (this.config.onTextDelta) {
            this.config.onTextDelta(event.content)
          }
          break

        case 'tool_call_start':
          toolCallsAccum.set(event.callId, { name: event.name, arguments: '' })
          break

        case 'tool_call_delta': {
          const existing = toolCallsAccum.get(event.callId)
          if (existing) {
            existing.arguments += event.arguments
          }
          break
        }

        case 'done':
          usage.promptTokens = event.usage.promptTokens
          usage.completionTokens = event.usage.completionTokens
          usage.totalTokens = event.usage.totalTokens
          break

        case 'error':
          throw event.error
      }
    }

    const llmToolCalls: LLMToolCall[] = []
    const parsedToolCalls: { callId: string; name: string; arguments: Record<string, unknown> }[] = []

    for (const [callId, tc] of toolCallsAccum) {
      let parsedArgs: Record<string, unknown> = {}
      try {
        parsedArgs = tc.arguments ? JSON.parse(tc.arguments) : {}
      } catch {
        parsedArgs = { raw: tc.arguments }
      }

      llmToolCalls.push({
        id: callId,
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments },
      })

      parsedToolCalls.push({ callId, name: tc.name, arguments: parsedArgs })
    }

    if (parsedToolCalls.length > 0) {
      for (const ptc of parsedToolCalls) {
        if (this.config.onToolCall) {
          this.config.onToolCall({ callId: ptc.callId, name: ptc.name, arguments: ptc.arguments })
        }
        // [NEW] Trace emit
        this.emitTrace({
          tenantId: this.config.ctx.subscriberAddress || 'unknown',
          agentId: this.config.ctx.agentId,
          sessionId: this.sessionId,
          type: 'tool_call',
          data: { callId: ptc.callId, name: ptc.name, arguments: ptc.arguments },
        })
      }
    }

    const toolCallRecords = await this.executor.executeBatch(parsedToolCalls)

    for (const record of toolCallRecords) {
      if (this.config.onToolResult) {
        this.config.onToolResult({
          callId: record.callId,
          name: record.name,
          result: record.result,
          error: record.error,
          durationMs: record.durationMs,
        })
      }
      // [NEW] Trace emit
      this.emitTrace({
        tenantId: this.config.ctx.subscriberAddress || 'unknown',
        agentId: this.config.ctx.agentId,
        sessionId: this.sessionId,
        type: 'tool_result',
        data: { callId: record.callId, name: record.name, error: record.error, durationMs: record.durationMs },
      })
    }

    return { text, toolCalls: llmToolCalls, toolCallRecords, usage }
  }

  // ── Context Engineering ──────────────────────────────────────────────────

  /** Rough token estimation: 1 token ≈ 4 characters */
  private estimateTokens(messages: LLMMessage[]): number {
    let total = 0
    for (const msg of messages) {
      total += JSON.stringify(msg).length
    }
    return Math.ceil(total / 4)
  }

  /** Compact messages: keep system prompt + last 2 turns, summarize the rest */
  private async compactMessages(messages: LLMMessage[]): Promise<LLMMessage[]> {
    if (messages.length <= 5) return messages  // not enough to compact

    const system = messages.filter(m => m.role === 'system')
    const nonSystem = messages.filter(m => m.role !== 'system')
    const keepCount = Math.min(4, nonSystem.length)
    const keepMessages = nonSystem.slice(-keepCount)
    const compactTarget = nonSystem.slice(0, nonSystem.length - keepCount)

    if (compactTarget.length === 0) return messages

    try {
      const stream = this.config.llmProvider.chatStream({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: `Summarize concisely (keep all facts/decisions):\n${compactTarget.map(m => `${m.role}: ${m.content}`).join('\n')}`
        }],
        maxTokens: 500,
        temperature: 0.3,
      })

      let summary = ''
      for await (const event of stream) {
        if (event.type === 'text_delta') summary += event.content
      }

      return [...system, { role: 'system', content: `[Summary]: ${summary}` }, ...keepMessages]
    } catch {
      return messages  // compaction failed → return original
    }
  }

  // ── Memory Extraction ───────────────────────────────────────────────────

  /** Extract simple facts from the conversation for memory storage */

  // ── Trace Helper ──────────────────────────────────────────────────────────

  private emitTrace(event: Omit<TraceEvent, 'timestamp'>): void {
    if (!this.config.trace?.enabled) return
    try {
      this.config.trace.emitter.emit({ ...event, timestamp: Date.now() })
    } catch {
      // Trace emit should never throw — silently ignore
    }
  }

  // ── Memory Extraction ───────────────────────────────────────────────────

  /** Extract simple facts from the conversation for memory storage */
  private async extractFacts(userMessage: string, assistantResponse: string): Promise<string[]> {
    try {
      const stream = this.config.llmProvider.chatStream({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: `Extract 1-3 key facts/preferences. One per line, <100 chars each. No other text.\nUser: ${userMessage}\nAssistant: ${assistantResponse.slice(0, 500)}\nFacts:`
        }],
        maxTokens: 200,
        temperature: 0.3,
      })

      let text = ''
      for await (const event of stream) {
        if (event.type === 'text_delta') text += event.content
      }

      return text.split('\n').map(s => s.replace(/^[\d\-•. ]+/, '').trim()).filter(Boolean)
    } catch {
      return []
    }
  }
}
