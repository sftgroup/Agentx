// ---------------------------------------------------------------------------
// AgentX — Chat page shared types & utils
// ---------------------------------------------------------------------------
// Extracted from app/user/chat/[agentId]/page.tsx (R7 split).
// ---------------------------------------------------------------------------

export interface ModelOption {
  id: string
  provider: string
  model: string
  label?: string
  source: 'platform' | 'tenant_owned'
  tenantKeyId?: string
}

export const HISTORY_KEY_PREFIX = 'agentx-chat-history-'

// Read the active LLM key stored locally by the settings page (stateless BYOK fallback).
export function llmApiKeyFromLocalStorage(): string | undefined {
  try {
    const configs = JSON.parse(localStorage.getItem('aiConfigs') || '[]') as { apiKey: string; isActive: boolean }[]
    const active = configs.find(c => c.isActive) || configs[0]
    return active?.apiKey || undefined
  } catch {
    return undefined
  }
}
