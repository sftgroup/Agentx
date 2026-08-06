// Plans Tab (split from app/admin/page.tsx, R7)
'use client'

import { useState, useEffect } from 'react'
import { Loader2, Check, X } from 'lucide-react'
import { GATEWAY } from './shared'

export default function PlansTab({ headers }: { headers: Record<string, string> }) {
  const [plans, setPlans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${GATEWAY}/api/v1/admin/plans`, { headers })
      .then(r => r.json()).then(d => setPlans(d.plans || [])).catch(() => { }).finally(() => setLoading(false))
  }, [])

  // P9: plan-level capability bit — parallel tasks / sub-agents
  const toggleParallelTasks = async (p: any) => {
    const next = p.features?.parallel_tasks === false
    await globalThis.fetch(`${GATEWAY}/api/v1/admin/plans/${p.id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ features: { parallel_tasks: next } }),
    })
    setPlans(prev => prev.map(x => x.id === p.id ? { ...x, features: { ...(x.features || {}), parallel_tasks: next } } : x))
  }

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
            <div className="flex items-center gap-1.5">
              Parallel Tasks:
              <button onClick={() => toggleParallelTasks(p)}
                className={`text-xs px-2 py-0.5 rounded ${p.features?.parallel_tasks !== false ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'}`}>
                {p.features?.parallel_tasks !== false ? 'ON' : 'OFF'}
              </button>
            </div>
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
