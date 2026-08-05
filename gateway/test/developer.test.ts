// ---------------------------------------------------------------------------
// R13 — developer application endpoints
// POST /api/v1/developer/apply — external teams self-service API integration
// ---------------------------------------------------------------------------

import request from 'supertest'
import express from 'express'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const poolMock = { query: vi.fn() }
vi.mock('../src/lib/db', () => ({ getPool: () => poolMock }))

import developerRouter from '../src/routes/developer'

const app = express()
app.use(express.json())
app.use('/api/v1/developer', developerRouter)

describe('POST /api/v1/developer/apply', () => {
  beforeEach(() => {
    poolMock.query.mockReset()
  })

  it('rejects missing required fields (400)', async () => {
    const res = await request(app).post('/api/v1/developer/apply').send({ company: 'Foo' })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('company, contact_name, and contact_email are required')
    expect(poolMock.query).not.toHaveBeenCalled()
  })

  it('rejects whitespace-only required fields (400)', async () => {
    const res = await request(app).post('/api/v1/developer/apply').send({
      company: '   ', contact_name: 'Jane', contact_email: 'jane@acme.io',
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('company, contact_name, and contact_email are required')
    expect(poolMock.query).not.toHaveBeenCalled()
  })

  it('creates a developer application (201) with type=developer', async () => {
    poolMock.query.mockResolvedValueOnce({
      rows: [{ id: 42, company: 'Acme Labs', type: 'developer', status: 'pending', created_at: '2026-08-06T00:00:00Z' }],
    })

    const res = await request(app).post('/api/v1/developer/apply').send({
      company: '  Acme Labs  ',
      contact_name: 'Jane',
      contact_email: 'jane@acme.io',
      website: 'https://acme.io',
      description: 'Trading bot',
    })

    expect(res.status).toBe(201)
    expect(res.body.application.id).toBe(42)
    expect(res.body.application.type).toBe('developer')

    const [sql, params] = poolMock.query.mock.calls[0]
    expect(sql).toContain(`'developer'`)
    expect(params[0]).toBe('Acme Labs') // trimmed
    expect(params[1]).toBe('Jane')
    expect(params[2]).toBe('jane@acme.io')
    expect(params[3]).toBe('https://acme.io')
    expect(params[4]).toBe('Trading bot')
  })

  it('maps missing website/description to null', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [{ id: 7, type: 'developer' }] })

    const res = await request(app).post('/api/v1/developer/apply').send({
      company: 'Mini Corp',
      contact_name: 'Bob',
      contact_email: 'bob@mini.io',
    })

    expect(res.status).toBe(201)
    const [, params] = poolMock.query.mock.calls[0]
    expect(params[3]).toBeNull()
    expect(params[4]).toBeNull()
  })
})
