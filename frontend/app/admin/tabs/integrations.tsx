// Integration Partners Tab (R11: multi-caller access config) — split from app/admin/page.tsx, R7
'use client'

import { useState, useEffect } from 'react'
import { Link2, Edit, Plus, Loader2, Key, Check, Copy, Trash2, RotateCcw } from 'lucide-react'
import { GATEWAY } from './shared'

export default function IntegrationsTab({ headers }: { headers: Record<string, string> }) {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ slug: '', name: '', gateway_url: '', plan_slug: 'enterprise', notes: '' })
  const [editing, setEditing] = useState<any | null>(null)
  const [revealedKey, setRevealedKey] = useState<{ slug: string; key: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const fetchItems = async () => {
    setLoading(true)
    try {
      const r = await fetch(`${GATEWAY}/api/v1/admin/integrations`, { headers })
      const d = await r.json()
      setItems(d.integrations || [])
    } catch (e) { /* */ }
    finally { setLoading(false) }
  }
  useEffect(() => { fetchItems() }, [])

  const submit = async (method: 'POST' | 'PATCH', id?: string) => {
    setBusy(true)
    try {
      const payload = {
        slug: form.slug.trim().toLowerCase(),
        name: form.name.trim(),
        gateway_url: form.gateway_url.trim(),
        plan_slug: form.plan_slug,
        notes: form.notes.trim() || undefined,
      }
      const url = `${GATEWAY}/api/v1/admin/integrations${id ? `/${id}` : ''}`
      const r = await fetch(url, { method, headers, body: JSON.stringify(payload) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Request failed')
      if (d.api_key) setRevealedKey({ slug: d.integration?.slug || form.slug, key: d.api_key })
      setForm({ slug: '', name: '', gateway_url: '', plan_slug: 'enterprise', notes: '' })
      setEditing(null)
      fetchItems()
    } catch (e: any) { alert(e.message) }
    finally { setBusy(false) }
  }

  const rotateKey = async (it: any) => {
    if (!confirm(`Rotate api key for "${it.name}"? The old key stops working immediately.`)) return
    setBusy(true)
    try {
      const r = await fetch(`${GATEWAY}/api/v1/admin/integrations/${it.id}/rotate-key`, {
        method: 'POST', headers,
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Rotate failed')
      setRevealedKey({ slug: it.slug, key: d.api_key })
      fetchItems()
    } catch (e: any) { alert(e.message) }
    finally { setBusy(false) }
  }

  const remove = async (it: any) => {
    if (!confirm(`Delete integration "${it.name}"? Its tenant is retained for audit.`)) return
    try {
      const r = await fetch(`${GATEWAY}/api/v1/admin/integrations/${it.id}`, { method: 'DELETE', headers })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Delete failed')
      fetchItems()
    } catch (e: any) { alert(e.message) }
  }

  const startEdit = (it: any) => {
    setEditing(it)
    setForm({
      slug: it.slug, name: it.name, gateway_url: it.gateway_url || '',
      plan_slug: it.plan_slug || 'enterprise', notes: it.notes || '',
    })
    setRevealedKey(null)
  }

  const copyKey = async (k: string) => {
    try {
      await navigator.clipboard.writeText(k)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* */ }
  }

  return (
    <div className="space-y-4">
      {/* Create / Edit form */}
      <div className="glass-card p-5 space-y-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Link2 className="w-4 h-4 text-accent-cyan" />
          {editing ? `Edit Integration (${editing.slug})` : 'Add Integration Caller'}
        </h3>
        <div className="grid sm:grid-cols-3 gap-3">
          <input placeholder="slug (e.g. aitrader)" value={form.slug} disabled={!!editing} onChange={e => setForm({ ...form, slug: e.target.value })}
            className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40 disabled:opacity-40 font-mono" />
          <input placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40" />
          <input placeholder="Gateway URL (caller's view)" value={form.gateway_url} onChange={e => setForm({ ...form, gateway_url: e.target.value })}
            className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40 font-mono" />
          <select value={form.plan_slug} onChange={e => setForm({ ...form, plan_slug: e.target.value })}
            className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40">
            <option value="free">Free</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>
          <input placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
            className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40" />
          <div className="flex items-center gap-2">
            <button onClick={() => submit(editing ? 'PATCH' : 'POST', editing?.id)} disabled={busy || !form.slug.trim() || !form.name.trim() || !form.gateway_url.trim()}
              className="btn-primary text-sm px-4 py-2 disabled:opacity-30 flex items-center gap-1.5">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? <Edit className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {editing ? 'Save' : 'Create (auto-issues key)'}
            </button>
            {editing && <button onClick={() => { setEditing(null); setForm({ slug: '', name: '', gateway_url: '', plan_slug: 'enterprise', notes: '' }) }} className="btn-secondary text-sm px-4 py-2">Cancel</button>}
          </div>
        </div>
      </div>

      {/* Revealed key — shown exactly once after create / rotate */}
      {revealedKey && (
        <div className="glass-card p-5 border border-amber-400/30">
          <h3 className="font-semibold text-sm text-amber-300 flex items-center gap-2">
            <Key className="w-4 h-4" /> API Key for "{revealedKey.slug}" — copy it now, it won't be shown again
          </h3>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-white/10 font-mono text-sm break-all">{revealedKey.key}</code>
            <button onClick={() => copyKey(revealedKey.key)} className="btn-secondary text-xs px-3 py-2 flex items-center gap-1.5">
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-[11px] text-text-muted mt-2">Set this as <span className="font-mono text-text-secondary">AGENTX_CONVERSATION_API_KEY</span> in the caller's environment (with <span className="font-mono text-text-secondary">{form.gateway_url || 'gateway_url'}</span> as <span className="font-mono text-text-secondary">AGENTX_GATEWAY_URL</span>).</p>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-text-muted" /></div>
      ) : items.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-text-muted">No integration partners configured yet.</div>
      ) : (
        <div className="space-y-2">
          {items.map((it: any) => (
            <div key={it.id} className="glass-card p-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{it.name}</span>
                    <span className="text-xs font-mono text-text-muted">{it.slug}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${it.active ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'}`}>{it.active ? 'active' : 'inactive'}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-accent-purple/10 text-accent-purple">{it.plan_slug || '—'}</span>
                  </div>
                  <div className="text-xs text-text-muted mt-1 font-mono break-all">{it.gateway_url}</div>
                  <div className="flex gap-3 mt-1 text-[11px] text-text-muted">
                    <span className="font-mono">tenant {it.wallet_address}</span>
                    <span>{it.has_api_key ? 'api key issued' : 'no api key'}</span>
                    <span>tenant {it.tenant_status}</span>
                    {it.notes && <span className="text-text-secondary">{it.notes}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button onClick={() => rotateKey(it)} disabled={busy} title="Rotate api key (new key shown once)"
                    className="text-amber-400/70 hover:text-amber-400 transition-colors disabled:opacity-30">
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button onClick={() => startEdit(it)} disabled={busy} className="text-text-muted hover:text-text-secondary transition-colors">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button onClick={() => remove(it)} disabled={busy} className="text-red-400/60 hover:text-red-400 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
