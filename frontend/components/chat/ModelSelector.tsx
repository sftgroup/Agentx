// ---------------------------------------------------------------------------
// AgentX — ModelSelector Component
// ---------------------------------------------------------------------------
// Dropdown to pick the chat model from platform models and tenant-owned keys.
// Presentational: selection state lives in the parent.
// ---------------------------------------------------------------------------

'use client'

import { Brain } from 'lucide-react'
import type { ModelOption } from '@/app/user/chat/[agentId]/chat-utils'

interface ModelSelectorProps {
  options: ModelOption[]
  selected: ModelOption | null
  open: boolean
  onToggle: () => void
  onSelect: (option: ModelOption) => void
}

export function ModelSelector({ options, selected, open, onToggle, onSelect }: ModelSelectorProps) {
  if (options.length === 0) return null

  const selectedLabel = selected ? (selected.label || selected.model) : 'Select model'
  const platformOptions = options.filter(m => m.source === 'platform')
  const ownOptions = options.filter(m => m.source === 'tenant_owned')

  return (
    <div className="relative">
      <button onClick={onToggle}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/5 text-sm text-text-secondary hover:text-text-primary transition-colors max-w-[200px]">
        <Brain className="w-4 h-4 flex-shrink-0" />
        <span className="truncate">{selectedLabel}</span>
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-2 glass-card p-2 w-72 z-50 max-h-80 overflow-y-auto">
          {platformOptions.length > 0 && (
            <>
              <div className="text-xs font-medium text-text-muted px-2 py-1">Platform Models</div>
              {platformOptions.map(m => (
                <button key={m.id} onClick={() => onSelect(m)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/5 transition-colors ${selected?.id === m.id ? 'bg-accent-purple/10 text-accent-purple' : ''}`}>
                  <div className="font-medium">{m.model}</div>
                  <div className="text-xs text-text-muted">{m.provider}</div>
                </button>
              ))}
              {ownOptions.length > 0 && (
                <div className="border-t border-white/5 my-1" />
              )}
            </>
          )}
          {ownOptions.map(m => (
            <button key={m.id} onClick={() => onSelect(m)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/5 transition-colors ${selected?.id === m.id ? 'bg-accent-purple/10 text-accent-purple' : ''}`}>
              <div className="font-medium">{m.label || m.model}</div>
              <div className="text-xs text-text-muted">{m.provider} · 🔑 Own Key</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
