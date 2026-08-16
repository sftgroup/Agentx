// BillingClient — B-end balance pre-check (R19.7 companion) unit tests.
// Covers: auth headers (apiKey / accessToken / endUserId), zero balance as a
// normal response, and error propagation on HTTP failures.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { BillingClient } from '../src/payment/billing'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('BillingClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const makeClient = (extra: Record<string, unknown> = {}) =>
    new BillingClient({ gatewayUrl: 'https://gw.example.com', apiKey: 'agentx_test', ...extra })

  const firstCall = (call: unknown[]) => {
    const [url, init] = call as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    return { url, method: init.method, headers }
  }

  it('GETs /api/v1/billing/balance with X-Api-Key', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ balance: '0', balanceWei: '0', currency: 'OXA', updatedAt: null, subject: '0x' }))
    const client = makeClient()
    await client.getBalance()
    const { url, method, headers } = firstCall(fetchMock.mock.calls[0]!)
    expect(url).toBe('https://gw.example.com/api/v1/billing/balance')
    expect(method).toBe('GET')
    expect(headers['X-Api-Key']).toBe('agentx_test')
  })

  it('uses Bearer token in accessToken mode', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ balance: '0', balanceWei: '0', currency: 'OXA', updatedAt: null, subject: '0x' }))
    const client = new BillingClient({ gatewayUrl: 'https://gw.example.com', accessToken: 'jwt-abc' })
    await client.getBalance()
    const { headers } = firstCall(fetchMock.mock.calls[0]!)
    expect(headers['Authorization']).toBe('Bearer jwt-abc')
    expect(headers['X-Api-Key']).toBeUndefined()
  })

  it('requires either apiKey or accessToken', async () => {
    const client = new BillingClient({ gatewayUrl: 'https://gw.example.com' })
    await expect(client.getBalance()).rejects.toThrow('requires either apiKey or accessToken')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends X-End-User-Id when provided (per-call overrides config)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ balance: '0', balanceWei: '0', currency: 'OXA', updatedAt: null, subject: '0x' }))
    const client = makeClient({ endUserId: '0x1111111111111111111111111111111111111111' })
    await client.getBalance()
    const { headers } = firstCall(fetchMock.mock.calls[0]!)
    expect(headers['X-End-User-Id']).toBe('0x1111111111111111111111111111111111111111')
  })

  it('zero balance is a normal response, not an error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ balance: '0', balanceWei: '0', currency: 'OXA', updatedAt: null, subject: '0x' }))
    const res = await makeClient().getBalance()
    expect(res.balance).toBe('0')
    expect(res.balanceWei).toBe('0')
  })

  it('propagates the gateway error message on HTTP failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Invalid API key' }, 401))
    await expect(makeClient().getBalance()).rejects.toThrow('Balance query failed (HTTP 401) Invalid API key')
  })
})
