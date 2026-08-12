// app/b/page.tsx — B-end console (R19.1): wallet sign-in → auto tenant +
// hashed API key shown exactly once → subscription status / next steps.
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useWalletClient } from 'wagmi'
import type { WalletClient } from 'viem'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft, ArrowRight, Check, Copy, KeyRound, Loader2, Wallet, Zap, Server,
  LineChart, ShieldAlert, ShieldCheck, AlertTriangle, Building2, ExternalLink, Info,
} from 'lucide-react'
import { WalletConnect } from '@/components/wallet/WalletConnect'
import { PlanPickerCard } from '@/components/billing/PlanPickerCard'
import { KeyManageCard } from '@/components/billing/KeyManageCard'
import { X402WalletCard } from '@/components/billing/X402WalletCard'
import { UsageStatsCard } from '@/components/billing/UsageStatsCard'
import { usePartnerGatewayAuth } from '@/hooks/usePartnerGatewayAuth'

const card = 'glass-card p-6 rounded-2xl'

function formatAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function copy(text: string, done: (v: boolean) => void) {
  navigator.clipboard?.writeText(text)
    .then(() => { done(true); setTimeout(() => done(false), 2000) })
    .catch(() => {})
}

export default function BusinessPage() {
  const { isConnected, isLoading, error, context, authenticate } = usePartnerGatewayAuth()
  const { data: walletClient } = useWalletClient()
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showPlans, setShowPlans] = useState(false)
  const { t } = useTranslation()

  const showReveal = !!context?.isNew && !saved && context.tenant.kind === 'partner'

  return (
    <div className="min-h-screen">
      {/* Minimal B-end top bar — no C-end sidebar */}
      <header className="border-b border-white/5 bg-black/20 backdrop-blur">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 text-text-muted hover:text-text-primary text-sm transition-colors">
              <ArrowLeft className="w-4 h-4" /> {t('b.backHome')}
            </Link>
            <div className="flex items-center gap-2">
              {/* AgentX wordmark: hidden on small screens to save space */}
              <span className="hidden sm:inline font-semibold tracking-tight">AgentX</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent-purple/15 text-accent-purple border border-accent-purple/20 font-medium">
                {t('b.forBusiness')}
              </span>
            </div>
          </div>
          <WalletConnect />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        {!isConnected && <SignInCard />}
        {isConnected && isLoading && (
          <div className="text-center py-24 text-text-muted flex flex-col items-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-accent-purple" />
            <span className="text-sm">{t('b.signingIn')}</span>
          </div>
        )}
        {isConnected && !isLoading && error && !context && <ErrorCard message={error} />}
        {isConnected && !isLoading && context && context.tenant.kind !== 'partner' && <WrongKindCard />}
        {isConnected && !isLoading && context && context.tenant.kind === 'partner' && showReveal && (
          <KeyRevealCard
            apiKey={context.apiKey ?? ''}
            copied={copied}
            onCopy={() => copy(context.apiKey ?? '', setCopied)}
            onSaved={() => setSaved(true)}
          />
        )}
        {isConnected && !isLoading && context && context.tenant.kind === 'partner' && !showReveal && (
          <DashboardCard
            address={context.tenant.wallet_address}
            tenantId={context.tenant.id}
            plan={context.plan}
            usageToday={context.usageToday}
            accessToken={context.accessToken}
            walletClient={walletClient}
            showPlans={showPlans}
            onTogglePlans={() => setShowPlans(v => !v)}
            onPurchased={authenticate}
          />
        )}
      </main>
    </div>
  )
}

// ── Sign-in (wallet not connected) ──────────────────────────────────────

