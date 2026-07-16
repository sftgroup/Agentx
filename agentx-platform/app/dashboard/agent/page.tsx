// app/dashboard/agent/page.tsx — Developer Dashboard (Glassmorphism Dark)
'use client'

import { AppLayout } from '@/components/layout/AppLayout'
import { useAccount } from 'wagmi'
import { useAgentRegistry } from '@/components/agent/hooks/useAgentRegistry'
import { useSubscription } from '@/components/agent/hooks/useSubscription'
import { Brain, CreditCard, DollarSign, Plus, Users, Zap, Settings, FileText, ArrowRight } from 'lucide-react'
import Link from 'next/link'

function StatCard({ label, value, icon: Icon, trend, trendUp, color = 'text-accent-purple' }: {
  label: string; value: string | number; icon: React.ElementType; trend?: string; trendUp?: boolean; color?: string
}) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center"><Icon className={`w-5 h-5 ${color}`} /></div>
        {trend && <span className={`text-xs ${trendUp ? 'text-green-400' : 'text-red-400'}`}>{trendUp ? '↑' : '↓'} {trend}</span>}
      </div>
      <div className="text-2xl font-bold mb-1">{value}</div>
      <div className="text-xs text-text-muted">{label}</div>
    </div>
  )
}

export default function DeveloperDashboard() {
  const { isConnected } = useAccount()
  const { userAgents } = useAgentRegistry()
  const { userSubscriptions } = useSubscription()

  const activeSubs = (userSubscriptions || []).filter((s: any) => s.status === 0).length
  const agentsArr = (userAgents || []) as number[]

  if (!isConnected) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto text-center py-20">
          <Brain className="w-16 h-16 text-accent-purple/40 mx-auto mb-4" />
          <h2 className="heading-md mb-3">Connect Your Wallet</h2>
          <p className="body text-text-muted">Connect to manage your Agents.</p>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto py-8 px-6 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="heading-md flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-accent-purple/10 flex items-center justify-center"><Brain className="w-5 h-5 text-accent-purple" /></div>
              Developer Dashboard
            </h1>
            <p className="body text-text-secondary mt-1">Manage your AI Agents and track earnings</p>
          </div>
          <Link href="/studio" className="btn-primary text-sm px-5 py-2.5"><Plus className="w-4 h-4" /> New Agent</Link>
        </div>

        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="My Agents" value={agentsArr.length} icon={Brain} color="text-accent-purple" />
          <StatCard label="Active Subs" value={activeSubs} icon={Users} color="text-accent-cyan" trend="+12%" trendUp />
          <StatCard label="Total Revenue" value="— ETH" icon={DollarSign} color="text-yellow-400" />
          <StatCard label="Tasks Processed" value="—" icon={Zap} color="text-accent-purple" />
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Brain className="w-4 h-4 text-accent-purple" /> My Agents</h2>
          {agentsArr.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <Brain className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-30" />
              <p className="text-text-secondary mb-4">No Agents yet. Create your first one!</p>
              <Link href="/studio" className="btn-primary text-sm"><Plus className="w-4 h-4" /> Create Agent</Link>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {agentsArr.slice(0, 6).map((id: number) => (
                <div key={id} className="glass-card glass-card-hover p-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-accent-purple/10 flex items-center justify-center"><Brain className="w-5 h-5 text-accent-purple" /></div>
                    <div>
                      <div className="font-semibold text-sm">Agent #{id}</div>
                      <div className="text-xs text-text-muted">Token ID: {id}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-end mt-3">
                    <Link href={`/marketplace/agent/${id}`} className="text-xs text-accent-cyan flex items-center gap-1 hover:underline">View <ArrowRight className="w-3 h-3" /></Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { label: 'Agent Studio', desc: 'Create a new Agent', href: '/studio', icon: Plus, color: 'text-accent-purple' },
            { label: 'Settings', desc: 'Configure endpoints', href: '/user/settings', icon: Settings, color: 'text-accent-cyan' },
            { label: 'Docs', desc: 'SDK & API reference', href: '#', icon: FileText, color: 'text-text-muted' },
          ].map(a => (
            <Link key={a.label} href={a.href} className="glass-card glass-card-hover p-5">
              <a.icon className={`w-5 h-5 ${a.color} mb-3`} />
              <div className="font-semibold text-sm mb-1">{a.label}</div>
              <div className="text-xs text-text-muted">{a.desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </AppLayout>
  )
}
