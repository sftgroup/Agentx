import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import enTranslation from './en.json'
import zhHantTranslation from './zh-Hant.json'

const resources = {
  en: { translation: enTranslation },
  'zh-Hant': { translation: zhHantTranslation },
}

export const SUPPORTED_LANGS = ['en', 'zh-Hant'] as const
export type SupportedLang = (typeof SUPPORTED_LANGS)[number]

const STORAGE_KEY = 'i18nextLng'

/** Client-only: read the persisted language (defaults to en). */
export function getSavedLanguage(): SupportedLang {
  if (typeof window === 'undefined') return 'en'
  const saved = window.localStorage.getItem(STORAGE_KEY)
  return (SUPPORTED_LANGS as readonly string[]).includes(saved ?? '')
    ? (saved as SupportedLang)
    : 'en'
}

/** Persist + apply a language (used by the LanguageSwitcher). */
export function setLanguage(lang: SupportedLang): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    /* storage may be unavailable in privacy mode */
  }
  void i18n.changeLanguage(lang)
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    // Pages are statically prerendered, so the server always emits English
    // HTML. Forcing 'en' here keeps the initial client render identical to the
    // server output (hydration-safe); the persisted language is applied after
    // mount in I18nProvider, avoiding React hydration errors on language switch.
    lng: 'en',
    interpolation: { escapeValue: false },
  })

export default i18n
