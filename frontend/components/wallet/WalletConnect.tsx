'use client'

import { useState, useEffect } from 'react'
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from 'wagmi'
import { Wallet, LogOut, ChevronDown, CheckCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { oxaChain } from '@/lib/wagmi/config'

const OXACHAIN_ID = oxaChain.id

export function WalletConnect() {
  const { t } = useTranslation()
  const [showConnectors, setShowConnectors] = useState(false)
  const [isSwitching, setIsSwitching] = useState(false)
  const { address, isConnected } = useAccount()
  const { connect, connectors, error, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()

  const isCorrectChain = chainId === OXACHAIN_ID

  // Auto-switch to OxaChain L1 after wallet connects
  useEffect(() => {
    if (isConnected && !isCorrectChain && !isSwitching) {
      setIsSwitching(true)
      switchChain({ chainId: OXACHAIN_ID }, {
        onSuccess: () => setIsSwitching(false),
        onError: () => setIsSwitching(false),
      })
    }
  }, [isConnected, isCorrectChain, isSwitching, switchChain])

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <div className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
          isCorrectChain
            ? 'bg-green-500/10 border-green-500/20 text-green-400'
            : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
        }`}>
          {isCorrectChain ? (
            <span className="flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              {oxaChain.name}
            </span>
          ) : (
            <span>{isSwitching ? t('common.switching') : `${t('common.wrongNetwork')} (${chainId})`}</span>
          )}
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg">
          <Wallet className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-sm font-medium text-text-primary">{formatAddress(address)}</span>
        </div>
        <button onClick={() => disconnect()} className="p-1.5 text-text-muted hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10" title={t('common.disconnect')}>
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
        <span>{t('common.connectWallet')}</span>
        <ChevronDown className="w-3 h-3" />
      </button>

      {showConnectors && (
        <div className="absolute top-full right-0 mt-2 w-64 glass-card p-2 z-50">
          <h3 className="text-xs font-semibold text-text-muted mb-2 px-2 uppercase tracking-wider">{t('common.selectWallet')}</h3>
          {isPending && <div className="text-xs text-accent-purple mb-2 text-center">{t('common.connecting')}</div>}
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
