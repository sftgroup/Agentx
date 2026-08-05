// app/apply/page.tsx — B-end Partner Application (public onboarding form)
'use client'

import { useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Check, Loader2, ArrowRight, Building2, User, Mail, Globe, MessageSquare, Wallet, Percent } from 'lucide-react'
import Link from 'next/link'

const GATEWAY = process.env.NEXT_PUBLIC_AGENTX_GATEWAY_URL || ''

export default function ApplyPage() {
  const [form, setForm] = useState({
    company: '', contactName: '', contactEmail: '', website: '',
    description: '', channelIdHint: '', desiredShareBps: '', wallet: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ id: string; status: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!form.company.trim() || !form.contactName.trim() || !form.contactEmail.trim()) return
    setSubmitting(true); setError(null)
    try {
      const r = await fetch(`${GATEWAY}/api/v1/channel/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: form.company.trim(),
          contactName: form.contactName.trim(),
          contactEmail: form.contactEmail.trim(),
          website: form.website.trim() || undefined,
          description: form.description.trim() || undefined,
          channelIdHint: form.channelIdHint.trim() || undefined,
          desiredShareBps: form.desiredShareBps.trim() ? Number(form.desiredShareBps) : undefined,
          wallet: form.wallet.trim() || undefined,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Submission failed')
      setResult({ id: d.application.id, status: d.application.status })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    return (
      <AppLayout>
        <div className="max-w-md mx-auto py-24 px-6">
          <div className="glass-card p-10 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-green-400/10 flex items-center justify-center mx-auto">
              <Check className="w-7 h-7 text-green-400" />
            </div>
            <h1 className="heading-md">Application Received</h1>
            <p className="text-sm text-text-muted">
              Thank you! Your application <span className="font-mono text-text-primary">#{result.id}</span> has been submitted.
              Our team will review it and reach out shortly.
            </p>
            <Link href="/" className="btn-primary text-sm inline-flex items-center gap-2 mt-2">
              Back to Home <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </AppLayout>
    )
  }

  const inputCls = "w-full px-3 py-2.5 bg-white/5 border border-white/5 rounded-xl text-sm focus:outline-none focus:border-accent-purple/40 transition-colors"
  const labelCls = "text-sm text-text-secondary mb-1.5 block"

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto py-10 px-6 space-y-6">
        {/* Hero */}
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-accent-purple/10 flex items-center justify-center mx-auto mb-3">
            <Building2 className="w-6 h-6 text-accent-purple" />
          </div>
          <h1 className="heading-lg mb-2">Become a <span className="gradient-text">Partner</span></h1>
          <p className="body text-text-secondary max-w-lg mx-auto">
            Join the AgentX ecosystem as a distribution channel. Refer subscribers, earn a revenue share on every attributed subscription — transparently tracked on-chain.
          </p>
        </div>

        {/* Benefits */}
        <div className="grid sm:grid-cols-3 gap-3">
          {[
            { icon: Percent, title: 'Revenue share', desc: 'Earn a share of every subscription you refer' },
            { icon: Wallet, title: 'On-chain payouts', desc: 'Settlement tracked & auditable on-chain' },
            { icon: Building2, title: 'White-label friendly', desc: 'Link / QR / API attribution for any platform' },
          ].map(b => (
            <div key={b.title} className="glass-card p-4 text-center">
              <b.icon className="w-5 h-5 text-accent-cyan mx-auto mb-2" />
              <div className="text-sm font-semibold">{b.title}</div>
              <div className="text-xs text-text-muted mt-1">{b.desc}</div>
            </div>
          ))}
        </div>

        {error && (
          <div className="glass-card p-4 text-sm text-red-400">{error}</div>
        )}

        {/* Form */}
        <div className="glass-card p-8 space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelCls}><Building2 className="w-3.5 h-3.5 inline -mt-0.5 mr-1" /> Company / Organization *</label>
              <input className={inputCls} placeholder="Your company name" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}><User className="w-3.5 h-3.5 inline -mt-0.5 mr-1" /> Contact Name *</label>
              <input className={inputCls} placeholder="Your name" value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}><Mail className="w-3.5 h-3.5 inline -mt-0.5 mr-1" /> Contact Email *</label>
              <input className={inputCls} type="email" placeholder="you@company.com" value={form.contactEmail} onChange={e => setForm({ ...form, contactEmail: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}><Globe className="w-3.5 h-3.5 inline -mt-0.5 mr-1" /> Website</label>
              <input className={inputCls} placeholder="https://your-platform.com" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}><MessageSquare className="w-3.5 h-3.5 inline -mt-0.5 mr-1" /> How will you distribute AgentX agents?</label>
              <textarea className={`${inputCls} min-h-[90px]`} placeholder="e.g. embedded in our SaaS dashboard, marketing site, API integrations…"
                value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Preferred Channel ID</label>
              <input className={inputCls} placeholder="e.g. my-platform (optional)" value={form.channelIdHint} onChange={e => setForm({ ...form, channelIdHint: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Desired Revenue Share (%)</label>
              <input className={inputCls} type="number" min={0} max={100} placeholder="e.g. 1.25 (optional)" value={form.desiredShareBps} onChange={e => setForm({ ...form, desiredShareBps: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}><Wallet className="w-3.5 h-3.5 inline -mt-0.5 mr-1" /> Payout Wallet Address</label>
              <input className={`${inputCls} font-mono`} placeholder="0x… (optional)" value={form.wallet} onChange={e => setForm({ ...form, wallet: e.target.value })} />
            </div>
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting || !form.company.trim() || !form.contactName.trim() || !form.contactEmail.trim()}
            className="btn-primary w-full py-3 disabled:opacity-30 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
            Submit Application
          </button>
          <p className="text-[11px] text-text-muted text-center">Applications are reviewed by the AgentX team. Approval grants you a channel ID and revenue-share configuration.</p>
        </div>
      </div>
    </AppLayout>
  )
}
