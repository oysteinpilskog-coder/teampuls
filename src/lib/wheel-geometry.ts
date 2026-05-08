// Pure SVG-wheel primitives shared by every year-wheel view.
// Lifted verbatim from year-wheel.tsx so multiple wheels can render
// against the same coordinate system without duplicating math.

import { isLeapYear, daysInYear, MONTH_DAYS_COMMON, MONTH_NAMES } from '@/components/year-wheel-shared'
import { getLastISOWeek, getWeekStart } from '@/lib/dates'

// ─── Geometry ─────────────────────────────────────────────────────

export const CX = 400
export const CY = 400

export const R = {
  monthOuter: 382, monthInner: 340,
  weekOuter:  336, weekInner:  310,
  ring1Outer: 306, ring1Inner: 268,
  ring2Outer: 264, ring2Inner: 226,
  ring3Outer: 222, ring3Inner: 184,
  centerRing: 180,
  centerGlass: 160,
} as const

// ─── Month palette ───────────────────────────────────────────────
// Smooth seasonal HSL — each month has [lighter outer, darker inner] for
// radial depth. Kept for atmospheric helpers (`seasonHueFor`) and other
// places that key visuals to time-of-year. The wheel's outer month ring
// now uses `monthSweepStops` (brand-pair sweep), see below.
export const MONTH_HSL: Array<[string, string]> = [
  ['hsl(220, 75%, 68%)', 'hsl(220, 70%, 48%)'],
  ['hsl(200, 70%, 66%)', 'hsl(200, 65%, 46%)'],
  ['hsl(175, 60%, 58%)', 'hsl(175, 55%, 40%)'],
  ['hsl(140, 60%, 55%)', 'hsl(140, 55%, 38%)'],
  ['hsl(115, 55%, 52%)', 'hsl(115, 50%, 36%)'],
  ['hsl( 80, 65%, 55%)', 'hsl( 80, 60%, 38%)'],
  ['hsl( 48, 90%, 62%)', 'hsl( 42, 85%, 45%)'],
  ['hsl( 30, 90%, 60%)', 'hsl( 28, 85%, 42%)'],
  ['hsl( 18, 80%, 58%)', 'hsl( 15, 75%, 42%)'],
  ['hsl(  5, 72%, 56%)', 'hsl(  2, 68%, 40%)'],
  ['hsl(290, 50%, 56%)', 'hsl(285, 45%, 38%)'],
  ['hsl(250, 60%, 62%)', 'hsl(245, 55%, 44%)'],
]

// Brand-pair sweep around the wheel: each month is a cosine-eased blend
// between `--ember` (Jan/Dec) and `--ink` (Jul). The cosine keeps the
// transition continuous across the Dec/Jan boundary so the ring looks
// like one circular gradient instead of 12 chunky segments. Light/dark
// stops give the radial depth the seasonal palette used to provide.
export function monthSweepStops(monthIdx: number): { dark: string; light: string } {
  const t = (1 - Math.cos((2 * Math.PI * monthIdx) / 12)) / 2
  const emberPct = ((1 - t) * 100).toFixed(1)
  const base = `color-mix(in oklab, var(--ember) ${emberPct}%, var(--ink))`
  return {
    dark:  `color-mix(in oklab, ${base}, black 22%)`,
    light: `color-mix(in oklab, ${base}, white 22%)`,
  }
}

// ─── Math helpers ────────────────────────────────────────────────

export function polarPoint(r: number, deg: number) {
  const rad = (deg - 90) * (Math.PI / 180)
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) }
}

export function f(n: number) { return n.toFixed(2) }

export function annularArc(
  outerR: number, innerR: number,
  startDeg: number, endDeg: number,
  gap = 0.5,
): string {
  const s = startDeg + gap
  const e = endDeg - gap
  if (e <= s) return ''
  const o1 = polarPoint(outerR, s)
  const o2 = polarPoint(outerR, e)
  const i1 = polarPoint(innerR, e)
  const i2 = polarPoint(innerR, s)
  const large = (e - s) > 180 ? 1 : 0
  return `M${f(o1.x)},${f(o1.y)} A${outerR},${outerR},0,${large},1,${f(o2.x)},${f(o2.y)} L${f(i1.x)},${f(i1.y)} A${innerR},${innerR},0,${large},0,${f(i2.x)},${f(i2.y)} Z`
}

