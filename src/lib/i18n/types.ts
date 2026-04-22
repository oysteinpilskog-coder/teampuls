import type { no } from './no'

export type Locale = 'no' | 'en' | 'sv' | 'es' | 'lt'

// Strip `readonly` modifiers and widen literal string types to `string` so
// translations (en, sv, es, lt) can satisfy the same shape without having
// to match each Norwegian literal character-for-character.
type Mutable<T> = T extends readonly (infer U)[]
  ? Mutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: Mutable<T[K]> }
    : T extends string
      ? string
      : T

export type Dictionary = Mutable<typeof no>

export const LOCALES: Locale[] = ['no', 'en', 'sv', 'es', 'lt']

export const LOCALE_META: Record<Locale, { name: string; nativeName: string; flag: string; htmlLang: string; intl: string }> = {
  no: { name: 'Norwegian', nativeName: 'Norsk',     flag: '🇳🇴', htmlLang: 'no',    intl: 'nb-NO' },
  en: { name: 'English',   nativeName: 'English',   flag: '🇬🇧', htmlLang: 'en',    intl: 'en-GB' },
  sv: { name: 'Swedish',   nativeName: 'Svenska',   flag: '🇸🇪', htmlLang: 'sv',    intl: 'sv-SE' },
  es: { name: 'Spanish',   nativeName: 'Español',   flag: '🇪🇸', htmlLang: 'es',    intl: 'es-ES' },
  lt: { name: 'Lithuanian', nativeName: 'Lietuvių', flag: '🇱🇹', htmlLang: 'lt',    intl: 'lt-LT' },
}

export const LOCALE_COOKIE = 'tp_locale'
export const DEFAULT_LOCALE: Locale = 'no'

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as string[]).includes(value)
}
