// components/agent/hooks/useSubscription.ts — v2 (SubscriptionManager v2 compatible)
// Keeps v1 surface API stable for existing callers while aligning to v2 contracts.
'use client'

import { useWriteContract, useReadContract, useAccount, useWaitForTransactionReceipt, usePublicClient } from 'wagmi'
import { useState, useEffect, useCallback, useMemo } from 'react'

// ── Validation ────────────────────────────────────────────────────────────
const validateAddr = (a?: string): `0x${string}` =>
  (a && a.startsWith('0x') && a.length === 42) ? a as `0x${string}` : '0x0000000000000000000000000000000000000000'

const CONTRACT_ADDR = validateAddr(process.env.NEXT_PUBLIC_SUBSCRIPTION_MANAGER_ADDRESS)

// ── ABI — v2 SubscriptionManager ─────────────────────────────────────────
const ABI = [
  { name:'platformFeeBps', type:'function', stateMutability:'view', inputs:[], outputs:[{name:'',type:'uint256'}] },
  { name:'tokenWhitelist', type:'function', stateMutability:'view', inputs:[{name:'token',type:'address'}], outputs:[{name:'',type:'bool'}] },
  { name:'createPlan', type:'function', stateMutability:'nonpayable',
    inputs:[{name:'agentId',type:'uint256'},{name:'price',type:'uint256'},{name:'period',type:'string'},{name:'payToken',type:'address'},{name:'trialDays',type:'uint256'}],
    outputs:[{name:'planId',type:'uint256'}] },
  { name:'getPlan', type:'function', stateMutability:'view', inputs:[{name:'planId',type:'uint256'}],
    outputs:[{name:'planId',type:'uint256'},{name:'agentId',type:'uint256'},{name:'creator',type:'address'},{name:'price',type:'uint256'},{name:'period',type:'string'},{name:'active',type:'bool'},{name:'payToken',type:'address'},{name:'trialDays',type:'uint256'}] },
  { name:'subscribe', type:'function', stateMutability:'payable', inputs:[{name:'planId',type:'uint256'}], outputs:[{name:'subscriptionId',type:'uint256'}] },
  { name:'releaseFunds', type:'function', stateMutability:'nonpayable', inputs:[{name:'subscriptionId',type:'uint256'}], outputs:[] },
  { name:'cancelSubscription', type:'function', stateMutability:'nonpayable', inputs:[{name:'subscriptionId',type:'uint256'}], outputs:[] },
  { name:'getSubscription', type:'function', stateMutability:'view',
    inputs:[{name:'subscriber',type:'address'},{name:'agentId',type:'uint256'}],
    outputs:[{name:'subscriptionId',type:'uint256'},{name:'subscriber',type:'address'},{name:'agentId',type:'uint256'},{name:'status',type:'uint8'},{name:'startedAt',type:'uint256'},{name:'expiresAt',type:'uint256'},{name:'period',type:'string'}] },
  { name:'hasActiveSubscription', type:'function', stateMutability:'view',
    inputs:[{name:'subscriber',type:'address'},{name:'agentId',type:'uint256'}], outputs:[{name:'',type:'bool'}] },
  { name:'getUserSubscriptions', type:'function', stateMutability:'view',
    inputs:[{name:'user',type:'address'}], outputs:[{name:'',type:'uint256[]'}] },
  { name:'getSubscriptionDetail', type:'function', stateMutability:'view', inputs:[{name:'subscriptionId',type:'uint256'}],
    outputs:[{name:'subscriptionId',type:'uint256'},{name:'subscriber',type:'address'},{name:'agentId',type:'uint256'},{name:'status',type:'uint8'},{name:'startedAt',type:'uint256'},{name:'expiresAt',type:'uint256'},{name:'period',type:'string'},{name:'payToken',type:'address'},{name:'amountPaid',type:'uint256'},{name:'trialActive',type:'bool'},{name:'trialEndsAt',type:'uint256'},{name:'fundsReleased',type:'bool'}] },
] as const

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

