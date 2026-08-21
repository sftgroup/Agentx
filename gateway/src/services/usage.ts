// ---------------------------------------------------------------------------
// AgentX Gateway — Usage Logging Service
// ---------------------------------------------------------------------------
// Single source of truth for usage_logs inserts. Previously the same
// fire-and-forget INSERT was copy-pasted in chat.ts / chat-tasks.ts /
// agent-runs.ts / internal-task-billing.ts. Usage logging is non-critical and
// must never block callers (always fire-and-forget).
// ---------------------------------------------------------------------------

import { getPool } from '../lib/db'

export interface RecordUsageParams {
  tenantId: string
  keySource: string
  model?: string
  tokensPrompt?: number
  tokensCompletion?: number
  tokensTotal?: number
  toolCalls?: number
  agentId?: string | number | null
  platformKeyId?: string | null
  tenantKeyId?: string | null
}

/**
 * Fire-and-forget usage_logs insert. Never throws: failures are swallowed so
 * metering never blocks an (already-ended) SSE response.
 */
export function recordUsage(p: RecordUsageParams): void {
  getPool()
    .query(
      `INSERT INTO usage_logs (tenant_id, key_source, platform_key_id, tenant_key_id, provider, model, tokens_prompt, tokens_completion, tokens_total, tool_calls, agent_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        p.tenantId,
        p.keySource,
        p.platformKeyId ?? null,
        p.tenantKeyId ?? null,
        p.keySource === 'platform' ? 'openai' : 'unknown',
        p.model ?? 'unknown',
        p.tokensPrompt ?? 0,
        p.tokensCompletion ?? 0,
        p.tokensTotal ?? 0,
        p.toolCalls ?? 0,
        p.agentId ?? null,
      ]
    )
    .catch(() => { /* usage logging is non-critical */ })
}
