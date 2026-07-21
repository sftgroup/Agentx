// app/studio/basics/page.tsx — Step 1: Agent Basics
'use client'

import { useTranslation } from 'react-i18next'
import { useStudio } from '@/components/studio/StudioContext'
import { StepNav } from '@/components/studio/StepNav'

const PRESET_TAGS = [
  'Customer Service', 'Sales', 'Marketing', 'Trading',
  'Security Audit', 'Data Analysis', 'Code Review', 'Content Writing',
  'Legal', 'Finance', 'Healthcare', 'Education',
  'Social Media', 'DeFi', 'NFT', 'Gaming',
]

export default function BasicsPage() {
  const { t } = useTranslation()
  const { form, setForm, fieldErrors } = useStudio()

  const toggleTag = (tag: string) => {
    const next = form.tags.includes(tag)
      ? form.tags.filter(t => t !== tag)
      : [...form.tags, tag]
    setForm({ ...form, tags: next })
  }

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
            <label className="text-sm text-text-secondary mb-2 block">{t('studio.tagsLabel')}</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_TAGS.map(tag => {
                const selected = form.tags.includes(tag)
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                      selected
                        ? 'bg-accent-purple/15 text-accent-purple border-accent-purple/20'
                        : 'bg-white/3 border-white/5 text-text-muted hover:text-text-secondary hover:border-white/10'
                    }`}
                  >
                    {tag}
                  </button>
                )
              })}
            </div>
            {form.tags.length > 0 && (
              <p className="text-xs text-text-muted mt-2">
                Selected: {form.tags.join(', ')}
              </p>
            )}
          </div>
        </div>
      </div>
      <StepNav step={1} />
    </>
  )
}
