// AgentX Gateway — Billing balance API unit tests.
// Covers: auth guard (401 without tenant), tenant balance, end-user wallet
// proxying (X-End-User-Id), zero/never-funded balance, and the optional
// pay-to / priceWei enhancement fields when x402 is enabled.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

const state = vi.hoisted(() => ({
  config: {
    x402Enabled: true,
    x402PayTo: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  },
  balanceWei: '0',
  updatedAt: null as string | null,
  paymentsService: {
    balanceOf: vi.fn(async (subject: string) => BigInt(state.balanceWei)),
    x402: { priceWei: vi.fn(() => 1_000_000_000_000_000n), available: vi.fn(() => true) },
  },
}))

vi.mock('../src/config', () => ({ config: state.config }))
vi.mock('../src/lib/db', () => ({
  getPool: () => ({
    query: async () => ({ rows: state.updatedAt ? [{ updated_at: state.updatedAt }] : [] }),
  }),
}))
vi.mock('../src/services/payments', () => ({ paymentsService: state.paymentsService }))
vi.mock('../src/services/agent-access', () => ({
  resolveAccessSubject: (wallet: string, _kind: string | undefined, endUserId?: string) =>
    endUserId && /^0x[0-9a-fA-F]{40}$/.test(endUserId) ? endUserId.toLowerCase() : wallet,
}))
vi.mock('../src/services/x402', () => ({
  x402Available: () => true,
  priceWei: () => 1_000_000_000_000_000n,
}))
vi.mock('../src/services/chain-data-reader', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import billingRouter from '../src/routes/billing'

const app = express()
app.use(express.json())
// Mock auth: inject a tenant context when the request carries X-Api-Key.
app.use('/api/v1/billing', (req, _res, next) => {
  if (req.headers['x-api-key']) {
    ;(req as any).tenant = {
      id: 't-1',
      walletAddress: '0x1111111111111111111111111111111111111111',
      kind: 'partner',
    }
  }
  next()
}, billingRouter)

beforeEach(() => {
  state.balanceWei = '0'
  state.updatedAt = null
  state.paymentsService.balanceOf.mockClear()
})

describe('GET /api/v1/billing/balance', () => {
  it('401 without auth', async () => {
    const res = await request(app).get('/api/v1/billing/balance')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Authentication required')
  })

  it('returns tenant balance (OXA decimal + wei)', async () => {
    state.balanceWei = '1500000000000000000' // 1.5 OXA
    const res = await request(app)
      .get('/api/v1/billing/balance')
      .set('X-Api-Key', 'agentx_test')
    expect(res.status).toBe(200)
    expect(res.body.balance).toBe('1.500000000000000000')
    expect(res.body.balanceWei).toBe('1500000000000000000')
    expect(res.body.currency).toBe('OXA')
    expect(res.body.subject).toBe('0x1111111111111111111111111111111111111111')
  })

  it('zero / never-funded → balance "0", no error', async () => {
    const res = await request(app)
      .get('/api/v1/billing/balance')
      .set('X-Api-Key', 'agentx_test')
    expect(res.status).toBe(200)
    expect(res.body.balance).toBe('0')
    expect(res.body.balanceWei).toBe('0')
    expect(res.body.updatedAt).toBeNull()
  })

  it('proxies an end-user wallet via X-End-User-Id', async () => {
    state.balanceWei = '1000000000000000' // 0.001 OXA
    const endUser = '0x2222222222222222222222222222222222222222'
    const res = await request(app)
      .get('/api/v1/billing/balance')
      .set('X-Api-Key', 'agentx_test')
      .set('X-End-User-Id', endUser)
    expect(res.status).toBe(200)
    expect(res.body.subject).toBe(endUser)
    expect(state.paymentsService.balanceOf).toHaveBeenCalledWith(endUser)
  })

  it('includes payTo + priceWei enhancement when x402 enabled', async () => {
    const res = await request(app)
      .get('/api/v1/billing/balance')
      .set('X-Api-Key', 'agentx_test')
    expect(res.status).toBe(200)
    expect(res.body.payTo).toBe('0x70997970C51812dc3A010C7d01b50e0d17dc79C8')
    expect(res.body.priceWei).toBe('1000000000000000')
  })
})
