// components/studio/StudioHeader.tsx
'use client'

import { useTranslation } from 'react-i18next'
import { Sparkles } from 'lucide-react'

export function StudioHeader() {
  const { t } = useTranslation()
  return (
    <div>
      <h1 className="heading-md flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-accent-purple/10 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-accent-purple" />
        </div>
        {t('studio.title')}
      </h1>
      <p className="body text-text-secondary mt-1">{t('studio.desc')}</p>
    </div>
  )
}
