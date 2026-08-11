// Plans Tab (split from app/admin/page.tsx, R7)
// R19.6 (G6): in-place quota editing — quota_daily / quota_monthly / RPM /
// concurrent / price — persists immediately via PATCH /admin/plans/:id.
'use client'

import { useState, useEffect } from 'react'
import { Loader2, Check, X, Pencil, Save, XCircle } from 'lucide-react'
import { GATEWAY } from './shared'

interface PlanRow {
  id: string
  name: string
  slug: string
  price_monthly: number
  quota_daily: number
  quota_monthly: number
  rate_limit_rpm: number
  max_concurrent: number
  byok_enabled: boolean
  is_active: boolean
  platform_models: { provider: string; model: string }[]
  features: Record<string, unknown>
}

export default function PlansTab({ headers }: { headers: Record<string, string> }) {
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<PlanRow>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${GATEWAY}/api/v1/admin/plans`, { headers })
      .then(r => r.json()).then(d => setPlans(d.plans || [])).catch(() => { }).finally(() => setLoading(false))
  }, [])

  // P9: plan-level capability bit — parallel tasks / sub-agents
  const toggleParallelTasks = async (p: PlanRow) => {
    const next = p.features?.parallel_tasks === false
    await globalThis.fetch(`${GATEWAY}/api/v1/admin/plans/${p.id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ features: { parallel_tasks: next } }),
    })
    setPlans(prev => prev.map(x => x.id === p.id ? { ...x, features: { ...(x.features || {}), parallel_tasks: next } } : x))
  }

  const startEdit = (p: PlanRow) => {
    setEditing(p.id)
    setDraft({ price_monthly: p.price_monthly, quota_daily: p.quota_daily, quota_monthly: p.quota_monthly, rate_limit_rpm: p.rate_limit_rpm, max_concurrent: p.max_concurrent })
    setError(null)
  }

  const saveEdit = async (id: string) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${GATEWAY}/api/v1/admin/plans/${id}`, {
        method: 'PATCH', headers,
        body: JSON.stringify(draft),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setPlans(prev => prev.map(x => x.id === id ? { ...x, ...data.plan } : x))
      setEditing(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">{error}</div>}
      {loading ? <Loader2 className="w-6 h-6 animate-spin mx-auto text-text-muted" /> : plans.map(p => (
        <div key={p.id} className="glass-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold">{p.name} <span className="text-xs text-text-muted font-normal">({p.slug})</span></span>
            {editing === p.id ? (
              <div className="flex items-center gap-1.5">
                <button onClick={() => saveEdit(p.id)} disabled={saving}
                  className="text-xs px-2 py-1 rounded bg-green-400/10 text-green-400 hover:bg-green-400/20 flex items-center gap-1 disabled:opacity-50">
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
                </button>
                <button onClick={() => setEditing(null)} className="text-xs px-2 py-1 rounded bg-white/5 text-text-muted hover:bg-white/10">
                  <XCircle className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-accent-cyan">${p.price_monthly}/mo</span>
                <button onClick={() => startEdit(p)} className="text-xs px-2 py-1 rounded bg-white/5 text-text-muted hover:bg-white/10 flex items-center gap-1">
                  <Pencil className="w-3 h-3" /> Edit quotas
                </button>
              </div>
            )}
          </div>

          {editing === p.id ? (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              {([
                ['price_monthly', 'Price ($/mo)'],
                ['quota_daily', 'Daily quota'],
                ['quota_monthly', 'Monthly quota'],
                ['rate_limit_rpm', 'RPM'],
                ['max_concurrent', 'Concurrent'],
              ] as const).map(([key, label]) => (
                <label key={key} className="block">
                  <span className="text-text-muted">{label}</span>
                  <input
                    type="number"
                    value={String(draft[key] ?? 0)}
                    onChange={(e) => setDraft(d => ({ ...d, [key]: Number(e.target.value) }))}
                    className="mt-1 w-full rounded-lg bg-black/40 border border-white/10 px-2 py-1.5 text-text-primary"
                  />
                </label>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 text-xs text-text-muted">
              <div>Daily Quota: {p.quota_daily.toLocaleString()}</div>
              <div>RPM: {p.rate_limit_rpm}</div>
              <div>Concurrent: {p.max_concurrent}</div>
              <div>Monthly: {p.quota_monthly.toLocaleString()}</div>
              <div>BYOK: {p.byok_enabled ? <Check className="w-3 h-3 text-green-400 inline" /> : <X className="w-3 h-3 text-red-400 inline" />}</div>
              <div>Active: {p.is_active ? <Check className="w-3 h-3 text-green-400 inline" /> : <X className="w-3 h-3 text-red-400 inline" />}</div>
              <div className="flex items-center gap-1.5">
                Parallel Tasks:
                <button onClick={() => toggleParallelTasks(p)}
                  className={`text-xs px-2 py-0.5 rounded ${p.features?.parallel_tasks !== false ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'}`}>
                  {p.features?.parallel_tasks !== false ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-1 mt-2">
            {(p.platform_models || []).map((m: any) => (
              <span key={m.model} className="text-xs px-1.5 py-0.5 rounded bg-white/5">{m.provider}:{m.model}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
