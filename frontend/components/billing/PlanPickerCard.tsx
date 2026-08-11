// ---------------------------------------------------------------------------
// AgentX — PlanPickerCard (R19.3 / D11)
// ---------------------------------------------------------------------------
// Reusable purchase picker for platform subscription tiers. Used by the B-end
// console (/b) and the C-end Billing page (/user/billing). Funds the exact
// amount to the x402 pay-to wallet, then verifies + binds via the unified
// payments endpoint. Stripe (fiat) will be offered here once credentials exist.
// ---------------------------------------------------------------------------
'use client'

import { useState } from 'react'
import type { Address } from 'viem'
import { AlertTriangle, ArrowRight, Check, CreditCard, Loader2, Sparkles, Zap } from 'lucide-react'
import { useTenantPlanPurchase, type TenantPlanOption } from '@/hooks/useTenantPlanPurchase'
import type { WalletClient } from 'viem'

export function PlanPickerCard({ accessToken, subscriber, walletClient, onPurchased }: {
  accessToken: string
  subscriber: Address
  walletClient?: WalletClient
  onPurchased?: () => void
}) {
  const { plans, payTo, purchasing, error, purchase } = useTenantPlanPurchase({ accessToken, walletClient })
  const [selected, setSelected] = useState<TenantPlanOption | null>(null)
  const [done, setDone] = useState<TenantPlanOption | null>(null)

  async function handleBuy(plan: TenantPlanOption) {
    setSelected(plan)
    const result = await purchase(plan, subscriber)
    setSelected(null)
    if (result.ok) {
      setDone(plan)
      onPurchased?.()
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-6 text-center space-y-3">
        <div className="w-10 h-10 rounded-xl bg-green-400/10 flex items-center justify-center mx-auto">
          <Check className="w-5 h-5 text-green-400" />
        </div>
        <div className="font-semibold">Subscription active — {done.name}</div>
        <p className="text-sm text-text-muted">Your daily quota has been updated. Billing continues automatically via the platform.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent-purple" /> Choose a plan
        </h3>
        {payTo ? (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20">
            x402 checkout
          </span>
        ) : (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
            x402 disabled
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 flex items-start gap-2 text-xs text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-3">
        {plans.map((plan) => (
          <button
            key={plan.id}
            onClick={() => handleBuy(plan)}
            disabled={purchasing || !payTo}
            className="glass-card p-5 rounded-2xl text-left transition-all hover:border-accent-purple/40 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 group"
          >
            <div className="text-sm font-semibold">{plan.name}</div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-bold">${Number(plan.price_monthly)}</span>
              <span className="text-xs text-text-muted">/mo</span>
            </div>
            <ul className="mt-3 space-y-1.5 text-xs text-text-muted">
              <li className="flex items-center gap-1.5"><Zap className="w-3 h-3 text-accent-cyan" /> {(plan.quota_daily / 1000).toLocaleString()}k tokens / day</li>
              <li className="flex items-center gap-1.5"><Zap className="w-3 h-3 text-accent-cyan" /> {plan.rate_limit_rpm} RPM · {plan.max_concurrent} concurrent</li>
              <li className="flex items-center gap-1.5"><CreditCard className="w-3 h-3 text-accent-cyan" /> {plan.platform_models?.length ?? 0} platform models</li>
            </ul>
            <div className="mt-4 flex items-center gap-1.5 text-xs font-medium text-accent-cyan">
              {purchasing && selected?.id === plan.id ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Paying…</>
              ) : (
                <>Pay with x402 <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" /></>
              )}
            </div>
          </button>
        ))}
      </div>
      {plans.length === 0 && (
        <p className="text-sm text-text-muted text-center py-6">
          {payTo ? 'No purchasable plans configured yet.' : 'The x402 payment rail is not enabled on this Gateway yet (X402_ENABLED / X402_PAY_TO).'}
        </p>
      )}
    </div>
  )
}
