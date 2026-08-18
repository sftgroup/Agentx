// ---------------------------------------------------------------------------
// AgentX — AutoRenewCard (ERC-4337 session-key auto-renew)
// ---------------------------------------------------------------------------
// One-time authorize (Kernel enable UserOp, signed with raw eth_sign of the
// enable digest) → Gateway renews the chain subscription with the session key.
// Flow: enable (session + deploy) → eth_sign(digest) → confirm → funded smart
// account. Requires the wallet to hold ETH for gas on the smart account.
// Lazy gateway auth: the wallet is asked to sign in (JWT) only when the user
// actually interacts with auto-renew, not on page load.
// ---------------------------------------------------------------------------
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAccount, useWalletClient } from 'wagmi'
import { Copy, ExternalLink, Loader2, RefreshCw, ShieldCheck, Sparkles, Wallet } from 'lucide-react'
import { GATEWAY_URL } from '@/lib/gateway'
import { useGatewayAuth } from '@/hooks/useGatewayAuth'
import {
  listAutoRenew,
  enableAutoRenew,
  confirmAutoRenew,
  disableAutoRenew,
  resumeAutoRenew,
  type AutoRenewRow,
  type EnableAutoRenewResult,
} from '@/lib/auto-renew'

interface AutoRenewCardProps {
  agentId: number
  planId: number
  subscriptionId: number
  /** 当前订阅价格（wei），作为 session valueLimit/dailyLimit */
  planPriceWei: string
  /** 展示用价格标签，如 "0.001 OXA / period" */
  priceDisplay: string
  /** 当前订阅是否 active（仅 active 可开启自动续订） */
  isActive: boolean
  expiresAt?: bigint
}

type Step =
  | 'idle'
  | 'enabling'
  | 'pending-sign'
  | 'confirming'
  | 'enabled'
  | 'paused'
  | 'disabling'
  | 'disabled'
  | 'error'