export function pieSlice(r: number, startDeg: number, endDeg: number): string {
  const o1 = polarPoint(r, startDeg)
  const o2 = polarPoint(r, endDeg)
  const large = (endDeg - startDeg) > 180 ? 1 : 0
  return `M${CX},${CY} L${f(o1.x)},${f(o1.y)} A${r},${r},0,${large},1,${f(o2.x)},${f(o2.y)} Z`
}

// A straight radial line at `midDeg` between two radii, usable as a textPath
// target so an event label can read outward (or inward in the bottom half
// so the glyphs stay upright for the viewer). This is the "Plandisc look":
// short events no longer lose their label to the tangential arc being too
// narrow — the radial width of the ring (~32 px) is always available.
export function radialLinePath(rInner: number, rOuter: number, deg: number): string {
  // Top half (330°..30° roughly): read inner → outer so letters climb outward.
  // Bottom half: read outer → inner so letters remain upright for the viewer.
  const normalized = ((deg % 360) + 360) % 360
  const flip = normalized > 90 && normalized < 270
  const pFrom = polarPoint(flip ? rOuter : rInner, deg)
  const pTo   = polarPoint(flip ? rInner : rOuter, deg)
  return `M${f(pFrom.x)},${f(pFrom.y)} L${f(pTo.x)},${f(pTo.y)}`
}

// An arc path for textPath placement. Direction reverses in bottom half
// so characters render upright all the way around the wheel.
export function labelArcPath(r: number, startDeg: number, endDeg: number): string {
  // Normalise: support ranges that cross 0° (e.g. 340° → 20°) by extending endDeg.
  const s = startDeg
  let e = endDeg
  if (e < s) e += 360
  const mid = ((s + e) / 2) % 360
  const reverse = mid > 90 && mid < 270
  const pad = 0.4
  const a = reverse ? e - pad : s + pad
  const b = reverse ? s + pad : e - pad
  const p1 = polarPoint(r, a)
  const p2 = polarPoint(r, b)
  const sweep = reverse ? 0 : 1
  const large = Math.abs(b - a) > 180 ? 1 : 0
  return `M${f(p1.x)},${f(p1.y)} A${r},${r},0,${large},${sweep},${f(p2.x)},${f(p2.y)}`
}

// ─── Date → angle helpers ────────────────────────────────────────

export function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0)
  return Math.floor((date.getTime() - start.getTime()) / 86400000)
}

export function dateStringToDeg(dateStr: string, year: number): number {
  const d = new Date(dateStr + 'T12:00:00')
  if (d.getFullYear() < year) return 0
  if (d.getFullYear() > year) return 360
  return (dayOfYear(d) / daysInYear(year)) * 360
}

export type MonthSegment = { name: string; start: number; end: number; idx: number }
export type WeekSegment = { weekNum: number; start: number; end: number }

export function getMonthSegments(year: number): MonthSegment[] {
  const days = [...MONTH_DAYS_COMMON]
  if (isLeapYear(year)) days[1] = 29
  const total = daysInYear(year)
  let acc = 0
  return MONTH_NAMES.map((name, i) => {
    const start = (acc / total) * 360
    acc += days[i]
    return { name, start, end: (acc / total) * 360, idx: i }
  })
}

export function getWeekSegments(year: number): WeekSegment[] {
  const total = daysInYear(year)
  const lastWeek = getLastISOWeek(year)
  const segs: WeekSegment[] = []
  for (let w = 1; w <= lastWeek; w++) {
    const mon = getWeekStart(w, year)
    const nextMon = getWeekStart(w + 1, year)
    const startDay = mon.getFullYear() < year ? 0 : dayOfYear(mon)
    const endDay = nextMon.getFullYear() > year ? total : dayOfYear(nextMon)
    segs.push({
      weekNum: w,
      start: (startDay / total) * 360,
      end: (endDay / total) * 360,
    })
  }
  return segs
}

// Position a recurring month/day (birthday, work-anniversary) on the wheel
// for a specific calendar year. Feb 29 in a non-leap year clamps to Feb 28
// and returns `clampedLeapDay: true` so the caller can show a footnote.
export function monthDayToDeg(month: number, day: number, year: number): {
  deg: number
  clampedLeapDay: boolean
} {
  const m = month
  let d = day
  let clampedLeapDay = false
  if (m === 1 && d === 29 && !isLeapYear(year)) {
    d = 28
    clampedLeapDay = true
  }
  const date = new Date(year, m, d, 12, 0, 0)
  const deg = (dayOfYear(date) / daysInYear(year)) * 360
  return { deg, clampedLeapDay }
}
