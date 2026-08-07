// ---------------------------------------------------------------------------
// AgentX — CreateTaskPanel Component
// ---------------------------------------------------------------------------
// A2A create-task form: pick agent, task type, input details, submit.
// Owns its local form state; tx submission is delegated to the parent.
// ---------------------------------------------------------------------------

'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, ArrowRight, AlertCircle, Loader2, Send, X } from 'lucide-react'
import { TASK_TYPE_PRESETS, type AgentOption } from '@/app/a2a/a2a-utils'

interface CreateTaskPanelProps {
  agents: AgentOption[]
  creating: boolean
  createTxHash: string | null
  createError: string | null
  onSubmit: (agent: AgentOption, taskType: string, inputData: string) => void
  onClose: () => void
}

export function CreateTaskPanel({ agents, creating, createTxHash, createError, onSubmit, onClose }: CreateTaskPanelProps) {
  const { t } = useTranslation()
  const [agentSearch, setAgentSearch] = useState('')
  const [selectedAgent, setSelectedAgent] = useState<AgentOption | null>(null)
  const [taskType, setTaskType] = useState('')
  const [inputData, setInputData] = useState('')

  const filteredAgents = agents.filter(a =>
    !agentSearch || a.name.toLowerCase().includes(agentSearch.toLowerCase())
  ).slice(0, 20)

  return (
    <div className="glass-card p-6 space-y-4 border border-accent-purple/10">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{t('a2a.createTaskTitle')}</h3>
        <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
      </div>

      {/* Step 1: Pick Agent */}
      <div>
        <label className="text-sm text-text-secondary mb-2 block">
          {selectedAgent ? `${t('a2a.targetAgent')}: ` : t('a2a.selectAgent')}
          {selectedAgent && <span className="text-accent-purple ml-1">{selectedAgent.name}</span>}
        </label>
        {!selectedAgent ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input value={agentSearch} onChange={e => setAgentSearch(e.target.value)}
                placeholder={t('a2a.searchAgent')}
                className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40" />
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {filteredAgents.map(a => (
                <button key={a.id} type="button" onClick={() => setSelectedAgent(a)}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors flex items-center justify-between group">
                  <div>
                    <span className="text-sm text-text-primary">{a.name}</span>
                    <span className="text-xs text-text-muted ml-2">#{a.id}</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-text-muted opacity-0 group-hover:opacity-100" />
                </button>
              ))}
              {filteredAgents.length === 0 && (
                <p className="text-xs text-text-muted text-center py-4">{t('a2a.noAgents')}</p>
              )}
            </div>
          </div>
        ) : (
          <button onClick={() => setSelectedAgent(null)} className="text-xs text-text-muted hover:text-text-secondary">
            {t('a2a.changeAgent')}
          </button>
        )}
      </div>

      {/* Step 2: Task Type */}
      {selectedAgent && (
        <div>
          <label className="text-sm text-text-secondary mb-2 block">{t('a2a.whatToDo')}</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {TASK_TYPE_PRESETS.map(p => (
              <button key={p} type="button" onClick={() => setTaskType(p)}
                className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                  taskType === p ? 'bg-accent-purple/15 text-accent-purple border-accent-purple/20' : 'bg-white/3 border-white/5 text-text-muted hover:text-text-secondary'
                }`}>{p}</button>
            ))}
          </div>
          <input value={taskType} onChange={e => setTaskType(e.target.value)}
            placeholder={t('a2a.taskTypeCustom')}
            className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40" />
        </div>
      )}

      {/* Step 3: Task Detail */}
      {selectedAgent && taskType && (
        <div>
          <label className="text-sm text-text-secondary mb-2 block">{t('a2a.taskDetailLabel')}</label>
          <p className="text-xs text-text-muted mb-2">{t('a2a.taskDetailHint')}</p>
          <textarea value={inputData} onChange={e => setInputData(e.target.value)}
            placeholder={t('a2a.taskDetailPlaceholder')} rows={4}
            className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40 resize-none" />
        </div>
      )}

      {/* Submit */}
      {selectedAgent && taskType && (
        <>
          {createTxHash && (
            <div className="p-3 rounded-lg bg-green-400/5 border border-green-400/10 text-sm text-green-400">
              {t('a2a.taskCreated')} Tx: {createTxHash.slice(0, 10)}...{createTxHash.slice(-8)}
            </div>
          )}
          {createError && (
            <div className="p-3 rounded-lg bg-red-400/5 border border-red-400/10 text-sm text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {createError}
            </div>
          )}
          <button onClick={() => onSubmit(selectedAgent, taskType, inputData)} disabled={creating || !selectedAgent || !taskType}
            className="btn-primary text-sm py-2.5 px-8 flex items-center gap-2">
            {creating ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('a2a.creating')}</> :
              <><Send className="w-4 h-4" /> {t('a2a.submitTask')}</>}
          </button>
        </>
      )}
    </div>
  )
}
