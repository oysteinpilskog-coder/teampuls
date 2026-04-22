import type { EventCategory } from '@/lib/supabase/types'
import type { Dictionary } from '@/lib/i18n/types'

export type ViewMode = 'disk' | 'list' | 'calendar'

// ─── Default Norwegian labels ────────────────────────────────────
// These remain as Norwegian strings so legacy callers (non-client
// code, SSR fallbacks, any consumer that hasn't wired up i18n yet)
// keep working. For user-visible text in client components, prefer
// the `*T(t)` helpers below which pull from the active Dictionary.

export const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des',
] as const

export const MONTH_FULL = [
  'Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Desember',
] as const

export const MONTH_DAYS_COMMON: readonly number[] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

// Norwegian convention: Monday is first weekday.
// Three separate forms for three different UI needs.
export const WEEKDAY_INITIALS = ['M', 'T', 'O', 'T', 'F', 'L', 'S'] as const
export const WEEKDAY_ABBR = ['man', 'tir', 'ons', 'tor', 'fre', 'lør', 'søn'] as const
export const WEEKDAY_FULL = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag'] as const

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  company: 'Firma',
  trade_show: 'Messe',
  training: 'Kurs',
  milestone: 'Milepæl',
  holiday: 'Fri',
  deadline: 'Frist',
  other: 'Annet',
}

export type RingDef = {
  key: string
  name: string
  hue: number
  categories: EventCategory[]
}

// The three "Plandisc-style" named rings — each groups related categories.
export const RINGS: RingDef[] = [
  { key: 'important',  name: 'Viktige datoer', hue: 220, categories: ['company', 'milestone', 'other'] },
  { key: 'activities', name: 'Aktiviteter',    hue: 160, categories: ['trade_show', 'training'] },
  { key: 'markers',    name: 'Merkedager',     hue: 40,  categories: ['holiday', 'deadline'] },
]

// ─── Localized label helpers (take the active Dictionary) ────────

/** Localized capitalized full month names (Januar, Februar, …). */
export function monthFullT(t: Dictionary): readonly string[] {
  return t.dates.monthsLongCap
}

/** Localized category labels (short form — used on the wheel). */
export function categoryLabelsT(t: Dictionary): Record<EventCategory, string> {
  return {
    company:    t.wheel.categoryShort.company,
    trade_show: t.wheel.categoryShort.fair,
    training:   t.wheel.categoryShort.course,
    milestone:  t.wheel.categoryShort.milestone,
    holiday:    t.wheel.categoryShort.off,
    deadline:   t.wheel.categoryShort.deadline,
    other:      t.wheel.categoryShort.other,
  }
}

/** Localized ring names for the three Plandisc-style rings. */
export function ringNamesT(t: Dictionary): [string, string, string] {
  return [t.wheel.rings.important, t.wheel.rings.activities, t.wheel.rings.holidays]
}

// ─── Math helpers (locale-independent) ───────────────────────────

export function ringIdxForCategory(cat: EventCategory): 0 | 1 | 2 {
  switch (cat) {
    case 'company':
    case 'milestone':
    case 'other':
      return 0
    case 'trade_show':
    case 'training':
      return 1
    case 'holiday':
    case 'deadline':
      return 2
  }
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

export function daysInYear(y: number): number {
  return isLeapYear(y) ? 366 : 365
}

// Monday = 0 … Sunday = 6 (Norwegian convention)
export function getWeekdayIdx(date: Date): number {
  const d = date.getDay() // Sunday = 0 in JS
  return (d + 6) % 7
}

// ─── Default Norwegian weekday/date formatters ───────────────────
// Kept for backwards compatibility; prefer the `*T(date, t)` variants.

export function weekdayAbbr(date: Date): string {
  return WEEKDAY_ABBR[getWeekdayIdx(date)]
}

export function weekdayFull(date: Date): string {
  return WEEKDAY_FULL[getWeekdayIdx(date)]
}

export function formatDateNO(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date + 'T12:00:00') : date
  return `${d.getDate()}. ${MONTH_FULL[d.getMonth()].toLowerCase()}`
}

export function formatDateRangeNO(start: string, end: string): string {
  if (start === end) return formatDateNO(start)
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return `${s.getDate()}.–${e.getDate()}. ${MONTH_FULL[s.getMonth()].toLowerCase()}`
  }
  return `${formatDateNO(start)} – ${formatDateNO(end)}`
}

// ─── Localized weekday/date formatters ───────────────────────────

export function weekdayAbbrT(date: Date, t: Dictionary): string {
  // weekdaysShort is Sun-first; map Mon-first idx back to Sun-first slot.
  const monIdx = getWeekdayIdx(date)      // 0=Mon … 6=Sun
  const sunIdx = (monIdx + 1) % 7         // 0=Sun … 6=Sat
  return t.dates.weekdaysShort[sunIdx].toLowerCase()
}

export function weekdayFullT(date: Date, t: Dictionary): string {
  const monIdx = getWeekdayIdx(date)
  const sunIdx = (monIdx + 1) % 7
  return t.dates.weekdaysLower[sunIdx]
}

export function formatDateT(date: string | Date, t: Dictionary): string {
  const d = typeof date === 'string' ? new Date(date + 'T12:00:00') : date
  return `${d.getDate()}. ${t.dates.monthsLong[d.getMonth()]}`
}

export function formatDateRangeT(start: string, end: string, t: Dictionary): string {
  if (start === end) return formatDateT(start, t)
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return `${s.getDate()}.–${e.getDate()}. ${t.dates.monthsLong[s.getMonth()]}`
  }
  return `${formatDateT(start, t)} – ${formatDateT(end, t)}`
}

export function isSameYmd(a: string, b: string): boolean {
  return a.slice(0, 10) === b.slice(0, 10)
}
