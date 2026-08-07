// AgentX Conversation Service — Agent Runner
// Wraps AgentLoop execution with Memory + Context + Tool engines.
// Generic — AgentX platform MCP tools are defined in agent metadata on Gateway side.

import { v4 as uuidv4 } from 'uuid'
import { AgentLoop } from '@agentxv2/sdk/agent-loop'
import type { LLMProvider, LLMMessage } from '@agentxv2/sdk/agent-loop'
import { MemoryEngine } from './memory-engine'
import { TenantLLMResolver } from './tenant-llm-resolver'
import { AgentContextLoader } from './agent-context-loader'
import type { AgentSkillDef, RunnableSkill } from './agent-context-loader'
import { OrchestratorService } from './orchestrator'
import { config } from '../config'

export interface AgentRunRequest {
  agentId?: number
  message: string
  tenantAddress: string
  enableMemory?: boolean
  contextBudget?: number
  history?: { role: 'user' | 'assistant'; content: string }[]
  headerApiKey?: string
  /** Stateless BYOK: caller's LLM endpoint (e.g. DeepSeek) — used with headerApiKey */
  llmEndpoint?: string
  /** Stateless BYOK: caller's LLM model (e.g. deepseek-chat) — used with headerApiKey */
  llmModel?: string
  endUserId?: string
  /** Inline mode: caller-supplied prompt + skills, bypasses Gateway agent lookup */
  prompt?: string
  skills?: AgentSkillDef[]
}

