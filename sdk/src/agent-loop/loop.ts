// ---------------------------------------------------------------------------
// @agentx/sdk — AgentLoop
// ---------------------------------------------------------------------------
// ReAct-style agent loop engine.
//
//   const loop = new AgentLoop({ ctx, llmProvider, maxIterations: 5 })
//   const result = await loop.run(userMessage, history)
//
// Flow:
//   User Input → LLM Thinks → Tool Call → Execute → Result → LLM Thinks → ...
//   Until: LLM stops calling tools, max iterations reached, or timeout.
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
import { buildTools, buildSystemPrompt } from './tool-builder'
import { ToolExecutor } from './executor'

const DEFAULT_MAX_ITERATIONS = 5
const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_MODEL = 'gpt-4o'

function generateCallId(): string {
  return `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export class AgentLoop {
  private config: Required<Omit<AgentLoopConfig, 'onTextDelta' | 'onToolCall' | 'onToolResult' | 'onThinking' | 'onComplete' | 'onError'>> & Pick<AgentLoopConfig, 'onTextDelta' | 'onToolCall' | 'onToolResult' | 'onThinking' | 'onComplete' | 'onError'>
  private executor: ToolExecutor
  private tools: ReturnType<typeof buildTools>
  private systemPrompt: string
  private aborted = false
  private abortController: AbortController | null = null

  constructor(config: AgentLoopConfig) {
    this.config = {
      ctx: config.ctx,
      llmProvider: config.llmProvider,
      maxIterations: config.maxIterations ?? DEFAULT_MAX_ITERATIONS,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      onTextDelta: config.onTextDelta,
      onToolCall: config.onToolCall,
      onToolResult: config.onToolResult,
      onThinking: config.onThinking,
      onComplete: config.onComplete,
      onError: config.onError,
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

    const messages: LLMMessage[] = [
      { role: 'system', content: this.systemPrompt },
      ...history.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: userMessage },
    ]

    this.aborted = false
    this.abortController = new AbortController()

    try {
      while (iterations < this.config.maxIterations) {
        if (this.aborted) {
          if (this.config.onThinking) {
            this.config.onThinking('Aborted by user')
          }
          break
        }

        iterations++

        if (this.config.onThinking && iterations > 1) {
          this.config.onThinking(`Thinking... (round ${iterations}/${this.config.maxIterations})`)
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
    }

    return { text, toolCalls: llmToolCalls, toolCallRecords, usage }
  }
}
