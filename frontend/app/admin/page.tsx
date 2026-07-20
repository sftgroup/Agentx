// app/admin/page.tsx — Admin Dashboard (Platform API Keys, Plans, Tenants, Usage)
'use client'

import { useState, useEffect } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Key, Shield, Users, BarChart3, Plus, Trash2, Loader2, Check, X, RefreshCw } from 'lucide-react'

const GATEWAY = process.env.NEXT_PUBLIC_AGENTX_GATEWAY_URL || 'http://43.156.99.215:3090'

type Tab = 'keys' | 'plans' | 'tenants' | 'usage'

function getAdminHeaders(): Record<string, string> {
  const key = typeof window !== 'undefined' ? localStorage.getItem('agentx_admin_key') || '' : ''
  return { 'Content-Type': 'application/json', 'X-Admin-Key': key }
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('keys')
  const [adminKey, setAdminKey] = useState('')
  const [authed, setAuthed] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('agentx_admin_key')
    if (saved) { setAdminKey(saved); setAuthed(true) }
  }, [])

  const login = () => {
    if (!adminKey.trim()) return
    localStorage.setItem('agentx_admin_key', adminKey.trim())
    setAuthed(true)
  }

  if (!authed) {
    return (
      <AppLayout>
        <div className="max-w-md mx-auto py-20 px-6">
          <div className="glass-card p-8 space-y-5 text-center">
            <Shield className="w-12 h-12 text-accent-purple mx-auto" />
            <h1 className="heading-md">Admin Panel</h1>
            <p className="text-sm text-text-muted">Enter the admin key to access platform management.</p>
            <input
              type="password" value={adminKey} onChange={e => setAdminKey(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && login()}
              placeholder="Admin Key"
              className="w-full px-4 py-2.5 bg-white/5 border border-white/5 rounded-xl text-sm focus:outline-none focus:border-accent-purple/40"
            />
            <button onClick={login} className="btn-primary w-full py-2.5">Login</button>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto py-8 px-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="heading-md flex items-center gap-3">
            <Shield className="w-7 h-7 text-accent-purple" /> Admin Panel
          </h1>
          <button onClick={() => { localStorage.removeItem('agentx_admin_key'); setAuthed(false); }}
            className="text-xs text-text-muted hover:text-red-400">Logout</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-white/3 rounded-xl w-fit">
          {[
            { id: 'keys' as Tab, label: 'LLM Keys', icon: Key },
            { id: 'plans' as Tab, label: 'Plans', icon: Shield },
            { id: 'tenants' as Tab, label: 'Tenants', icon: Users },
            { id: 'usage' as Tab, label: 'Usage', icon: BarChart3 },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${tab === t.id ? 'bg-white/10 text-text-primary' : 'text-text-muted hover:text-text-secondary'}`}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        {tab === 'keys' && <PlatformKeysTab headers={getAdminHeaders()} />}
        {tab === 'plans' && <PlansTab headers={getAdminHeaders()} />}
        {tab === 'tenants' && <TenantsTab headers={getAdminHeaders()} />}
        {tab === 'usage' && <UsageTab headers={getAdminHeaders()} />}
      </div>
    </AppLayout>
  )
}

// ── Platform Keys Tab ──────────────────────────────────────────────────────

function PlatformKeysTab({ headers }: { headers: Record<string, string> }) {
  const [keys, setKeys] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ provider: 'deepseek', endpoint: 'https://api.deepseek.com/v1', api_key: '', models: '', plan_slugs: 'pro,enterprise' })

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

  const addKey = async () => {
    if (!form.api_key) return
    setAdding(true)
    try {
      await fetch(`${GATEWAY}/api/v1/admin/platform-keys`, {
        method: 'POST', headers,
        body: JSON.stringify({
          provider: form.provider, endpoint: form.endpoint, api_key: form.api_key,
          models: form.models.split(',').map(s => s.trim()).filter(Boolean),
          plan_slugs: form.plan_slugs.split(',').map(s => s.trim()).filter(Boolean),
        })
      })
      setForm({ ...form, api_key: '', models: '' })
      fetchKeys()
    } catch (e) { /* */ }
    finally { setAdding(false) }
  }

  const deleteKey = async (id: string) => {
    await fetch(`${GATEWAY}/api/v1/admin/platform-keys/${id}`, { method: 'DELETE', headers })
    fetchKeys()
  }

  return (
    <div className="space-y-4">
      {/* Add form */}
      <div className="glass-card p-5 space-y-3">
        <h3 className="font-semibold text-sm flex items-center gap-2"><Plus className="w-4 h-4 text-green-400" /> Add Platform Key</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <input placeholder="Provider" value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })}
            className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40" />
          <input placeholder="Endpoint URL" value={form.endpoint} onChange={e => setForm({ ...form, endpoint: e.target.value })}
            className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40" />
          <input placeholder="API Key" type="password" value={form.api_key} onChange={e => setForm({ ...form, api_key: e.target.value })}
            className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40" />
          <input placeholder="Models (comma-separated)" value={form.models} onChange={e => setForm({ ...form, models: e.target.value })}
            className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40" />
        </div>
        <div className="flex gap-3">
          <input placeholder="Plan slugs (comma)" value={form.plan_slugs} onChange={e => setForm({ ...form, plan_slugs: e.target.value })}
            className="flex-1 px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40" />
          <button onClick={addKey} disabled={adding || !form.api_key} className="btn-primary text-sm px-4 py-2 disabled:opacity-30">
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
          </button>
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
                  <span className={`w-2 h-2 rounded-full ${k.is_active ? 'bg-green-400' : 'bg-red-400'}`} />
                </div>
                <div className="text-xs text-text-muted mt-1">{k.endpoint}</div>
                <div className="flex gap-1 mt-1">
                  {(k.models || []).map((m: string) => <span key={m} className="text-xs px-1.5 py-0.5 rounded bg-white/5">{m}</span>)}
                  {(k.plan_slugs || []).map((s: string) => <span key={s} className="text-xs px-1.5 py-0.5 rounded bg-accent-purple/10 text-accent-purple">{s}</span>)}
                </div>
              </div>
              <button onClick={() => deleteKey(k.id)} className="text-red-400/60 hover:text-red-400 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Plans Tab ──────────────────────────────────────────────────────────────

function PlansTab({ headers }: { headers: Record<string, string> }) {
  const [plans, setPlans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${GATEWAY}/api/v1/admin/plans`, { headers })
      .then(r => r.json()).then(d => setPlans(d.plans || [])).catch(() => { }).finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-2">
      {loading ? <Loader2 className="w-6 h-6 animate-spin mx-auto text-text-muted" /> : plans.map(p => (
        <div key={p.id} className="glass-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold">{p.name}</span>
            <span className="text-sm text-accent-cyan">${p.price_monthly}/mo</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs text-text-muted">
            <div>Daily Quota: {p.quota_daily.toLocaleString()}</div>
            <div>RPM: {p.rate_limit_rpm}</div>
            <div>Concurrent: {p.max_concurrent}</div>
            <div>Monthly: {p.quota_monthly.toLocaleString()}</div>
            <div>BYOK: {p.byok_enabled ? <Check className="w-3 h-3 text-green-400 inline" /> : <X className="w-3 h-3 text-red-400 inline" />}</div>
            <div>Active: {p.is_active ? <Check className="w-3 h-3 text-green-400 inline" /> : <X className="w-3 h-3 text-red-400 inline" />}</div>
          </div>
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

// ── Tenants Tab ─────────────────────────────────────────────────────────────

function TenantsTab({ headers }: { headers: Record<string, string> }) {
  const [data, setData] = useState<any>({ tenants: [], total: 0 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const fetch = async (p: number) => {
    setLoading(true)
    try {
      const r = await (await globalThis.fetch(`${GATEWAY}/api/v1/admin/tenants?page=${p}&limit=15`, { headers })).json()
      setData(r)
    } catch (e) { /* */ }
    finally { setLoading(false) }
  }
  useEffect(() => { fetch(page) }, [page])

  const updateTenant = async (id: string, plan_slug?: string, status?: string) => {
    await globalThis.fetch(`${GATEWAY}/api/v1/admin/tenants/${id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ plan_slug, status })
    })
    fetch(page)
  }

  return (
    <div>
      <div className="text-sm text-text-muted mb-3">{data.total} total tenants</div>
      {loading ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : (
        <div className="space-y-2">
          {data.tenants.map((t: any) => (
            <div key={t.id} className="glass-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-mono text-text-muted">{t.wallet_address?.substring(0, 12)}...{t.wallet_address?.substring(38)}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${t.plan_slug === 'enterprise' ? 'bg-accent-purple/10 text-accent-purple' : t.plan_slug === 'pro' ? 'bg-accent-cyan/10 text-accent-cyan' : 'bg-white/5 text-text-muted'}`}>{t.plan_name}</span>
                    <span className={`text-xs ${t.status === 'active' ? 'text-green-400' : 'text-red-400'}`}>{t.status}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-xs text-text-muted">{t.quota_used}/{t.quota_daily} tokens</div>
                  <select onChange={e => updateTenant(t.id, e.target.value)} defaultValue={t.plan_slug}
                    className="text-xs px-2 py-1 bg-white/5 border border-white/5 rounded focus:outline-none">
                    <option value="free">Free</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                  {t.status === 'active' ? (
                    <button onClick={() => updateTenant(t.id, undefined, 'suspended')} className="text-xs text-red-400/60 hover:text-red-400">Suspend</button>
                  ) : (
                    <button onClick={() => updateTenant(t.id, undefined, 'active')} className="text-xs text-green-400/60 hover:text-green-400">Activate</button>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div className="flex justify-center gap-2 pt-4">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary text-xs px-3 py-1 disabled:opacity-30">Prev</button>
            <span className="text-sm text-text-muted self-center">Page {page}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={data.tenants.length < 15} className="btn-secondary text-xs px-3 py-1 disabled:opacity-30">Next</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Usage Tab ───────────────────────────────────────────────────────────────

function UsageTab({ headers }: { headers: Record<string, string> }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const fetchUsage = () => {
    setLoading(true)
    globalThis.fetch(`${GATEWAY}/api/v1/admin/usage`, { headers })
      .then(r => r.json()).then(setData).catch(() => { }).finally(() => setLoading(false))
  }
  useEffect(() => { fetchUsage() }, [])

  if (loading) return <Loader2 className="w-6 h-6 animate-spin mx-auto text-text-muted" />

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="glass-card p-5 text-center">
          <div className="text-3xl font-bold">{(data?.summary?.total_requests || 0).toLocaleString()}</div>
          <div className="text-xs text-text-muted mt-1">Total Requests</div>
        </div>
        <div className="glass-card p-5 text-center">
          <div className="text-3xl font-bold">{(data?.summary?.total_tokens || 0).toLocaleString()}</div>
          <div className="text-xs text-text-muted mt-1">Total Tokens</div>
        </div>
      </div>

      {/* Daily */}
      <div className="glass-card p-5">
        <h3 className="font-semibold text-sm mb-3">Daily Usage (30 days)</h3>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {(data?.daily || []).slice(0, 14).map((d: any) => (
            <div key={d.date} className="flex justify-between text-xs">
              <span className="text-text-muted">{d.date?.substring(5)}</span>
              <span>{d.requests} req · {d.tokens?.toLocaleString()} tok</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top Tenants */}
      <div className="glass-card p-5">
        <h3 className="font-semibold text-sm mb-3">Top Tenants</h3>
        <div className="space-y-2">
          {(data?.topTenants || []).map((t: any, i: number) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <div>
                <span className="text-text-muted font-mono">{t.wallet_address?.substring(0, 10)}...</span>
                <span className="ml-2 px-1.5 py-0.5 rounded bg-white/5">{t.plan}</span>
              </div>
              <span>{t.tokens?.toLocaleString()} tokens</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
