'use client'

import Link from 'next/link'
import { Brain, Hexagon, Sparkles } from 'lucide-react'
import { WalletConnect } from '@/components/wallet/WalletConnect'
import { WalletStatus } from '@/components/wallet/WalletStatus'
import { NetworkSwitcher } from '@/components/wallet/NetworkSwitcher'
import { MobileNav } from '@/components/layout/MobileNav'

export function Header() {
  return (
    <header className="border-b border-white/5 bg-bg/80 backdrop-blur-xl sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Left: Logo + Nav */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-purple to-accent-cyan flex items-center justify-center ring-1 ring-white/10">
                <Hexagon className="w-4.5 h-4.5 text-white" strokeWidth={2} />
              </div>
              <span className="text-lg font-bold tracking-tight text-text-primary group-hover:text-accent-purple transition-colors">AgentX</span>
            </Link>
            <nav className="hidden md:flex items-center gap-6 ml-4">
              <Link href="/marketplace" className="text-text-secondary hover:text-text-primary font-medium text-sm transition-colors">Marketplace</Link>
              <Link href="/studio" className="text-text-secondary hover:text-text-primary font-medium text-sm transition-colors">
                Studio <Sparkles className="w-3 h-3 inline ml-1 text-accent-purple" />
              </Link>
              <Link href="/dashboard/agent" className="text-text-secondary hover:text-text-primary font-medium text-sm transition-colors">Dashboard</Link>
            </nav>
          </div>

          {/* Right: Wallet + Mobile Nav */}
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-3">
              <NetworkSwitcher />
              <WalletConnect />
            </div>
            <MobileNav />
          </div>
        </div>
      </div>
    </header>
  )
}
