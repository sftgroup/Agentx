// ---------------------------------------------------------------------------
// R13 / R19.5 (D-1) — developer application endpoints
// POST /api/v1/developer/apply — retired since R19.5: B-end onboarding is now
// fully self-service (wallet sign-in at /b with intent='partner'). The endpoint
// stays mounted and answers 410 so old callers get an explicit redirect signal.
// ---------------------------------------------------------------------------

import request from 'supertest'
import express from 'express'
import { describe, it, expect } from 'vitest'

import developerRouter from '../src/routes/developer'

const app = express()
app.use(express.json())
app.use('/api/v1/developer', developerRouter)

describe('POST /api/v1/developer/apply (retired, R19.5)', () => {
  it('answers 410 Gone with a self-service redirect signal', async () => {
    const res = await request(app).post('/api/v1/developer/apply').send({
      company: 'Acme Labs',
      contact_name: 'Jane',
      contact_email: 'jane@acme.io',
    })
    expect(res.status).toBe(410)
    expect(res.body.error).toContain('application flow is retired')
    expect(res.body.redirect).toBe('/b')
  })

  it('answers 410 regardless of payload', async () => {
    const res = await request(app).post('/api/v1/developer/apply').send({})
    expect(res.status).toBe(410)
  })
})
