// components/guard/SubscriptionGuard.tsx — Universal subscription gate
//
// Wraps any page/component that requires an active subscription to access.
// Checks on-chain with SubscriptionManager.hasActiveSubscription(address, agentId).
//
// Usage:
//   <SubscriptionGuard agentId={5}>
//     <ChatPage />         ← only rendered when subscription is active
//   </SubscriptionGuard>
// Or with render props:
//   <SubscriptionGuard agentId={5}>
//     {({ isValid }) => isValid ? <ChatPage /> : <LockedView />}
//   </SubscriptionGuard>
// ---------------------------------------------------------------------------

'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { AlertCircle, Lock, Loader2, ExternalLink } from 'lucide-react'
import Link from 'next/link'

// ── SubscriptionManager ABI (minimal) ──────────────────────────────────────

const SUBSCRIPTION_MANAGER_ABI = [
  {
    name: 'hasActiveSubscription',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'subscriber', type: 'address' },
      { name: 'agentId', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

// ── Context ────────────────────────────────────────────────────────────────

interface SubscriptionGuardContext {
  agentId: number
  isValid: boolean
  isLoading: boolean
  error: Error | null
  checkAgain: () => void
}

const GuardCtx = createContext<SubscriptionGuardContext>({
  agentId: 0,
  isValid: false,
  isLoading: true,
  error: null,
  checkAgain: () => {},
})

export const useSubscriptionGuard = () => useContext(GuardCtx)

// ── Props ──────────────────────────────────────────────────────────────────

export interface SubscriptionGuardProps {
  agentId: number
  children: React.ReactNode | ((ctx: SubscriptionGuardContext) => React.ReactNode)
  /** Fallback UI when no subscription (overrides built-in gate screen) */
  fallback?: React.ReactNode
  /** Address to check (defaults to connected wallet) */
  subscriber?: `0x${string}`
}

// ── Address helper ─────────────────────────────────────────────────────────

function getSubscriptionManagerAddress(): `0x${string}` {
  const addr = process.env.NEXT_PUBLIC_SUBSCRIPTION_MANAGER_ADDRESS
  if (addr && /^0x[a-fA-F0-9]{40}$/.test(addr)) return addr as `0x${string}`
  return '0xC15fE80b9d800abb72121F353a6ae6d6E9077E63'
}

// ── Component ──────────────────────────────────────────────────────────────

export function SubscriptionGuard({
  agentId,
  children,
  fallback,
  subscriber: subscriberOverride,
}: SubscriptionGuardProps) {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()

  const [isValid, setIsValid] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const subscriber = subscriberOverride ?? address

  const checkSubscription = useCallback(async () => {
    if (!subscriber || !publicClient || !isConnected) {
      setIsValid(false)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const result = await publicClient.readContract({
        address: getSubscriptionManagerAddress(),
        abi: SUBSCRIPTION_MANAGER_ABI,
        functionName: 'hasActiveSubscription',
        args: [subscriber, BigInt(agentId)],
      })
      setIsValid(result as boolean)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Subscription check failed'))
      setIsValid(false)
    } finally {
      setIsLoading(false)
    }
  }, [subscriber, publicClient, isConnected, agentId])

  useEffect(() => {
    checkSubscription()
  }, [checkSubscription])

  const ctx: SubscriptionGuardContext = {
    agentId,
    isValid,
    isLoading,
    error,
    checkAgain: checkSubscription,
  }

  // ── Render children (with context injection) ──────────────────────────
  if (isValid) {
    if (typeof children === 'function') {
      return <>{children(ctx)}</>
    }
    return <>{children}</>
  }

  // ── Custom fallback ───────────────────────────────────────────────────
  if (fallback) return <>{fallback}</>

  // ── Built-in gate screen ──────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <Loader2 className="w-10 h-10 text-accent-purple animate-spin mx-auto mb-4" />
        <p className="body text-text-secondary">Checking subscription...</p>
      </div>
    )
  }

  if (!isConnected) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <AlertCircle className="w-16 h-16 text-accent-purple/40 mx-auto mb-4" />
        <h2 className="heading-md mb-3">Connect Wallet Required</h2>
        <p className="body text-text-muted mb-6">
          Connect your wallet to verify your subscription status.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto text-center py-20">
      <Lock className="w-16 h-16 text-accent-purple/40 mx-auto mb-4" />
      <h2 className="heading-md mb-3">Subscription Required</h2>
      <p className="body text-text-muted mb-2">
        You need an active subscription to access this Agent's content.
      </p>
      {error && (
        <p className="text-xs text-red-400/60 mb-6">{error.message}</p>
      )}
      <div className="flex gap-4 justify-center mt-6">
        <Link
          href={`/marketplace/agent/${agentId}`}
          className="px-6 py-3 rounded-xl bg-accent-purple hover:bg-accent-purple/90 text-white transition-colors flex items-center gap-2"
        >
          <ExternalLink className="w-4 h-4" /> View Plans
        </Link>
        <Link
          href="/marketplace"
          className="px-6 py-3 rounded-xl border border-white/10 hover:bg-white/5 text-text-secondary transition-colors"
        >
          Browse Marketplace
        </Link>
      </div>
    </div>
  )
}

// ── Convenience hook ──────────────────────────────────────────────────────

export function useHasActiveSubscription(agentId: number) {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const [isValid, setIsValid] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!address || !publicClient || !isConnected) {
      setIsValid(false)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    publicClient
      .readContract({
        address: getSubscriptionManagerAddress(),
        abi: SUBSCRIPTION_MANAGER_ABI,
        functionName: 'hasActiveSubscription',
        args: [address, BigInt(agentId)],
      })
      .then(r => setIsValid(r as boolean))
      .catch(() => setIsValid(false))
      .finally(() => setIsLoading(false))
  }, [address, publicClient, isConnected, agentId])

  return { isValid, isLoading }
}
