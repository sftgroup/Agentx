// app/user/schedules/page.tsx — Scheduled Tasks (R10)
// One-time / interval schedules that auto-create a chat task at the due time.
'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { CalendarClock, Plus, Trash2, Play, Pause, Loader2, RefreshCw, AlertCircle, ChevronDown, ChevronUp, Clock } from 'lucide-react'
import { useAccount } from 'wagmi'
import { useGatewayAuth } from '@/hooks/useGatewayAuth'

const GATEWAY = process.env.NEXT_PUBLIC_AGENTX_GATEWAY_URL || ''

interface Schedule {
  id: number; agent_id: number | null; title: string | null; message: string
  schedule_type: string; run_at: string | null; interval_seconds: number | null
  timezone: string; enabled: boolean; next_run_at: string | null
  created_at: string; run_count: number; failed_count: number
}
interface Run { id: number; task_id: string | null; status: string; error: string | null; triggered_at: string }

const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleString() : '—'
const fmtInterval = (sec: number | null) => {
  if (!sec) return '—'
  if (sec % 86400 === 0) return `${sec / 86400} 天`
  if (sec % 3600 === 0) return `${sec / 3600} 小时`
  return `${sec} 秒`
}

export default function SchedulesPage() {
  const { isConnected } = useAccount()
  const { accessToken } = useGatewayAuth(GATEWAY)

  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [runsOpen, setRunsOpen] = useState<number | null>(null)
  const [runs, setRuns] = useState<Record<number, Run[]>>({})
  const [runsLoading, setRunsLoading] = useState<number | null>(null)

  const [form, setForm] = useState({
    agentId: '', title: '', message: '', scheduleType: 'one_time',
    runAt: '', intervalSeconds: '3600',
  })

  const load = useCallback(async () => {
    if (!accessToken) return
    setLoading(true); setError(null)
    try {
      const r = await fetch(`${GATEWAY}/api/v1/schedules`, { headers: { Authorization: `Bearer ${accessToken}` } })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Load failed')
      setSchedules(d.schedules || [])
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [accessToken])

  useEffect(() => { load() }, [load])

  const create = async () => {
    if (!form.agentId.trim() || !form.message.trim()) { setError('agentId 和 message 必填'); return }
    setBusy(true); setError(null)
    try {
      const body: any = {
        agentId: Number(form.agentId), title: form.title || null, message: form.message,
        scheduleType: form.scheduleType, timezone: 'UTC',
      }
      if (form.scheduleType === 'one_time') body.runAt = new Date(form.runAt).toISOString()
      else body.intervalSeconds = Number(form.intervalSeconds)
      const r = await fetch(`${GATEWAY}/api/v1/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Create failed')
      setShowForm(false)
      await load()
    } catch (e: any) { setError(e.message) }
    finally { setBusy(false) }
  }

  const toggle = async (s: Schedule) => {
    setBusy(true); setError(null)
    try {
      const r = await fetch(`${GATEWAY}/api/v1/schedules/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ enabled: !s.enabled }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Update failed')
      await load()
    } catch (e: any) { setError(e.message) }
    finally { setBusy(false) }
  }

  const remove = async (s: Schedule) => {
    if (!confirm(`删除定时任务 #${s.id}？运行历史将保留。`)) return
    setBusy(true); setError(null)
    try {
      const r = await fetch(`${GATEWAY}/api/v1/schedules/${s.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` },
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Delete failed')
      await load()
    } catch (e: any) { setError(e.message) }
    finally { setBusy(false) }
  }

  const fetchRuns = async (s: Schedule) => {
    const id = s.id
    if (runsOpen === id) { setRunsOpen(null); return }
    setRunsOpen(id)
    setRunsLoading(id)
    try {
      const r = await fetch(`${GATEWAY}/api/v1/schedules/${id}/runs`, { headers: { Authorization: `Bearer ${accessToken}` } })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Load failed')
      setRuns(prev => ({ ...prev, [id]: d.runs || [] }))
    } catch (e: any) { setError(e.message) }
    finally { setRunsLoading(null) }
  }

  if (!isConnected) {
    return (
      <AppLayout><div className="max-w-4xl mx-auto text-center py-20">
        <AlertCircle className="w-16 h-16 text-accent-purple/40 mx-auto mb-4" />
        <h2 className="heading-md mb-3">Connect Your Wallet</h2>
        <p className="body text-text-muted">Connect to manage your scheduled tasks.</p>
      </div></AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto py-8 px-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="heading-md flex items-center gap-2"><CalendarClock className="w-6 h-6 text-accent-purple" /> Scheduled Tasks</h1>
            <p className="body text-text-secondary mt-1">到点自动创建并执行聊天任务，无需手动触发</p>
          </div>
          <div className="flex gap-3">
            <button onClick={load} className="btn-secondary text-sm py-2"><RefreshCw className="w-4 h-4" /> Refresh</button>
            <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm py-2"><Plus className="w-4 h-4" /> New Schedule</button>
          </div>
        </div>

        {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">{error}</div>}

        {showForm && (
          <div className="glass-card p-5 space-y-4">
            <h2 className="font-semibold text-sm">新建定时任务</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-xs text-text-muted">Agent ID（必填）
                <input value={form.agentId} onChange={e => setForm({ ...form, agentId: e.target.value })}
                  placeholder="如 42" className="input" type="number" />
              </label>
              <label className="text-xs text-text-muted">标题
                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="可选" className="input" />
              </label>
              <label className="text-xs text-text-muted sm:col-span-2">任务消息（必填，到点后作为任务内容执行）
                <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
                  placeholder="例如：请生成今日市场行情摘要" className="input min-h-[70px]" />
              </label>
              <label className="text-xs text-text-muted">类型
                <select value={form.scheduleType} onChange={e => setForm({ ...form, scheduleType: e.target.value })} className="input">
                  <option value="one_time">一次性</option>
                  <option value="interval">周期（间隔）</option>
                </select>
              </label>
              {form.scheduleType === 'one_time' ? (
                <label className="text-xs text-text-muted">执行时间
                  <input type="datetime-local" value={form.runAt} onChange={e => setForm({ ...form, runAt: e.target.value })} className="input" />
                </label>
              ) : (
                <label className="text-xs text-text-muted">间隔（秒，≥60）
                  <input type="number" value={form.intervalSeconds} onChange={e => setForm({ ...form, intervalSeconds: e.target.value })} className="input" />
                </label>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="btn-secondary text-sm py-2">取消</button>
              <button onClick={create} disabled={busy} className="btn-primary text-sm py-2 flex items-center gap-1.5">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} 创建
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-text-muted" />
        ) : schedules.length === 0 ? (
          <div className="glass-card p-10 text-center text-text-muted text-sm">
            <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
            暂无定时任务。点击「New Schedule」创建第一个。
          </div>
        ) : (
          <div className="space-y-3">
            {schedules.map(s => (
              <div key={s.id} className="glass-card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{s.title || `定时任务 #${s.id}`}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${s.enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/10 text-text-muted'}`}>
                        {s.enabled ? '已启用' : '已停用'}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/10 text-text-muted">
                        {s.schedule_type === 'one_time' ? '一次性' : `每 ${fmtInterval(s.interval_seconds)}`}
                      </span>
                      {s.failed_count > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-red-500/15 text-red-400">{s.failed_count} 次失败</span>
                      )}
                    </div>
                    <p className="text-sm text-text-secondary mt-1.5 truncate">{s.message}</p>
                    <div className="text-xs text-text-muted mt-2 space-x-3">
                      <span>Agent #{s.agent_id}</span>
                      <span>下次执行: {fmtDate(s.next_run_at)}</span>
                      <span>已触发 {s.run_count} 次</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={() => toggle(s)} disabled={busy} title={s.enabled ? '停用' : '启用'}
                      className="p-2 rounded-lg hover:bg-white/5 text-text-muted hover:text-text-primary transition-colors">
                      {s.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button onClick={() => fetchRuns(s)} title="运行历史"
                      className="p-2 rounded-lg hover:bg-white/5 text-text-muted hover:text-text-primary transition-colors">
                      {runsLoading === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : runsOpen === s.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button onClick={() => remove(s)} disabled={busy} title="删除"
                      className="p-2 rounded-lg hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {runsOpen === s.id && (
                  <div className="mt-4 border-t border-white/5 pt-3 space-y-1.5">
                    {runsLoading === s.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-text-muted mx-auto" />
                    ) : (runs[s.id] || []).length === 0 ? (
                      <div className="text-xs text-text-muted text-center py-2">暂无触发记录</div>
                    ) : runs[s.id].map(r => (
                      <div key={r.id} className="flex items-center gap-3 text-xs py-1.5 px-3 rounded-lg bg-white/3">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${r.status === 'triggered' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                        <span className="text-text-secondary">{fmtDate(r.triggered_at)}</span>
                        {r.task_id
                          ? <span className="ml-auto text-text-muted font-mono">task:{r.task_id.slice(0, 12)}</span>
                          : <span className="ml-auto text-red-300">{r.error || r.status}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
