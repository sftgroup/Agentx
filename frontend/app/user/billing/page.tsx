// app/user/billing/page.tsx — C-end Billing (R19.4 / G7 / D6-D7):
// current platform plan + daily usage progress bar + upgrade purchase entry.
// Uses the same wallet→Gateway JWT path (intent='user') and the shared
// PlanPickerCard (x402 rail; Stripe once credentials exist).
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useWalletClient } from 'wagmi'
import { ArrowRight, CreditCard, Loader2, ShieldAlert, Sparkles, Wallet } from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { PlanPickerCard } from '@/components/billing/PlanPickerCard'
import { usePartnerGatewayAuth } from '@/hooks/usePartnerGatewayAuth'
import { WalletConnect } from '@/components/wallet/WalletConnect'

export default function UserBillingPage() {
  const { isConnected, isLoading, error, context, authenticate } = usePartnerGatewayAuth({ intent: 'user' })
  const { data: walletClient } = useWalletClient()
  const [showPlans, setShowPlans] = useState(false)

  const plan = context?.plan ?? null
  const usage = context?.usageToday ?? { total_tokens: 0, total_tool_calls: 0 }
  const pct = plan && plan.quota_daily > 0
    ? Math.min(100, Math.round((plan.quota_used / plan.quota_daily) * 100))
    : 0

  return (
    <AppLayout>
      <div className="max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="heading-lg">Billing</h1>
            <p className="body text-text-secondary">Platform plan, token usage and upgrades for your LLM access.</p>
          </div>
          <WalletConnect />
        </div>

        {!isConnected && (
          <div className="glass-card p-8 rounded-2xl text-center space-y-4">
            <Wallet className="w-8 h-8 text-accent-cyan mx-auto" />
            <div className="font-semibold">Connect your wallet to view billing</div>
            <p className="text-sm text-text-muted">Use the Connect Wallet button above. Your plan and usage live on the Gateway.</p>
          </div>
        )}

        {isConnected && isLoading && (
          <div className="text-center py-16 text-text-muted flex flex-col items-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-accent-purple" />
            <span className="text-sm">Loading your plan…</span>
          </div>
        )}

        {isConnected && !isLoading && error && !context && (
          <div className="glass-card p-6 rounded-2xl text-center space-y-3">
            <ShieldAlert className="w-8 h-8 text-red-400 mx-auto" />
            <div className="font-semibold">Could not load billing</div>
            <p className="text-sm text-text-muted">{error}</p>
          </div>
        )}

        {isConnected && !isLoading && context && (
          <div className="space-y-5">
            {/* Current plan */}
            <div className="glass-card p-6 rounded-2xl space-y-4">
              {!plan ? (
                <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-5 space-y-3">
                  <div className="flex items-center gap-2 text-yellow-300 font-semibold">
                    <Sparkles className="w-5 h-5" /> No active plan
                  </div>
                  <p className="text-sm text-text-muted">
                    Platform LLM usage requires a subscription. Subscribe below to unlock metered token access.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-text-muted uppercase tracking-wider">Plan</div>
                      <div className="font-semibold text-lg">{plan.name}</div>
                    </div>
                    <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-accent-purple/15 text-accent-purple border border-accent-purple/20">
                      {plan.platform_models?.length ?? 0} platform models
                    </span>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-text-muted mb-1.5">
                      <span>Daily token usage</span>
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
                      <div className="text-[11px] text-text-muted mt-0.5">RPM</div>
                    </div>
                    <div className="rounded-xl bg-white/5 p-3">
                      <div className="font-mono text-sm text-text-primary">{plan.max_concurrent}</div>
                      <div className="text-[11px] text-text-muted mt-0.5">Concurrent</div>
                    </div>
                    <div className="rounded-xl bg-white/5 p-3">
                      <div className="font-mono text-sm text-text-primary">{usage.total_tool_calls}</div>
                      <div className="text-[11px] text-text-muted mt-0.5">Tool calls</div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Upgrade / manage */}
            <div className="glass-card p-6 rounded-2xl space-y-4">
              <button
                onClick={() => setShowPlans(v => !v)}
                className="btn-primary w-full py-2.5 text-sm flex items-center justify-center gap-2"
              >
                <CreditCard className="w-4 h-4" />
                {showPlans ? 'Hide plans' : (plan ? 'Manage / upgrade plan' : 'Choose a plan')}
                <ArrowRight className="w-4 h-4" />
              </button>
              {showPlans && (
                <PlanPickerCard
                  accessToken={context.accessToken}
                  subscriber={context.tenant.wallet_address as `0x${string}`}
                  walletClient={walletClient}
                  onPurchased={authenticate}
                />
              )}
              <p className="text-xs text-text-muted">
                Payments go through the x402 rail (native token to the platform wallet). Stripe checkout is coming once
                merchant credentials are configured. Agent subscriptions are managed on the{' '}
                <Link href="/user/subscriptions" className="text-accent-cyan hover:underline">subscriptions page</Link>.
              </p>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
