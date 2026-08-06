// ---------------------------------------------------------------------------
// AgentX — CompleteTaskModal Component
// ---------------------------------------------------------------------------
// Modal to complete an A2A task with output data and final status.
// Owns its local form state; the tx submission is delegated to the parent.
// ---------------------------------------------------------------------------

'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Brain, Loader2, Check, AlertCircle } from 'lucide-react'
import type { GatewayTaskStatus } from '@/app/a2a/a2a-utils'

interface CompleteTaskModalProps {
  taskId: number
  initialOutput: string
  llmModel?: string
  error: string | null
  onSubmit: (output: string, status: string) => Promise<void>
  onClose: () => void
}

export function CompleteTaskModal({ taskId, initialOutput, llmModel, error, onSubmit, onClose }: CompleteTaskModalProps) {
  const { t } = useTranslation()
  const [output, setOutput] = useState(initialOutput)
  const [status, setStatus] = useState('3')
  const [completing, setCompleting] = useState(false)

  const handleSubmit = async () => {
    setCompleting(true)
    try {
      await onSubmit(output, status)
    } catch { /* error is surfaced via the error prop */ } finally {
      setCompleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="glass-card p-6 w-full max-w-md mx-4 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold">{t('a2a.completeTaskTitle')} #{taskId}</h3>
        <div>
          <label className="text-sm text-text-secondary mb-1 block">{t('a2a.outputDataLabel')}</label>
          <textarea value={output} onChange={e => setOutput(e.target.value)}
            placeholder={t('a2a.outputDataPlaceholder')} rows={3}
            className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40 resize-none" />
          {output && llmModel && (
            <p className="text-xs text-accent-cyan mt-1 flex items-center gap-1">
              <Brain className="w-3 h-3" /> {t('a2a.gatewayGenerated', { model: llmModel })}
            </p>
          )}
        </div>
        <div>
          <label className="text-sm text-text-secondary mb-1 block">{t('a2a.statusLabel')}</label>
          <div className="flex gap-2">
            {[{ v: '3', l: t('a2a.statusCompleted') }, { v: '4', l: t('a2a.statusFailed') }].map(o => (
              <button key={o.v} type="button" onClick={() => setStatus(o.v)}
                className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                  status === o.v ? 'bg-accent-purple/15 text-accent-purple border-accent-purple/20' : 'bg-white/3 border-white/5 text-text-muted hover:text-text-secondary'
                }`}>{o.l}</button>
            ))}
          </div>
        </div>
        {error && (
          <div className="p-2 rounded-lg bg-red-400/5 text-xs text-red-400 flex items-center gap-2">
            <AlertCircle className="w-3 h-3" /> {error}
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary text-sm py-2 flex-1">{t('studio.back')}</button>
          <button onClick={handleSubmit} disabled={completing}
            className="btn-primary text-sm py-2 flex-1 flex items-center justify-center gap-2">
            {completing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{t('a2a.submitComplete')}
          </button>
        </div>
      </div>
    </div>
  )
}
