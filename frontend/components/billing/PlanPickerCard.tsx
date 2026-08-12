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
import { useTranslation } from 'react-i18next'
import { useTenantPlanPurchase, type TenantPlanOption } from '@/hooks/useTenantPlanPurchase'
import type { WalletClient } from 'viem'

export function PlanPickerCard({ accessToken, subscriber, walletClient, onPurchased }: {
  accessToken: string
  subscriber: Address
  walletClient?: WalletClient
  onPurchased?: () => void
}) {
  const { t } = useTranslation()
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
        <div className="font-semibold">{t('billing.planActive', { name: done.name })}</div>
        <p className="text-sm text-text-muted">{t('billing.planActiveDesc')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent-purple" /> {t('billing.choosePlan')}
        </h3>
        {payTo ? (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20">
            {t('billing.x402Checkout')}
          </span>
        ) : (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
            {t('billing.x402Disabled')}
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
              <span className="text-xs text-text-muted">{t('billing.perMonth')}</span>
            </div>
            <ul className="mt-3 space-y-1.5 text-xs text-text-muted">
              <li className="flex items-center gap-1.5"><Zap className="w-3 h-3 text-accent-cyan" /> {t('billing.tokensPerDay', { count: Math.round(plan.quota_daily / 1000) })}</li>
              <li className="flex items-center gap-1.5"><Zap className="w-3 h-3 text-accent-cyan" /> {t('billing.rpmConcurrent', { rpm: plan.rate_limit_rpm, conc: plan.max_concurrent })}</li>
              <li className="flex items-center gap-1.5"><CreditCard className="w-3 h-3 text-accent-cyan" /> {t('billing.platformModels', { count: plan.platform_models?.length ?? 0 })}</li>
            </ul>
            <div className="mt-4 flex items-center gap-1.5 text-xs font-medium text-accent-cyan">
              {purchasing && selected?.id === plan.id ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('billing.paying')}</>
              ) : (
                <>{t('billing.payWithX402')} <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" /></>
              )}
            </div>
          </button>
        ))}
      </div>
      {plans.length === 0 && (
        <p className="text-sm text-text-muted text-center py-6">
          {payTo ? t('billing.noPlans') : t('billing.x402NotEnabled')}
        </p>
      )}
    </div>
  )
}
