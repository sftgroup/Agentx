// AgentX Gateway — R19.1 B-end wallet self-service auth unit tests.
// Covers the intent='partner' sign-in path: auto tenant creation (kind=partner),
// NO free plan (D10/T3 — plan_id NULL, quota 0), hashed API keys (D8/T2 —
// sha256 stored, plaintext never persisted, legacy plaintext still verified),
// plus getApiKey behavior for hashed-key tenants.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'

// vi.mock factories are hoisted — only vi.hoisted values are visible inside them.
const queryMock = vi.hoisted(() => vi.fn())
const { WALLET } = vi.hoisted(() => ({
  WALLET: '0x1234567890abcdef1234567890abcdef12345678',
}))

vi.mock('../src/lib/db', () => ({
  getPool: () => ({ query: queryMock }),
}))

vi.mock('../src/middleware/rate-limiter', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/middleware/rate-limiter')>()
  return { ...mod, getRedis: vi.fn(() => null) }
})

vi.mock('../src/config', () => ({
  config: { jwtSecret: 'test-secret', sessionTtlSec: 3600 },
}))

// verifyMessage returns the wallet under test so signatures "always validate"
vi.mock('ethers', () => ({
  ethers: { verifyMessage: vi.fn(() => WALLET) },
}))

import { getChallenge, verifyChallenge, apiKeyAuth, getApiKey } from '../src/middleware/auth'

const hash = (k: string) => crypto.createHash('sha256').update(k).digest('hex')

function makeRes(): any {
  const res: any = { json: vi.fn(), status: vi.fn() }
  res.status.mockReturnValue(res)
  return res
}

function makeReq(over: any = {}): any {
  return { headers: {}, query: {}, body: {}, params: {}, ...over }
}

async function obtainChallenge(address: string = WALLET): Promise<{ challenge: string; timestamp: number; nonce: string }> {
  const req = makeReq({ query: { address } })
  const res = makeRes()
  await getChallenge(req, res)
  return res.json.mock.calls[0][0]
}

async function signIn(intent?: string, wallet: string = WALLET): Promise<{ res: any; body: any }> {
  const ch = await obtainChallenge(wallet)
  const req = makeReq({
    body: { wallet_address: wallet, signature: '0xsig', timestamp: ch.timestamp, nonce: ch.nonce, intent },
  })
  const res = makeRes()
  await verifyChallenge(req, res)
  return { res, body: res.json.mock.calls[0][0] }
}

// ── shared row factory ──────────────────────────────────────────────────

function tenantRow(over: Record<string, unknown> = {}) {
  return {
    id: 't-1',
    wallet_address: WALLET,
    status: 'active',
    api_key: null,
    api_key_hash: null,
    quota_daily: 0,
    quota_used: 0,
    rate_limit_rpm: 5,
    max_concurrent: 1,
    kind: 'partner',
    allow_parallel_tasks: null,
    plan_id: null,
    plan_slug: null,
    plan_features: null,
    ...over,
  }
}

let currentRow: any = null

beforeEach(() => {
  queryMock.mockReset()
  currentRow = null
  queryMock.mockImplementation((sql: string, params?: unknown[]) => {
    if (sql.startsWith('SELECT t.id')) return Promise.resolve({ rows: currentRow ? [currentRow] : [] })
    if (sql.startsWith('SELECT id, features FROM plans')) return Promise.resolve({ rows: [{ id: 'free-1', features: {} }] })
    if (sql.startsWith('SELECT api_key FROM tenants')) return Promise.resolve({ rows: [{ api_key: null }] })
    if (sql.startsWith('INSERT INTO tenants')) return Promise.resolve({ rows: [{ id: 't-1' }] })
    if (sql.startsWith('UPDATE tenants SET api_key_hash')) return Promise.resolve({ rows: [] })
    return Promise.resolve({ rows: [] })
  })
})

// ── R19.1 B-end self-registration ───────────────────────────────────────

