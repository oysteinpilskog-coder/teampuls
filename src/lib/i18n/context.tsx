'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { no } from './no'
import { en } from './en'
import { sv } from './sv'
import { es } from './es'
import { lt } from './lt'
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_META, isLocale, type Dictionary, type Locale } from './types'

const DICTIONARIES: Record<Locale, Dictionary> = { no, en, sv, es, lt }

interface I18nContextValue {
  locale: Locale
  dict: Dictionary
  setLocale: (locale: Locale) => void
}

const I18nContext = createContext<I18nContextValue | null>(null)

function writeCookie(locale: Locale) {
  if (typeof document === 'undefined') return
  const oneYear = 60 * 60 * 24 * 365
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${oneYear}; samesite=lax`
}

export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale?: Locale
  children: React.ReactNode
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? DEFAULT_LOCALE)

  // Hydrate from cookie/localStorage on mount so returning visitors keep their choice
  // even when the server didn't pass an initial locale (e.g. static chunks).
  useEffect(() => {
    if (initialLocale) return
    try {
      const cookie = document.cookie
        .split('; ')
        .find((c) => c.startsWith(`${LOCALE_COOKIE}=`))
        ?.split('=')[1]
      if (isLocale(cookie)) {
        setLocaleState(cookie)
        return
      }
      const stored = localStorage.getItem(LOCALE_COOKIE)
      if (isLocale(stored)) setLocaleState(stored)
    } catch {
      // ignore storage errors (private mode, etc.)
    }
  }, [initialLocale])

  // Keep <html lang> in sync so screen readers, browser translation, and
  // typographic features all use the right locale.
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.lang = LOCALE_META[locale].htmlLang
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    writeCookie(next)
    try {
      localStorage.setItem(LOCALE_COOKIE, next)
    } catch {
      // ignore
    }
  }, [])

  const value = useMemo<I18nContextValue>(
    () => ({ locale, dict: DICTIONARIES[locale], setLocale }),
    [locale, setLocale],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>')
  return ctx
}

/** Convenience hook returning just the dictionary. */
export function useT(): Dictionary {
  return useI18n().dict
}

/** Convenience hook returning just the current locale code. */
export function useLocale(): Locale {
  return useI18n().locale
}
