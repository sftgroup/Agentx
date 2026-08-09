// SubscriptionPayments — three-rail subscription payment unit tests.
// 0.9.0: fiat/x402/access talk to the unified payments endpoint through
// @0xinfrax/payments' PaymentsClient; chain stays on SubscriptionManager.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SubscriptionPayments } from '../src/payment/payments'
import { MPPClient, A2AClient, PeriodClient, X402Client, PaymentsClient, PAYMENT_VERSION } from '../src/payment'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('payment module exports (v0.9.3)', () => {
  it('re-exports the generic protocol clients from the SDK root', () => {
    for (const Ctor of [MPPClient, A2AClient, PeriodClient, X402Client, PaymentsClient]) {
      expect(typeof Ctor).toBe('function')
      expect(new Ctor({ baseUrl: 'http://localhost' })).toBeInstanceOf(Ctor)
    }
  })
  it('tracks the aligned generic engine version', () => {
    expect(PAYMENT_VERSION).toBe('0.1.1') // F2 跟随演练：@0xinfrax/payments 0.1.0→0.1.1
  })
})

describe('SubscriptionPayments', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const make = (extra: Record<string, unknown> = {}) =>
    new SubscriptionPayments({ gatewayUrl: 'https://gw.example.com', ...extra })

  const firstCall = (call: unknown[]) => {
    const [url, init] = call as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    const body = init.body ? JSON.parse(init.body as string) : undefined
    return { url, method: init.method, headers, body }
  }

  describe('chain rail', () => {
    it('delegates to SubscriptionManager.subscribe and returns the chain result', async () => {
      const subscribe = vi.fn().mockResolvedValue({
        subscriptionId: 7, txHash: '0xtx1', subscriber: '0xa', agentId: 3, expiresAt: 123,
      })
      const payments = make({ subscriptionManager: { subscribe } as unknown as never })
      const res = await payments.pay({ planId: 1, agentId: 3, method: 'chain' })
      expect(res).toEqual({ method: 'chain', subscriptionId: 7, txHash: '0xtx1' })
      expect(subscribe).toHaveBeenCalledWith(1, { valueWei: undefined, approveTokenFirst: undefined })
    })

    it('throws when no SubscriptionManager is configured', async () => {
      const payments = make()
      await expect(payments.pay({ planId: 1, agentId: 3, method: 'chain' }))
        .rejects.toThrow('requires a SubscriptionManager')
    })
  })

  describe('fiat rail', () => {
    it('creates a checkout through the unified endpoint and returns the Stripe redirect', async () => {
      fetchMock.mockResolvedValue(jsonResponse({
        method: 'fiat', paymentId: 'pi_f1', url: 'https://checkout.stripe.com/c/s1',
        sessionUrl: 'https://checkout.stripe.com/c/s1', sessionId: 'cs_1',
        clientReference: '0xabc|3|2', redirect: true,
      }, 200))
      const payments = make()
      const res = await payments.pay({
        method: 'fiat', planId: 2, agentId: 3, subscriber: '0xabc',
        amountCents: 499, currency: 'usd', successUrl: 'https://x.app/success',
      })
      expect(res).toEqual({ method: 'fiat', sessionUrl: 'https://checkout.stripe.com/c/s1', sessionId: 'cs_1', redirect: true })
      const { url, method, body } = firstCall(fetchMock.mock.calls[0]!)
      expect(url).toBe('https://gw.example.com/api/v1/payments')
      expect(method).toBe('POST')
      expect(body).toMatchObject({
        method: 'fiat', subscriber: '0xabc', period: 'month', currency: 'usd', chain: 'oxachain',
        amountCents: 499, pricing: { planId: 2 }, metadata: { agentId: 3, planId: 2 },
        successUrl: 'https://x.app/success',
      })
    })

    it('omits amountCents when not supplied (Gateway auto-prices from planId)', async () => {
      fetchMock.mockResolvedValue(jsonResponse({
        method: 'fiat', paymentId: 'pi_f2', url: 'https://checkout.stripe.com/c/s2',
        sessionUrl: 'https://checkout.stripe.com/c/s2', sessionId: 'cs_2',
        clientReference: '0xabc|3|2', redirect: true,
      }, 200))
      const res = await make().pay({ method: 'fiat', planId: 2, agentId: 3, subscriber: '0xabc' })
      expect(res.redirect).toBe(true)
      const { body } = firstCall(fetchMock.mock.calls[0]!)
      expect(body).toMatchObject({ subscriber: '0xabc', period: 'month', currency: 'usd', chain: 'oxachain' })
      expect(body.amountCents).toBeUndefined()
    })

    it('requires a gatewayUrl', async () => {
      const payments = new SubscriptionPayments({})
      await expect(payments.pay({ method: 'fiat', planId: 2, agentId: 3, subscriber: '0xabc', amountCents: 100 }))
        .rejects.toThrow('gatewayUrl')
    })
  })

  describe('x402 rail', () => {
    it('POSTs the x402 subscription to the unified endpoint with the given txHash', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ subscriptionId: 9, creditedWei: '1000' }, 200))
      const payments = make({ chain: 'oxachain' })
      const res = await payments.pay({
        method: 'x402', planId: 2, agentId: 3, subscriber: '0xabc', txHash: '0xtx99', period: 'month',
      })
      expect(res).toEqual({ method: 'x402', subscriptionId: 9, txHash: '0xtx99', creditedWei: '1000' })
      const { url, method, body } = firstCall(fetchMock.mock.calls[0]!)
      expect(url).toBe('https://gw.example.com/api/v1/payments')
      expect(method).toBe('POST')
      expect(body).toMatchObject({ method: 'x402', subscriber: '0xabc', agentId: 3, planId: 2, period: 'month', txHash: '0xtx99', chain: 'oxachain' })
    })

    it('auto-funds the payment via the wallet client when no txHash is given', async () => {
      const sendTransaction = vi.fn().mockResolvedValue('0xautotx')
      const getPlan = vi.fn().mockResolvedValue({ price: 800n })
      fetchMock.mockResolvedValueOnce(jsonResponse({
        rails: { fiat: { enabled: true }, chain: { enabled: true }, x402: { enabled: true } },
        x402: { enabled: true, priceWei: '500', payTo: '0xpay', network: 'eip155:1', chain: 'oxachain' },
        chains: { chain: 'oxachain', chainId: 19505 },
      }, 200))
      fetchMock.mockResolvedValue(jsonResponse({ subscriptionId: 11, creditedWei: '800' }, 200))
      const payments = make({ walletClient: { account: { address: '0xacc' }, sendTransaction }, subscriptionManager: { getPlan } as unknown as never })

      const res = await payments.pay({ method: 'x402', planId: 2, agentId: 3, subscriber: '0xabc' })
      expect(sendTransaction).toHaveBeenCalledWith({ to: '0xpay', value: 800n, chain: undefined, account: '0xacc' })
      expect(res).toEqual({ method: 'x402', subscriptionId: 11, txHash: '0xautotx', creditedWei: '800' })
      // Discovery went to the unified info endpoint first.
      const infoUrl = firstCall(fetchMock.mock.calls[0]!).url
      expect(infoUrl).toBe('https://gw.example.com/api/v1/payments/info')
    })

    it('rejects an invalid period', async () => {
      const payments = make()
      await expect(payments.pay({ method: 'x402', planId: 2, agentId: 3, subscriber: '0xabc', txHash: '0x1', period: 'hourly' as never }))
        .rejects.toThrow('period must be one of')
    })
  })

  describe('hasAccess + fetchX402Info', () => {
    it('returns active from the unified access endpoint', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ active: true }))
      const ok = await make().hasAccess(3, '0xabc')
      expect(ok).toBe(true)
      const { url } = firstCall(fetchMock.mock.calls[0]!)
      expect(url).toContain('/api/v1/payments/access?')
      expect(url).toContain('subscriber=0xabc')
      expect(url).toContain('agentId=3')
      expect(url).toContain('chain=oxachain')
    })

    it('requires a gatewayUrl', async () => {
      await expect(new SubscriptionPayments({}).hasAccess(3, '0xabc')).rejects.toThrow('gatewayUrl')
    })

    it('adapts the unified info payload into X402Info', async () => {
      fetchMock.mockResolvedValue(jsonResponse({
        rails: { fiat: { enabled: true }, chain: { enabled: true }, x402: { enabled: true } },
        x402: { enabled: true, priceWei: '123', payTo: '0xpay', network: 'eip155:11155111', chain: 'sepolia' },
        chains: { chain: 'sepolia', chainId: 11155111 },
      }, 200))
      const info = await make().fetchX402Info()
      expect(info).toEqual({
        enabled: true, priceWei: '123', payTo: '0xpay', network: 'eip155:11155111', chain: 'sepolia',
      })
      const { url } = firstCall(fetchMock.mock.calls[0]!)
      expect(url).toBe('https://gw.example.com/api/v1/payments/info')
    })
  })

  describe('error handling', () => {
    it('surfaces the gateway error message on non-2xx', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: 'subscriber must be the wallet that sent the payment' }, 422))
      await expect(make().pay({ method: 'x402', planId: 2, agentId: 3, subscriber: '0xabc', txHash: '0x1' }))
        .rejects.toThrow('subscriber must be the wallet that sent the payment')
    })

    it('sends the bearer token when configured', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ active: true }))
      await make({ accessToken: 'tok-1' }).hasAccess(3, '0xabc')
      const { headers } = firstCall(fetchMock.mock.calls[0]!)
      expect(headers['Authorization']).toBe('Bearer tok-1')
    })
  })
})
