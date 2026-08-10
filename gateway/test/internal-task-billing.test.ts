// AgentX Gateway — Internal Task Billing callback unit tests.
// Covers the shared-secret guard, platform-mode metering (tenantAddress →
// tenantId mapping + updateQuota), and idempotency across SSE/callback paths.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

const state = vi.hoisted(() => ({
  config: { orchestrateToken: 'test-orch-token' },
  updateQuota: vi.fn(async () => {}),
  tenantByWallet: {} as Record<string, string>,
  getPool: () => ({
    query: async (_sql: string, params: unknown[]) => {
      const wallet = String(params[0])
      const id = state.tenantByWallet[wallet]
      return { rows: id ? [{ id }] : [] }
    },
  }),
}))

vi.mock('../src/config', () => ({ config: state.config }))
vi.mock('../src/middleware/rate-limiter', () => ({ updateQuota: state.updateQuota }))
vi.mock('../src/lib/db', () => ({ getPool: state.getPool }))

import billingRouter from '../src/routes/internal-task-billing'

const app = express()
app.use(express.json())
app.use('/api/v1/internal/task-billing', billingRouter)

const valid = (overrides: Record<string, unknown> = {}) => ({
  taskId: `task-${Math.random().toString(36).slice(2)}`,
  tenantAddress: 'partner-smoke-1',
  totalTokens: 120,
  llmSource: 'platform',
  ...overrides,
})

beforeEach(() => {
  state.updateQuota.mockClear()
  state.tenantByWallet = {}
})

describe('shared-secret guard', () => {
  it('rejects without X-Orchestrate-Token → 401', async () => {
    const res = await request(app).post('/api/v1/internal/task-billing').send(valid())
    expect(res.status).toBe(401)
  })

  it('rejects a wrong token → 401', async () => {
    const res = await request(app)
      .post('/api/v1/internal/task-billing')
      .set('X-Orchestrate-Token', 'wrong')
      .send(valid())
    expect(res.status).toBe(401)
  })
})

describe('platform-mode metering', () => {
  it('meters a platform-usage task against the tenant quota', async () => {
    state.tenantByWallet['partner-smoke-1'] = 't-p1'
    const res = await request(app)
      .post('/api/v1/internal/task-billing')
      .set('X-Orchestrate-Token', 'test-orch-token')
      .send(valid())
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(state.updateQuota).toHaveBeenCalledTimes(1)
    expect(state.updateQuota).toHaveBeenCalledWith('t-p1', 120)
  })

  it('skips BYOK usage (llmSource !== platform) without metering', async () => {
    state.tenantByWallet['partner-smoke-1'] = 't-p1'
    const res = await request(app)
      .post('/api/v1/internal/task-billing')
      .set('X-Orchestrate-Token', 'test-orch-token')
      .send(valid({ llmSource: 'byok', totalTokens: 500 }))
    expect(res.status).toBe(200)
    expect(res.body.skipped).toBe('not platform usage')
    expect(state.updateQuota).not.toHaveBeenCalled()
  })

  it('skips when the wallet has no tenant record', async () => {
    const res = await request(app)
      .post('/api/v1/internal/task-billing')
      .set('X-Orchestrate-Token', 'test-orch-token')
      .send(valid())
    expect(res.status).toBe(200)
    expect(res.body.skipped).toBe('no tenant record')
    expect(state.updateQuota).not.toHaveBeenCalled()
  })

  it('rejects when taskId/tenantAddress are missing → 400', async () => {
    const res = await request(app)
      .post('/api/v1/internal/task-billing')
      .set('X-Orchestrate-Token', 'test-orch-token')
      .send({ totalTokens: 10, llmSource: 'platform' })
    expect(res.status).toBe(400)
  })

  it('is idempotent — a task already billed via SSE is not counted twice', async () => {
    state.tenantByWallet['partner-smoke-1'] = 't-p1'
    const post = () =>
      request(app)
        .post('/api/v1/internal/task-billing')
        .set('X-Orchestrate-Token', 'test-orch-token')
        .send(valid({ taskId: 'task-dup' }))
    await post()
    const second = await post()
    expect(second.body.skipped).toBe('already billed')
    expect(state.updateQuota).toHaveBeenCalledTimes(1)
  })
})
