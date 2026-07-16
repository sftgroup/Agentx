// app/a2a/page.tsx — A2A Tasks (Agent-to-Agent Collaboration)
'use client'

import { AppLayout } from '@/components/layout/AppLayout'
import { useAccount } from 'wagmi'
import {
  Cpu, ArrowRight, Activity, CheckCircle, Clock, AlertCircle, Sparkles, RefreshCw, Plus, Shield, Network, Terminal
} from 'lucide-react'
import Link from 'next/link'

export default function A2ATasksPage() {
  const { isConnected } = useAccount()
  // A2A Protocol is on-chain — tasks are created/queried via contract calls.
  // Until full task list indexer is available, show protocol capabilities and guide.
  const capabilities = [
    { icon: Shield, title: 'Multi-Agent Pipeline', desc: 'Chain agents together: Audit → Deploy → Monitor in a single A2A workflow.' },
    { icon: Network, title: 'Decentralized Routing', desc: 'Agents discover each other via on-chain registry. No central orchestrator needed.' },
    { icon: Terminal, title: 'Verified Execution', desc: 'Every step logged on-chain with ZK proofs. Outputs cryptographically verified.' },
  ]

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="heading-md flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-accent-cyan/10 flex items-center justify-center"><Cpu className="w-5 h-5 text-accent-cyan" /></div>
              A2A Tasks
            </h1>
            <p className="body text-text-secondary mt-1">Agent-to-Agent collaboration tasks — build autonomous AI workflows</p>
          </div>
          <Link href="/a2a/create" className="btn-primary text-sm py-2">
            <Plus className="w-4 h-4" /> New Task
          </Link>
        </div>

        {/* Explain card */}
        <div className="glass-card p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-accent-cyan/5 blur-[60px] rounded-full" />
          <div className="relative">
            <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <Activity className="w-5 h-5 text-accent-cyan" /> How A2A Works
            </h2>
            <div className="grid md:grid-cols-3 gap-4 mt-4">
              {[
                { step: '1', title: 'Orchestrator', desc: 'Define a pipeline: input → Agent A → Agent B → output. Each step is a verified A2A call on-chain.' },
                { step: '2', title: 'Verification', desc: 'Every agent interaction is logged with ZK proofs. Outputs are cryptographically verified before next step.' },
                { step: '3', title: 'Settlement', desc: 'Fees flow through SubscriptionManager. Each agent receives its share automatically.' },
              ].map(s => (
                <div key={s.step} className="p-4 rounded-xl bg-white/3 border border-white/5">
                  <div className="text-xs font-bold text-accent-cyan/60 mb-2">STEP {s.step}</div>
                  <div className="font-medium text-sm mb-1">{s.title}</div>
                  <div className="text-xs text-text-muted leading-relaxed">{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Capabilities grid */}
        <div className="grid md:grid-cols-3 gap-4">
          {capabilities.map((c, i) => (
            <div key={i} className="glass-card glass-card-hover p-6">
              <div className="w-10 h-10 rounded-xl bg-accent-cyan/10 flex items-center justify-center mb-4">
                <c.icon className="w-5 h-5 text-accent-cyan" />
              </div>
              <h3 className="font-semibold mb-2">{c.title}</h3>
              <p className="text-sm text-text-secondary leading-relaxed">{c.desc}</p>
            </div>
          ))}
        </div>

        {/* Coming soon */}
        {!isConnected ? (
          <div className="text-center py-16 glass-card">
            <Cpu className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-30" />
            <h3 className="font-semibold mb-1">Connect Your Wallet</h3>
            <p className="body text-text-muted">Connect to view and create A2A tasks.</p>
          </div>
        ) : (
          <div className="text-center py-16 glass-card">
            <div className="w-16 h-16 rounded-2xl bg-accent-cyan/10 flex items-center justify-center mx-auto mb-4">
              <ArrowRight className="w-8 h-8 text-accent-cyan/40" />
            </div>
            <h3 className="font-semibold mb-1">A2A Task Dashboard</h3>
            <p className="body text-text-muted mb-4 max-w-md mx-auto">
              Full task tracking with on-chain indexing is coming soon. For now, create and complete A2A tasks directly from&nbsp;
              <Link href="/marketplace" className="text-accent-cyan hover:underline">any Agent page</Link>.
            </p>
            <Link href="/a2a/create" className="btn-primary text-sm inline-block"><Plus className="w-4 h-4" /> Create Task</Link>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
