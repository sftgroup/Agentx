// app/studio/publish/page.tsx — Step 4: Review & Publish
'use client'

import { useTranslation } from 'react-i18next'
import { useRouter } from 'next/navigation'
import { Check, Upload, Loader2, AlertCircle, ExternalLink } from 'lucide-react'
import { useStudio } from '@/components/studio/StudioContext'

export default function PublishPage() {
  const router = useRouter()
  const { t } = useTranslation()
  const { form, publishing, error, txHash, ipfsHash, isConnected, isConfirming, publish } = useStudio()

  return (
    <>
      <div className="glass-card p-6 space-y-5">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Check className="w-5 h-5 text-green-400" /> {t('studio.reviewTitle')}
        </h2>

        <div className="p-5 rounded-xl bg-white/3 border border-white/5 space-y-3">
          {[
            { label: t('studio.reviewName'), value: form.name || '—' },
            { label: t('studio.reviewDesc'), value: form.description || '—' },
            { label: t('studio.reviewSkills'), value: form.skills.length ? `${form.skills.length} skills` : t('studio.reviewSkillsNone') },
            { label: t('studio.reviewPricing'), value: form.price ? `${form.price} ETH (${form.pricingType})` : '—' },
            { label: t('studio.reviewTags'), value: form.tags.length ? form.tags.join(', ') : '—' },
          ].map(row => (
            <div key={row.label} className="flex justify-between text-sm">
              <span className="text-text-muted">{row.label}</span>
              <span className="text-text-primary font-medium">{row.value}</span>
            </div>
          ))}
          <div className="pt-3 border-t border-white/5 flex justify-between text-sm">
            <span className="text-text-muted">{t('studio.reviewEncryption')}</span><span className="text-accent-purple font-medium">{t('studio.reviewEncryptionVal')}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-muted">{t('studio.reviewStorage')}</span><span className="text-accent-cyan font-medium">{t('studio.reviewStorageVal')}</span>
          </div>
        </div>

        {!isConnected && (
          <div className="p-4 rounded-xl bg-yellow-400/5 border border-yellow-400/10 text-sm text-yellow-400/80 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {t('studio.connectToPublish')}
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-red-400/5 border border-red-400/10 text-sm text-red-400">{error}</div>
        )}

        {txHash && (
          <div className="p-4 rounded-xl bg-green-400/5 border border-green-400/10">
            <div className="text-sm text-green-400 font-medium mb-1">{t('studio.publishedTitle')}</div>
            {ipfsHash && <div className="text-xs text-text-muted">{t('studio.ipfsLabel')} {ipfsHash}</div>}
            <a href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" className="text-xs text-accent-cyan flex items-center gap-1 mt-1 hover:underline">
              {t('studio.viewExplorer')} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={() => router.push('/studio/encrypt')}
            className="btn-secondary text-sm px-4 py-2 flex-1">← {t('studio.back')}</button>
          <button onClick={publish}
            disabled={publishing || isConfirming || !isConnected || !form.name}
            className="flex-1 btn-primary py-3 bg-gradient-to-r from-accent-purple to-accent-cyan disabled:opacity-30 text-base flex items-center justify-center gap-2">
            {publishing ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('studio.publishing')}</> :
             isConfirming ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('studio.confirming')}</> :
             <><Upload className="w-4 h-4" /> {t('studio.publishBtn')}</>}
          </button>
        </div>
      </div>
    </>
  )
}
