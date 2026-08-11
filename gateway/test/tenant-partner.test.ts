// AgentX Gateway — R19.1 /api/v1/tenant/me regression test.
// Partner tenants register WITHOUT a plan (plan_id NULL). /me must not pass an
// empty uuid to Postgres (string_to_uuid error) — plan query is skipped.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const queryMock = vi.hoisted(() => vi.fn())

vi.mock('../src/lib/db', () => ({
  getPool: () => ({ query: queryMock }),
}))

vi.mock('../src/middleware/rate-limiter', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/middleware/rate-limiter')>()
  return { ...mod, getRedis: vi.fn(() => null) }
})

vi.mock('../src/config', () => ({
  config: { masterEncryptionKey: 'test-key', jwtSecret: 'test-secret', sessionTtlSec: 3600 },
}))

// Express Router shape used by routes/tenant.ts
vi.mock('express', () => {
  const router = () => {
    const r: any = { get: vi.fn(), post: vi.fn(), delete: vi.fn() }
    return r
  }
  return { Router: vi.fn(() => router()) }
})

import tenantRouter from '../src/routes/tenant'

function makeTenant(over: Record<string, unknown> = {}) {
  return {
    id: 't-1',
    walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
    planId: '',
    planSlug: '',
    quotaDaily: 0,
    quotaUsed: 0,
    rateLimitRpm: 5,
    maxConcurrent: 1,
    status: 'active',
    kind: 'partner',
    allowParallelTasks: null,
    planFeatures: null,
    ...over,
  }
}

function makeReq(tenant: any): any {
  return { tenant, query: {}, params: {}, body: {} }
}

function makeRes(): any {
  const res: any = { json: vi.fn(), status: vi.fn() }
  res.status.mockReturnValue(res)
  return res
}

// Grab the registered /me handler from the router mock
function getMeHandler(): (req: any, res: any) => Promise<void> {
  const router = (tenantRouter as any) as { get: ReturnType<typeof vi.fn> }
  const meCall = router.get.mock.calls.find((c: unknown[]) => c[0] === '/me')
  expect(meCall).toBeDefined()
  return (meCall as unknown[])[1] as (req: any, res: any) => Promise<void>
}

describe('GET /api/v1/tenant/me — partner tenant without plan', () => {
  beforeEach(() => {
    queryMock.mockReset()
  })

  it('skips the plan query when plan_id is NULL and returns plan:null (no string_to_uuid crash)', async () => {
    queryMock.mockImplementation((sql: string) => {
      if (sql.startsWith('SELECT id, provider, model')) return Promise.resolve({ rows: [] })
      if (sql.startsWith('SELECT COALESCE(SUM(tokens_total)')) return Promise.resolve({ rows: [{ total_tokens: '12', total_tool_calls: '3' }] })
      return Promise.resolve({ rows: [] })
    })

    const handler = getMeHandler()
    const req = makeReq(makeTenant())
    const res = makeRes()
    await handler(req, res)

    // No SQL containing "FROM plans" should have been issued with an empty uuid
    const planQueries = queryMock.mock.calls.filter((c: unknown[]) =>
      (c[0] as string).includes('FROM plans')
    )
    expect(planQueries).toHaveLength(0)

    expect(res.status).not.toHaveBeenCalled()
    const body = res.json.mock.calls[0][0]
    expect(body.plan).toBeNull()
    expect(body.tenant.id).toBe('t-1')
    expect(body.usage_today.total_tokens).toBe(12)
    expect(body.capabilities.parallel_tasks).toBe(true)
  })

  it('still loads the plan for tenants WITH a plan (unchanged path)', async () => {
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes('FROM plans')) {
        return Promise.resolve({
          rows: [{ name: 'Pro', slug: 'pro', quota_daily: 1000, quota_monthly: 0, platform_models: [], byok_enabled: true, rate_limit_rpm: 60, max_concurrent: 10, features: {} }],
        })
      }
      if (sql.startsWith('SELECT id, provider, model')) return Promise.resolve({ rows: [] })
      if (sql.startsWith('SELECT COALESCE(SUM(tokens_total)')) return Promise.resolve({ rows: [{ total_tokens: '0', total_tool_calls: '0' }] })
      return Promise.resolve({ rows: [] })
    })

    const handler = getMeHandler()
    const req = makeReq(makeTenant({ planId: 'plan-pro', kind: 'user', planSlug: 'pro' }))
    const res = makeRes()
    await handler(req, res)

    const planQueries = queryMock.mock.calls.filter((c: unknown[]) =>
      (c[0] as string).includes('FROM plans')
    )
    expect(planQueries).toHaveLength(1)
    expect((planQueries[0] as unknown[])[1]).toEqual(['plan-pro'])
    const body = res.json.mock.calls[0][0]
    expect(body.plan.slug).toBe('pro')
  })
})
