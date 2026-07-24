// hooks/user/useMyAgentIds.ts
// Returns a Set of agent IDs the current user owns OR has an active subscription to.
// Used by My Agents, Dashboard, and A2A pages for tenant-scoped agent selection.
'use client'

import { useMemo } from 'react'
import { useAccount } from 'wagmi'
import { useAgentRegistry } from '@/hooks/aimarket/useAgentRegistry'
import { useUserSubscriptions } from '@/hooks/user/useUserSubscriptions'

export function useMyAgentIds() {
  const { address } = useAccount()
  const { agents: allAgents, isLoading: loadingAgents } = useAgentRegistry(200)
  const { subscriptions, isLoading: loadingSubs } = useUserSubscriptions()

  const myAgentIds = useMemo(() => {
    if (!address) return new Set<number>()

    const ids = new Set<number>()

    // 1. Agents the user owns (from Gateway DB)
    for (const a of allAgents) {
      if (a.owner?.toLowerCase() === address.toLowerCase()) {
        ids.add(a.id)
      }
    }

    // 2. Agents the user has an active subscription to (from contract)
    if (subscriptions) {
      for (const sub of subscriptions) {
        if (sub.isActive) {
          ids.add(Number(sub.agentId))
        }
      }
    }

    return ids
  }, [allAgents, subscriptions, address])

  return {
    myAgentIds,
    isLoading: loadingAgents || loadingSubs,
    total: myAgentIds.size,
  }
}
