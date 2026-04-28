/**
 * Multi-country public holidays via `date-holidays`.
 *
 * Covers our four offices: NO, SE, LT, GB. Returns only `type === 'public'`
 * holidays — the lib also exposes observances, school holidays, and bank
 * holidays which we don't want polluting the matrix.
 *
 * Per-(year, country) Holidays-instance is cached so repeated calls during
 * render don't rebuild the whole rules table.
 */

import Holidays from 'date-holidays'

export type CountryCode = 'NO' | 'SE' | 'LT' | 'GB'

const SUPPORTED: readonly CountryCode[] = ['NO', 'SE', 'LT', 'GB']

interface HolidayHit {
  name: string
}

const instanceCache = new Map<CountryCode, Holidays>()
const dateCache = new Map<string, HolidayHit | null>() // key: `${country}_${YYYY-MM-DD}`

function getInstance(country: CountryCode): Holidays {
  let inst = instanceCache.get(country)
  if (!inst) {
    inst = new Holidays(country)
    instanceCache.set(country, inst)
  }
  return inst
}

function dateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function getHolidayForDate(date: Date, country: CountryCode): HolidayHit | null {
  const key = `${country}_${dateKey(date)}`
  if (dateCache.has(key)) return dateCache.get(key) ?? null
  // `date-holidays` defines its day-window in the country's local timezone,
  // so a Norway-local midnight (22:00 UTC the day before, in summer) falls
  // OUTSIDE the UK day-window (23:00 UTC the day before to 23:00 UTC of the
  // day, in BST). To probe a calendar date Y-M-D regardless of runtime tz,
  // we pass noon UTC of that Y/M/D — that lands squarely inside every
  // country's day-window from UTC-12 to UTC+14.
  const probe = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0),
  )
  const result = getInstance(country).isHoliday(probe)
  let hit: HolidayHit | null = null
  if (Array.isArray(result)) {
    const pub = result.find((h) => h.type === 'public')
    if (pub) hit = { name: pub.name }
  }
  dateCache.set(key, hit)
  return hit
}

/**
 * Return holidays per country for `date`, restricted to the given country
 * codes. Useful for rendering a tooltip listing all relevant offices.
 */
export function getHolidaysForCountries(
  date: Date,
  countries: readonly CountryCode[],
): Map<CountryCode, string> {
  const out = new Map<CountryCode, string>()
  for (const c of countries) {
    const hit = getHolidayForDate(date, c)
    if (hit) out.set(c, hit.name)
  }
  return out
}

export function isSupportedCountry(code: string | null | undefined): code is CountryCode {
  return code != null && (SUPPORTED as readonly string[]).includes(code)
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
