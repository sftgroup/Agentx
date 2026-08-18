// ---------------------------------------------------------------------------
// AgentX — Auto-Renew (ERC-4337) Gateway client
// ---------------------------------------------------------------------------
// Wraps the /api/v1/billing/auto-renew* endpoints. Auto-renew enables a smart
// account (Kernel v3) with a session key so the Gateway can renew a chain
// subscription on the user's behalf: sign once (enable UserOp), pay many times.
// ---------------------------------------------------------------------------
'use client'

import { gatewayFetch } from '@/lib/gateway'

export interface AutoRenewRow {
  agent_id: number
  plan_id: number
  account_address: string | null
  current_subscription_id: number | null
  session_id: string | null
  session_signer: string | null
  renew_status: 'enabled' | 'pending' | 'disabled' | 'paused' | string
  renew_count: number
  renew_fail_count: number
  paused_reason: string | null
  paused_at: string | null
  last_renew_at: string | null
  last_renew_tx: string | null
  last_renew_err: string | null
  created_at: string | null
  updated_at: string | null
  sub_status: number | null
  sub_started_at: string | null
  sub_expires_at: string | null
  amount_wei: string | null
  plan_price: string | null
  plan_period: number | null
  funding: { nativeWei: string; epDepositWei: string; escrowWei: string } | null
}

export interface EnableAutoRenewResult {
  accountAddress: string
  accountDeployed: boolean
  sessionId: string
  sessionSigner: string
  /** EIP-712 enable digest — sign with raw eth_sign (not personal_sign) */
  digest: string
  validUntil: string
}

export interface ConfirmAutoRenewResult {
  userOpHash: string
  txHash: string | null
  receiptSuccess: boolean
}

const AUTH_HEADERS = (accessToken: string): HeadersInit => ({
  Authorization: `Bearer ${accessToken}`,
})

async function parseError(res: Response): Promise<Error> {
  try {
    const body = await res.json()
    return new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
  } catch {
    return new Error(`HTTP ${res.status}`)
  }
}

/** GET /api/v1/billing/auto-renew — my auto-renew registrations (+ smart-account funding) */
export async function listAutoRenew(accessToken: string): Promise<AutoRenewRow[]> {
  const res = await gatewayFetch('/api/v1/billing/auto-renew', { headers: AUTH_HEADERS(accessToken) })
  if (!res.ok) throw await parseError(res)
  const data = (await res.json()) as { rows?: AutoRenewRow[] }
  return data.rows ?? []
}

/** POST /api/v1/billing/auto-renew/enable — create session + deploy account → returns enable digest */
export async function enableAutoRenew(
  accessToken: string,
  body: { agentId: number; planId: number; subscriptionId: number; planPriceWei: string },
): Promise<EnableAutoRenewResult> {
  const res = await gatewayFetch('/api/v1/billing/auto-renew/enable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS(accessToken) },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await parseError(res)
  return (await res.json()) as EnableAutoRenewResult
}

/** POST /api/v1/billing/auto-renew/confirm — submit the eth_sign(enable digest) signature */
export async function confirmAutoRenew(
  accessToken: string,
  body: { agentId: number; planId: number; ownerSignature: string },
): Promise<ConfirmAutoRenewResult> {
  const res = await gatewayFetch('/api/v1/billing/auto-renew/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS(accessToken) },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await parseError(res)
  return (await res.json()) as ConfirmAutoRenewResult
}

/** POST /api/v1/billing/auto-renew/resume — resume a paused auto-renew after topping up */
export async function resumeAutoRenew(
  accessToken: string,
  body: { agentId: number; planId: number },
): Promise<{ ok: boolean }> {
  const res = await gatewayFetch('/api/v1/billing/auto-renew/resume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS(accessToken) },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await parseError(res)
  return (await res.json()) as { ok: boolean }
}

/** POST /api/v1/billing/auto-renew/disable — stop future renewals */
export async function disableAutoRenew(
  accessToken: string,
  body: { agentId: number; planId: number },
): Promise<{ disableCallData?: string }> {
  const res = await gatewayFetch('/api/v1/billing/auto-renew/disable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS(accessToken) },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await parseError(res)
  return (await res.json()) as { disableCallData?: string }
}