describe('R19.1 B-end partner sign-in (intent=partner)', () => {
  it('creates a kind=partner tenant with NO free plan (plan_id NULL, quota 0)', async () => {
    const { res, body } = await signIn('partner')
    expect(res.status).not.toHaveBeenCalled()
    expect(body.is_new).toBe(true)
    expect(body.tenant.kind).toBe('partner')
    expect(body.tenant.planId).toBe('')
    expect(body.tenant.planSlug).toBe('')
    expect(body.tenant.quotaDaily).toBe(0)
    expect(body.tenant.status).toBe('active')
  })

  it('stores the new API key as a SHA-256 hash and never persists plaintext', async () => {
    const { body } = await signIn('partner')
    expect(body.api_key).toMatch(/^agentx_[0-9a-f]{32}$/)
    const insertCall = queryMock.mock.calls.find((c: unknown[]) => (c[0] as string).startsWith('INSERT INTO tenants'))
    expect(insertCall).toBeDefined()
    const [sql, params] = insertCall as [string, unknown[]]
    expect(sql).toContain('api_key_hash')
    expect(sql).toContain("'partner'")
    expect(params).toEqual([WALLET, hash(body.api_key as string)])
    // plaintext must never appear in persisted params
    expect(JSON.stringify(params)).not.toContain(body.api_key)
  })

  it('returns is_new=false and no api_key for an existing hashed-key tenant', async () => {
    currentRow = tenantRow({ api_key: null, api_key_hash: 'a'.repeat(64), kind: 'partner' })
    const { res, body } = await signIn('partner')
    expect(res.status).not.toHaveBeenCalled()
    expect(body.is_new).toBe(false)
    expect(body.api_key).toBeNull()
    expect(body.tenant.kind).toBe('partner')
    // no re-issue UPDATE for hashed tenants
    const updates = queryMock.mock.calls.filter((c: unknown[]) => (c[0] as string).startsWith('UPDATE'))
    expect(updates).toHaveLength(0)
  })

  it('returns the legacy plaintext key (is_new=false) for a pre-migration tenant', async () => {
    currentRow = tenantRow({ api_key: 'agentx_legacy', kind: 'user', plan_slug: 'free' })
    const { res, body } = await signIn('partner')
    expect(res.status).not.toHaveBeenCalled()
    expect(body.is_new).toBe(false)
    expect(body.api_key).toBe('agentx_legacy')
  })

  it('backfills a hashed key exactly once for legacy tenants without any key', async () => {
    currentRow = tenantRow({ api_key: null, api_key_hash: null })
    const { body } = await signIn('partner')
    expect(body.is_new).toBe(true)
    expect(body.api_key).toMatch(/^agentx_/)
    const updateCall = queryMock.mock.calls.find((c: unknown[]) => (c[0] as string).startsWith('UPDATE'))
    expect(updateCall).toBeDefined()
    expect((updateCall as unknown[])[1]).toEqual([hash(body.api_key as string), 't-1'])
  })
})

describe('C-end (user) sign-in keeps working', () => {
  it('registers a kind=user tenant on free plan with a hashed key', async () => {
    const { res, body } = await signIn() // no intent
    expect(res.status).not.toHaveBeenCalled()
    expect(body.is_new).toBe(true)
    expect(body.tenant.kind).toBe('user')
    expect(body.tenant.planSlug).toBe('free')
    const insertCall = queryMock.mock.calls.find((c: unknown[]) => (c[0] as string).startsWith('INSERT INTO tenants'))
    const [sql, params] = insertCall as [string, unknown[]]
    expect(sql).toContain("'user'")
    expect(params).toEqual([WALLET, 'free-1', hash(body.api_key as string)])
  })
})

// ── X-Api-Key verification (hashed first, legacy plaintext fallback) ────

describe('apiKeyAuth — R19.1 hashed-key verification', () => {
  it('looks up the SHA-256 digest and authenticates a new-style key', async () => {
    currentRow = tenantRow({ api_key_hash: 'a'.repeat(64), kind: 'partner' })
    const plain = 'agentx_0123456789abcdef0123456789abcdef'
    const req = makeReq({ headers: { 'x-api-key': plain } })
    const res = makeRes()
    const next = vi.fn()
    apiKeyAuth(req, res, next)
    // apiKeyAuth resolves asynchronously via queryTenant().then — wait for it
    await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1))
    expect(req.tenant.kind).toBe('partner')
    // WHERE clause must receive [hash(plain), plain]
    const call = queryMock.mock.calls.find((c: unknown[]) => (c[0] as string).includes('api_key_hash = $1'))
    expect((call as unknown[])[1]).toEqual([hash(plain), plain])
  })

  it('rejects an unknown key with 401', async () => {
    const req = makeReq({ headers: { 'x-api-key': 'agentx_nope' } })
    const res = makeRes()
    const next = vi.fn()
    apiKeyAuth(req, res, next)
    await vi.waitFor(() => expect(res.status).toHaveBeenCalledWith(401))
    expect(next).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid API key' })
  })
})

// ── getApiKey for hashed-key tenants ────────────────────────────────────

describe('getApiKey — hashed-key tenants cannot re-fetch plaintext', () => {
  it('returns 404 for hashed-key tenants (key shown once at issuance)', async () => {
    const req = makeReq({ tenant: { id: 't-1' } })
    const res = makeRes()
    await getApiKey(req, res)
    expect(res.status).toHaveBeenCalledWith(404)
  })

  it('still returns the plaintext key for legacy tenants', async () => {
    queryMock.mockImplementationOnce((sql: string) =>
      sql.startsWith('SELECT api_key')
        ? Promise.resolve({ rows: [{ api_key: 'agentx_legacy' }] })
        : Promise.resolve({ rows: [] })
    )
    const req = makeReq({ tenant: { id: 't-1' } })
    const res = makeRes()
    await getApiKey(req, res)
    expect(res.json).toHaveBeenCalledWith({ api_key: 'agentx_legacy' })
  })
})
