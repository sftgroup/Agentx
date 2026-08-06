// Payment / Merchant Status Tab + Channel Admin (split from app/admin/page.tsx, R7)
'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, Loader2, Coins, Plus, Eye, Trash2 } from 'lucide-react'
import { GATEWAY, fmtWei, StatusDot } from './shared'

export default function PaymentsTab({ headers }: { headers: Record<string, string> }) {
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
