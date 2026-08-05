// app/admin/page.tsx — Admin Dashboard (Platform API Keys, Plans, Tenants, Usage)
'use client'

import { useState, useEffect } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Key, Shield, Users, BarChart3, Plus, Trash2, Loader2, Check, X, RefreshCw, Activity, Wallet, CreditCard, Eye, Coins, Edit } from 'lucide-react'

const GATEWAY = process.env.NEXT_PUBLIC_AGENTX_GATEWAY_URL || 'http://localhost:3090'

type Tab = 'keys' | 'plans' | 'tenants' | 'usage' | 'system' | 'revenue' | 'payments' | 'applications'

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
            { id: 'system' as Tab, label: 'System', icon: Activity },
            { id: 'revenue' as Tab, label: 'Revenue', icon: Wallet },
            { id: 'payments' as Tab, label: 'Payments', icon: CreditCard },
            { id: 'applications' as Tab, label: 'Applications', icon: Users },
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
        {tab === 'system' && <SystemTab headers={getAdminHeaders()} />}
        {tab === 'revenue' && <RevenueTab headers={getAdminHeaders()} />}
        {tab === 'payments' && <PaymentsTab headers={getAdminHeaders()} />}
        {tab === 'applications' && <ApplicationsTab headers={getAdminHeaders()} />}
      </div>
    </AppLayout>
  )
}

// ── Platform Keys Tab ──────────────────────────────────────────────────────

function PlatformKeysTab({ headers }: { headers: Record<string, string> }) {
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

// ── Helpers ────────────────────────────────────────────────────────────────

const fmtWei = (w?: string | number | null) =>
  w === null || w === undefined ? '—' : Number(w) / 1e18 > 0 && Number(w) / 1e18 < 0.0001
    ? (Number(w) / 1e18).toExponential(2)
    : (Number(w) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 4 })
const fmtCents = (c?: string | number | null) =>
  c === null || c === undefined ? '—' : '$' + (Number(c) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })
const StatusDot = ({ ok }: { ok: boolean }) => <span className={`w-2 h-2 rounded-full inline-block ${ok ? 'bg-green-400' : 'bg-red-400'}`} />

// ── System Status Tab ──────────────────────────────────────────────────────

