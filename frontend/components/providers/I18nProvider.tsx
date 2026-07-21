'use client'

import { ReactNode, useEffect } from 'react'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/lib/i18n'

export function I18nProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Force re-render direction if needed for RTL languages (not used currently)
    document.documentElement.lang = i18n.language
  }, [])

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
}