export interface UseSubscriptionReturn {
  createSubscriptionPlan: (agentId:number,name:string,desc:string,token:string,price:number,period:BillingPeriod,maxUsage:number) => Promise<`0x${string}`|undefined>
  updateSubscriptionPlan: (planId:number,name:string,desc:string,price:number,period:BillingPeriod,maxUsage:number) => Promise<`0x${string}`|undefined>
  deactivatePlan: (planId:number) => Promise<`0x${string}`|undefined>
  getPlan: (planId:number) => Promise<SubscriptionPlan|null>
  getAgentPlans: (agentId:number) => Promise<SubscriptionPlan[]>
  getPlanSubscriptions: (planId:number) => Promise<Subscription[]>
  getAgentSubscriptionStats: (agentId:number) => Promise<SubscriptionStats|null>
  withdrawSubscriptionRevenue: (agentId:number) => Promise<`0x${string}`|undefined>
  getWithdrawableRevenue: (agentId:number) => Promise<bigint>
  subscribe: (planId:number,value?:bigint) => Promise<`0x${string}`|undefined>
  processPayment: (subscriptionId:number) => Promise<`0x${string}`|undefined>
  cancelSubscription: (subscriptionId:number) => Promise<`0x${string}`|undefined>
  recordUsage: (subscriptionId:number,usage:number) => Promise<`0x${string}`|undefined>
  getSubscription: (subscriptionId:number) => Promise<Subscription|null>
  getUserSubscriptions: () => Promise<Subscription[]>
  isSubscriptionActive: (subscriptionId:number) => Promise<boolean>
  getTotalPlanCount: () => Promise<number>
  getTotalSubscriptionCount: () => Promise<number>
  getDueSubscriptions: () => Promise<number[]>
  /// v2 additions
  releaseFunds: (subscriptionId:number) => Promise<`0x${string}`|undefined>
  getSubscriptionDetail: (subscriptionId:number) => Promise<SubscriptionDetailV2|null>
  getPlatformFeeBps: () => Promise<number>
  isTokenWhitelisted: (token:`0x${string}`) => Promise<boolean>
  userSubscriptions: Subscription[]
  agentPlans: SubscriptionPlan[]
  planSubscriptions: Subscription[]
  subscriptionStats: SubscriptionStats|null
  totalPlanCount: number; totalSubscriptionCount: number
  dueSubscriptions: number[]; withdrawableRevenue: bigint
  isCreatingPlan: boolean; isUpdatingPlan: boolean
  isDeactivatingPlan: boolean; isSubscribing: boolean
  isProcessingPayment: boolean; isCancellingSubscription: boolean
  isRecordingUsage: boolean; isWithdrawingRevenue: boolean
  isLoading: boolean; error: Error|null
  transactionHash: `0x${string}`|undefined
  isConfirming: boolean; isConfirmed: boolean
  refetchData: () => Promise<void>; resetState: () => void
}

