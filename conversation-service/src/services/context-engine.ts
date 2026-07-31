// AgentX Conversation Service — Context Engine
// Compacts conversation messages when approaching token budget

import type { LLMMessage, LLMProvider } from '@agentxv2/sdk/agent-loop'

export class ContextEngine {
  /**
   * Estimate token count of messages array (rough approximation: 1 token ≈ 4 chars).
   */
  estimateTokens(messages: LLMMessage[]): number {
    let total = 0
    for (const msg of messages) {
      total += JSON.stringify(msg).length
    }
    return Math.ceil(total / 4)
  }

  /**
   * Compact messages when exceeding budget.
   * Strategy:
   *   1. Keep system prompt intact
   *   2. Summarize oldest turns (keep last 2 turns verbatim)
   *   3. Return compacted messages array
   */
  async compact(
    messages: LLMMessage[],
    budget: number,
    llmProvider: LLMProvider,
  ): Promise<LLMMessage[]> {
    if (messages.length <= 4) return messages // nothing to compact

    const system = messages.filter(m => m.role === 'system')
    const nonSystem = messages.filter(m => m.role !== 'system')

    // Keep last 2 turns (4 messages: user+assistant+user+assistant)
    const keepCount = Math.min(4, nonSystem.length)
    const keepMessages = nonSystem.slice(-keepCount)
    const compactTarget = nonSystem.slice(0, nonSystem.length - keepCount)

    if (compactTarget.length === 0) return messages

    // Summarize old messages via LLM
    const summaryPrompt: LLMMessage = {
      role: 'user',
      content: `Summarize the following conversation concisely (keep all factual claims, decisions, and context):

${compactTarget.map(m => `${m.role}: ${m.content}`).join('\n')}

Summary:`,
    }

    try {
      const stream = llmProvider.chatStream({
        model: 'gpt-4o-mini',
        messages: [summaryPrompt],
        maxTokens: 500,
        temperature: 0.3,
      })

      let summary = ''
      for await (const event of stream) {
        if (event.type === 'text_delta') {
          summary += event.content
        }
      }

      // Build compacted array: system + summary + last 2 turns
      return [
        ...system,
        { role: 'system', content: `[Earlier conversation summary]: ${summary}` },
        ...keepMessages,
      ]
    } catch (err) {
      console.warn('[ContextEngine] Compaction failed, returning original messages:', (err as Error).message)
      return messages
    }
  }
}