export interface AgentRunSSEEvent {
  type: 'text' | 'tool_call' | 'tool_result' | 'thinking' | 'done' | 'error' | 'clarification'
  content?: string
  /** Clarification question when the run is interrupted for disambiguation */
  question?: string
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
    private readonly llmResolver: TenantLLMResolver,
    private readonly contextLoader: AgentContextLoader,
    private readonly orchestrator?: OrchestratorService,
  ) {}

  /**
   * Run an agent to completion and return its final text (off-chain delegation
   * entry point). Used by OrchestratorService for nested sub-agent runs.
   */
  async runToText(request: AgentRunRequest, opts?: { signal?: AbortSignal; depth?: number }): Promise<string> {
    let text = ''
    for await (const event of this.streamRun(request, opts)) {
      if (event.type === 'text') text += event.content || ''
      if (event.type === 'error') throw new Error(event.error || 'Nested agent run failed')
    }
    return text
  }

  async *streamRun(request: AgentRunRequest, opts?: { signal?: AbortSignal; depth?: number }): AsyncGenerator<AgentRunSSEEvent> {
    const sessionId = uuidv4()
    const depth = opts?.depth ?? 0
    let loop: AgentLoop | null = null
    const onAbort = () => loop?.abort()

    const hasInline = request.prompt !== undefined || (request.skills && request.skills.length > 0)

    try {
      // 1. Load agent context — inline prompt/skills when provided, else from Gateway
      const loadedCtx = hasInline
        ? this.contextLoader.loadInline(request.prompt || '', request.skills)
        : await this.contextLoader.load(request.agentId as number)
      const runAgentId = hasInline ? 0 : (request.agentId as number)

      // 1.5 Platform tools: off-chain / on-chain multi-agent orchestration.
      //     Injected only while the depth budget allows further delegation.
      //     If the caller already injected same-named orchestration skills
      //     (e.g. our platform inline agentx_list_agents/agentx_delegate backed
      //     by the local subscription table), skip the Gateway-based ones to
      //     avoid duplicate tool definitions.
      const loadedNames = new Set((loadedCtx.skills || []).map((s) => s.name))
      const skills = [...(loadedCtx.skills || []), ...this.buildOrchestrationSkills(request, depth, loadedNames)]

      // 2. Resolve LLM provider — tenant key > header key > AgentX key
      const llmProvider = await this.llmResolver.resolve(
        { agentId: runAgentId, prompt: loadedCtx.prompt, skills: [] },
        request.tenantAddress,
        request.headerApiKey,
        request.llmEndpoint,
        request.llmModel,
      )

      // 2.5 Clarification gate — interrupt ambiguous requests before spending
      //     tool calls / memory writes on guesswork (enabled by default, off via env).
      //     Skipped for nested (depth > 0) runs — a sub-agent cannot dialog with
      //     the user, so it executes as-is.
      if (config.clarificationEnabled && depth === 0) {
        const question = await this.checkClarification(llmProvider, loadedCtx.prompt, request.message)
        if (question) {
          yield { type: 'clarification', question }
          yield { type: 'done', usage: undefined, iterations: 0 }
          return
        }
      }

      // 3. Memory recall (before AgentLoop)
      if (request.enableMemory) {
        yield { type: 'thinking', content: 'Recalling memory...' }
        try {
          const facts = await this.memoryEngine.recall({
            subscriberAddress: request.tenantAddress,
            agentId: runAgentId,
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
      loop = new AgentLoop({
        ctx: {
          agentId: runAgentId,
          prompt: loadedCtx.prompt,
          skills: skills as any, // RunnableSkill shape is compatible
          subscriberAddress: request.tenantAddress,
        },
        llmProvider,
        maxIterations: 8,
        contextBudget: request.contextBudget,
      })

      // External abort (task cancellation) → stop the loop mid-run
      opts?.signal?.addEventListener('abort', onAbort, { once: true })

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
              agentId: runAgentId,
              fact: fact.fact,
              endUserId: request.endUserId,
              metadata: { confidence: String(fact.confidence) },
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
    } finally {
      opts?.signal?.removeEventListener('abort', onAbort)
    }
  }

  /**
   * Platform orchestration tools injected into every agent run while the
   * delegation depth budget allows:
   *   - agentx_list_agents  — discover sub-agents the caller may delegate to
   *   - agentx_delegate     — delegate a sub-task (off-chain by default,
   *                           on-chain when the user requests audit/settlement)
   */
  private buildOrchestrationSkills(
    request: AgentRunRequest,
    depth: number,
    loadedNames?: Set<string>,
  ): RunnableSkill[] {
    if (!this.orchestrator || !this.orchestrator.configured || depth >= config.orchestrateMaxDepth) {
      return []
    }
    // 平台 inline skills 已提供同名工具 (本地订阅表授权) → 跳过官方 Gateway 编排, 避免工具重名
    if (loadedNames && (loadedNames.has('agentx_list_agents') || loadedNames.has('agentx_delegate'))) {
      return []
    }

    const tenantAddress = request.tenantAddress

    const listAgentsTool: RunnableSkill = {
      name: 'agentx_list_agents',
      description:
        'List agents the current user can delegate to (agents they own or have an active subscription to), with IDs, names, descriptions and categories. Call this to discover which agents can help with sub-tasks — do NOT invent agent IDs.',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => {
        try {
          const agents = await this.orchestrator!.listAgents(tenantAddress)
          if (agents.length === 0) {
            return 'No accessible agents. Agents you own or have an active subscription to will appear here.'
          }
          return agents
            .map(a => `#${a.id} "${a.name}" — ${a.description || '(no description)'} [${a.category}]`)
            .join('\n')
        } catch (err) {
          return `Error listing agents: ${err instanceof Error ? err.message : String(err)}`
        }
      },
    }

    const delegateTool: RunnableSkill = {
      name: 'agentx_delegate',
      description:
        'Delegate a sub-task to another AgentX agent. Default rail is off-chain (real-time conversation channel, zero cost). ' +
        'When the user EXPLICITLY requests an auditable / settled / on-chain delegation (e.g. "上链", "记到链上", "可审计", "结算", "对账", "on-chain", "audit", "settle"), use mode: "onchain" — this creates an on-chain A2A task with a taskId audit trail and settlement capability.',
      inputSchema: {
        type: 'object',
        properties: {
          targetAgentId: { type: 'integer', description: 'The agent ID to delegate to (from agentx_list_agents)' },
          message: { type: 'string', description: 'Full task description. Include ALL context the sub-agent needs.' },
          mode: {
            type: 'string',
            enum: ['offchain', 'onchain'],
            description: 'offchain (default) = real-time chat channel; onchain = auditable/settled A2A task',
          },
        },
        required: ['targetAgentId', 'message'],
      },
      execute: async (input: Record<string, unknown>) => {
        const targetAgentId = Number(input.targetAgentId)
        const message = String(input.message ?? '')
        const mode = String(input.mode ?? config.orchestrateDefaultMode)
        if (!Number.isInteger(targetAgentId) || targetAgentId <= 0 || !message) {
          return 'Error: targetAgentId and message are required'
        }

        if (mode === 'onchain') {
          try {
            const { taskId, status } = await this.orchestrator!.delegateOnChain({
              tenantAddress,
              targetAgentId,
              message,
              taskType: 'delegate',
            })
            return `Delegated on-chain (rail: onchain). taskId=${taskId}, status=${status}. The sub-task is queued, will be processed on-chain, and its result is recorded in the A2A task registry for audit / settlement.`
          } catch (err) {
            return `Error delegating on-chain: ${err instanceof Error ? err.message : String(err)}`
          }
        }

        try {
          const result = await this.orchestrator!.delegateOffChain({
            targetAgentId,
            message,
            tenantAddress,
            endUserId: request.endUserId,
            depth,
          })
          return `Delegated off-chain (rail: offchain, real-time).\nResult from Agent #${targetAgentId}:\n${result}`
        } catch (err) {
          return `Error delegating off-chain: ${err instanceof Error ? err.message : String(err)}`
        }
      },
    }

    return [listAgentsTool, delegateTool]
  }

  /**
   * Clarification gate: ask the LLM whether the user's request is ambiguous
   * enough to warrant a clarifying question before running tools.
   * Returns the question string, or null to proceed normally.
   */
  private async checkClarification(
    llmProvider: LLMProvider,
    systemPrompt: string,
    userMessage: string,
  ): Promise<string | null> {
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `You are a clarification gate for an AI assistant. Decide whether the user's request is clear enough to act on.
Return needsClarification=true ONLY when:
- the request is genuinely ambiguous or missing necessary context to act (e.g. "help me", "analyze it", "what about it?"), or
- multiple plausible interpretations exist and acting on the wrong one would waste the user's time.
Return false when the request can be answered directly or acted on as-is. Greetings, thanks, and simple instructions are false.
Respond ONLY with JSON: {"needsClarification": true|false, "question": "your clarifying question"}.
When false, set "question" to an empty string.

The assistant's purpose (context):
${systemPrompt.slice(0, 500)}`,
      },
      { role: 'user', content: userMessage },
    ]

    try {
      const stream = llmProvider.chatStream({
        model: config.clarificationModel,
        messages,
        maxTokens: 60,
        temperature: 0,
      })

      let text = ''
      for await (const event of stream) {
        if (event.type === 'text_delta') text += event.content
      }

      const parsed = this.parseClarificationJson(text)
      if (parsed && parsed.needsClarification && parsed.question) {
        console.info(`[Clarification] interrupting run with question: ${parsed.question}`)
        return parsed.question
      }
      console.info('[Clarification] request deemed clear enough, proceeding')
      return null
    } catch (err) {
      console.warn('[Clarification] check failed, proceeding normally:', (err as Error).message)
      return null
    }
  }

  /** Tolerant JSON parse for the clarification gate response. */
  private parseClarificationJson(raw: string): { needsClarification: boolean; question: string } | null {
    const obj = this.tryParseJson<{ needsClarification?: unknown; question?: unknown }>(raw, '{', '}')
    if (!obj) return null
    return {
      needsClarification: Boolean(obj.needsClarification),
      question: String(obj.question ?? '').trim(),
    }
  }

  /**
   * Extract key facts from conversation for memory storage.
   * Each fact carries a confidence score (0-1); facts below the configured
   * threshold are filtered out so low-value filler never pollutes memory.
   */
  private async extractFacts(
    userMessage: string,
    assistantResponse: string,
    llmProvider: LLMProvider,
  ): Promise<Array<{ fact: string; confidence: number }>> {
    const prompt: LLMMessage = {
      role: 'user',
      content: `Extract the 1-3 most important durable facts or preferences from this conversation.
For each fact assign a confidence score from 0 to 1: how certain you are it is worth remembering
across future sessions. Short fillers like "ok", "thanks", "I understand" must be excluded
or given low confidence (below 0.3).

Return ONLY a JSON array, no other text:
[{"fact": "...", "confidence": 0.9}]

User: ${userMessage}
Assistant: ${assistantResponse.slice(0, 500)}

Facts:`,
    }

    try {
      const stream = llmProvider.chatStream({
        model: config.compactModel,
        messages: [prompt],
        maxTokens: 300,
        temperature: 0.3,
      })

      let text = ''
      for await (const event of stream) {
        if (event.type === 'text_delta') text += event.content
      }
      console.info(`[MemoryFacts] raw LLM extraction response: ${JSON.stringify(text.slice(0, 500))}`)

      const facts = this.parseFactsJson(text)
      console.info(`[MemoryFacts] parsed ${facts.length} fact(s) | threshold=${config.memoryConfidenceThreshold}`)

      // Confidence filter — drop low-value facts before storing
      const kept: Array<{ fact: string; confidence: number }> = []
      const dropped: Array<{ fact: string; confidence: number }> = []
      for (const f of facts) {
        if (f.confidence >= config.memoryConfidenceThreshold) {
          kept.push(f)
        } else {
          dropped.push(f)
        }
      }

      if (dropped.length > 0) {
        console.warn(
          `[MemoryFacts] dropped ${dropped.length} low-confidence fact(s): ${JSON.stringify(dropped)}`
        )
      }
      if (kept.length > 0) {
        console.info(`[MemoryFacts] storing ${kept.length} fact(s): ${JSON.stringify(kept)}`)
      } else {
        console.warn('[MemoryFacts] nothing passed the confidence filter — memory not updated')
      }
      return kept
    } catch (err) {
      console.warn('[AgentRunner] Fact extraction failed:', (err as Error).message)
      return []
    }
  }

  /** Parse the LLM's JSON fact list, with a line-based fallback. */
  private parseFactsJson(raw: string): Array<{ fact: string; confidence: number }> {
    // Fallback confidence when the model returns plain lines instead of JSON
    const DEFAULT_CONFIDENCE = 0.6

    const items = this.tryParseJson<unknown[]>(raw, '[', ']')
    if (items) {
      return items.map((it) => {
        const obj = (it ?? {}) as Record<string, unknown>
        const fact = String(obj.fact ?? obj.text ?? '').trim()
        if (!fact) return null
        const conf = typeof obj.confidence === 'number'
          ? obj.confidence
          : (typeof obj.score === 'number' ? obj.score : DEFAULT_CONFIDENCE)
        return { fact, confidence: Math.max(0, Math.min(1, conf)) }
      }).filter((x): x is { fact: string; confidence: number } => x !== null)
    }

    // Fallback: plain lines, keep the old behavior with a default confidence
    console.warn('[MemoryFacts] LLM response was not JSON — using line-based fallback (default confidence 0.6)')
    return raw.split('\n')
      .map(s => s.replace(/^[\d\-•. ]+/, '').trim())
      .filter(Boolean)
      .map(fact => ({ fact: fact.slice(0, 200), confidence: DEFAULT_CONFIDENCE }))
  }

  /** Extract and parse a JSON value spanning a `[`/`{` ... `]`/`}` range. */
  private tryParseJson<T>(raw: string, open: string, close: string): T | null {
    const start = raw.indexOf(open)
    const end = raw.lastIndexOf(close)
    if (start === -1 || end <= start) return null
    try {
      return JSON.parse(raw.slice(start, end + 1)) as T
    } catch {
      return null
    }
  }
}
