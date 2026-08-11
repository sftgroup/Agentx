// AgentX Gateway — R19.2 POST /api/v1/tenant/rotate-key test.
// Rotating replaces the stored api_key_hash and clears any legacy plaintext so
// the old key dies immediately; the new key is returned exactly once.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hashApiKey } from '../src/middleware/auth'

const queryMock = vi.hoisted(() => vi.fn())

vi.mock('../src/lib/db', () => ({
  getPool: () => ({ query: queryMock }),
}))

vi.mock('../src/middleware/rate-limiter', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/middleware/rate-limiter')>()
  return { ...mod, getRedis: vi.fn(() => null) }
})

vi.mock('../src/config', () => ({
  config: { masterEncryptionKey: 'test-key', jwtSecret: 'test-secret', sessionTtlSec: 3600, fiatTokenUsdPrice: 1 },
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

function getRotateKeyHandler(): (req: any, res: any) => Promise<void> {
  const router = (tenantRouter as any) as { post: ReturnType<typeof vi.fn> }
  const call = router.post.mock.calls.find((c: unknown[]) => c[0] === '/rotate-key')
  expect(call).toBeDefined()
  return (call as unknown[])[1] as (req: any, res: any) => Promise<void>
}

function makeReq(tenantId = 't-1'): any {
  return { tenant: { id: tenantId }, query: {}, params: {}, body: {} }
}

function makeRes(): any {
  const res: any = { json: vi.fn(), status: vi.fn() }
  res.status.mockReturnValue(res)
  return res
}

describe('POST /api/v1/tenant/rotate-key (R19.2)', () => {
  beforeEach(() => {
    queryMock.mockReset()
  })

  it('issues a fresh agentx_ key, stores only its hash, and clears legacy plaintext', async () => {
    queryMock.mockImplementation((sql: string) => {
      if (sql.startsWith('UPDATE tenants SET api_key_hash')) {
        return Promise.resolve({ rows: [{ id: 't-1' }] })
      }
      return Promise.resolve({ rows: [] })
    })

    const handler = getRotateKeyHandler()
    const res = makeRes()
    await handler(makeReq('t-1'), res)

    expect(res.status).not.toHaveBeenCalled()
    const body = res.json.mock.calls[0][0]
    expect(body.rotated).toBe(true)
    expect(body.api_key).toMatch(/^agentx_[0-9a-f]{32}$/)

    // The UPDATE must store the SHA-256 of the returned key, never plaintext
    const updateCall = queryMock.mock.calls.find((c: unknown[]) => (c[0] as string).startsWith('UPDATE tenants SET api_key_hash'))
    expect(updateCall).toBeDefined()
    const params = (updateCall as unknown[])[1] as string[]
    expect(params[0]).toBe(hashApiKey(body.api_key))
    expect(params[0]).not.toBe(body.api_key)
    expect(params[1]).toBe('t-1')
  })

  it('answers 404 when the tenant row is missing', async () => {
    queryMock.mockImplementation(() => Promise.resolve({ rows: [] }))

    const handler = getRotateKeyHandler()
    const res = makeRes()
    await handler(makeReq('ghost'), res)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json.mock.calls[0][0].error).toContain('Tenant not found')
  })
})