function SystemTab({ headers }: { headers: Record<string, string> }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = () => {
    setLoading(true)
    globalThis.fetch(`${GATEWAY}/api/v1/admin/system`, { headers })
      .then(r => r.json()).then(setData).catch(() => { }).finally(() => setLoading(false))
  }
  useEffect(() => { fetchData() }, [])
  if (loading) return <Loader2 className="w-6 h-6 animate-spin mx-auto text-text-muted" />

  const s = data?.services || {}
  return (
    <div className="space-y-4">
      {/* Services */}
      <div className="grid sm:grid-cols-3 gap-4">
        {[
          { name: 'Gateway', online: s.gateway?.online, detail: `${(s.gateway?.uptimeSec ?? 0) / 3600 | 0}h uptime · ${s.gateway?.memoryMB}MB` },
          { name: 'Conversation', online: s.conversation?.online, detail: s.conversation?.code ? `HTTP ${s.conversation.code} · ${s.conversation.latencyMs}ms` : 'unreachable' },
          { name: 'Frontend', online: s.frontend?.online, detail: s.frontend?.code ? `HTTP ${s.frontend.code} · ${s.frontend.latencyMs}ms` : 'unreachable' },
        ].map(c => (
          <div key={c.name} className="glass-card p-5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">{c.name}</span>
              <StatusDot ok={c.online} />
            </div>
            <div className="text-xs text-text-muted mt-2">{c.detail}</div>
          </div>
        ))}
      </div>

      {/* Database */}
      <div className="glass-card p-5">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          Database <StatusDot ok={data?.database?.connected} />
        </h3>
        <div className="grid grid-cols-3 gap-2 text-xs text-text-muted">
          <div>Agents: <span className="text-text-primary">{data?.database?.agents?.toLocaleString()}</span></div>
          <div>Plans: <span className="text-text-primary">{data?.database?.plans?.toLocaleString()}</span></div>
          <div>Last sync: <span className="text-text-primary">{data?.database?.lastSyncAt ? new Date(data.database.lastSyncAt).toLocaleString() : '—'}</span></div>
        </div>
      </div>

      {/* Chains */}
      <div className="glass-card p-5">
        <h3 className="font-semibold text-sm mb-3">Chains</h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[['Sepolia', data?.chains?.sepolia], ['OxaChain L1', data?.chains?.oxachain]].map(([name, c]: any) => (
            <div key={name} className="flex items-center justify-between rounded-lg bg-white/3 px-3 py-2">
              <span className="text-text-muted">{name} (eip155:{c?.chainId})</span>
              <span className="text-text-primary">{c?.blockNumber?.toLocaleString() ?? '—'}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-xs text-text-muted">Checked at {data?.time ? new Date(data.time).toLocaleTimeString() : '—'}</span>
        <button onClick={fetchData} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"><RefreshCw className="w-3 h-3" /> Refresh</button>
      </div>
    </div>
  )
}

// ── Revenue Tab ────────────────────────────────────────────────────────────

function RevenueTab({ headers }: { headers: Record<string, string> }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = () => {
    setLoading(true)
    globalThis.fetch(`${GATEWAY}/api/v1/admin/revenue`, { headers })
      .then(r => r.json()).then(setData).catch(() => { }).finally(() => setLoading(false))
  }
  useEffect(() => { fetchData() }, [])
  if (loading) return <Loader2 className="w-6 h-6 animate-spin mx-auto text-text-muted" />

  const oc = data?.onChain || {}
  const fi = data?.fiat || {}
  const ch = data?.channel || {}
  const x4 = data?.x402 || {}

  const cards = [
    {
      title: 'On-chain platform fees', sub: `platformFeeBps = ${oc.platformFeeBps ?? '—'}`,
      rows: [
        ['OxaChain L1 (native)', fmtWei(oc.oxachain?.nativeFeesWei)],
        ['Sepolia (testnet)', fmtWei(oc.sepolia?.nativeFeesWei)],
      ],
    },
    {
      title: 'Fiat (Stripe)', sub: `${fi.payouts ?? 0} payouts`,
      rows: [
        ['Collected', fmtCents(fi.total_cents)],
        ['Platform cut', fmtCents(fi.platform_cut_cents)],
        ['Pending', fmtCents(fi.pending_cents)],
      ],
    },
    {
      title: 'Channel revenue share', sub: `${ch.attributions ?? 0} attributions`,
      rows: [
        ['Attributed volume', fmtWei(ch.amount_paid_wei)],
        ['Channel share owed', fmtWei(ch.channel_share_wei)],
        ['Settled', fmtWei(ch.settled_share_wei)],
      ],
    },
    {
      title: 'x402 micropayments', sub: `${x4.payments ?? 0} payments`,
      rows: [
        ['Received', fmtWei(x4.total_wei)],
        ['Outstanding balance', fmtWei(x4.outstanding_wei)],
      ],
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        {cards.map(c => (
          <div key={c.title} className="glass-card p-5">
            <h3 className="font-semibold text-sm">{c.title}</h3>
            <div className="text-xs text-text-muted mb-3">{c.sub}</div>
            <div className="space-y-1.5">
              {c.rows.map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs">
                  <span className="text-text-muted">{k}</span>
                  <span className="text-text-primary font-medium">{v}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <button onClick={fetchData} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"><RefreshCw className="w-3 h-3" /> Refresh</button>
      </div>
    </div>
  )
}

// ── Payment / Merchant Status Tab ──────────────────────────────────────────

function PaymentsTab({ headers }: { headers: Record<string, string> }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = () => {
    setLoading(true)
    globalThis.fetch(`${GATEWAY}/api/v1/admin/payments`, { headers })
      .then(r => r.json()).then(setData).catch(() => { }).finally(() => setLoading(false))
  }
  useEffect(() => { fetchData() }, [])
  if (loading) return <Loader2 className="w-6 h-6 animate-spin mx-auto text-text-muted" />

  const st = data?.stripe || {}
  const x4 = data?.x402 || {}

  return (
    <div className="space-y-4">
      {/* Stripe */}
      <div className="glass-card p-5">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">Stripe <StatusDot ok={st.configured} /></h3>
        <div className="grid sm:grid-cols-4 gap-2 text-xs text-text-muted">
          <div>Secret key: <StatusDot ok={st.secretKeySet} /></div>
          <div>Webhook secret: <StatusDot ok={st.webhookSecretSet} /></div>
          <div>Subscriptions: <span className="text-text-primary">{st.subscriptions?.total ?? 0}</span></div>
          <div>Active: <span className="text-text-primary">{st.subscriptions?.active ?? 0}</span></div>
        </div>
        {!st.configured && <div className="text-xs text-amber-400/80 mt-2">Inactive — set STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET to enable card subscriptions.</div>}
      </div>

      {/* x402 */}
      <div className="glass-card p-5">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">x402 <StatusDot ok={x4.enabled} /></h3>
        <div className="grid sm:grid-cols-4 gap-2 text-xs text-text-muted">
          <div>Enabled: <span className="text-text-primary">{String(x4.enabled)}</span></div>
          <div>Price: <span className="text-text-primary font-mono">{x4.priceWei}</span> wei</div>
          <div>Chain: <span className="text-text-primary">{x4.chain}</span></div>
          <div>Payments: <span className="text-text-primary">{x4.payments ?? 0}</span></div>
        </div>
        <div className="text-xs text-text-muted mt-2 break-all">Pay-to: <span className="font-mono">{x4.payTo || 'not configured'}</span></div>
        {!x4.enabled && <div className="text-xs text-amber-400/80 mt-1">Inactive — set X402_ENABLED=true + X402_PAY_TO to enable pay-per-request.</div>}
      </div>

      {/* Channels */}
      <ChannelAdmin headers={headers} />

      {/* On-chain summary */}
      <div className="glass-card p-5 flex items-center justify-between text-xs">
        <span className="text-text-muted">On-chain subscription plans indexed</span>
        <span className="text-text-primary font-medium">{data?.onChain?.subscriptionPlans ?? 0}</span>
      </div>
      <div className="flex justify-end">
        <button onClick={fetchData} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"><RefreshCw className="w-3 h-3" /> Refresh</button>
      </div>
    </div>
  )
}

// ── Channel Admin (CRUD + detail + settlement) ─────────────────────────────

function ChannelAdmin({ headers }: { headers: Record<string, string> }) {
  const [channels, setChannels] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ id: '', name: '', share_bps: '125', wallet: '' })
  const [detail, setDetail] = useState<any | null>(null)
  const [settleTx, setSettleTx] = useState('')

  const fetchChannels = async () => {
    setLoading(true)
    try {
      const r = await fetch(`${GATEWAY}/api/v1/admin/payments`, { headers })
      const d = await r.json()
      setChannels(d.channels || [])
    } catch (e) { /* */ }
    finally { setLoading(false) }
  }
  useEffect(() => { fetchChannels() }, [])

  const createChannel = async () => {
    if (!form.id.trim() || !form.name.trim()) return
    setCreating(true)
    try {
      const r = await fetch(`${GATEWAY}/api/v1/admin/channels`, {
        method: 'POST', headers,
        body: JSON.stringify({ id: form.id.trim(), name: form.name.trim(), share_bps: Number(form.share_bps) || 0, wallet: form.wallet.trim() || undefined }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Create failed')
      setForm({ id: '', name: '', share_bps: '125', wallet: '' })
      fetchChannels()
    } catch (e: any) { alert(e.message) }
    finally { setCreating(false) }
  }

  const toggleChannel = async (c: any) => {
    await fetch(`${GATEWAY}/api/v1/admin/channels/${c.id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ active: !c.active })
    })
    fetchChannels()
  }

  const deleteChannel = async (c: any) => {
    await fetch(`${GATEWAY}/api/v1/admin/channels/${c.id}`, { method: 'DELETE', headers })
    fetchChannels()
  }

  const viewDetail = async (c: any) => {
    setDetail(null)
    try {
      const r = await fetch(`${GATEWAY}/api/v1/admin/channels/${c.id}/report`, { headers })
      const d = await r.json()
      setDetail(d)
    } catch (e: any) { alert(e.message) }
  }

  const settleChannel = async (c: any) => {
    if (!settleTx.trim()) return
    try {
      const r = await fetch(`${GATEWAY}/api/v1/admin/channels/${c.id}/settle`, {
        method: 'POST', headers, body: JSON.stringify({ tx_hash: settleTx.trim() }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Settle failed')
      setSettleTx('')
      setDetail(null)
      fetchChannels()
    } catch (e: any) { alert(e.message) }
  }

  return (
    <div className="glass-card p-5 space-y-4">
      <h3 className="font-semibold text-sm flex items-center gap-2"><Coins className="w-4 h-4 text-accent-cyan" /> Channels</h3>

      {/* Create form */}
      <div className="grid sm:grid-cols-5 gap-2">
        <input placeholder="Channel ID" value={form.id} onChange={e => setForm({ ...form, id: e.target.value })}
          className="px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-xs focus:outline-none focus:border-accent-purple/40" />
        <input placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
          className="px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-xs focus:outline-none focus:border-accent-purple/40" />
        <input placeholder="Share bps (125 = 1.25%)" type="number" min={0} max={10000} value={form.share_bps} onChange={e => setForm({ ...form, share_bps: e.target.value })}
          className="px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-xs focus:outline-none focus:border-accent-purple/40" />
        <input placeholder="Payout wallet" value={form.wallet} onChange={e => setForm({ ...form, wallet: e.target.value })}
          className="px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-xs focus:outline-none focus:border-accent-purple/40 font-mono" />
        <button onClick={createChannel} disabled={creating || !form.id.trim() || !form.name.trim()} className="btn-primary text-xs px-3 py-2 disabled:opacity-30">
          {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Create
        </button>
      </div>

      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin mx-auto text-text-muted" />
      ) : channels.length === 0 ? (
        <div className="text-xs text-text-muted">No channels configured.</div>
      ) : (
        <div className="space-y-2">
          {channels.map((c: any) => (
            <div key={c.id} className="rounded-lg bg-white/3 px-3 py-2 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text-primary">{c.id}</span>
                  <span className="text-text-muted">{c.name}</span>
                  <button onClick={() => toggleChannel(c)} title="Toggle active">
                    <span className={`w-2 h-2 rounded-full inline-block ${c.active ? 'bg-green-400' : 'bg-red-400'}`} />
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-text-muted">{c.share_bps / 100}% share</span>
                  <span className="text-text-muted">{c.attributions ?? 0} attributions</span>
                  <span className="font-mono text-text-muted">{c.wallet?.substring(0, 10) || '—'}…</span>
                  <button onClick={() => viewDetail(c)} className="text-accent-cyan/70 hover:text-accent-cyan transition-colors" title="Detail report">
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => deleteChannel(c)} className="text-red-400/60 hover:text-red-400 transition-colors" title="Delete / deactivate">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Detail report */}
              {detail?.channel?.id === c.id && (
                <div className="mt-3 pt-3 border-t border-white/5 space-y-3">
                  <div className="flex flex-wrap items-center gap-4 text-text-muted">
                    <span>Total share: <span className="text-text-primary">{fmtWei(detail.totalShareWei)}</span></span>
                    <span>Outstanding: <span className="text-text-primary">{fmtWei(detail.outstandingWei)}</span></span>
                    <span>{detail.count} attributions</span>
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {detail.attributions.map((a: any) => (
                      <div key={a.id} className="flex justify-between text-[11px]">
                        <span className="font-mono text-text-muted">{a.subscriber?.substring(0, 8)}…·agent {a.agentId}</span>
                        <span className={a.settled ? 'text-green-400' : 'text-text-muted'}>
                          {a.settled ? '✓ settled' : 'pending'} · {fmtWei(a.channelShare)}
                        </span>
                      </div>
                    ))}
                  </div>
                  {detail.settlements?.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold text-text-secondary">Settlement ledger</div>
                      {detail.settlements.map((s: any) => (
                        <div key={s.id} className="flex justify-between text-[11px]">
                          <span className="font-mono text-text-muted">#{s.id} · {s.tx_hash?.substring(0, 16)}…</span>
                          <span>{fmtWei(s.amount_wei)} · {new Date(s.created_at).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input placeholder="Payout tx hash" value={settleTx} onChange={e => setSettleTx(e.target.value)}
                      className="flex-1 px-3 py-1.5 bg-white/5 border border-white/5 rounded-lg text-xs focus:outline-none focus:border-accent-purple/40 font-mono" />
                    <button onClick={() => settleChannel(c)} disabled={!settleTx.trim()} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1 disabled:opacity-30">
                      <Coins className="w-3 h-3" /> Settle outstanding
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── B-end Applications Tab ─────────────────────────────────────────────────

function ApplicationsTab({ headers }: { headers: Record<string, string> }) {
  const [apps, setApps] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<Record<string, string>>({})

  const fetchApps = async () => {
    setLoading(true)
    try {
      const r = await fetch(`${GATEWAY}/api/v1/admin/applications`, { headers })
      const d = await r.json()
      setApps(d.applications || [])
    } catch (e) { /* */ }
    finally { setLoading(false) }
  }
  useEffect(() => { fetchApps() }, [])

  const decide = async (id: string, decision: 'approved' | 'rejected') => {
    setBusy(id)
    try {
      const r = await fetch(`${GATEWAY}/api/v1/admin/applications/${id}/decide`, {
        method: 'POST', headers,
        body: JSON.stringify({ decision, note: note[id] || undefined }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Decision failed')
      fetchApps()
    } catch (e: any) { alert(e.message) }
    finally { setBusy(null) }
  }

  const statusBadge = (s: string) => (
    <span className={`text-xs px-2 py-0.5 rounded-full ${
      s === 'approved' ? 'bg-green-400/10 text-green-400'
      : s === 'rejected' ? 'bg-red-400/10 text-red-400'
      : 'bg-amber-400/10 text-amber-400'}`}>
      {s}
    </span>
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">B-end Partner Applications</h3>
        <button onClick={fetchApps} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"><RefreshCw className="w-3 h-3" /> Refresh</button>
      </div>
      {loading ? (
        <Loader2 className="w-6 h-6 animate-spin mx-auto text-text-muted" />
      ) : apps.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-text-muted">No applications yet.</div>
      ) : (
        apps.map(a => (
          <div key={a.id} className="glass-card p-4">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{a.company}</span>
                  {statusBadge(a.status)}
                </div>
                <div className="text-xs text-text-muted mt-0.5">
                  {a.contact_name} · {a.contact_email}
                  {a.website && <span> · <a href={a.website} target="_blank" rel="noreferrer" className="text-accent-cyan/70 hover:underline">{a.website.replace(/^https?:\/\//, '')}</a></span>}
                </div>
                {a.description && <p className="text-xs text-text-secondary mt-1">{a.description}</p>}
                <div className="flex gap-3 mt-1.5 text-[11px] text-text-muted">
                  {a.channel_id_hint && <span>channel hint: <span className="font-mono">{a.channel_id_hint}</span></span>}
                  {a.desired_share_bps !== null && a.desired_share_bps !== undefined && <span>desired share: {a.desired_share_bps / 100}%</span>}
                  {a.wallet && <span className="font-mono">wallet {a.wallet.substring(0, 10)}…</span>}
                  <span>submitted {new Date(a.created_at).toLocaleString()}</span>
                </div>
                {a.decision_note && <div className="text-[11px] text-text-muted mt-1">note: {a.decision_note}</div>}
              </div>
              {a.status === 'pending' && (
                <div className="flex items-center gap-2 shrink-0">
                  <input placeholder="Note" value={note[a.id] || ''} onChange={e => setNote({ ...note, [a.id]: e.target.value })}
                    className="w-40 px-2 py-1.5 bg-white/5 border border-white/5 rounded-lg text-xs focus:outline-none focus:border-accent-purple/40" />
                  <button onClick={() => decide(a.id, 'approved')} disabled={busy === a.id}
                    className="btn-primary text-xs px-3 py-1.5 disabled:opacity-30">
                    {busy === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Approve
                  </button>
                  <button onClick={() => decide(a.id, 'rejected')} disabled={busy === a.id}
                    className="btn-secondary text-xs px-3 py-1.5 text-red-400 disabled:opacity-30">
                    <X className="w-3 h-3" /> Reject
                  </button>
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
