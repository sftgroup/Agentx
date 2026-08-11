// ---------------------------------------------------------------------------
// AgentX — UsageStatsCard (R19.2)
// ---------------------------------------------------------------------------
// Call statistics for the B-end console, fed by GET /api/v1/tenant/usage
// (R18 usage_logs): per key-source summary + a 30-day token timeline rendered
// as a lightweight bar chart (no chart dependency).
// ---------------------------------------------------------------------------
'use client'

import { useEffect, useState } from 'react'
import { BarChart3, Loader2 } from 'lucide-react'
import { GATEWAY_URL } from '@/lib/gateway'

interface UsageSummary {
  key_source: string
  total_tokens: string
  total_tool_calls: string
  request_count: string
}

interface TimelinePoint {
  day: string
  key_source: string
  tokens: string
}

export function UsageStatsCard({ accessToken }: { accessToken: string }) {
  const [summary, setSummary] = useState<UsageSummary[]>([])
  const [timeline, setTimeline] = useState<TimelinePoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch(`${GATEWAY_URL}/api/v1/tenant/usage?days=30`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(r => r.json())
      .then((d: { summary?: UsageSummary[]; timeline?: TimelinePoint[] }) => {
        if (cancelled) return
        setSummary(d.summary ?? [])
        setTimeline(d.timeline ?? [])
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [accessToken])

  // Aggregate timeline by day (tokens summed across key sources)
  const byDay = new Map<string, number>()
  for (const p of timeline) {
    byDay.set(p.day, (byDay.get(p.day) ?? 0) + Number(p.tokens))
  }
  const days = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  const maxTokens = Math.max(1, ...days.map(([, v]) => v))
  const totalTokens = days.reduce((acc, [, v]) => acc + v, 0)

  return (
    <div className="glass-card p-6 rounded-2xl space-y-4">
      <h3 className="font-semibold text-sm flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-accent-purple" /> Usage — last 30 days
      </h3>

      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin mx-auto text-text-muted" />
      ) : (
        <div className="space-y-4">
          {/* Summary by key source */}
          <div className="grid sm:grid-cols-3 gap-2">
            {summary.length === 0 && (
              <div className="text-sm text-text-muted sm:col-span-3 text-center py-4">
                No usage recorded yet — requests will appear here as you call the gateway.
              </div>
            )}
            {summary.map(s => (
              <div key={s.key_source} className="rounded-xl bg-white/5 p-3">
                <div className="text-[11px] text-text-muted uppercase tracking-wider">{s.key_source || 'platform'}</div>
                <div className="font-mono text-sm text-text-primary mt-1">{Number(s.total_tokens).toLocaleString()} tokens</div>
                <div className="text-[11px] text-text-muted mt-0.5">
                  {Number(s.request_count).toLocaleString()} requests · {Number(s.total_tool_calls).toLocaleString()} tool calls
                </div>
              </div>
            ))}
          </div>

          {/* Timeline bar chart */}
          {days.length > 0 && (
            <>
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>Daily token volume</span>
                <span className="font-mono text-text-primary">{totalTokens.toLocaleString()} tokens total</span>
              </div>
              <div className="flex items-end gap-[3px] h-16">
                {days.slice(-30).map(([day, v]) => (
                  <div key={day} className="flex-1 flex flex-col items-center gap-1 group relative" title={`${day}: ${v.toLocaleString()} tokens`}>
                    <div
                      className="w-full rounded-sm bg-accent-cyan/50 hover:bg-accent-cyan transition-colors"
                      style={{ height: `${Math.max(4, Math.round((v / maxTokens) * 56))}px` }}
                    />
                    {days.length <= 15 && <span className="text-[9px] text-text-muted">{day.slice(5)}</span>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
