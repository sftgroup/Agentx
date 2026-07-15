'use client'

import { useState } from 'react'
import { useSwitchChain } from 'wagmi'
import { ChevronDown, Globe } from 'lucide-react'
import { supportedChains } from '@/lib/wagmi/config'

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum', 11155111: 'Sepolia', 300: 'zkSync Testnet',
  80001: 'Polygon Mumbai', 84531: 'Base Sepolia',
}

export function NetworkSwitcher() {
  const [showNetworks, setShowNetworks] = useState(false)
  const { switchChain, isPending } = useSwitchChain()

  return (
    <div className="relative">
      <button
        onClick={() => setShowNetworks(!showNetworks)}
        disabled={isPending}
        className="btn-ghost text-sm py-1.5"
      >
        <Globe className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Network</span>
        <ChevronDown className="w-3 h-3" />
      </button>

      {showNetworks && (
        <div className="absolute top-full right-0 mt-2 w-44 glass-card p-2 z-50">
          <h3 className="text-[10px] font-semibold text-text-muted mb-1 px-2 uppercase tracking-wider">Switch Network</h3>
          {supportedChains.map((chain) => (
            <button
              key={chain.id}
              onClick={() => { switchChain({ chainId: chain.id }); setShowNetworks(false) }}
              disabled={isPending}
              className="flex items-center justify-between w-full px-3 py-2 text-left hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50"
            >
              <span className="text-xs font-medium text-text-primary">{CHAIN_NAMES[chain.id] || `Chain ${chain.id}`}</span>
              {isPending && <div className="w-1.5 h-1.5 bg-accent-purple rounded-full animate-pulse" />}
            </button>
          ))}
        </div>
      )}
      {showNetworks && <div className="fixed inset-0 z-40" onClick={() => setShowNetworks(false)} />}
    </div>
  )
}
