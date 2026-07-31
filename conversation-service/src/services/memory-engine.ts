// AgentX Conversation Service — Memory Engine
// Stores and recalls conversation facts using pgvector
// Embedding model and API URL are configurable via environment variables.

import type { Pool } from 'pg'
import type { MemoryProvider, MemoryFact } from '@agentxv2/sdk/memory'
import { config } from '../config'

export class MemoryEngine implements MemoryProvider {
  constructor(
    private readonly db: Pool,
  ) {}

  /** Generate embedding vector for a text query via configured API */
  private async getEmbedding(text: string): Promise<string | null> {
    if (!config.openaiApiKey) return null

    try {
      const res = await fetch(config.embeddingApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: config.embeddingModel,
          input: text,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        return JSON.stringify(data.data[0].embedding)
      }
    } catch (err) {
      console.warn('[MemoryEngine] Embedding generation failed:', (err as Error).message)
    }
    return null
  }

  async store(params: {
    subscriberAddress: string
    agentId: number
    fact: string
    metadata?: Record<string, string>
  }): Promise<void> {
    const embedding = await this.getEmbedding(params.fact)

    await this.db.query(
      `INSERT INTO memories (subscriber, agent_id, fact, embedding, metadata)
       VALUES ($1, $2, $3, $4::vector, $5)
       ON CONFLICT (subscriber, agent_id, fact) DO NOTHING`,
      [params.subscriberAddress, params.agentId, params.fact, embedding, JSON.stringify(params.metadata || {})]
    )
  }

  async recall(params: {
    subscriberAddress: string
    agentId: number
    query: string
    limit?: number
  }): Promise<MemoryFact[]> {
    const limit = params.limit || 5

    // Try vector similarity search first
    const queryVector = await this.getEmbedding(params.query)
    if (queryVector) {
      try {
        const result = await this.db.query(
          `SELECT fact, 1 - (embedding <=> $3::vector) AS score, created_at
           FROM memories
           WHERE subscriber = $1 AND agent_id = $2
           ORDER BY embedding <=> $3::vector
           LIMIT $4`,
          [params.subscriberAddress, params.agentId, queryVector, limit]
        )

        return result.rows.map((r: any) => ({
          fact: r.fact,
          score: parseFloat(r.score),
          createdAt: r.created_at,
        }))
      } catch (err) {
        console.warn('[MemoryEngine] Vector recall failed, using fallback:', (err as Error).message)
      }
    }

    // Fallback: time-sorted recall
    const result = await this.db.query(
      `SELECT fact, 0.5 AS score, created_at
       FROM memories
       WHERE subscriber = $1 AND agent_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [params.subscriberAddress, params.agentId, limit]
    )

    return result.rows.map((r: any) => ({
      fact: r.fact,
      score: parseFloat(r.score),
      createdAt: r.created_at,
    }))
  }
}
