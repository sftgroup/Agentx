// ---------------------------------------------------------------------------
// AgentX — usePartnerGatewayAuth Hook (R19.1)
// ---------------------------------------------------------------------------
// B-end wallet auth → Gateway JWT with intent='partner'.
// First sign-in auto-provisions a kind='partner' tenant (NO free plan, hashed
// API key returned exactly once). Existing tenants keep their kind — a wallet
// that already registered as a C-end user surfaces kind !== 'partner'.
// ---------------------------------------------------------------------------

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAccount, useWalletClient } from 'wagmi'
import { GATEWAY_URL } from '@/lib/gateway'

interface AuthState {
  isLoading: boolean
  error: string | null
}

export interface PartnerPlan {
  name: string
  slug: string
  quota_daily: number
  quota_used: number
  rate_limit_rpm: number
  max_concurrent: number
  platform_models: { provider: string; model: string }[]
  byok_enabled: boolean
}

export interface PartnerContext {
  accessToken: string
  tenant: {
    id: string
    wallet_address: string
    status: string
    kind: string
  }
  /** null → no active subscription; platform LLM requires one (R19.3) */
  plan: PartnerPlan | null
  usageToday: { total_tokens: number; total_tool_calls: number }
  /** present only when this sign-in issued a brand-new key (shown once) */
  apiKey: string | null
  isNew: boolean
}

export function usePartnerGatewayAuth() {
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const [state, setState] = useState<AuthState>({ isLoading: false, error: null })
  const [context, setContext] = useState<PartnerContext | null>(null)
  const tokenRef = useRef<string | null>(null)

  const authenticate = useCallback(async () => {
    if (!isConnected || !address || !walletClient) {
      setContext(null)
      setState({ isLoading: false, error: null })
      return
    }
    setState({ isLoading: true, error: null })
    try {
      const challengeRes = await fetch(`${GATEWAY_URL}/api/v1/auth/challenge?address=${address}`)
      const { challenge } = await challengeRes.json() as { challenge: string }

      const signature = await walletClient.signMessage({
        account: walletClient.account!,
        message: challenge,
      })

      const verifyRes = await fetch(`${GATEWAY_URL}/api/v1/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: address,
          signature,
          timestamp: Math.floor(Date.now() / 1000),
          nonce: challenge.split(':').pop(),
          intent: 'partner',
        }),
      })
      const data = await verifyRes.json() as {
        access_token: string
        api_key: string | null
        is_new: boolean
        tenant: PartnerContext['tenant']
        error?: string
      }
      if (!verifyRes.ok) throw new Error(data.error || 'B-end sign-in failed')

      tokenRef.current = data.access_token

      const detailRes = await fetch(`${GATEWAY_URL}/api/v1/tenant/me`, {
        headers: { Authorization: `Bearer ${data.access_token}` },
      })
      const detail = await detailRes.json() as {
        plan: PartnerPlan | null
        usage_today?: { total_tokens: number; total_tool_calls: number }
      }

      setContext({
        accessToken: data.access_token,
        tenant: data.tenant,
        plan: detail.plan ?? null,
        usageToday: detail.usage_today ?? { total_tokens: 0, total_tool_calls: 0 },
        apiKey: data.api_key ?? null,
        isNew: Boolean(data.is_new),
      })
      setState({ isLoading: false, error: null })
    } catch (err) {
      setState({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Authentication failed',
      })
      setContext(null)
    }
  }, [isConnected, address, walletClient])

  useEffect(() => {
    authenticate()
  }, [authenticate])

  return { isConnected, ...state, context, authenticate }
}