function SignInCard() {
  const { t } = useTranslation()
  const perks = [
    { icon: KeyRound, title: t('b.perk1Title'), desc: t('b.perk1Desc') },
    { icon: Zap, title: t('b.perk2Title'), desc: t('b.perk2Desc') },
    { icon: LineChart, title: t('b.perk3Title'), desc: t('b.perk3Desc') },
  ]
  return (
    <div className="space-y-8">
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-accent-purple/10 flex items-center justify-center mx-auto mb-4">
          <Building2 className="w-7 h-7 text-accent-purple" />
        </div>
        <h1 className="heading-lg mb-2">
          {t('b.buildOn')} <span className="gradient-text">AgentX</span>
        </h1>
        <p className="body text-text-secondary max-w-lg mx-auto">
          {t('b.signInSubtitle')}
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        {perks.map(p => (
          <div key={p.title} className="glass-card p-4 rounded-2xl">
            <p.icon className="w-5 h-5 text-accent-cyan mb-2" />
            <div className="text-sm font-semibold">{p.title}</div>
            <div className="text-xs text-text-muted mt-1 leading-relaxed">{p.desc}</div>
          </div>
        ))}
      </div>

      <div className="glass-card p-6 rounded-2xl text-center space-y-4">
        <Wallet className="w-8 h-8 text-accent-cyan mx-auto" />
        <div>
          <div className="font-semibold">{t('b.connectWalletTitle')}</div>
          <p className="text-sm text-text-muted mt-1">
            {t('b.connectWalletDesc')}
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 text-xs text-text-muted">
          <Info className="w-3.5 h-3.5" />
          {t('b.consumerHint')}
        </div>
      </div>
    </div>
  )
}

// ── Errors ──────────────────────────────────────────────────────────────

function ErrorCard({ message }: { message: string }) {
  const { t } = useTranslation()
  return (
    <div className={`${card} text-center space-y-3`}>
      <ShieldAlert className="w-8 h-8 text-red-400 mx-auto" />
      <div className="font-semibold">{t('b.signInFailed')}</div>
      <p className="text-sm text-text-muted">{message}</p>
      <Link href="/" className="btn-primary text-sm inline-flex items-center gap-2 mt-2">
        {t('b.backHome')} <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  )
}

function WrongKindCard() {
  const { t } = useTranslation()
  return (
    <div className={`${card} text-center space-y-3 max-w-md mx-auto`}>
      <ShieldAlert className="w-8 h-8 text-yellow-400 mx-auto" />
      <div className="font-semibold">{t('b.wrongKindTitle')}</div>
      <p className="text-sm text-text-muted">
        {t('b.wrongKindDesc')}
      </p>
      <Link href="/user/dashboard" className="btn-primary text-sm inline-flex items-center gap-2 mt-2">
        {t('b.wrongKindCta')} <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  )
}

// ── First-time key reveal (shown exactly once) ──────────────────────────

function KeyRevealCard({ apiKey, copied, onCopy, onSaved }: {
  apiKey: string
  copied: boolean
  onCopy: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className={`${card} space-y-5 max-w-xl mx-auto`}>
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-2xl bg-green-400/10 flex items-center justify-center mx-auto">
          <Check className="w-6 h-6 text-green-400" />
        </div>
        <h2 className="heading-md">{t('b.keyRevealTitle')}</h2>
        <p className="text-sm text-text-muted">{t('b.keyRevealSub')}</p>
      </div>

      <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-3 flex items-start gap-2 text-xs text-yellow-300">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <span>{t('b.keyRevealWarning')}</span>
      </div>

      <div className="rounded-xl bg-black/40 border border-white/10 p-3 font-mono text-sm break-all text-accent-cyan">
        {apiKey}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <button onClick={onCopy} className="btn-primary flex-1 py-2.5 text-sm flex items-center justify-center gap-2">
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? t('b.copied') : t('b.copyKey')}
        </button>
        <button onClick={onSaved} className="btn-secondary flex-1 py-2.5 text-sm flex items-center justify-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          {t('b.savedIt')}
        </button>
      </div>
    </div>
  )
}

// ── Dashboard (returning partner) ───────────────────────────────────────

