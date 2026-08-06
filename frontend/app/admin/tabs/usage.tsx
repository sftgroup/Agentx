// Usage Tab (split from app/admin/page.tsx, R7)
'use client'

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { GATEWAY } from './shared'

export default function UsageTab({ headers }: { headers: Record<string, string> }) {
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
