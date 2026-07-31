// ---------------------------------------------------------------------------
// @agentx/sdk — Context Compactor
// ---------------------------------------------------------------------------
// Token estimation + LLM-based message summarization.
// Extracted from AgentLoop for decoupling.
// ---------------------------------------------------------------------------

import type { LLMMessage, LLMProvider } from './types'

export class ContextCompactor {
  constructor(
    private readonly llmProvider: LLMProvider,
    private readonly compactModel: string = 'gpt-4o-mini',
  ) {}

  /** Rough token estimation: 1 token ≈ 4 characters */
  estimateTokens(messages: LLMMessage[]): number {
    let total = 0
    for (const msg of messages) {
      total += JSON.stringify(msg).length
    }
    return Math.ceil(total / 4)
  }

  /**
   * Compact messages: keep system prompt + last 2 turns, summarize the rest.
   * Returns original array if not enough messages or compaction fails.
   */
  async compact(messages: LLMMessage[]): Promise<LLMMessage[]> {
    if (messages.length <= 5) return messages

    const system = messages.filter(m => m.role === 'system')
    const nonSystem = messages.filter(m => m.role !== 'system')
    const keepCount = Math.min(4, nonSystem.length)
    const keepMessages = nonSystem.slice(-keepCount)
    const compactTarget = nonSystem.slice(0, nonSystem.length - keepCount)

    if (compactTarget.length === 0) return messages

    try {
      const stream = this.llmProvider.chatStream({
        model: this.compactModel,
        messages: [{
          role: 'user',
          content: `Summarize concisely (keep all facts/decisions):\n${compactTarget.map(m => `${m.role}: ${m.content}`).join('\n')}`,
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
      return messages
    }
  }
}