export function AutoRenewCard({ agentId, planId, subscriptionId, planPriceWei, priceDisplay, isActive, expiresAt }: AutoRenewCardProps) {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  // lazy: 只有用户点击时才请求 gateway JWT（避免进页面就弹签名）
  const { accessToken, isLoading: authLoading, authenticate } = useGatewayAuth(GATEWAY_URL, { lazy: true })

  const [step, setStep] = useState<Step>('idle')
  const [row, setRow] = useState<AutoRenewRow | null>(null)
  const [draft, setDraft] = useState<EnableAutoRenewResult | null>(null)
  const [error, setError] = useState<string>('')
  const [info, setInfo] = useState<string>('')
  const [copied, setCopied] = useState(false)

  const refresh = useCallback(async (token: string) => {
    try {
      const rows = await listAutoRenew(token)
      const mine = rows.find(r => r.agent_id === agentId && r.plan_id === planId) ?? null
      setRow(mine)
      if (mine) {
        setStep(
          mine.renew_status === 'enabled' ? 'enabled' :
          mine.renew_status === 'paused' ? 'paused' :
          mine.renew_status === 'disabled' ? 'disabled' : 'pending-sign',
        )
      } else {
        setStep(isActive ? 'idle' : 'disabled')
      }
      setError('')
    } catch (e: any) {
      setStep('error')
      setError(e?.message ?? String(e))
    }
  }, [agentId, planId, isActive])

  // 认证成功后加载状态
  useEffect(() => {
    if (accessToken) void refresh(accessToken)
  }, [accessToken, refresh])

  // —— 开启：创建 session + 部署账户，返回 enable digest ——
  const handleEnable = async () => {
    if (!accessToken) { setError('Please sign in first'); setStep('error'); return }
    setError(''); setInfo(''); setStep('enabling')
    try {
      const draft = await enableAutoRenew(accessToken, {
        agentId, planId, subscriptionId, planPriceWei,
      })
      setDraft(draft)
      setStep('pending-sign')
      setInfo(`Smart account ready at ${draft.accountAddress.slice(0, 10)}…${draft.accountAddress.slice(-6)}. Review and sign the enable request.`)
    } catch (e: any) {
      setStep('error')
      setError(e?.message ?? String(e))
    }
  }

  // —— 授权：eth_sign 裸 ECDSA（Kernel ECDSA validator 需要，非 personal_sign）——
  const handleSignAndConfirm = async () => {
    if (!draft?.digest || !walletClient || !address) { setError('Wallet not ready — reconnect and try again'); setStep('error'); return }
    if (!accessToken) { setError('Not authenticated — sign in first'); setStep('error'); return }
    setError(''); setStep('confirming')
    try {
      // 仅对 32 字节 digest 做 eth_sign；Kernel 的 enableDigest 是 EIP-712 digest，
      // validator 用 ecrecover(userOpHash, sig)，因此不能用 personal_sign(EIP-191)。
      const signature = await walletClient.request({
        method: 'eth_sign',
        params: [address, draft.digest as `0x${string}`],
      })
      const result = await confirmAutoRenew(accessToken, { agentId, planId, ownerSignature: signature })
      if (result.receiptSuccess) {
        setStep('enabled')
        setInfo('Auto-renew enabled — the smart account will renew this subscription automatically.')
        setRow(prev => prev ? { ...prev, renew_status: 'enabled', account_address: draft.accountAddress } : prev)
      } else {
        setError(`Enable UserOp reverted on-chain (op ${result.userOpHash?.slice(0, 12)}…). Check the smart account has gas.`)
      }
    } catch (e: any) {
      setStep('error')
      setError(e?.message ?? String(e))
    }
  }

  // —— 停用：本地停用（可选链上撤销 session）——
  const handleDisable = async () => {
    if (!accessToken) return
    if (!window.confirm('Disable auto-renew for this subscription? The session key will stop renewing.')) return
    setError(''); setInfo(''); setStep('disabling')
    try {
      await disableAutoRenew(accessToken, { agentId, planId })
      setStep('disabled')
      setInfo('Auto-renew disabled.')
      setRow(prev => prev ? { ...prev, renew_status: 'disabled' } : prev)
    } catch (e: any) {
      setStep('error')
      setError(e?.message ?? String(e))
    }
  }

  // —— 恢复：充值后恢复被暂停（失败护栏/资金不足）的自动续订 ——
  const handleResume = async () => {
    if (!accessToken) { setError('Please sign in first'); setStep('error'); return }
    setError(''); setInfo(''); setStep('enabling')
    try {
      await resumeAutoRenew(accessToken, { agentId, planId })
      setStep('enabled')
      setInfo('Auto-renew resumed — the next scan will pick it up.')
      setRow(prev => prev ? { ...prev, renew_status: 'enabled', paused_reason: null, paused_at: null } : prev)
    } catch (e: any) {
      setStep('paused')
      setError(e?.message ?? String(e))
    }
  }

  const copyAccount = async () => {
    if (!row?.account_address) return
    try { await navigator.clipboard.writeText(row.account_address); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {}
  }

  const nativeWei = row?.funding ? BigInt(row.funding.nativeWei) : null
  const epDeposit = row?.funding ? BigInt(row.funding.epDepositWei) : null
  const escrowWei = row?.funding ? BigInt(row.funding.escrowWei) : null
  // relay A-10 服务费阈值（实测 ~0.00246 OXA/次，与网关 AA_RELAY_SERVICE_FEE_WEI 对齐）
  const escrowFeeThreshold = BigInt('2460000000000000')
  const funded = (nativeWei ?? BigInt(0)) > BigInt(0) || (epDeposit ?? BigInt(0)) > BigInt(0)
  const escrowFunded = (escrowWei ?? BigInt(0)) >= escrowFeeThreshold
  const expiresDate = expiresAt ? new Date(Number(expiresAt) * 1000).toLocaleDateString() : null
  const isEnabled = step === 'enabled' || row?.renew_status === 'enabled'
  const isPaused = step === 'paused' || row?.renew_status === 'paused'
  const isEnabling = step === 'enabling'
  const isConfirming = step === 'confirming'
  const isDisabling = step === 'disabling'

  // 未认证：先签名登录 gateway
  if (!accessToken && !authLoading) {
    return (
      <div className="glass-card p-6 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent-purple" /> Auto-Renew (ERC-4337)
          </h3>
        </div>
        <p className="text-xs text-text-muted leading-relaxed">
          Authorize once — a smart account renews this subscription automatically every period
          (<span className="text-text-secondary">{priceDisplay}</span>). One signature to enable, then the Gateway
          renews it for you.
        </p>
        <button onClick={() => void authenticate()} className="btn-primary text-sm px-6 py-2">
          {authLoading ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</span> : 'Sign in to manage auto-renew'}
        </button>
      </div>
    )
  }

  if (authLoading && !accessToken) {
    return (
      <div className="glass-card p-6 rounded-2xl flex items-center gap-3 text-sm text-text-muted">
        <Loader2 className="w-4 h-4 animate-spin" /> Signing in…
      </div>
    )
  }

  return (
    <div className="glass-card p-6 rounded-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent-purple" /> Auto-Renew (ERC-4337)
        </h3>
        <button onClick={() => accessToken && void refresh(accessToken)} className="text-text-muted hover:text-text-secondary transition-colors" title="Refresh status">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <p className="text-xs text-text-muted leading-relaxed">
        Authorize once — your smart account renews this subscription automatically every period
        (<span className="text-text-secondary">{priceDisplay}</span>). You keep custody; the session key only
        calls <code className="font-mono">subscribe()</code> on the Subscription Manager within the price limit.
      </p>

      {/* 已开启/已暂停：状态 + 智能账户 + 三类资金 + 充值引导 */}
      {(isEnabled || isPaused) && row?.account_address && (
        <div className="space-y-3">
          {isPaused ? (
            <div className="flex items-center gap-2 text-sm text-amber-400">
              <Wallet className="w-4 h-4" /> Auto-renew paused
              {row.renew_fail_count != null && <span className="text-xs text-text-muted">· {row.renew_fail_count} consecutive failures</span>}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-green-400">
              <ShieldCheck className="w-4 h-4" /> Auto-renew enabled
              <span className="text-xs text-text-muted">· renewed {row.renew_count ?? 0}×</span>
              {row.last_renew_at && <span className="text-xs text-text-muted">· last {new Date(row.last_renew_at).toLocaleDateString()}</span>}
            </div>
          )}

          <div className="rounded-xl bg-white/5 border border-white/5 p-3 space-y-2">
            <div className="text-[11px] text-text-muted uppercase tracking-wider">Smart account (pays renewal)</div>
            <div className="flex items-center gap-2">
              <code className="font-mono text-xs text-text-primary break-all flex-1">{row.account_address}</code>
              <button onClick={copyAccount} className="text-text-muted hover:text-text-secondary shrink-0" title="Copy address">
                <Copy className="w-3.5 h-3.5" />
                {copied && <span className="sr-only">Copied</span>}
              </button>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
              <span>Balance: <span className={`font-mono ${funded ? 'text-text-secondary' : 'text-red-400/80'}`}>{nativeWei != null ? formatWei(nativeWei) : '—'}</span></span>
              <span>Gas deposit: <span className={`font-mono ${funded ? 'text-text-secondary' : 'text-red-400/80'}`}>{epDeposit != null ? formatWei(epDeposit) : '—'}</span></span>
              <span>Service escrow: <span className={`font-mono ${escrowFunded ? 'text-text-secondary' : 'text-red-400/80'}`}>{escrowWei != null ? formatWei(escrowWei) : '—'}</span></span>
            </div>
          </div>

          {isPaused && row.paused_reason && (
            <div className="rounded-xl bg-amber-400/5 border border-amber-400/15 p-3 text-xs text-amber-300/90">
              Reason: {row.paused_reason}
            </div>
          )}

          {/* 充值引导（fallback：不依赖 infraX depositFor；三类资金各自充值路径） */}
          {(!funded || !escrowFunded) && (
            <div className="rounded-xl bg-amber-400/5 border border-amber-400/15 p-3 text-xs text-amber-300/90 space-y-2">
              <div className="flex gap-2 items-start">
                <Wallet className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Smart account needs funds before the next renewal. Three balances are tracked separately:</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-amber-200/80">
                <li>
                  <span className="text-amber-300/90">Balance (pays the subscription price)</span> — send OXA directly to the
                  smart account address above.
                </li>
                <li>
                  <span className="text-amber-300/90">Gas deposit (pays UserOp gas)</span> — your EOA must deposit gas for the
                  smart account (EntryPoint <code className="font-mono">depositTo</code>); it does not come from the balance
                  transfer automatically.
                </li>
                <li>
                  <span className="text-amber-300/90">Service escrow (pays the relay fee, ~0.0025 OXA/renewal)</span> — topped up
                  by the smart account itself; contact support if you need help funding it.
                </li>
              </ol>
              <p className="text-amber-200/60">Auto-renew is paused while unfunded. Top up, then resume below.</p>
            </div>
          )}
          {expiresDate && <div className="text-xs text-text-muted">Current period ends {expiresDate} — renewal happens in the window before expiry.</div>}
        </div>
      )}

      {/* 等待签名：展示 digest + 授权按钮 */}
      {step === 'pending-sign' && draft && (
        <div className="space-y-3">
          <div className="rounded-xl bg-accent-purple/5 border border-accent-purple/15 p-3 space-y-2 text-xs">
            <div className="text-text-secondary font-medium">Enable request ready — sign to authorize</div>
            <div className="text-text-muted break-all"><span className="text-text-secondary">Account: </span><code className="font-mono">{draft.accountAddress}</code></div>
            <div className="text-text-muted break-all"><span className="text-text-secondary">Digest: </span><code className="font-mono">{draft.digest.slice(0, 18)}…{draft.digest.slice(-6)}</code></div>
            <div className="text-text-muted">Limit: <span className="text-text-secondary">{priceDisplay} / renewal</span> · Valid until {new Date(Number(draft.validUntil) * 1000).toLocaleDateString()}</div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => void handleSignAndConfirm()} disabled={isConfirming} className="btn-primary text-sm px-6 py-2 disabled:opacity-40">
              {isConfirming ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Confirming…</span> : 'Sign & Enable'}
            </button>
            <button onClick={() => { setDraft(null); setStep('idle') }} className="btn-secondary text-sm px-6 py-2">Cancel</button>
          </div>
          <p className="text-[11px] text-text-muted">
            Your wallet will be asked to sign a 32-byte enable digest (raw eth_sign). This is a one-time
            authorization for the session key to renew this subscription.
          </p>
        </div>
      )}

      {/* 操作按钮 */}
      {step === 'idle' && isActive && (
        <button onClick={() => void handleEnable()} disabled={isEnabling} className="btn-primary text-sm px-6 py-2 disabled:opacity-40">
          {isEnabling ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Preparing…</span> : 'Enable Auto-Renew'}
        </button>
      )}
      {(isEnabled || isPaused) && (
        <div className="flex gap-3 flex-wrap">
          {isPaused && (
            <button onClick={() => void handleResume()} disabled={isEnabling} className="btn-primary text-sm px-6 py-2 disabled:opacity-40">
              {isEnabling ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Resuming…</span> : 'Resume Auto-Renew'}
            </button>
          )}
          <button onClick={() => void handleDisable()} disabled={isDisabling} className="btn-secondary text-sm px-6 py-2 text-red-400/80 disabled:opacity-40">
            {isDisabling ? 'Disabling…' : 'Disable Auto-Renew'}
          </button>
        </div>
      )}
      {step === 'disabled' && (
        <div className="text-xs text-text-muted flex items-center gap-2">
          Auto-renew is off.{row?.renew_count ? ` Previously renewed ${row.renew_count}×.` : ''}
          {isActive && (
            <button onClick={() => void handleEnable()} className="text-accent-purple hover:underline">Re-enable</button>
          )}
        </div>
      )}

      {/* 提示 / 错误 */}
      {info && <div className="text-xs text-green-400/90">{info}</div>}
      {error && (
        <div className="text-xs text-red-400/90 flex items-start gap-2">
          <span>⚠ {error}</span>
          {accessToken && <button onClick={() => void refresh(accessToken)} className="underline shrink-0">Retry</button>}
        </div>
      )}

      {row?.last_renew_err && (
        <div className="text-[11px] text-red-400/70">Last renewal error: {row.last_renew_err}</div>
      )}

      <div className="flex items-center gap-1.5 text-[11px] text-text-muted/60">
        Powered by ERC-4337 session keys — <ExternalLink className="w-3 h-3" /> sign once, pay many.
      </div>
    </div>
  )
}

/** 简易 wei → 可读金额（≤6 位小数） */
function formatWei(wei: bigint): string {
  if (wei === BigInt(0)) return '0'
  const scale = BigInt(10) ** BigInt(18)
  const whole = wei / scale
  const frac = wei % scale
  if (frac === BigInt(0)) return whole.toString()
  const fracStr = frac.toString().padStart(18, '0').replace(/0+$/, '').slice(0, 6)
  return `${whole}.${fracStr}`
}
