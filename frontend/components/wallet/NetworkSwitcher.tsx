'use client'

import { useState } from 'react'
import { useSwitchChain, useChainId } from 'wagmi'
import { Globe, CheckCircle } from 'lucide-react'
import { oxaChain } from '@/lib/wagmi/config'

export function NetworkSwitcher() {
  const [showNetworks, setShowNetworks] = useState(false)
  const { switchChain, isPending } = useSwitchChain()
  const chainId = useChainId()
  const isCorrectChain = chainId === oxaChain.id

  return (
    <div className="relative">
      <button
        onClick={() => setShowNetworks(!showNetworks)}
        disabled={isPending}
        className="btn-ghost text-sm py-1.5"
      >
        <Globe className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{isCorrectChain ? oxaChain.name : 'Wrong Network'}</span>
      </button>

      {showNetworks && (
        <div className="absolute top-full right-0 mt-2 w-44 glass-card p-2 z-50">
          <h3 className="text-[10px] font-semibold text-text-muted mb-1 px-2 uppercase tracking-wider">Select Network</h3>
          <button
            onClick={() => { switchChain({ chainId: oxaChain.id }); setShowNetworks(false) }}
            disabled={isPending || isCorrectChain}
            className="flex items-center justify-between w-full px-3 py-2 text-left hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50"
          >
            <span className="text-xs font-medium text-text-primary">
              {oxaChain.name} {isCorrectChain && <CheckCircle className="inline w-3 h-3 text-green-400 ml-1" />}
            </span>
            {isPending && <div className="w-1.5 h-1.5 bg-accent-purple rounded-full animate-pulse" />}
          </button>
        </div>
      )}
      {showNetworks && <div className="fixed inset-0 z-40" onClick={() => setShowNetworks(false)} />}
    </div>
  )
}
