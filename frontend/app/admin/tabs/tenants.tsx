// Tenants Tab (split from app/admin/page.tsx, R7)
'use client'

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { GATEWAY } from './shared'

export default function TenantsTab({ headers }: { headers: Record<string, string> }) {
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

  const updateTenant = async (id: string, plan_slug?: string, status?: string, allow_parallel_tasks?: boolean | null) => {
    await globalThis.fetch(`${GATEWAY}/api/v1/admin/tenants/${id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ plan_slug, status, allow_parallel_tasks })
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
                  {/* P9: tenant-level override for parallel tasks / sub-agents */}
                  <select
                    value={t.allow_parallel_tasks == null ? 'inherit' : (t.allow_parallel_tasks ? 'allow' : 'block')}
                    onChange={e => updateTenant(t.id, undefined, undefined,
                      e.target.value === 'inherit' ? null : e.target.value === 'allow')}
                    title="Parallel tasks / sub-agents override"
                    className="text-xs px-2 py-1 bg-white/5 border border-white/5 rounded focus:outline-none">
                    <option value="inherit">Parallel: inherit</option>
                    <option value="allow">Parallel: allow</option>
                    <option value="block">Parallel: block</option>
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
