// app/studio/basics/page.tsx — Step 1: Agent Basics
'use client'

import { useTranslation } from 'react-i18next'
import { useStudio } from '@/components/studio/StudioContext'
import { StepNav } from '@/components/studio/StepNav'

export default function BasicsPage() {
  const { t } = useTranslation()
  const { form, setForm, fieldErrors } = useStudio()

  return (
    <>
      <div className="glass-card p-6 space-y-5">
        <h2 className="text-lg font-semibold">{t('studio.basicsTitle')}</h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-text-secondary mb-1.5 block">{t('studio.nameLabel')}</label>
            <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
              placeholder={t('studio.namePlaceholder')}
              className={`w-full px-4 py-2.5 bg-white/5 border rounded-xl text-sm focus:outline-none focus:bg-white/8 transition-colors ${fieldErrors.name ? 'border-red-400/40' : 'border-white/5 focus:border-accent-purple/40'}`} />
            {fieldErrors.name && <p className="text-xs text-red-400 mt-1">{fieldErrors.name}</p>}
          </div>
          <div>
            <label className="text-sm text-text-secondary mb-1.5 block">{t('studio.descLabel')} <span className="text-text-muted">(至少 20 个字符)</span></label>
            <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
              placeholder={t('studio.descPlaceholder')} rows={3}
              className={`w-full px-4 py-2.5 bg-white/5 border rounded-xl text-sm focus:outline-none focus:bg-white/8 transition-colors resize-none ${fieldErrors.description ? 'border-red-400/40' : 'border-white/5 focus:border-accent-purple/40'}`} />
            {fieldErrors.description && <p className="text-xs text-red-400 mt-1">{fieldErrors.description}</p>}
          </div>
          <div>
            <label className="text-sm text-text-secondary mb-1.5 block">{t('studio.promptLabel')}</label>
            <textarea value={form.prompt} onChange={e => setForm({...form, prompt: e.target.value})}
              placeholder={t('studio.promptPlaceholder')} rows={4}
              className={`w-full px-4 py-2.5 bg-white/5 border rounded-xl text-sm focus:outline-none focus:bg-white/8 transition-colors resize-none font-mono ${fieldErrors.prompt ? 'border-red-400/40' : 'border-white/5 focus:border-accent-purple/40'}`} />
            {fieldErrors.prompt && <p className="text-xs text-red-400 mt-1">{fieldErrors.prompt}</p>}
          </div>
          <div>
            <label className="text-sm text-text-secondary mb-1.5 block">{t('studio.tagsLabel')}</label>
            <input value={form.tags} onChange={e => setForm({...form, tags: e.target.value})} placeholder={t('studio.tagsPlaceholder')}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/5 rounded-xl text-sm focus:outline-none focus:border-accent-purple/40 focus:bg-white/8 transition-colors" />
          </div>
        </div>
      </div>
      <StepNav step={1} />
    </>
  )
}
