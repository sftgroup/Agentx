// ---------------------------------------------------------------------------
// AgentX — useTenantPlanPurchase Hook (R19.3 / D11)
// ---------------------------------------------------------------------------
// B-end / C-end wallet purchase of a platform subscription tier through the
// unified payments endpoint:
//   1. list purchasable plans (GET /tenant/plans → price_wei mirrors engine check)
//   2. fund the exact amount to the x402 pay-to wallet (walletClient transfer)
//   3. POST /api/v1/payments { purpose:'tenant-plan', method:'x402', txHash }
//      → the Gateway verifies the tx then binds plan_id / quota_daily
// ---------------------------------------------------------------------------

'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Address, WalletClient } from 'viem'
import { GATEWAY_URL } from '@/lib/gateway'

export interface TenantPlanOption {
  id: string
  name: string
  slug: string
  price_monthly: string
  currency: string
  quota_daily: number
  quota_monthly: number
  byok_enabled: boolean
  rate_limit_rpm: number
  max_concurrent: number
  platform_models: { provider: string; model: string }[]
  price_wei: string
}

interface X402Info {
  enabled: boolean
  priceWei?: string
  payTo?: string
}

export function useTenantPlanPurchase(opts: { accessToken: string | null; walletClient?: WalletClient }) {
  const { accessToken, walletClient } = opts
  const [plans, setPlans] = useState<TenantPlanOption[]>([])
  const [payTo, setPayTo] = useState<string>('')
  const [purchasing, setPurchasing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPlans = useCallback(async () => {
    if (!accessToken) return
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` }
      const [plansRes, infoRes] = await Promise.all([
        fetch(`${GATEWAY_URL}/api/v1/tenant/plans`, { headers }),
        fetch(`${GATEWAY_URL}/api/v1/payments/info`),
      ])
      const plansData = await plansRes.json() as { plans?: TenantPlanOption[] }
      const infoData = await infoRes.json() as { x402?: X402Info }
      setPlans((plansData.plans ?? []).filter((p) => p.price_wei && p.price_wei !== '0'))
      setPayTo(infoData.x402?.payTo ?? '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plans')
    }
  }, [accessToken])

  useEffect(() => { loadPlans() }, [loadPlans])

  /** x402 purchase: fund the exact amount → verify+bind via the unified endpoint. */
  const purchase = useCallback(async (plan: TenantPlanOption, subscriber: Address) => {
    setPurchasing(true)
    setError(null)
    try {
      if (!walletClient) throw new Error('Wallet not connected')
      if (!payTo) throw new Error('x402 is not enabled on the Gateway (X402_PAY_TO missing)')
      const hash = await walletClient.sendTransaction({
        to: payTo as Address,
        value: BigInt(plan.price_wei),
        chain: undefined,
        account: walletClient.account!,
      })
      const res = await fetch(`${GATEWAY_URL}/api/v1/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'x402',
          purpose: 'tenant-plan',
          tenantPlanId: plan.id,
          subscriber,
          txHash: hash,
          chain: 'oxachain',
        }),
      })
      const data = await res.json() as { error?: string; planSlug?: string }
      if (!res.ok) throw new Error(data.error || 'Purchase failed')
      await loadPlans()
      return { ok: true as const, planSlug: data.planSlug ?? '' }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Purchase failed')
      return { ok: false as const, error: err instanceof Error ? err.message : 'Purchase failed' }
    } finally {
      setPurchasing(false)
    }
  }, [walletClient, payTo, loadPlans])

  return { plans, payTo, purchasing, error, purchase }
}
