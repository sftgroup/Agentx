// AgentX Conversation Service — Memory Engine
// Stores and recalls conversation facts using pgvector

import type { Pool } from 'pg'
import type { MemoryProvider, MemoryFact } from '@agentxv2/sdk/memory'
import { config } from '../config'

export class MemoryEngine implements MemoryProvider {
  constructor(
    private readonly db: Pool,
  ) {}

  async store(params: {
    subscriberAddress: string
    agentId: number
    fact: string
    metadata?: Record<string, string>
  }): Promise<void> {
    // Generate embedding if OpenAI API key is available, otherwise null
    let embedding: string | null = null
    if (config.openaiApiKey) {
      try {
        const res = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.openaiApiKey}`,
          },
          body: JSON.stringify({
            model: 'text-embedding-ada-002',
            input: params.fact,
          }),
        })
        if (res.ok) {
          const data = await res.json()
          embedding = JSON.stringify(data.data[0].embedding)
        }
      } catch (err) {
        console.warn('[MemoryEngine] Embedding generation failed, storing without vector:', (err as Error).message)
      }
    }

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
    if (config.openaiApiKey) {
      try {
        const embRes = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.openaiApiKey}`,
          },
          body: JSON.stringify({
            model: 'text-embedding-ada-002',
            input: params.query,
          }),
        })
        if (embRes.ok) {
          const data = await embRes.json()
          const queryVector = JSON.stringify(data.data[0].embedding)

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
        }
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
