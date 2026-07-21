// app/studio/encrypt/page.tsx — Step 3: Encrypt & Configure
'use client'

import { useTranslation } from 'react-i18next'
import { Shield, Key } from 'lucide-react'
import { useStudio } from '@/components/studio/StudioContext'
import { StepNav } from '@/components/studio/StepNav'

export default function EncryptPage() {
  const { t } = useTranslation()
  const { form, setForm, fieldErrors } = useStudio()

  return (
    <>
      <div className="glass-card p-6 space-y-5">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Shield className="w-5 h-5 text-accent-purple" /> {t('studio.encryptTitle')}
        </h2>
        <p className="text-sm text-text-muted">
          {t('studio.encryptDesc')}
        </p>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-text-secondary mb-1.5 block">{t('studio.pricingModel')}</label>
            <div className="flex gap-3">
              {[{ value: 'subscription', label: t('studio.subscriptionOpt') }, { value: 'per-use', label: t('studio.perUseOpt') }].map(opt => (
                <button key={opt.value}
                  onClick={() => setForm({...form, pricingType: opt.value as 'subscription' | 'per-use'})}
                  className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                    form.pricingType === opt.value
                      ? 'bg-accent-purple/15 text-accent-purple border-accent-purple/20'
                      : 'bg-white/3 border-white/5 text-text-muted hover:text-text-secondary'
                  }`}>{opt.label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm text-text-secondary mb-1.5 block">
              {form.pricingType === 'subscription' ? t('studio.monthlyPrice') : t('studio.pricePerUse')}
            </label>
            <input value={form.price} onChange={e => setForm({...form, price: e.target.value})} placeholder={t('studio.pricePlaceholder')}
              className={`w-full px-4 py-2.5 bg-white/5 border rounded-xl text-sm focus:outline-none transition-colors ${fieldErrors.price ? 'border-red-400/40' : 'border-white/5 focus:border-accent-purple/40'}`} />
            {fieldErrors.price && <p className="text-xs text-red-400 mt-1">{fieldErrors.price}</p>}
          </div>
          <div className="p-4 rounded-xl bg-accent-purple/5 border border-accent-purple/10">
            <div className="flex items-center gap-2 text-sm font-medium text-accent-purple mb-2">
              <Key className="w-4 h-4" /> {t('studio.sdkPipeline')}
            </div>
            <div className="text-xs text-text-muted space-y-1">
              <p>{t('studio.sdkStep1')}</p>
              <p>{t('studio.sdkStep2')}</p>
              <p>{t('studio.sdkStep3')}</p>
              <p>{t('studio.sdkStep4')}</p>
              <p>{t('studio.sdkStep5')}</p>
            </div>
          </div>
        </div>
      </div>
      <StepNav step={3} />
    </>
  )
}
