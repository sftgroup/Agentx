// Platform Keys Tab (split from app/admin/page.tsx, R7)
'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Loader2, Edit } from 'lucide-react'
import { GATEWAY } from './shared'

export default function PlatformKeysTab({ headers }: { headers: Record<string, string> }) {
  const [keys, setKeys] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [form, setForm] = useState({ provider: 'deepseek', endpoint: 'https://api.deepseek.com/v1', api_key: '', models: '', plan_slugs: 'pro,enterprise', weight: '1', is_active: true })

  const fetchKeys = async () => {
    setLoading(true)
    try {
      const r = await fetch(`${GATEWAY}/api/v1/admin/platform-keys`, { headers })
      const d = await r.json()
      setKeys(d.keys || [])
    } catch (e) { /* */ }
    finally { setLoading(false) }
  }
  useEffect(() => { fetchKeys() }, [])

  const submit = async (payload: any, method: 'POST' | 'PATCH', id?: string) => {
    setAdding(true)
    try {
      const url = `${GATEWAY}/api/v1/admin/platform-keys${id ? `/${id}` : ''}`
      const r = await fetch(url, { method, headers, body: JSON.stringify(payload) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Request failed')
      setForm({ provider: 'deepseek', endpoint: 'https://api.deepseek.com/v1', api_key: '', models: '', plan_slugs: 'pro,enterprise', weight: '1', is_active: true })
      setEditing(null)
      fetchKeys()
    } catch (e: any) {
      alert(e.message)
    }
    finally { setAdding(false) }
  }

  const addKey = async () => {
    if (!form.api_key) return
    await submit({
      provider: form.provider, endpoint: form.endpoint, api_key: form.api_key,
      models: form.models.split(',').map(s => s.trim()).filter(Boolean),
      plan_slugs: form.plan_slugs.split(',').map(s => s.trim()).filter(Boolean),
      weight: Number(form.weight) || 1,
    }, 'POST')
  }

  const updateKey = async () => {
    await submit({
      provider: form.provider,
      endpoint: form.endpoint,
      models: form.models.split(',').map(s => s.trim()).filter(Boolean),
      plan_slugs: form.plan_slugs.split(',').map(s => s.trim()).filter(Boolean),
      weight: Number(form.weight) || 1,
      is_active: form.is_active,
      ...(form.api_key ? { api_key: form.api_key } : {}),
    }, 'PATCH', editing.id)
  }

  const toggleActive = async (k: any) => {
    await fetch(`${GATEWAY}/api/v1/admin/platform-keys/${k.id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ is_active: !k.is_active })
    })
    fetchKeys()
  }

  const deleteKey = async (id: string) => {
    await fetch(`${GATEWAY}/api/v1/admin/platform-keys/${id}`, { method: 'DELETE', headers })
    fetchKeys()
  }

  const startEdit = (k: any) => {
    setEditing(k)
    setForm({
      provider: k.provider, endpoint: k.endpoint, api_key: '',
      models: (k.models || []).join(','),
      plan_slugs: (k.plan_slugs || []).join(','),
      weight: String(k.weight ?? 1),
      is_active: !!k.is_active,
    })
  }

  return (
    <div className="space-y-4">
      {/* Add / Edit form */}
      <div className="glass-card p-5 space-y-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Plus className="w-4 h-4 text-green-400" /> {editing ? `Edit Key (${editing.provider})` : 'Add Platform Key'}
        </h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <input placeholder="Provider" value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })}
            className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40" />
          <input placeholder="Endpoint URL" value={form.endpoint} onChange={e => setForm({ ...form, endpoint: e.target.value })}
            className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40" />
          <input placeholder="API Key (blank to keep current)" type="password" value={form.api_key} onChange={e => setForm({ ...form, api_key: e.target.value })}
            className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40" />
          <input placeholder="Models (comma-separated)" value={form.models} onChange={e => setForm({ ...form, models: e.target.value })}
            className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40" />
        </div>
        <div className="flex gap-3">
          <input placeholder="Plan slugs (comma)" value={form.plan_slugs} onChange={e => setForm({ ...form, plan_slugs: e.target.value })}
            className="flex-1 px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40" />
          <input placeholder="Weight" type="number" min={1} value={form.weight} onChange={e => setForm({ ...form, weight: e.target.value })}
            className="w-20 px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40" />
          {editing && (
            <button onClick={() => setForm({ ...form, is_active: !form.is_active })}
              className={`px-3 py-2 rounded-lg text-xs whitespace-nowrap ${form.is_active ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'}`}>
              {form.is_active ? 'Active' : 'Inactive'}
            </button>
          )}
          <button onClick={editing ? updateKey : addKey} disabled={adding || (!editing && !form.api_key)} className="btn-primary text-sm px-4 py-2 disabled:opacity-30">
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? 'Save' : 'Add'}
          </button>
          {editing && <button onClick={() => setEditing(null)} className="btn-secondary text-sm px-4 py-2">Cancel</button>}
        </div>
      </div>

      {/* Keys list */}
      {loading ? (
        <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-text-muted" /></div>
      ) : (
        <div className="space-y-2">
          {keys.map((k: any) => (
            <div key={k.id} className="glass-card p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{k.provider}</span>
                  <span className="text-xs text-text-muted">weight {k.weight ?? 1}</span>
                  <button onClick={() => toggleActive(k)} title={k.is_active ? 'Click to deactivate' : 'Click to activate'}>
                    <span className={`w-2 h-2 rounded-full ${k.is_active ? 'bg-green-400' : 'bg-red-400'}`} />
                  </button>
                </div>
                <div className="text-xs text-text-muted mt-1">{k.endpoint}</div>
                <div className="flex gap-1 mt-1">
                  {(k.models || []).map((m: string) => <span key={m} className="text-xs px-1.5 py-0.5 rounded bg-white/5">{m}</span>)}
                  {(k.plan_slugs || []).map((s: string) => <span key={s} className="text-xs px-1.5 py-0.5 rounded bg-accent-purple/10 text-accent-purple">{s}</span>)}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => startEdit(k)} className="text-text-muted hover:text-text-secondary transition-colors">
                  <Edit className="w-4 h-4" />
                </button>
                <button onClick={() => deleteKey(k.id)} className="text-red-400/60 hover:text-red-400 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
