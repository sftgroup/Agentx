// AgentX Conversation Service — Agent Runner
// Wraps AgentLoop execution with Memory + Context + Tool engines.
// Generic — AgentX platform MCP tools are defined in agent metadata on Gateway side.

import { v4 as uuidv4 } from 'uuid'
import { AgentLoop } from '@agentxv2/sdk/agent-loop'
import type { LLMProvider, LLMMessage } from '@agentxv2/sdk/agent-loop'
import { MemoryEngine } from './memory-engine'
import { ContextEngine } from './context-engine'
import { TenantLLMResolver } from './tenant-llm-resolver'
import { AgentContextLoader } from './agent-context-loader'

export interface AgentRunRequest {
  agentId: number
  message: string
  tenantAddress: string
  enableMemory?: boolean
  contextBudget?: number
  history?: { role: 'user' | 'assistant'; content: string }[]
  headerApiKey?: string
  endUserId?: string
}

export interface AgentRunSSEEvent {
  type: 'text' | 'tool_call' | 'tool_result' | 'thinking' | 'done' | 'error'
  content?: string
  toolName?: string
  toolArgs?: Record<string, unknown>
  toolResult?: unknown
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
  iterations?: number
  error?: string
}

export class AgentRunnerService {
  constructor(
    private readonly memoryEngine: MemoryEngine,
    private readonly contextEngine: ContextEngine,
    private readonly llmResolver: TenantLLMResolver,
    private readonly contextLoader: AgentContextLoader,
  ) {}

  async *streamRun(request: AgentRunRequest): AsyncGenerator<AgentRunSSEEvent> {
    const sessionId = uuidv4()
    const startTime = Date.now()

    try {
      // 1. Load agent context (prompt + skills) from Gateway
      const loadedCtx = await this.contextLoader.load(request.agentId)

      // 2. Resolve LLM provider — tenant key > header key > AgentX key
      const llmProvider = await this.llmResolver.resolve(
        { agentId: request.agentId, prompt: loadedCtx.prompt, skills: [] },
        request.tenantAddress,
        request.headerApiKey,
      )

      // 3. Memory recall (before AgentLoop)
      if (request.enableMemory) {
        yield { type: 'thinking', content: 'Recalling memory...' }
        try {
          const facts = await this.memoryEngine.recall({
            subscriberAddress: request.tenantAddress,
            agentId: request.agentId,
            query: request.message,
            limit: 5,
            endUserId: request.endUserId,
          })
          if (facts.length > 0) {
            loadedCtx.prompt += '\n\n## User Memory\n' + facts.map(f => `- ${f.fact}`).join('\n')
          }
        } catch (err) {
          console.error('[AgentRunner] Memory recall failed:', (err as Error).message)
        }
      }

      // 4. Initialize AgentLoop with loaded skills
      const loop = new AgentLoop({
        ctx: {
          agentId: request.agentId,
          prompt: loadedCtx.prompt,
          skills: loadedCtx.skills as any, // RunnableSkill shape is compatible
          subscriberAddress: request.tenantAddress,
        },
        llmProvider,
        maxIterations: 8,
        contextBudget: request.contextBudget,
      })

      // 5. Run AgentLoop with streaming events
      const result = await loop.run(request.message, request.history)

      // Emit tool call records
      for (const tc of result.toolCalls) {
        yield { type: 'tool_call', toolName: tc.name, toolArgs: tc.arguments }
        if (tc.result !== undefined) {
          yield { type: 'tool_result', toolName: tc.name, toolResult: tc.result }
        }
      }

      // Emit final text
      yield { type: 'text', content: result.finalText }

      // Emit completion
      yield {
        type: 'done',
        usage: result.usage,
        iterations: result.totalIterations,
      }

      // 6. Memory store on session end
      if (request.enableMemory) {
        try {
          const facts = await this.extractFacts(request.message, result.finalText, llmProvider)
          for (const fact of facts) {
            await this.memoryEngine.store({
              subscriberAddress: request.tenantAddress,
              agentId: request.agentId,
              fact,
              endUserId: request.endUserId,
            })
          }
        } catch (err) {
          console.error('[AgentRunner] Memory store failed:', (err as Error).message)
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[AgentRunner] Run failed (session ${sessionId}):`, message)
      yield { type: 'error', error: message }
    }
  }

  /**
   * Extract key facts from conversation for memory storage.
   */
  private async extractFacts(
    userMessage: string,
    assistantResponse: string,
    llmProvider: LLMProvider,
  ): Promise<string[]> {
    const prompt: LLMMessage = {
      role: 'user',
      content: `Extract 1-3 key facts or preferences from this conversation. Return one fact per line, keep each under 100 chars. Only return facts, no other text.

User: ${userMessage}
Assistant: ${assistantResponse.slice(0, 500)}

Facts:`,
    }

    try {
      const stream = llmProvider.chatStream({
        model: 'gpt-4o-mini',
        messages: [prompt],
        maxTokens: 200,
        temperature: 0.3,
      })

      let text = ''
      for await (const event of stream) {
        if (event.type === 'text_delta') text += event.content
      }

      return text.split('\n').map(s => s.replace(/^[\d\-•. ]+/, '').trim()).filter(Boolean)
    } catch (err) {
      console.warn('[AgentRunner] Fact extraction failed:', (err as Error).message)
      return []
    }
  }
}
