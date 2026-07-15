'use client'

import Link from 'next/link'
import { Brain, Hexagon, Sparkles, Menu } from 'lucide-react'
import { WalletConnect } from '@/components/wallet/WalletConnect'
import { WalletStatus } from '@/components/wallet/WalletStatus'
import { NetworkSwitcher } from '@/components/wallet/NetworkSwitcher'

export function Header() {
  return (
    <header className="border-b border-white/5 bg-bg/80 backdrop-blur-xl sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-purple to-accent-cyan flex items-center justify-center ring-1 ring-white/10">
                <Hexagon className="w-4.5 h-4.5 text-white" strokeWidth={2} />
              </div>
              <span className="text-lg font-bold tracking-tight text-text-primary group-hover:text-accent-purple transition-colors">AgentX</span>
            </Link>
          </div>

          <nav className="hidden md:flex items-center gap-6">
            <Link href="/marketplace" className="text-text-secondary hover:text-text-primary font-medium text-sm transition-colors">Marketplace</Link>
            <Link href="/studio" className="text-text-secondary hover:text-text-primary font-medium text-sm transition-colors">
              Studio
              <Sparkles className="w-3 h-3 inline ml-1 text-accent-purple" />
            </Link>
            <Link href="/dashboard/agent" className="text-text-secondary hover:text-text-primary font-medium text-sm transition-colors">Dashboard</Link>
          </nav>

          <div className="flex items-center gap-4">
            <div className="md:hidden"><WalletStatus /></div>
            <div className="hidden md:flex items-center gap-3">
              <NetworkSwitcher />
              <WalletConnect />
            </div>
            <button className="md:hidden p-2 text-text-muted hover:text-text-primary">
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
