/**
 * Multi-country public holidays — CLIENT-SAFE lookup.
 *
 * Holidays are precomputed server-side (see `lib/holidays-server.ts`) and
 * shipped to the client as a flat `HolidayMap` keyed by `${country}_YYYY-MM-DD`.
 * This file imports nothing heavy — `date-holidays` (which transitively bundles
 * moment + moment-timezone with all locales, ~1.6 MB) is confined to the server.
 *
 * Covers our four offices: NO, SE, LT, GB. Only `type === 'public'` holidays
 * make it into the map — observances, school holidays, and bank holidays are
 * filtered out on the server.
 */

export type CountryCode = 'NO' | 'SE' | 'LT' | 'GB'

export interface HolidayHit {
  name: string
}

/**
 * Flat lookup table, plain object so it round-trips through RSC/JSON cleanly.
 * Key format: `${country}_${YYYY-MM-DD}` — same shape as `holidayKey()`.
 */
export type HolidayMap = Record<string, { name: string; country: CountryCode }>

const SUPPORTED: readonly CountryCode[] = ['NO', 'SE', 'LT', 'GB']

export function holidayKey(country: CountryCode, date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${country}_${y}-${m}-${d}`
}

export function getHolidayFromMap(
  map: HolidayMap | undefined,
  date: Date,
  country: CountryCode,
): HolidayHit | null {
  if (!map) return null
  const entry = map[holidayKey(country, date)]
  return entry ? { name: entry.name } : null
}

/**
 * Return holidays per country for `date`, restricted to the given country
 * codes. Useful for rendering a tooltip listing all relevant offices.
 */
export function getHolidaysFromMapForCountries(
  map: HolidayMap | undefined,
  date: Date,
  countries: readonly CountryCode[],
): Map<CountryCode, string> {
  const out = new Map<CountryCode, string>()
  if (!map) return out
  for (const c of countries) {
    const entry = map[holidayKey(c, date)]
    if (entry) out.set(c, entry.name)
  }
  return out
}

export function isSupportedCountry(code: string | null | undefined): code is CountryCode {
  return code != null && (SUPPORTED as readonly string[]).includes(code)
}

/**
 * Resolve which CountryCode to drive holiday lookups for a given member.
 * Picks the member's home-office country, falling back to a workspace-level
 * country (organizations.country_code or WorkspaceSummary.country_code).
 * Returns null when neither is one of our supported countries — callers
 * should treat that as "no holiday suppression".
 */
export function memberCountryCode(
  homeOfficeId: string | null | undefined,
  officeById: Map<string, { country_code: string | null }>,
  fallback?: string | null,
): CountryCode | null {
  const office = homeOfficeId ? officeById.get(homeOfficeId) : undefined
  const code = office?.country_code ?? fallback ?? null
  return isSupportedCountry(code) ? code : null
}

const FLAG: Record<CountryCode, string> = {
  NO: '🇳🇴',
  SE: '🇸🇪',
  LT: '🇱🇹',
  GB: '🇬🇧',
}

export function flagFor(country: CountryCode): string {
  return FLAG[country]
}
