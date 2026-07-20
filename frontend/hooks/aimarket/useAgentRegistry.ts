// hooks/aimarket/useAgentRegistry.ts
// v3 — Gateway API-backed agent registry (no direct contract calls)
'use client'

import { useQuery } from '@tanstack/react-query'
import { useState, useEffect } from 'react'

export interface AgentInfo {
  id: number
  owner: string
  name: string
  description: string
  tags: string[]
  capabilities: string[]
  synced_at?: string
  created_at?: string
  updated_at?: string
  token_uri?: string
  metadata_json?: Record<string, unknown>
  // compatibility
  metadata?: { name: string; description: string; tags: string[]; capabilities: string[]; pricing?: { type: string; amount: string } }
  isLoaded: boolean
  hasError: boolean
  status: 'success' | 'no-metadata' | 'metadata-failed' | 'error'
  hasSubscriptionPlans: boolean
}

export interface UseAgentRegistryReturn {
  agents: AgentInfo[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  totalAgents: number
  loadedCount: number
  errorCount: number
  refetch: () => void
  fetchMore: (count: number) => Promise<void>
}

const GATEWAY_URL = process.env.NEXT_PUBLIC_AGENTX_GATEWAY_URL || 'http://43.156.99.215:3090'

function mapAgent(row: any): AgentInfo {
  return {
    id: row.id,
    owner: row.owner,
    name: row.name,
    description: row.description,
    tags: row.tags || [],
    capabilities: row.capabilities || [],
    synced_at: row.synced_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    token_uri: row.token_uri,
    metadata_json: row.metadata_json,
    metadata: {
      name: row.name,
      description: row.description,
      tags: row.tags || [],
      capabilities: row.capabilities || [],
    },
    isLoaded: true,
    hasError: false,
    status: 'success',
    hasSubscriptionPlans: false,
  }
}

export function useAgentRegistry(batchSize: number = 12): UseAgentRegistryReturn {
  const [localAgents, setLocalAgents] = useState<AgentInfo[]>([])

  const { data, isLoading, isError, error, refetch: refetchQuery } = useQuery({
    queryKey: ['agents', 'gateway'],
    queryFn: async (): Promise<AgentInfo[]> => {
      const res = await fetch(`${GATEWAY_URL}/api/v1/agents`)
      if (!res.ok) throw new Error(`Gateway returned ${res.status}`)
      const json = await res.json()
      return (json.agents || []).map(mapAgent)
    },
    staleTime: 60_000,
    retry: 2,
  })

  useEffect(() => {
    if (data?.length) setLocalAgents(data)
  }, [data])

  const handleFetchMore = async (_count: number) => {
    // Gateway returns all agents at once, no pagination needed
  }

  return {
    agents: localAgents,
    isLoading,
    isError,
    error: error as Error | null,
    totalAgents: localAgents.length,
    loadedCount: localAgents.filter(a => a.isLoaded).length,
    errorCount: localAgents.filter(a => a.hasError).length,
    refetch: () => refetchQuery(),
    fetchMore: handleFetchMore,
  }
}

// ── useAgentDetail ──────────────────────────────────────────────────────────

export function useAgentDetail(agentId: number) {
  return useQuery({
    queryKey: ['agent', 'gateway', 'detail', agentId],
    queryFn: async () => {
      if (!agentId || agentId <= 0) return null
      const res = await fetch(`${GATEWAY_URL}/api/v1/agents/${agentId}`)
      if (!res.ok) {
        if (res.status === 404) return null
        throw new Error(`Gateway returned ${res.status}`)
      }
      const row = await res.json()
      return mapAgent(row)
    },
    enabled: !!agentId && agentId > 0,
    staleTime: 60_000,
    retry: 1,
  })
}
