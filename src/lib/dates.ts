import { getISOWeek, getISOWeekYear, startOfISOWeek, addDays, format } from 'date-fns'
import { no } from './i18n/no'
import type { Dictionary } from './i18n/types'

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