function DashboardCard({ address, tenantId, plan, usageToday, accessToken, walletClient, showPlans, onTogglePlans, onPurchased }: {
  address: string
  tenantId: string
  plan: { name: string; slug: string; quota_daily: number; quota_used: number; rate_limit_rpm: number; max_concurrent: number; platform_models: { provider: string; model: string }[] } | null
  usageToday: { total_tokens: number; total_tool_calls: number }
  accessToken: string
  walletClient?: WalletClient
  showPlans: boolean
  onTogglePlans: () => void
  onPurchased: () => void
}) {
  const { t } = useTranslation()
  const pct = plan && plan.quota_daily > 0
    ? Math.min(100, Math.round((plan.quota_used / plan.quota_daily) * 100))
    : 0

  return (
    <div className="space-y-5">
      {/* Identity */}
      <div className="glass-card p-5 rounded-2xl flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400">
          <ShieldCheck className="w-3.5 h-3.5" /> {t('b.active')}
        </span>
        <span className="font-mono text-sm text-text-secondary">{formatAddress(address)}</span>
        <span className="text-xs text-text-muted font-mono">{t('b.tenantPrefix')}{tenantId.slice(0, 8)}</span>
      </div>

      {/* Subscription status */}
      {!plan ? (
        <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-6 space-y-3">
          <div className="flex items-center gap-2 text-yellow-300">
            <AlertTriangle className="w-5 h-5" />
            <h2 className="font-semibold">{t('b.noPlanTitle')}</h2>
          </div>
          <p className="text-sm text-text-muted">
            {t('b.noPlanDesc')}
          </p>
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <button
              onClick={onTogglePlans}
              className="btn-primary text-sm py-2.5 flex items-center justify-center gap-2"
            >
              {showPlans ? t('b.hidePlans') : t('b.choosePlan')} <ArrowRight className="w-4 h-4" />
            </button>
            <a
              href="/docs/sdk"
              className="btn-secondary text-sm py-2.5 flex items-center justify-center gap-2"
            >
              {t('b.readSdkDocs')} <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      ) : (
        <div className="glass-card p-6 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wider">{t('b.planLabel')}</div>
              <div className="font-semibold text-lg">{plan.name}</div>
            </div>
            <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-accent-purple/15 text-accent-purple border border-accent-purple/20">
              {t('b.platformModels', { count: plan.platform_models?.length ?? 0 })}
            </span>
          </div>
          <div>
            <div className="flex justify-between text-xs text-text-muted mb-1.5">
              <span>{t('b.dailyTokenUsage')}</span>
              <span className="font-mono text-text-primary">
                {plan.quota_used.toLocaleString()} / {plan.quota_daily.toLocaleString()} ({pct}%)
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-red-400' : pct >= 70 ? 'bg-yellow-400' : 'bg-accent-cyan'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-white/5 p-3">
              <div className="font-mono text-sm text-text-primary">{plan.rate_limit_rpm}</div>
              <div className="text-[11px] text-text-muted mt-0.5">{t('b.rpm')}</div>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <div className="font-mono text-sm text-text-primary">{plan.max_concurrent}</div>
              <div className="text-[11px] text-text-muted mt-0.5">{t('b.concurrent')}</div>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <div className="font-mono text-sm text-text-primary">{usageToday.total_tool_calls}</div>
              <div className="text-[11px] text-text-muted mt-0.5">{t('b.toolCalls')}</div>
            </div>
          </div>
        </div>
      )}

      {/* Next steps */}
      <div className={`${card} space-y-3`}>
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Server className="w-4 h-4 text-accent-cyan" /> {t('b.integrationTitle')}
        </h3>
        <ol className="space-y-2 text-sm text-text-muted">
          <li className="flex gap-3">
            <span className="w-5 h-5 rounded-full bg-white/5 text-text-primary text-xs flex items-center justify-center shrink-0">1</span>
            {t('b.step1')}
          </li>
          <li className="flex gap-3">
            <span className="w-5 h-5 rounded-full bg-white/5 text-text-primary text-xs flex items-center justify-center shrink-0">2</span>
            {t('b.step2')}
          </li>
          <li className="flex gap-3">
            <span className="w-5 h-5 rounded-full bg-white/5 text-text-primary text-xs flex items-center justify-center shrink-0">3</span>
            {t('b.step3')}
          </li>
        </ol>
        <a href="/docs/sdk" className="text-sm text-accent-cyan inline-flex items-center gap-1.5 hover:underline">
          {t('b.sdkQuickstart')} <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* R19.2: key rotation + x402 wallet + call statistics */}
      <KeyManageCard accessToken={accessToken} />
      <X402WalletCard address={address} walletClient={walletClient} />
      <UsageStatsCard accessToken={accessToken} />

      {/* R19.3 / D11: platform subscription-tier purchase (x402 rail) */}
      {showPlans && (
        <div className={`${card} !p-6`}>
          <PlanPickerCard
            accessToken={accessToken}
            subscriber={address as `0x${string}`}
            walletClient={walletClient}
            onPurchased={onPurchased}
          />
        </div>
      )}
    </div>
  )
}
