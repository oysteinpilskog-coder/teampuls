import { getISOWeek, getISOWeekYear, startOfISOWeek, addDays, format } from 'date-fns'

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

const WEEKDAY_SHORT: Record<number, string> = {
  1: 'Man', 2: 'Tir', 3: 'Ons', 4: 'Tor', 5: 'Fre', 6: 'Lør', 0: 'Søn',
}
const MONTH_SHORT: Record<number, string> = {
  0: 'jan', 1: 'feb', 2: 'mar', 3: 'apr', 4: 'mai', 5: 'jun',
  6: 'jul', 7: 'aug', 8: 'sep', 9: 'okt', 10: 'nov', 11: 'des',
}

export interface DayLabel {
  weekday: string   // 'Man'
  day: number       // 20
  month: string     // 'apr'
}

export function getDayLabel(date: Date): DayLabel {
  return {
    weekday: WEEKDAY_SHORT[date.getDay()],
    day: date.getDate(),
    month: MONTH_SHORT[date.getMonth()],
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

export const MONTH_LONG_NB: Record<number, string> = {
  0: 'januar', 1: 'februar', 2: 'mars', 3: 'april', 4: 'mai', 5: 'juni',
  6: 'juli', 7: 'august', 8: 'september', 9: 'oktober', 10: 'november', 11: 'desember',
}

export const WEEKDAY_LONG_NB: Record<number, string> = {
  0: 'Søndag', 1: 'Mandag', 2: 'Tirsdag', 3: 'Onsdag',
  4: 'Torsdag', 5: 'Fredag', 6: 'Lørdag',
}

/** Full Norwegian date label: "Mandag 20. april" */
export function formatDateLabelLong(date: Date): string {
  return `${WEEKDAY_LONG_NB[date.getDay()]} ${date.getDate()}. ${MONTH_LONG_NB[date.getMonth()]}`
}
