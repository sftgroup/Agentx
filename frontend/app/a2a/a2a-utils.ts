// ---------------------------------------------------------------------------
// AgentX — A2A page shared types, constants & helpers
// ---------------------------------------------------------------------------
// Extracted from app/a2a/page.tsx (R7 split).
// ---------------------------------------------------------------------------

import { createPublicClient, http } from 'viem'
import type { TFunction } from 'i18next'
import { GATEWAY_URL } from '@/lib/gateway'

export { GATEWAY_URL }

export const oxaChain = { id: 19505, name: 'OxaChain L1', nativeCurrency: { name: 'OXA', symbol: 'OXA', decimals: 18 }, rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_OXACHAIN_RPC_URL || 'https://rpc-oxa.0xainet.top'] } } }
export const A2A_REGISTRY = (process.env.NEXT_PUBLIC_A2A_PROTOCOL_ADDRESS || '0x7F42a7dC4A0F3C107664C3750bE1B5B6fa6BEb86') as `0x${string}`

export const publicClient = createPublicClient({ chain: oxaChain, transport: http() })

export const TASK_TYPE_PRESETS = ['Audit', 'Analyze', 'Summarize', 'Research', 'Translate', 'Generate Report']

export interface A2ATaskDisplay {
  taskId: number; agentId: number; taskType: string
  inputData: string; outputData: string; status: number
  clientAddress: string; createdAt: number; completedAt: number
}

export interface GatewayTaskStatus {
  status: number  // 0=pending, 1=processing, 2=completed, 3=failed, 4=awaiting_payment
  output_data?: string
  llm_model?: string
  processed_at?: string
  // awaiting_payment (status=4) 时由 gateway 写入的付款信息
  payment_payer?: string
  payment_amount_wei?: string
  payment_pay_to?: string
  payment_target_agent_id?: number
  payment_ref?: string
}

export interface AgentOption { id: number; name: string; description: string; owner?: string }

export type TaskFilter = 'all' | 'active' | 'completed'

export function friendlyError(e: unknown, t: TFunction): string {
  const err = e as { message?: unknown; toString?: () => string } | null | undefined
  const msg = typeof err?.message === 'string' ? err.message : String(err?.toString?.() ?? err ?? '')
  if (msg.includes('User rejected') || msg.includes('denied')) return t('a2a.userRejected')
  if (msg.includes('insufficient funds')) return t('a2a.insufficientFunds')
  return msg.length > 120 ? msg.slice(0, 120) + '...' : msg
}
