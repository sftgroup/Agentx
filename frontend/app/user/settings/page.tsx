// app/user/settings/page.tsx — API Settings (Glassmorphism Dark)
'use client'

import { useState, useEffect } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Settings, Plus, Trash2, Edit, Check, X, Zap } from 'lucide-react'

interface AIConfig { id: string; name: string; provider: string; endpoint: string; apiKey: string; model: string; temperature: number; maxTokens: number; isActive: boolean }

const DEFAULT_CONFIGS: Record<string, { endpoint: string; models: string[]; displayName: string }> = {
  openai: { endpoint: 'https://api.openai.com/v1/chat/completions', models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'], displayName: 'OpenAI' },
  deepseek: { endpoint: 'https://api.deepseek.com/v1/chat/completions', models: ['deepseek-chat', 'deepseek-v4-pro'], displayName: 'DeepSeek' },
}

export default function SettingsPage() {
  const [configs, setConfigs] = useState<AIConfig[]>([])
  const [editing, setEditing] = useState<AIConfig | null>(null)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => { const saved = localStorage.getItem('aiConfigs'); if (saved) setConfigs(JSON.parse(saved)) }, [])

  const save = (cfg: AIConfig) => {
    const next = editing ? configs.map(c => c.id === cfg.id ? cfg : c) : [...configs, { ...cfg, id: Date.now().toString() }]
    setConfigs(next); localStorage.setItem('aiConfigs', JSON.stringify(next)); setShowForm(false); setEditing(null)
  }

  const remove = (id: string) => { const next = configs.filter(c => c.id !== id); setConfigs(next); localStorage.setItem('aiConfigs', JSON.stringify(next)) }
  const setActive = (id: string) => {
    const next = configs.map(c => ({ ...c, isActive: c.id === id })); setConfigs(next); localStorage.setItem('aiConfigs', JSON.stringify(next))
  }

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto py-8 px-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="heading-md flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-accent-purple/10 flex items-center justify-center"><Settings className="w-5 h-5 text-accent-purple" /></div>API Settings</h1>
            <p className="body text-text-secondary mt-1">Configure LLM API keys for Agent chatting</p>
          </div>
          <button onClick={() => { setEditing(null); setShowForm(true) }} className="btn-primary text-sm py-2"><Plus className="w-4 h-4" /> Add Config</button>
        </div>

        {showForm && <ConfigForm editing={editing} onSave={save} onCancel={() => { setShowForm(false); setEditing(null) }} />}

        {configs.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <Zap className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-30" />
            <p className="text-text-secondary mb-4">No API configs yet. Add one to start chatting with Agents.</p>
            <button onClick={() => { setEditing(null); setShowForm(true) }} className="btn-primary text-sm"><Plus className="w-4 h-4" /> Add Config</button>
          </div>
        ) : (
          <div className="space-y-3">
            {configs.map(cfg => (
              <div key={cfg.id} className={`glass-card glass-card-hover p-5 ${cfg.isActive ? 'ring-1 ring-accent-purple/30' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-accent-purple/10 flex items-center justify-center"><Zap className="w-5 h-5 text-accent-purple" /></div>
                    <div>
                      <div className="font-semibold text-sm">{cfg.name} <span className="text-xs text-text-muted ml-1">({cfg.provider})</span></div>
                      <div className="text-xs text-text-muted">{cfg.model} · {cfg.endpoint.replace(/^https?:\/\//, '').replace(/\/v1\/.*/, '')}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {cfg.isActive ? <span className="text-xs px-2 py-0.5 rounded-full bg-green-400/10 text-green-400">Active</span> : <button onClick={() => setActive(cfg.id)} className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-text-muted hover:text-accent-purple transition-colors">Activate</button>}
                    <button onClick={() => { setEditing(cfg); setShowForm(true) }} className="text-text-muted hover:text-text-secondary transition-colors"><Edit className="w-4 h-4" /></button>
                    <button onClick={() => remove(cfg.id)} className="text-text-muted hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}

function ConfigForm({ editing, onSave, onCancel }: { editing: AIConfig | null; onSave: (c: AIConfig) => void; onCancel: () => void }) {
  const [provider, setProvider] = useState(editing?.provider || 'openai')
  const [name, setName] = useState(editing?.name || '')
  const [apiKey, setApiKey] = useState(editing?.apiKey || '')
  const [model, setModel] = useState(editing?.model || DEFAULT_CONFIGS.openai.models[0])
  const [endpoint, setEndpoint] = useState(editing?.endpoint || DEFAULT_CONFIGS.openai.endpoint)

  useEffect(() => {
    if (!editing) { const def = DEFAULT_CONFIGS[provider]; if (def) { setEndpoint(def.endpoint); setModel(def.models[0]) } }
  }, [provider, editing])

  const handleSave = () => {
    if (!name.trim() || !apiKey.trim()) return
    onSave({ id: editing?.id || '', name, provider, endpoint, apiKey, model, temperature: 0.7, maxTokens: 2048, isActive: editing?.isActive || false })
  }

  return (
    <div className="glass-card p-6 space-y-4">
      <h2 className="text-lg font-semibold">{editing ? 'Edit Config' : 'New Config'}</h2>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="text-sm text-text-secondary mb-1.5 block">Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="My OpenAI Key" className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40 transition-colors" />
        </div>
        <div>
          <label className="text-sm text-text-secondary mb-1.5 block">Provider</label>
          <select value={provider} onChange={e => setProvider(e.target.value)} className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40 transition-colors">
            {Object.entries(DEFAULT_CONFIGS).map(([k, v]) => <option key={k} value={k}>{v.displayName}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm text-text-secondary mb-1.5 block">Model</label>
          <select value={model} onChange={e => setModel(e.target.value)} className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40 transition-colors">
            {(DEFAULT_CONFIGS[provider]?.models || []).map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm text-text-secondary mb-1.5 block">Endpoint</label>
          <input value={endpoint} onChange={e => setEndpoint(e.target.value)} className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40 transition-colors font-mono" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm text-text-secondary mb-1.5 block">API Key</label>
          <input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password" placeholder="sk-..." className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40 transition-colors font-mono" />
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <button onClick={handleSave} className="btn-primary text-sm px-6 py-2"><Check className="w-4 h-4" /> Save</button>
        <button onClick={onCancel} className="btn-secondary text-sm px-6 py-2"><X className="w-4 h-4" /> Cancel</button>
      </div>
    </div>
  )
}
