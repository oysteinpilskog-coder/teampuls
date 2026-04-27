/**
 * Norwegian public holidays. Pure, dependency-free, deterministic.
 *
 * Fixed dates: 1. januar, 1. mai, 17. mai, 25. desember, 26. desember.
 * Easter-derived: skjærtorsdag (-3), langfredag (-2), 1. påskedag (0),
 * 2. påskedag (+1), Kr. himmelfart (+39), 1. pinsedag (+49), 2. pinsedag (+50).
 *
 * Easter is computed via the anonymous Gregorian algorithm (Computus). No
 * external `@nager/date` dependency — Norwegian holidays are stable enough
 * that pulling 50 KB of multi-country tables to read seven offsets isn't
 * worth it. If we ever need more countries we can swap to `date-holidays`.
 */

function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

const FIXED_HOLIDAYS: Array<readonly [number, number]> = [
  [1, 1],
  [5, 1],
  [5, 17],
  [12, 25],
  [12, 26],
]

const EASTER_OFFSETS = [-3, -2, 0, 1, 39, 49, 50]

export function isPublicHolidayNO(date: Date): boolean {
  const m = date.getMonth() + 1
  const d = date.getDate()
  if (FIXED_HOLIDAYS.some(([fm, fd]) => fm === m && fd === d)) return true
  const easter = easterSunday(date.getFullYear())
  return EASTER_OFFSETS.some((off) => {
    const h = new Date(easter)
    h.setDate(easter.getDate() + off)
    return sameDay(h, date)
  })
}
