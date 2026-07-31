// AgentX Gateway — Skill Service
// Business logic for skill template CRUD and review workflow

import { Pool } from 'pg'

export interface SkillTemplate {
  id?: number
  name: string
  description: string
  category: string
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  usageCount?: number
  status?: 'pending' | 'approved' | 'rejected'
  publisher?: string
  reviewer?: string
  reviewNote?: string
  createdAt?: string
  updatedAt?: string
}

export class SkillService {
  constructor(private readonly db: Pool) {}

  async list(params: {
    category?: string
    status?: string
    page?: number
    limit?: number
  }): Promise<{ skills: SkillTemplate[]; total: number }> {
    const limit = Math.min(params.limit || 20, 100)
    const offset = ((params.page || 1) - 1) * limit

    let where = "WHERE status = 'approved'"
    const values: (string | number)[] = []

    if (params.category) {
      where += ' AND category = $' + (values.length + 1)
      values.push(params.category)
    }
    if (params.status) {
      where = `WHERE status = $${values.length + 1}`
      values.push(params.status)
    }

    const countResult = await this.db.query(`SELECT COUNT(*) FROM skills ${where}`, values)
    const result = await this.db.query(
      `SELECT * FROM skills ${where} ORDER BY usage_count DESC, created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    )

    return {
      skills: result.rows as SkillTemplate[],
      total: parseInt(countResult.rows[0].count),
    }
  }

  async getById(id: number): Promise<SkillTemplate | null> {
    const result = await this.db.query('SELECT * FROM skills WHERE id = $1', [id])
    return result.rows[0] || null
  }

  async submit(data: {
    name: string
    description: string
    category: string
    inputSchema: Record<string, unknown>
    outputSchema?: Record<string, unknown>
    publisher: string
  }): Promise<SkillTemplate> {
    const result = await this.db.query(
      `INSERT INTO skills (name, description, category, input_schema, output_schema, publisher, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       ON CONFLICT (name, publisher) DO UPDATE SET
         description = $2, category = $3, input_schema = $4, output_schema = $5, updated_at = NOW()
       RETURNING *`,
      [data.name, data.description, data.category,
       JSON.stringify(data.inputSchema), JSON.stringify(data.outputSchema || {}), data.publisher]
    )
    return result.rows[0]
  }

  async review(params: {
    id: number
    action: 'approve' | 'reject'
    reviewer: string
    note?: string
  }): Promise<SkillTemplate | null> {
    const status = params.action === 'approve' ? 'approved' : 'rejected'
    const result = await this.db.query(
      `UPDATE skills SET status = $1, reviewer = $2, review_note = $3, updated_at = NOW()
       WHERE id = $4 AND status = 'pending'
       RETURNING *`,
      [status, params.reviewer, params.note || null, params.id]
    )
    return result.rows[0] || null
  }

  async listByPublisher(publisher: string): Promise<SkillTemplate[]> {
    const result = await this.db.query(
      'SELECT * FROM skills WHERE publisher = $1 ORDER BY created_at DESC',
      [publisher]
    )
    return result.rows
  }

  async incrementUsage(id: number): Promise<void> {
    await this.db.query(
      'UPDATE skills SET usage_count = usage_count + 1 WHERE id = $1',
      [id]
    )
  }
}

let instance: SkillService | null = null

export function getSkillService(): SkillService {
  if (!instance) {
    const { getPool } = require('../lib/db')
    instance = new SkillService(getPool())
  }
  return instance
}
