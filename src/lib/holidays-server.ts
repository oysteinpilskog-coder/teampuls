/**
 * Server-only holiday computation. Imports `date-holidays` (which transitively
 * bundles moment + moment-timezone with all locales, ~1.6 MB) — must NEVER
 * be imported from a client component. `import 'server-only'` enforces this
 * at build time: any client import path that reaches this file fails the build.
 *
 * Output is a flat `HolidayMap` (plain object), safe to serialize as a prop
 * to client components. They consume it via `getHolidayFromMap()` from
 * `./holidays.ts` — no heavy import on the client.
 */

import 'server-only'
import Holidays from 'date-holidays'
import type { CountryCode, HolidayMap } from './holidays'

const SUPPORTED: readonly CountryCode[] = ['NO', 'SE', 'LT', 'GB']

/**
 * Per-(country, year) memoization across requests in the same lambda. The
 * Holidays rules table is the expensive part — once we've materialized a
 * year's public holidays for a country, the entries themselves are tiny.
 */
const yearCache = new Map<string, HolidayMap>()

function computeYearForCountry(country: CountryCode, year: number): HolidayMap {
  const cacheKey = `${country}_${year}`
  const cached = yearCache.get(cacheKey)
  if (cached) return cached

  const hd = new Holidays(country)
  const rows = hd.getHolidays(year) as Array<{ date: string; name: string; type: string }>
  const out: HolidayMap = {}
  for (const h of rows) {
    if (h.type !== 'public') continue
    // h.date is like "2026-01-01 00:00:00 +01:00" — extract YYYY-MM-DD prefix.
    const datePart = h.date.slice(0, 10)
    out[`${country}_${datePart}`] = { name: h.name, country }
  }
  yearCache.set(cacheKey, out)
  return out
}

export function computeHolidaysForYears(
  years: readonly number[],
  countries: readonly CountryCode[] = SUPPORTED,
): HolidayMap {
  const merged: HolidayMap = {}
  for (const c of countries) {
    for (const y of years) {
      Object.assign(merged, computeYearForCountry(c, y))
    }
  }
  return merged
}

/**
 * Convenience: pivot year ± 1 (covers Dec→Jan boundaries and week-nav
 * a few steps in either direction). ~50 entries × 4 countries × 3 years
 * ≈ 600 entries, JSON ≈ 35 KB. Cheap to ship over the wire.
 */
export function computeHolidaysWindow(
  pivotYear: number = new Date().getFullYear(),
  countries: readonly CountryCode[] = SUPPORTED,
): HolidayMap {
  return computeHolidaysForYears([pivotYear - 1, pivotYear, pivotYear + 1], countries)
}
