// ---------------------------------------------------------------------------
// AgentX — useGatewayAuth Hook
// ---------------------------------------------------------------------------
// EIP-191 wallet auth → Gateway JWT.
// Auto-requests challenge, signs, fetches token, handles renewal.
// ---------------------------------------------------------------------------

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useWalletClient, useAccount } from 'wagmi'

interface GatewayAuthState {
  accessToken: string | null
  isLoading: boolean
  error: string | null
  isAuthenticated: boolean
}

interface TenantInfo {
  id: string
  wallet_address: string
  status: string
}

interface PlanInfo {
  name: string
  slug: string
  quota_daily: number
  quota_used: number
  platform_models: { provider: string; model: string }[]
  byok_enabled: boolean
  rate_limit_rpm: number
  max_concurrent: number
}

interface OwnKeyInfo {
  id: string
  provider: string
  model: string
  label: string | null
  endpoint?: string | null
  is_active: boolean
  last_validated?: string | null
}

export interface GatewayContext {
  accessToken: string
  tenant: TenantInfo
  plan: PlanInfo | null
  ownKeys: OwnKeyInfo[]
  usageToday: {
    total_tokens: number
    total_tool_calls: number
  }
}

export function useGatewayAuth(gatewayUrl?: string, opts?: { lazy?: boolean }) {
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const [state, setState] = useState<GatewayAuthState>({
    accessToken: null,
    isLoading: false,
    error: null,
    isAuthenticated: false,
  })
  const [context, setContext] = useState<GatewayContext | null>(null)
  const tokenRef = useRef<string | null>(null)
  const expiringRef = useRef(false)
  const authInFlightRef = useRef(false)

  const authenticate = useCallback(async () => {
    if (!gatewayUrl || !isConnected || !address || !walletClient) {
      setState({ accessToken: null, isLoading: false, error: null, isAuthenticated: false })
      setContext(null)
      return
    }

    // Coalesce concurrent authenticate() runs. isConnected/address/walletClient settle in
    // rapid succession after connect, so the mount effect can invoke authenticate twice in
    // flight. Each call fetches its own challenge; the second overwrites the first's nonce
    // on the gateway, so the first verify returns 401 and whichever call resolves last wins
    // the state — leaving isAuthenticated=false even though a later verify succeeded.
    // Only the first in-flight attempt runs; later calls during that window are no-ops.
    if (authInFlightRef.current) return
    authInFlightRef.current = true

    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      const challengeRes = await fetch(`${gatewayUrl}/api/v1/auth/challenge?address=${address}`)
      const { challenge, timestamp } = await challengeRes.json() as { challenge: string; timestamp: number }

      const signature = await walletClient.signMessage({
        account: walletClient.account!,
        message: challenge,
      })

      const verifyRes = await fetch(`${gatewayUrl}/api/v1/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: address,
          signature,
          timestamp,
          nonce: challenge.split(':').pop(),
        }),
      })
      const data = await verifyRes.json() as {
        access_token: string
        expires_in: number
        tenant: TenantInfo
      }

      if (!verifyRes.ok) throw new Error((data as unknown as { error: string }).error)

      tokenRef.current = data.access_token

      const detailRes = await fetch(`${gatewayUrl}/api/v1/tenant/me`, {
        headers: { Authorization: `Bearer ${data.access_token}` },
      })
      const detail = await detailRes.json() as {
        plan: PlanInfo | null
        own_keys: OwnKeyInfo[]
        usage_today: { total_tokens: number; total_tool_calls: number }
      }

      setContext({
        accessToken: data.access_token,
        tenant: data.tenant,
        plan: detail.plan,
        ownKeys: detail.own_keys || [],
        usageToday: detail.usage_today || { total_tokens: 0, total_tool_calls: 0 },
      })
      setState({ accessToken: data.access_token, isLoading: false, error: null, isAuthenticated: true })
    } catch (err) {
      setState({
        accessToken: null,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Authentication failed',
        isAuthenticated: false,
      })
      setContext(null)
    } finally {
      authInFlightRef.current = false
    }
  }, [gatewayUrl, isConnected, address, walletClient])

  useEffect(() => {
    if (!opts?.lazy) authenticate()
  }, [authenticate, opts?.lazy])

  const refreshContext = useCallback(async () => {
    if (!tokenRef.current || !gatewayUrl) return
    try {
      const detailRes = await fetch(`${gatewayUrl}/api/v1/tenant/me`, {
        headers: { Authorization: `Bearer ${tokenRef.current}` },
      })
      if (detailRes.ok) {
        const detail = await detailRes.json() as {
          plan: PlanInfo | null
          own_keys: OwnKeyInfo[]
          usage_today: { total_tokens: number; total_tool_calls: number }
        }
        setContext(prev => prev ? { ...prev, plan: detail.plan, ownKeys: detail.own_keys, usageToday: detail.usage_today } : prev)
      } else if (detailRes.status === 401 && !expiringRef.current) {
        expiringRef.current = true
        authenticate()
        expiringRef.current = false
      }
    } catch { /* ignore */ }
  }, [gatewayUrl, authenticate])

  return { ...state, context, authenticate, refreshContext }
}