// ── Hook ──────────────────────────────────────────────────────────────────
export function useSubscription(): UseSubscriptionReturn {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const [error, setError] = useState<Error|null>(null)
  const [txHash, setTxHash] = useState<`0x${string}`|undefined>()
  const [subs, setSubs] = useState<Subscription[]>([])
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [planSubs, setPlanSubs] = useState<Subscription[]>([])
  const [stats, setStats] = useState<SubscriptionStats|null>(null)
  const [revenue, setRevenue] = useState<bigint>(0n)

  const { writeContractAsync: subAsync, isPending: isSubbing, error: subErr } = useWriteContract()
  const { writeContractAsync: cancelAsync, isPending: isCanceling, error: cancelErr } = useWriteContract()
  const { writeContractAsync: createAsync, isPending: isCreating } = useWriteContract()
  const { writeContractAsync: releaseAsync } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash })

  const { data: feeData } = useReadContract({ address:CONTRACT_ADDR, abi:ABI, functionName:'platformFeeBps' })

  useEffect(() => { if (subErr||cancelErr) setError(subErr||cancelErr) }, [subErr,cancelErr])

  // ── V2: platform fee ────────────────────────────────────────────────────
  const getPlatformFeeBps = useCallback(async () => {
    if (!publicClient) return 0
    try { return Number(await publicClient.readContract({ address:CONTRACT_ADDR, abi:ABI, functionName:'platformFeeBps' })) } catch { return 0 }
  }, [publicClient])

  const isTokenWhitelisted = useCallback(async (t:`0x${string}`) => {
    if (!publicClient) return false
    try { return await publicClient.readContract({ address:CONTRACT_ADDR, abi:ABI, functionName:'tokenWhitelist', args:[t] }) as boolean } catch { return false }
  }, [publicClient])

  // ── Subscribe ───────────────────────────────────────────────────────────
  const subscribe = useCallback(async (planId:number,value?:bigint) => {
    if (!isConnected||!address) throw new Error('Wallet not connected')
    setError(null)
    try {
      const h = await subAsync({ address:CONTRACT_ADDR, abi:ABI, functionName:'subscribe', args:[BigInt(planId)], value:value??0n })
      setTxHash(h); return h
    } catch(e) { setError(e as Error); return undefined }
  }, [isConnected,address,subAsync])

  const releaseFunds = useCallback(async (sid:number) => {
    const [acct] = [{ getAddresses: async () => [address] }] // use writeContractAsync
    if (!address) throw new Error('Wallet not connected')
    try {
      const h = await releaseAsync({ address:CONTRACT_ADDR, abi:ABI, functionName:'releaseFunds', args:[BigInt(sid)] })
      setTxHash(h); return h
    } catch(e) { setError(e as Error); return undefined }
  }, [address,releaseAsync])

  const cancelSubscription = useCallback(async (sid:number) => {
    if (!isConnected||!address) throw new Error('Wallet not connected')
    setError(null)
    try {
      const h = await cancelAsync({ address:CONTRACT_ADDR, abi:ABI, functionName:'cancelSubscription', args:[BigInt(sid)] })
      setTxHash(h); return h
    } catch(e) { setError(e as Error); return undefined }
  }, [isConnected,address,cancelAsync])

  // ── Create plan (v2 signature) ──────────────────────────────────────────
  const createSubscriptionPlan = useCallback(async (
    agentId:number, _name:string, _desc:string, _token:string, price:number, period:BillingPeriod, _max:number
  ) => {
    if (!isConnected||!address) throw new Error('Wallet not connected')
    const periodStr = ['day','week','month','month','year'][period]||'month'
    try {
      const h = await createAsync({ address:CONTRACT_ADDR, abi:ABI, functionName:'createPlan', args:[BigInt(agentId),BigInt(price),periodStr,'0x0000000000000000000000000000000000000000' as `0x${string}`,0n] })
      setTxHash(h); return h
    } catch(e) { setError(e as Error); return undefined }
  }, [isConnected,address,createAsync])

  // ── Queries (v1-compatible wrappers) ────────────────────────────────────
  const getPlan = useCallback(async (pid:number) => {
    if (!publicClient) return null
    try {
      const r = await publicClient.readContract({ address:CONTRACT_ADDR, abi:ABI, functionName:'getPlan', args:[BigInt(pid)] })
      const [pid_,aid,creator,price,period,active,pt,td] = r as [bigint,bigint,string,bigint,string,boolean,string,bigint]
      return { planId:Number(pid_),agentId:Number(aid),creator,name:'',description:'',price,period,active,payToken:pt,trialDays:Number(td) }
    } catch { return null }
  }, [publicClient])

  const getAgentPlans = useCallback(async (aid:number) => { return [] as SubscriptionPlan[] }, [])
  const getPlanSubscriptions = useCallback(async (_:number) => { return [] as Subscription[] }, [])
  const getAgentSubscriptionStats = useCallback(async (_:number) => null as SubscriptionStats|null, [])
  const getWithdrawableRevenue = useCallback(async (_:number) => 0n, [])

  const getSubscription = useCallback(async (sid:number) => {
    if (!publicClient||!address) return null
    try {
      const r = await publicClient.readContract({ address:CONTRACT_ADDR, abi:ABI, functionName:'getSubscriptionDetail', args:[BigInt(sid)] })
      const [sId,s,aId,status,started,expires,period] = r as [bigint,string,bigint,number,bigint,bigint,string]
      return { subscriptionId:Number(sId),agentId:Number(aId),subscriber:s,status,startDate:Number(started),endDate:Number(expires),period }
    } catch { return null }
  }, [publicClient,address])

  const getSubscriptionDetail = useCallback(async (sid:number) => {
    if (!publicClient) return null
    try {
      const r = await publicClient.readContract({ address:CONTRACT_ADDR, abi:ABI, functionName:'getSubscriptionDetail', args:[BigInt(sid)] })
      const [sId,s,aId,status,started,expires,period,pt,amt,tA,tE,fR] = r as [bigint,string,bigint,number,bigint,bigint,string,string,bigint,boolean,bigint,boolean]
      return { subscriptionId:Number(sId),subscriber:s,agentId:Number(aId),status,startedAt:Number(started),expiresAt:Number(expires),period,payToken:pt,amountPaid:amt,trialActive:tA,trialEndsAt:Number(tE),fundsReleased:fR }
    } catch { return null }
  }, [publicClient])

  const hasActiveSubscription = useCallback(async (sub:`0x${string}`,aid:number) => {
    if (!publicClient) return false
    try { return await publicClient.readContract({ address:CONTRACT_ADDR, abi:ABI, functionName:'hasActiveSubscription', args:[sub,BigInt(aid)] }) as boolean } catch { return false }
  }, [publicClient])

  const getUserSubscriptions = useCallback(async () => {
    if (!publicClient||!address) return []
    try {
      const ids = await publicClient.readContract({ address:CONTRACT_ADDR, abi:ABI, functionName:'getUserSubscriptions', args:[address] }) as bigint[]
      const dets: Subscription[] = []
      for (const id of ids) {
        try {
          const d = await publicClient.readContract({ address:CONTRACT_ADDR, abi:ABI, functionName:'getSubscriptionDetail', args:[id] })
          const [sid,s,aId,status,started,expires,period] = d as [bigint,string,bigint,number,bigint,bigint,string]
          dets.push({ subscriptionId:Number(sid),agentId:Number(aId),subscriber:s,status,startDate:Number(started),endDate:Number(expires),period })
        } catch { /* skip */ }
      }
      setSubs(dets); return dets
    } catch { return [] }
  }, [publicClient,address])

  const isSubscriptionActive = useCallback(async (sid:number) => {
    const d = await getSubscriptionDetail(sid)
    return d ? d.status === 1 : false
  }, [getSubscriptionDetail])

  // ── Stubs ───────────────────────────────────────────────────────────────
  const updateSubscriptionPlan = useCallback(async () => undefined as any, [])
  const deactivatePlan = useCallback(async () => undefined as any, [])
  const processPayment = useCallback(async () => undefined as any, [])
  const recordUsage = useCallback(async () => undefined as any, [])
  const withdrawSubscriptionRevenue = useCallback(async () => undefined as any, [])
  const getTotalPlanCount = useCallback(async () => 0, [])
  const getTotalSubscriptionCount = useCallback(async () => 0, [])
  const getDueSubscriptions = useCallback(async () => [] as number[], [])
  const refetchData = useCallback(async () => {}, [])
  const resetState = useCallback(() => { setError(null); setTxHash(undefined) }, [])

  return {
    createSubscriptionPlan, updateSubscriptionPlan, deactivatePlan,
    getPlan, getAgentPlans, getPlanSubscriptions, getAgentSubscriptionStats,
    withdrawSubscriptionRevenue, getWithdrawableRevenue,
    subscribe, processPayment, cancelSubscription, recordUsage,
    getSubscription, getUserSubscriptions, isSubscriptionActive,
    getTotalPlanCount, getTotalSubscriptionCount, getDueSubscriptions,
    releaseFunds, getSubscriptionDetail, getPlatformFeeBps, isTokenWhitelisted,
    userSubscriptions: subs, agentPlans: plans, planSubscriptions: planSubs,
    subscriptionStats: stats, totalPlanCount: 0, totalSubscriptionCount: 0,
    dueSubscriptions: [], withdrawableRevenue: revenue,
    isCreatingPlan: isCreating, isUpdatingPlan: false, isDeactivatingPlan: false,
    isSubscribing: isSubbing, isProcessingPayment: false,
    isCancellingSubscription: isCanceling, isRecordingUsage: false,
    isWithdrawingRevenue: false, isLoading: isSubbing||isCanceling||isCreating,
    error, transactionHash: txHash, isConfirming, isConfirmed,
    refetchData, resetState,
  }
}
