'use client'

import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh-Hant', label: '繁體中文' },
]

export function LanguageSwitcher() {
  const { i18n } = useTranslation()

  return (
    <div className="flex items-center gap-1">
      <Globe className="w-3.5 h-3.5 text-text-muted" />
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          onClick={() => i18n.changeLanguage(lang.code)}
          className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
            i18n.language === lang.code
              ? 'text-accent-purple bg-accent-purple/10'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          {lang.label}
        </button>
      ))}
    </div>
  )
}
