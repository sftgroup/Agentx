// components/agent/hooks/useSubscription.ts — v2 (SubscriptionManager v2 compatible)
// Keeps v1 surface API stable for existing callers while aligning to v2 contracts.
'use client'

import { useWriteContract, useAccount, useWaitForTransactionReceipt, usePublicClient, useWalletClient } from 'wagmi'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { SubscriptionManager } from '@agentxv2/sdk'
import { SUBSCRIPTION_MANAGER_ABI } from '@/abis/SubscriptionManager'

import { validateAddress as validateAddr, ZERO_ADDRESS } from './contract-address'
import { GATEWAY_URL } from '@/lib/gateway'

const CONTRACT_ADDR = validateAddr(process.env.NEXT_PUBLIC_SUBSCRIPTION_MANAGER_ADDRESS)

// ── Types (stable v1 surface + v2 additions) ─────────────────────────────
export interface Subscription {
  subscriptionId: number; planId?: number; agentId: number
  subscriber: string; status: number; startDate?: number
  nextBillingDate?: number; endDate?: number
  startedAt?: number; expiresAt?: number; period?: string
  currentUsage?: number; totalPaid: bigint; createdAt: number
}
export interface SubscriptionPlan {
  planId: number; agentId: number; creator?: string
  name?: string; description?: string; price: bigint
  period?: string; active?: boolean; payToken?: string; trialDays?: number
  /** v1 dashboard-only fields (not on-chain for v2 plans) */
  token?: string; billingPeriod?: BillingPeriod; maxUsage?: number; createdAt?: number
}
export interface SubscriptionStats {
  totalSubscriptions: bigint; activeSubscriptions: bigint
  totalRevenue: bigint; monthlyRecurringRevenue: bigint
}
export interface SubscriptionDetailV2 {
  subscriptionId: number; subscriber: string; agentId: number
  status: number; startedAt: number; expiresAt: number; period: string
  payToken: string; amountPaid: bigint
  trialActive: boolean; trialEndsAt: number; fundsReleased: boolean
}
export enum SubscriptionStatus { Active=0,Cancelled=1,Expired=2,PaymentFailed=3 }
export enum BillingPeriod { Daily=0,Weekly=1,Monthly=2,Quarterly=3,Yearly=4 }

// On-chain `_periodToSeconds` only recognizes day/week/month/year. Quarterly is
// intentionally NOT mapped — silently mapping it would create a 30-day plan.
export const BILLING_PERIOD_TO_ONCHAIN: Record<BillingPeriod, string> = {
  [BillingPeriod.Daily]: 'day',
  [BillingPeriod.Weekly]: 'week',
  [BillingPeriod.Monthly]: 'month',
  [BillingPeriod.Yearly]: 'year',
  [BillingPeriod.Quarterly]: '', // rejected in createSubscriptionPlan
}

export interface UseSubscriptionReturn {
  createSubscriptionPlan: (agentId:number,name:string,desc:string,token:string,price:number,period:BillingPeriod,maxUsage:number) => Promise<`0x${string}`|undefined>
  getPlan: (planId:number) => Promise<SubscriptionPlan|null>
  getAgentPlans: (agentId:number) => Promise<SubscriptionPlan[]>
  getAgentSubscriptionStats: (agentId:number) => Promise<SubscriptionStats|null>
  subscribe: (planId:number,value?:bigint) => Promise<`0x${string}`|undefined>
  cancelSubscription: (subscriptionId:number) => Promise<`0x${string}`|undefined>
  getSubscription: (subscriptionId:number) => Promise<Subscription|null>
  getUserSubscriptions: () => Promise<Subscription[]>
  isSubscriptionActive: (subscriptionId:number) => Promise<boolean>
  /// v2 additions
  releaseFunds: (subscriptionId:number) => Promise<`0x${string}`|undefined>
  getSubscriptionDetail: (subscriptionId:number) => Promise<SubscriptionDetailV2|null>
  getPlatformFeeBps: () => Promise<number>
  isTokenWhitelisted: (token:`0x${string}`) => Promise<boolean>
  userSubscriptions: Subscription[]
  agentPlans: SubscriptionPlan[]
  subscriptionStats: SubscriptionStats|null
  isCreatingPlan: boolean; isSubscribing: boolean
  isCancellingSubscription: boolean
  isLoading: boolean; error: Error|null
  transactionHash: `0x${string}`|undefined
  isConfirming: boolean; isConfirmed: boolean
  refetchData: () => Promise<void>; resetState: () => void
}

