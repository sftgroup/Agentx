// B-end Applications Tab — split from app/admin/page.tsx, R7
'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, Loader2, Copy, X, Check } from 'lucide-react'
import { GATEWAY } from './shared'

export default function ApplicationsTab({ headers }: { headers: Record<string, string> }) {
  const [apps, setApps] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<Record<string, string>>({})
  const [issuedKey, setIssuedKey] = useState<{ id: string; key: string; slug: string } | null>(null)

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
      if (d.api_key) {
        setIssuedKey({ id, key: d.api_key, slug: d.integration?.slug || '' })
      }
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
      {issuedKey && (
        <div className="glass-card p-4 border border-accent-purple/30">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-accent-purple mb-1">API key issued — shown only once, copy it now</p>
              <p className="text-xs text-text-muted mb-1">Partner: <span className="font-mono">{issuedKey.slug}</span> · Gateway: <span className="font-mono">{GATEWAY}</span></p>
              <code className="block font-mono text-sm bg-black/30 rounded-lg px-3 py-2 break-all">{issuedKey.key}</code>
              <p className="text-[11px] text-text-muted mt-1">Send the caller <span className="font-mono">AGENTX_GATEWAY_URL</span> + <span className="font-mono">AGENTX_CONVERSATION_API_KEY</span>. Authenticate with <span className="font-mono">X-Api-Key: {issuedKey.key}</span>.</p>
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => navigator.clipboard?.writeText(issuedKey.key)} className="btn-secondary text-xs px-2 py-1" title="Copy key"><Copy className="w-3 h-3" /></button>
              <button onClick={() => setIssuedKey(null)} className="btn-secondary text-xs px-2 py-1" title="Dismiss"><X className="w-3 h-3" /></button>
            </div>
          </div>
        </div>
      )}
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
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full uppercase tracking-wide ${
                    a.type === 'developer' ? 'bg-accent-purple/15 text-accent-purple' : 'bg-accent-cyan/15 text-accent-cyan'}`}>
                    {a.type === 'developer' ? 'API' : 'Channel'}
                  </span>
                  {statusBadge(a.status)}
                </div>
                <div className="text-xs text-text-muted mt-0.5">
                  {a.contact_name} · {a.contact_email}
                  {a.website && <span> · <a href={a.website} target="_blank" rel="noreferrer" className="text-accent-cyan/70 hover:underline">{a.website.replace(/^https?:\/\//, '')}</a></span>}
                </div>
                {a.description && <p className="text-xs text-text-secondary mt-1">{a.description}</p>}
                <div className="flex gap-3 mt-1.5 text-[11px] text-text-muted">
                  {a.type !== 'developer' && a.channel_id_hint && <span>channel hint: <span className="font-mono">{a.channel_id_hint}</span></span>}
                  {a.type !== 'developer' && a.desired_share_bps !== null && a.desired_share_bps !== undefined && <span>desired share: {a.desired_share_bps / 100}%</span>}
                  {a.type !== 'developer' && a.wallet && <span className="font-mono">wallet {a.wallet.substring(0, 10)}…</span>}
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
                    {busy === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} {a.type === 'developer' ? 'Approve & Issue Key' : 'Approve'}
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
