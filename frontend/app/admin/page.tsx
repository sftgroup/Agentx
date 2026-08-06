// app/admin/page.tsx — Admin Dashboard shell (tabs split into ./tabs, R7)
'use client'

import { useState, useEffect } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Shield, Users, BarChart3, Activity, Wallet, CreditCard, Link2, Key } from 'lucide-react'
import PlatformKeysTab from './tabs/platform-keys'
import PlansTab from './tabs/plans'
import TenantsTab from './tabs/tenants'
import UsageTab from './tabs/usage'
import SystemTab from './tabs/system'
import RevenueTab from './tabs/revenue'
import PaymentsTab from './tabs/payments'
import ApplicationsTab from './tabs/applications'
import IntegrationsTab from './tabs/integrations'

type Tab = 'keys' | 'plans' | 'tenants' | 'usage' | 'system' | 'revenue' | 'payments' | 'applications' | 'integrations'

function getAdminHeaders(): Record<string, string> {
  const key = typeof window !== 'undefined' ? localStorage.getItem('agentx_admin_key') || '' : ''
  return { 'Content-Type': 'application/json', 'X-Admin-Key': key }
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('keys')
  const [adminKey, setAdminKey] = useState('')
  const [authed, setAuthed] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('agentx_admin_key')
    if (saved) { setAdminKey(saved); setAuthed(true) }
  }, [])

  const login = () => {
    if (!adminKey.trim()) return
    localStorage.setItem('agentx_admin_key', adminKey.trim())
    setAuthed(true)
  }

  if (!authed) {
    return (
      <AppLayout>
        <div className="max-w-md mx-auto py-20 px-6">
          <div className="glass-card p-8 space-y-5 text-center">
            <Shield className="w-12 h-12 text-accent-purple mx-auto" />
            <h1 className="heading-md">Admin Panel</h1>
            <p className="text-sm text-text-muted">Enter the admin key to access platform management.</p>
            <input
              type="password" value={adminKey} onChange={e => setAdminKey(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && login()}
              placeholder="Admin Key"
              className="w-full px-4 py-2.5 bg-white/5 border border-white/5 rounded-xl text-sm focus:outline-none focus:border-accent-purple/40"
            />
            <button onClick={login} className="btn-primary w-full py-2.5">Login</button>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto py-8 px-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="heading-md flex items-center gap-3">
            <Shield className="w-7 h-7 text-accent-purple" /> Admin Panel
          </h1>
          <button onClick={() => { localStorage.removeItem('agentx_admin_key'); setAuthed(false); }}
            className="text-xs text-text-muted hover:text-red-400">Logout</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-white/3 rounded-xl w-fit">
          {[
            { id: 'keys' as Tab, label: 'LLM Keys', icon: Key },
            { id: 'plans' as Tab, label: 'Plans', icon: Shield },
            { id: 'tenants' as Tab, label: 'Tenants', icon: Users },
            { id: 'usage' as Tab, label: 'Usage', icon: BarChart3 },
            { id: 'system' as Tab, label: 'System', icon: Activity },
            { id: 'revenue' as Tab, label: 'Revenue', icon: Wallet },
            { id: 'payments' as Tab, label: 'Payments', icon: CreditCard },
            { id: 'applications' as Tab, label: 'Applications', icon: Users },
            { id: 'integrations' as Tab, label: 'Integrations', icon: Link2 },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${tab === t.id ? 'bg-white/10 text-text-primary' : 'text-text-muted hover:text-text-secondary'}`}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        {tab === 'keys' && <PlatformKeysTab headers={getAdminHeaders()} />}
        {tab === 'plans' && <PlansTab headers={getAdminHeaders()} />}
        {tab === 'tenants' && <TenantsTab headers={getAdminHeaders()} />}
        {tab === 'usage' && <UsageTab headers={getAdminHeaders()} />}
        {tab === 'system' && <SystemTab headers={getAdminHeaders()} />}
        {tab === 'revenue' && <RevenueTab headers={getAdminHeaders()} />}
        {tab === 'payments' && <PaymentsTab headers={getAdminHeaders()} />}
        {tab === 'applications' && <ApplicationsTab headers={getAdminHeaders()} />}
        {tab === 'integrations' && <IntegrationsTab headers={getAdminHeaders()} />}
      </div>
    </AppLayout>
  )
}
