// System Status Tab (split from app/admin/page.tsx, R7)
'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, Loader2 } from 'lucide-react'
import { GATEWAY, StatusDot } from './shared'

export default function SystemTab({ headers }: { headers: Record<string, string> }) {
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
