'use client'

import { ReactNode, useEffect } from 'react'
import { I18nextProvider } from 'react-i18next'
import i18n, { getSavedLanguage } from '@/lib/i18n'

export function I18nProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Apply the persisted language only after hydration: the initial render
    // must match the server-emitted (English) HTML to avoid hydration errors.
    const lang = getSavedLanguage()
    document.documentElement.lang = lang
    if (lang !== i18n.language) {
      void i18n.changeLanguage(lang)
    }
  }, [])

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
}
