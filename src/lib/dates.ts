import { getISOWeek, getISOWeekYear, startOfISOWeek, addDays, format } from 'date-fns'
import { no } from './i18n/no'
import { en } from './i18n/en'
import { sv } from './i18n/sv'
import { es } from './i18n/es'
import { lt } from './i18n/lt'
import type { Dictionary, Locale } from './i18n/types'

export { getISOWeek, getISOWeekYear }

/** Monday of ISO week N in year Y */
export function getWeekStart(week: number, year: number): Date {
  // Jan 4 is always in ISO week 1
  const jan4 = new Date(year, 0, 4)
  const week1Start = startOfISOWeek(jan4)
  return addDays(week1Start, (week - 1) * 7)
}

/** Mon–Fri for ISO week N in year Y */
export function getWeekDays(week: number, year: number): Date[] {
  const start = getWeekStart(week, year)
  return Array.from({ length: 5 }, (_, i) => addDays(start, i))
}

/** Last ISO week number in a given year (52 or 53) */
export function getLastISOWeek(year: number): number {
  // Dec 28 is always in the last ISO week of the year
  return getISOWeek(new Date(year, 11, 28))
}

/** 'YYYY-MM-DD' string */
export function toDateString(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export interface DayLabel {
  weekday: string   // 'Man'
  day: number       // 20
  month: string     // 'apr'
}

/** Locale-aware day label. Falls back to Norwegian if no dict is given so
 *  server-rendered / pre-locale call sites keep working. */
export function getDayLabel(date: Date, dict: Dictionary = no): DayLabel {
  return {
    weekday: dict.dates.weekdaysShort[date.getDay()].slice(0, 3),
    day: date.getDate(),
    month: dict.dates.monthsShort[date.getMonth()],
  }
}

export function isToday(date: Date): boolean {
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

export function getTodayWeekAndYear(): { week: number; year: number } {
  const today = new Date()
  return { week: getISOWeek(today), year: getISOWeekYear(today) }
}

/** ISO week containing the first day of the given month. */
export function getISOWeekForMonth(year: number, monthIndex: number): { week: number; year: number } {
  const firstOfMonth = new Date(year, monthIndex, 1)
  return { week: getISOWeek(firstOfMonth), year: getISOWeekYear(firstOfMonth) }
}

/** Calendar month/year that the Monday of the given ISO week falls in. */
export function getMonthForWeek(week: number, year: number): { month: number; year: number } {
  const monday = getWeekStart(week, year)
  return { month: monday.getMonth(), year: monday.getFullYear() }
}

// Legacy Norwegian constants — kept as aliases so existing imports compile.
// New code should read from `useT().dates` instead.
export const MONTH_LONG_NB: Record<number, string> = Object.fromEntries(
  no.dates.monthsLong.map((m, i) => [i, m]),
) as Record<number, string>

export const WEEKDAY_LONG_NB: Record<number, string> = Object.fromEntries(
  no.dates.weekdaysLong.map((d, i) => [i, d]),
) as Record<number, string>

/** Locale-aware long date label, e.g. "Mandag 20. april" in Norwegian. */
export function formatDateLabelLong(date: Date, dict: Dictionary = no): string {
  return `${dict.dates.weekdaysLong[date.getDay()]} ${date.getDate()}. ${dict.dates.monthsLong[date.getMonth()]}`
}

/**
 * Coarse time-of-day phase used by the dashboard surface to shift its tone
 * (aurora warmth, breathing amplitude). Bands are picked so the visual
 * change happens around moments people notice — first-coffee, lunch,
 * golden-hour, after-hours.
 */
export type DayPhase = 'morning' | 'day' | 'evening' | 'night'

export function getDayPhase(date: Date): DayPhase {
  const h = date.getHours()
  if (h >= 6 && h < 10) return 'morning'
  if (h >= 10 && h < 16) return 'day'
  if (h >= 16 && h < 20) return 'evening'
  return 'night'
}

// ---- Typeable date input ----------------------------------------------------

const ALL_DICTS: Dictionary[] = [no, en, sv, es, lt]

/** Build a (lowercased) lookup from month tokens (long/short, every locale)
 *  to a 0-indexed month number. Tokens shorter than 3 chars are ignored. */
const MONTH_TOKEN_INDEX: Map<string, number> = (() => {
  const map = new Map<string, number>()
  for (const d of ALL_DICTS) {
    for (let m = 0; m < 12; m++) {
      const long = d.dates.monthsLong[m]?.toLowerCase()
      const short = d.dates.monthsShort[m]?.toLowerCase()
      if (long && long.length >= 3) map.set(long, m)
      if (short && short.length >= 3) map.set(short, m)
    }
  }
  return map
})()

function expandYear(yy: number): number {
  if (yy >= 100) return yy
  return yy < 70 ? 2000 + yy : 1900 + yy
}

function buildIfValid(year: number, month: number, day: number): string | null {
  if (month < 0 || month > 11) return null
  if (day < 1 || day > 31) return null
  const d = new Date(year, month, day)
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month ||
    d.getDate() !== day
  ) {
    return null
  }
  return toDateString(d)
}

/**
 * Parse a free-form date string into 'YYYY-MM-DD'.
 * Returns null if parsing fails. Empty / whitespace-only input returns null.
 *
 * Accepts:
 *  - ISO:                 2026-04-21, 2026-4-21
 *  - Numeric DMY:         21.04.2026, 21/4/26, 21-04-2026, 21.4 (current year)
 *  - Month name:          21. april 2026, 21 apr, 21. April
 *
 * Year defaults to the current year when omitted. Two-digit years map to
 * 2000+yy when yy < 70, else 1900+yy.
 */
export function parseDateInput(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null

  // 1) ISO (year first, hyphens)
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) {
    return buildIfValid(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  }

  const thisYear = new Date().getFullYear()

  // 2) Numeric DMY with ./-/ separators (day first)
  const num = raw.match(/^(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](\d{2,4}))?\.?$/)
  if (num) {
    const day = Number(num[1])
    const month = Number(num[2]) - 1
    const year = num[3] ? expandYear(Number(num[3])) : thisYear
    return buildIfValid(year, month, day)
  }

  // 3) Day + month-name [+ year]
  // Examples: "21. april 2026", "21 april", "21.april.2026", "21 apr 26"
  const name = raw
    .toLowerCase()
    .match(/^(\d{1,2})[.\s]+([a-zæøåäöéíúñčęįšųūž]+)\.?(?:[.\s]+(\d{2,4}))?$/u)
  if (name) {
    const day = Number(name[1])
    const token = name[2]
    const year = name[3] ? expandYear(Number(name[3])) : thisYear

    let month = MONTH_TOKEN_INDEX.get(token)
    if (month === undefined) {
      // Loose match: token starts with a known short form (handles inflected
      // forms like "april." or extra suffixes from autocomplete).
      for (const [key, idx] of MONTH_TOKEN_INDEX) {
        if (key.length >= 3 && (token.startsWith(key) || key.startsWith(token))) {
          month = idx
          break
        }
      }
    }
    if (month === undefined) return null
    return buildIfValid(year, month, day)
  }

  return null
}

/** Locale-specific display format used inside typeable date inputs. */
const DISPLAY_FORMATS: Record<Locale, string> = {
  no: 'dd.MM.yyyy',
  en: 'dd/MM/yyyy',
  sv: 'yyyy-MM-dd',
  es: 'dd/MM/yyyy',
  lt: 'yyyy-MM-dd',
}

/** Format an ISO 'YYYY-MM-DD' for display in a TypeableDateInput. */
export function formatDateInputDisplay(iso: string, locale: Locale = 'no'): string {
  if (!iso) return ''
  // Hand-parse to avoid date-fns timezone surprises with `parseISO`.
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return format(d, DISPLAY_FORMATS[locale])
}

