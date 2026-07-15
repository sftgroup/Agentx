'use client'

import { useState } from 'react'
import { useAccount, useConnect, useDisconnect, useChainId } from 'wagmi'
import { Wallet, LogOut, ChevronDown } from 'lucide-react'

export function WalletConnect() {
  const [showConnectors, setShowConnectors] = useState(false)
  const { address, isConnected } = useAccount()
  const { connect, connectors, error, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`

  const getChainName = (id: number) => {
    const chains: Record<number, string> = {
      1: 'Ethereum', 11155111: 'Sepolia', 19505: 'OxaChain L1', 300: 'zkSync Testnet',
      80001: 'Polygon Mumbai', 84531: 'Base Sepolia',
    }
    return chains[id] || `Chain ${id}`
  }

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <div className="px-2.5 py-1 rounded-lg bg-bg-card border border-white/10 text-xs font-medium text-text-secondary">
          {getChainName(chainId)}
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg">
          <Wallet className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-sm font-medium text-text-primary">{formatAddress(address)}</span>
        </div>
        <button onClick={() => disconnect()} className="p-1.5 text-text-muted hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10" title="Disconnect">
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowConnectors(!showConnectors)}
        className="btn-primary text-sm py-2 px-4"
      >
        <Wallet className="w-4 h-4" />
        <span>Connect Wallet</span>
        <ChevronDown className="w-3 h-3" />
      </button>

      {showConnectors && (
        <div className="absolute top-full right-0 mt-2 w-64 glass-card p-2 z-50">
          <h3 className="text-xs font-semibold text-text-muted mb-2 px-2 uppercase tracking-wider">Select Wallet</h3>
          {isPending && <div className="text-xs text-accent-purple mb-2 text-center">Connecting...</div>}
          {connectors.map((connector) => (
            <button
              key={connector.uid}
              onClick={() => { connect({ connector }); setShowConnectors(false) }}
              disabled={isPending}
              className="flex items-center justify-between w-full px-3 py-2.5 text-left hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 bg-white/5 rounded flex items-center justify-center">
                  <Wallet className="w-3 h-3 text-text-muted" />
                </div>
                <span className="text-sm font-medium text-text-primary">{connector.name}</span>
              </div>
              {isPending && <div className="w-1.5 h-1.5 bg-accent-purple rounded-full animate-pulse" />}
            </button>
          ))}
          {error && (
            <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">{error.message}</div>
          )}
        </div>
      )}
      {showConnectors && <div className="fixed inset-0 z-40" onClick={() => setShowConnectors(false)} />}
    </div>
  )
}
