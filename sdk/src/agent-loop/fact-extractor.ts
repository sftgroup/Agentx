// ---------------------------------------------------------------------------
// @agentx/sdk — Fact Extractor
// ---------------------------------------------------------------------------
// Extracts key facts from conversation for memory storage.
// Uses a single cheap LLM call for summarization.
// ---------------------------------------------------------------------------

import type { LLMProvider } from './types'

export class FactExtractor {
  constructor(
    private readonly llmProvider: LLMProvider,
    private readonly factModel: string = 'gpt-4o-mini',
  ) {}

  /** Extract simple facts from the conversation for memory storage */
  async extract(userMessage: string, assistantResponse: string): Promise<string[]> {
    try {
      const stream = this.llmProvider.chatStream({
        model: this.factModel,
        messages: [{
          role: 'user',
          content: `Extract 1-3 key facts/preferences. One per line, <100 chars each. No other text.\nUser: ${userMessage}\nAssistant: ${assistantResponse.slice(0, 500)}\nFacts:`,
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