// ── Channel attribution (docs/payment-architecture.md §6) ─────────────────
// Referring channel comes from `?ref=CHANNEL_ID` URL param (set when the
// third-party platform sends the user) or a previously stored value.
function resolveChannelRef(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const urlRef = new URLSearchParams(window.location.search).get('ref')
    if (urlRef) return urlRef
    return window.localStorage.getItem('agentx_channel_ref')
  } catch {
    return null
  }
}

// Report a completed chain subscription to the Gateway so the channel gets
// its share. Fire-and-forget: attribution must never block the subscribe flow.
async function reportChannelAttribution(opts: { subscriber: string; agentId: number; planId?: number }): Promise<void> {
  const channelId = resolveChannelRef()
  if (!channelId) return
  const base = GATEWAY_URL
  try {
    await fetch(`${base}/api/v1/channel/attribute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscriber: opts.subscriber, agentId: opts.agentId, planId: opts.planId, channelId }),
    })
  } catch {
    // ignore — attribution is best-effort
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────
export function useSubscription(): UseSubscriptionReturn {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const [error, setError] = useState<Error|null>(null)
  const [txHash, setTxHash] = useState<`0x${string}`|undefined>()
  const [subs, setSubs] = useState<Subscription[]>([])
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [stats, setStats] = useState<SubscriptionStats|null>(null)

  const [isSubbing, setIsSubbing] = useState(false)
  const { writeContractAsync: cancelAsync, isPending: isCanceling, error: cancelErr } = useWriteContract()
  const { writeContractAsync: createAsync, isPending: isCreating } = useWriteContract()
  const { writeContractAsync: releaseAsync } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash })

  // ── SDK SubscriptionManager (v0.8.0) ────────────────────────────────────
  // Replaces hand-rolled ABI calls with the SDK wrapper: correct struct decoding
  // (getPlan) and event parsing (subscribe → subscriptionId/expiresAt).
  const walletClient = useWalletClient()
  const manager = useMemo(
    () => (publicClient && walletClient.data
      ? new SubscriptionManager({ contractAddress: CONTRACT_ADDR, publicClient, walletClient: walletClient.data })
      : null),
    [publicClient, walletClient.data]
  )

  useEffect(() => { if (cancelErr) setError(cancelErr) }, [cancelErr])

  // ── V2: platform fee ────────────────────────────────────────────────────
  const getPlatformFeeBps = useCallback(async () => {
    if (!publicClient) return 0
    try { return Number(await publicClient.readContract({ address:CONTRACT_ADDR, abi:SUBSCRIPTION_MANAGER_ABI, functionName:'platformFeeBps' })) } catch { return 0 }
  }, [publicClient])

  const isTokenWhitelisted = useCallback(async (t:`0x${string}`) => {
    if (!publicClient) return false
    try { return await publicClient.readContract({ address:CONTRACT_ADDR, abi:SUBSCRIPTION_MANAGER_ABI, functionName:'tokenWhitelist', args:[t] }) as boolean } catch { return false }
  }, [publicClient])

  // ── Subscribe (SDK — event-parsed subscriptionId/expiresAt) ─────────────
  const subscribe = useCallback(async (planId:number,value?:bigint) => {
    if (!isConnected||!address) throw new Error('Wallet not connected')
    if (!manager) throw new Error('Wallet client not ready')
    setError(null); setIsSubbing(true)
    try {
      const result = await manager.subscribe(planId, { valueWei: value })
      setTxHash(result.txHash)
      reportChannelAttribution({ subscriber: result.subscriber, agentId: result.agentId, planId })
      return result.txHash
    } catch(e) { setError(e as Error); return undefined }
    finally { setIsSubbing(false) }
  }, [isConnected,address,manager])

  const releaseFunds = useCallback(async (sid:number) => {
    if (!address) throw new Error('Wallet not connected')
    try {
      const h = await releaseAsync({ address:CONTRACT_ADDR, abi:SUBSCRIPTION_MANAGER_ABI, functionName:'releaseFunds', args:[BigInt(sid)] })
      setTxHash(h); return h
    } catch(e) { setError(e as Error); return undefined }
  }, [address,releaseAsync])

  const cancelSubscription = useCallback(async (sid:number) => {
    if (!isConnected||!address) throw new Error('Wallet not connected')
    setError(null)
    try {
      const h = await cancelAsync({ address:CONTRACT_ADDR, abi:SUBSCRIPTION_MANAGER_ABI, functionName:'cancelSubscription', args:[BigInt(sid)] })
      setTxHash(h); return h
    } catch(e) { setError(e as Error); return undefined }
  }, [isConnected,address,cancelAsync])

  // ── Create plan (v2 signature) ──────────────────────────────────────────
  const createSubscriptionPlan = useCallback(async (
    agentId:number, _name:string, _desc:string, _token:string, price:number, period:BillingPeriod, _max:number
  ) => {
    if (!isConnected||!address) throw new Error('Wallet not connected')
    const periodStr = BILLING_PERIOD_TO_ONCHAIN[period]
    if (!periodStr) throw new Error('Quarterly plans are not supported on-chain (only day/week/month/year)')
    try {
      const h = await createAsync({ address:CONTRACT_ADDR, abi:SUBSCRIPTION_MANAGER_ABI, functionName:'createPlan', args:[BigInt(agentId),BigInt(price),periodStr,ZERO_ADDRESS,BigInt(0)] })
      setTxHash(h); return h
    } catch(e) { setError(e as Error); return undefined }
  }, [isConnected,address,createAsync])

  // ── Queries ─────────────────────────────────────────────────────────────
  // getPlan via SDK — correct struct (tuple components) decoding, same fix
  // already applied to SDK / Gateway indexer / MCP.
  const getPlan = useCallback(async (pid:number) => {
    if (!manager) return null
    try {
      const p = await manager.getPlan(pid)
      return { planId:p.planId, agentId:p.agentId, creator:p.creator, name:'', description:'', price:p.price, period:p.period, active:p.active, payToken:p.payToken, trialDays:p.trialDays }
    } catch { return null }
  }, [manager])

  // getAgentPlans — served by Gateway REST (chain data synced by the indexer),
  // instead of the previous stub that always returned [].
  const getAgentPlans = useCallback(async (aid:number) => {
    const base = GATEWAY_URL
    try {
      const res = await fetch(`${base}/api/v1/agents/${aid}`)
      if (!res.ok) { setPlans([]); return [] }
      const data = await res.json()
      const list: SubscriptionPlan[] = (data.subscriptionPlans || []).map((p: any) => ({
        planId: Number(p.planId),
        agentId: aid,
        creator: p.creator,
        price: typeof p.price === 'string' ? BigInt(p.price) : BigInt(p.price || 0),
        period: p.period,
        active: p.isActive,
        payToken: p.payToken,
        trialDays: p.trialDays,
      }))
      setPlans(list)
      return list
    } catch { setPlans([]); return [] }
  }, [])
  // getAgentSubscriptionStats — served by Gateway REST, aggregated from the
  // chain_subscriptions table the indexer maintains (the v2 contract has no
  // "subscriptions by agent" on-chain view, so events are the only source).
  const getAgentSubscriptionStats = useCallback(async (aid:number) => {
    const base = GATEWAY_URL
    try {
      const res = await fetch(`${base}/api/v1/agents/${aid}/stats`)
      if (!res.ok) { setStats(null); return null }
      const d = await res.json()
      const s: SubscriptionStats = {
        totalSubscriptions: BigInt(d.totalSubscriptions ?? 0),
        activeSubscriptions: BigInt(d.activeSubscriptions ?? 0),
        totalRevenue: BigInt(d.totalRevenue ?? 0),
        monthlyRecurringRevenue: BigInt(d.monthlyRecurringRevenue ?? 0),
      }
      setStats(s)
      return s
    } catch { setStats(null); return null }
  }, [])

  const getSubscription = useCallback(async (sid:number) => {
    if (!publicClient||!address) return null
    try {
      const r = await publicClient.readContract({ address:CONTRACT_ADDR, abi:SUBSCRIPTION_MANAGER_ABI, functionName:'getSubscriptionDetail', args:[BigInt(sid)] })
      const [sId,s,aId,status,started,expires,period] = r as unknown as [bigint,string,bigint,number,bigint,bigint,string]
      return { subscriptionId:Number(sId),agentId:Number(aId),subscriber:s,status,startDate:Number(started),endDate:Number(expires),period,totalPaid:BigInt(0),createdAt:0 }
    } catch { return null }
  }, [publicClient,address])

  const getSubscriptionDetail = useCallback(async (sid:number) => {
    if (!publicClient) return null
    try {
      const r = await publicClient.readContract({ address:CONTRACT_ADDR, abi:SUBSCRIPTION_MANAGER_ABI, functionName:'getSubscriptionDetail', args:[BigInt(sid)] })
      const [sId,s,aId,status,started,expires,period,pt,amt,tA,tE,fR] = r as [bigint,string,bigint,number,bigint,bigint,string,string,bigint,boolean,bigint,boolean]
      return { subscriptionId:Number(sId),subscriber:s,agentId:Number(aId),status,startedAt:Number(started),expiresAt:Number(expires),period,payToken:pt,amountPaid:amt,trialActive:tA,trialEndsAt:Number(tE),fundsReleased:fR }
    } catch { return null }
  }, [publicClient])

  const getUserSubscriptions = useCallback(async () => {
    if (!publicClient||!address) return []
    try {
      const ids = await publicClient.readContract({ address:CONTRACT_ADDR, abi:SUBSCRIPTION_MANAGER_ABI, functionName:'getUserSubscriptions', args:[address] }) as bigint[]
      const dets: Subscription[] = []
      for (const id of ids) {
        try {
          const d = await publicClient.readContract({ address:CONTRACT_ADDR, abi:SUBSCRIPTION_MANAGER_ABI, functionName:'getSubscriptionDetail', args:[id] })
          const [sid,s,aId,status,started,expires,period] = d as unknown as [bigint,string,bigint,number,bigint,bigint,string]
          dets.push({ subscriptionId:Number(sid),agentId:Number(aId),subscriber:s,status,startDate:Number(started),endDate:Number(expires),period,totalPaid:BigInt(0),createdAt:0 })
        } catch { /* skip */ }
      }
      setSubs(dets); return dets
    } catch { return [] }
  }, [publicClient,address])

  const isSubscriptionActive = useCallback(async (sid:number) => {
    const d = await getSubscriptionDetail(sid)
    return d ? d.status === 1 : false
  }, [getSubscriptionDetail])

  const refetchData = useCallback(async () => {}, [])
  const resetState = useCallback(() => { setError(null); setTxHash(undefined) }, [])

  return {
    createSubscriptionPlan,
    getPlan, getAgentPlans, getAgentSubscriptionStats,
    subscribe, cancelSubscription,
    getSubscription, getUserSubscriptions, isSubscriptionActive,
    releaseFunds, getSubscriptionDetail, getPlatformFeeBps, isTokenWhitelisted,
    userSubscriptions: subs, agentPlans: plans,
    subscriptionStats: stats,
    isCreatingPlan: isCreating,
    isSubscribing: isSubbing,
    isCancellingSubscription: isCanceling,
    isLoading: isSubbing||isCanceling||isCreating,
    error, transactionHash: txHash, isConfirming, isConfirmed,
    refetchData, resetState,
  }
}
