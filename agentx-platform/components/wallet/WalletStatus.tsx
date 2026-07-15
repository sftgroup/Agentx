'use client'

import { useAccount, useChainId } from 'wagmi'
import { Wallet, AlertCircle } from 'lucide-react'

export function WalletStatus() {
  const { isConnected, address } = useAccount()
  const chainId = useChainId()

  const getChainName = (id: number) => {
    const chains: Record<number, string> = {
      1: 'ETH', 11155111: 'Sepolia', 300: 'zkSync', 80001: 'Polygon', 84531: 'Base',
    }
    return chains[id] || `Chain ${id}`
  }

  if (!isConnected) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
        <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-xs text-amber-400">Not connected</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <Wallet className="w-3.5 h-3.5 text-text-muted" />
      <span className="text-text-secondary">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
      <span className="px-1.5 py-0.5 bg-accent-purple/10 text-accent-purple rounded text-[10px] font-medium">{getChainName(chainId)}</span>
    </div>
  )
}
