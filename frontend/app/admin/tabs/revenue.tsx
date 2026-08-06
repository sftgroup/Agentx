// Revenue Tab (split from app/admin/page.tsx, R7)
'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, Loader2 } from 'lucide-react'
import { GATEWAY, fmtWei, fmtCents } from './shared'

export default function RevenueTab({ headers }: { headers: Record<string, string> }) {
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
  const erc20 = oc.erc20 || []

  const cards = [
    {
      title: 'On-chain platform fees', sub: `platformFeeBps = ${oc.platformFeeBps ?? '—'}`,
      rows: [
        ['OxaChain L1 (native)', fmtWei(oc.oxachain?.nativeFeesWei)],
        ['Sepolia (testnet)', fmtWei(oc.sepolia?.nativeFeesWei)],
        ...erc20.map((e: any) => [`${e.symbol} (${e.chain})`, fmtWei(e.feesWei)]),
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
