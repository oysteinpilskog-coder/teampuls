import 'server-only'
import { cookies, headers } from 'next/headers'
import { no } from './no'
import { en } from './en'
import { sv } from './sv'
import { es } from './es'
import { lt } from './lt'
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALES, isLocale, type Dictionary, type Locale } from './types'

/** Pick a locale from cookie first, then Accept-Language, falling back to default. */
export async function getServerLocale(): Promise<Locale> {
  const cookieStore = await cookies()
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value
  if (isLocale(fromCookie)) return fromCookie

  const hdrs = await headers()
  const accept = hdrs.get('accept-language')
  if (!accept) return DEFAULT_LOCALE

  // Minimal parser: take the first segment and compare its base language code
  // against our supported set. We don't depend on an external library here.
  const first = accept.split(',')[0]?.trim().toLowerCase() ?? ''
  const base = first.split('-')[0]
  // 'nb' (Norwegian Bokmål) and 'nn' (Nynorsk) both map to 'no'.
  if (base === 'nb' || base === 'nn') return 'no'
  if ((LOCALES as string[]).includes(base)) return base as Locale

  return DEFAULT_LOCALE
}

const SERVER_DICTIONARIES: Record<Locale, Dictionary> = { no, en, sv, es, lt }

/** Get the dictionary for the active server-side locale. Use in server components. */
export async function getServerDict(): Promise<Dictionary> {
  const locale = await getServerLocale()
  return SERVER_DICTIONARIES[locale]
}
