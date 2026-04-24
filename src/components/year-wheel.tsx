'use client'

import { Fragment, useState, useEffect, useCallback, useRef, useId, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { getISOWeek, getWeekStart, getLastISOWeek } from '@/lib/dates'
import { spring } from '@/lib/motion'
import { CATEGORY_COLORS, EventEditor } from '@/components/event-editor'
import { useEvents } from '@/hooks/use-events'
import type { OrgEvent } from '@/lib/supabase/types'
import { useT } from '@/lib/i18n/context'
import type { Dictionary } from '@/lib/i18n/types'
import {
  MONTH_NAMES, MONTH_DAYS_COMMON,
  RINGS, ringIdxForCategory,
  isLeapYear, daysInYear, getWeekdayIdx,
  monthFullT, categoryLabelsT, ringNamesT,
  weekdayAbbrT, weekdayFullT,
  type ViewMode,
} from './year-wheel-shared'
import { ListView } from './year-wheel-list'
import { CalendarView } from './year-wheel-calendar'

// ─── Geometry ─────────────────────────────────────────────────────

const CX = 400
const CY = 400

const R = {
  monthOuter: 382, monthInner: 340,
  weekOuter:  336, weekInner:  310,
  ring1Outer: 306, ring1Inner: 274,
  ring2Outer: 270, ring2Inner: 238,
  ring3Outer: 234, ring3Inner: 202,
  centerRing: 196,
  centerGlass: 176,
}

const RING_BOUNDS = [
  { outer: R.ring1Outer, inner: R.ring1Inner, mid: (R.ring1Outer + R.ring1Inner) / 2 },
  { outer: R.ring2Outer, inner: R.ring2Inner, mid: (R.ring2Outer + R.ring2Inner) / 2 },
  { outer: R.ring3Outer, inner: R.ring3Inner, mid: (R.ring3Outer + R.ring3Inner) / 2 },
] as const

// Fallback ring-label positions used only when a ring has no events at all.
// Scattered so the three labels never stack on top of each other.
const RING_LABEL_FALLBACK: Array<[number, number]> = [
  [336,  24],  // ring 0 (Viktige datoer) — across New Year, top
  [256, 304],  // ring 1 (Aktiviteter)    — left side
  [156, 204],  // ring 2 (Merkedager)     — bottom
]

// Each ring label needs ~30° of clear arc. We aim for a 56° "ideal" arc so the
// letters land with breathing room, but shrink to fit smaller gaps and hide
// entirely if no gap on the ring is wide enough.
const RING_LABEL_MIN_SPAN  = 30
const RING_LABEL_IDEAL_ARC = 56

// ─── Month palette ───────────────────────────────────────────────
// Smooth seasonal HSL — each month has [lighter outer, darker inner] for radial depth.
const MONTH_HSL: Array<[string, string]> = [
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

// ─── Math helpers ────────────────────────────────────────────────

function polarPoint(r: number, deg: number) {
  const rad = (deg - 90) * (Math.PI / 180)
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) }
}

function f(n: number) { return n.toFixed(2) }

function annularArc(
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

function pieSlice(r: number, startDeg: number, endDeg: number): string {
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
function radialLinePath(rInner: number, rOuter: number, deg: number): string {
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
function labelArcPath(r: number, startDeg: number, endDeg: number): string {
  // Normalise: support ranges that cross 0° (e.g. 340° → 20°) by extending endDeg.
  let s = startDeg
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

// Find the largest event-free arc on a given ring and return a centered
// label range inside it. Returns null when no gap is wide enough to fit
// the label cleanly — the caller should hide that ring's label.
function computeRingLabelRange(
  events: OrgEvent[],
  ringIdx: number,
  year: number,
): [number, number] | null {
  const occupied: Array<[number, number]> = events
    .filter(ev => ringIdxForCategory(ev.category) === ringIdx)
    .map(ev => {
      const start = dateStringToDeg(ev.start_date, year)
      const end   = dateStringToDeg(ev.end_date, year) + (360 / daysInYear(year))
      return [start, Math.min(end, 360)] as [number, number]
    })
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0])

  if (occupied.length === 0) return RING_LABEL_FALLBACK[ringIdx]

  // Merge overlaps so adjacent events count as one occupied block.
  const merged: Array<[number, number]> = []
  for (const [s, e] of occupied) {
    const last = merged[merged.length - 1]
    if (last && s <= last[1] + 0.5) last[1] = Math.max(last[1], e)
    else merged.push([s, e])
  }

  // Largest gap, considering wrap-around from last block back to first.
  let bestStart = merged[merged.length - 1][1]
  let bestSpan  = merged[0][0] + 360 - bestStart
  for (let i = 0; i < merged.length - 1; i++) {
    const span = merged[i + 1][0] - merged[i][1]
    if (span > bestSpan) {
      bestSpan = span
      bestStart = merged[i][1]
    }
  }

  if (bestSpan < RING_LABEL_MIN_SPAN) return null

  const center = bestStart + bestSpan / 2
  const half   = Math.min(RING_LABEL_IDEAL_ARC, bestSpan - 4) / 2
  const norm   = (deg: number) => ((deg % 360) + 360) % 360
  return [norm(center - half), norm(center + half)]
}

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0)
  return Math.floor((date.getTime() - start.getTime()) / 86400000)
}

function dateStringToDeg(dateStr: string, year: number): number {
  const d = new Date(dateStr + 'T12:00:00')
  if (d.getFullYear() < year) return 0
  if (d.getFullYear() > year) return 360
  return (dayOfYear(d) / daysInYear(year)) * 360
}

function getMonthSegments(year: number) {
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

function getWeekSegments(year: number) {
  const total = daysInYear(year)
  const lastWeek = getLastISOWeek(year)
  const segs: Array<{ weekNum: number; start: number; end: number }> = []
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

// ─── Month-focus math ─────────────────────────────────────────────

function getDaySegments(year: number, month: number) {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  return Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(year, month, i + 1)
    const weekdayIdx = (d.getDay() + 6) % 7
    return {
      day: i + 1,
      start: (i / daysInMonth) * 360,
      end: ((i + 1) / daysInMonth) * 360,
      weekdayIdx,
      isWeekend: weekdayIdx >= 5,
    }
  })
}

function getMonthWeekSegments(year: number, month: number) {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const segs: Array<{ weekNum: number; start: number; end: number }> = []
  let currentWeek: number | null = null
  let segStartDay = 1
  for (let day = 1; day <= daysInMonth; day++) {
    const week = getISOWeek(new Date(year, month, day))
    if (week !== currentWeek) {
      if (currentWeek !== null) {
        segs.push({
          weekNum: currentWeek,
          start: ((segStartDay - 1) / daysInMonth) * 360,
          end:   ((day - 1)         / daysInMonth) * 360,
        })
      }
      currentWeek = week
      segStartDay = day
    }
  }
  if (currentWeek !== null) {
    segs.push({
      weekNum: currentWeek,
      start: ((segStartDay - 1) / daysInMonth) * 360,
      end: 360,
    })
  }
  return segs
}

function monthEventArc(event: OrgEvent, year: number, month: number): {
  startDeg: number; endDeg: number
  continuesBefore: boolean; continuesAfter: boolean
} | null {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthFirst = new Date(year, month, 1, 12, 0, 0)
  const monthLast  = new Date(year, month + 1, 0, 12, 0, 0)
  const evStart = new Date(event.start_date + 'T12:00:00')
  const evEnd   = new Date(event.end_date   + 'T12:00:00')
  if (evEnd < monthFirst || evStart > monthLast) return null

  const clippedStart = evStart < monthFirst ? monthFirst : evStart
  const clippedEnd   = evEnd   > monthLast  ? monthLast  : evEnd
  const startDayIdx = clippedStart.getDate() - 1
  const endDayIdx   = clippedEnd.getDate()
  return {
    startDeg: (startDayIdx / daysInMonth) * 360,
    endDeg:   (endDayIdx   / daysInMonth) * 360,
    continuesBefore: evStart < monthFirst,
    continuesAfter:  evEnd   > monthLast,
  }
}

function todayDegInMonth(today: Date, year: number, month: number): number | null {
  if (today.getFullYear() !== year || today.getMonth() !== month) return null
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const dayIdx = today.getDate() - 1
  const hourFrac = today.getHours() / 24
  return ((dayIdx + hourFrac) / daysInMonth) * 360
}

// ─── Types ────────────────────────────────────────────────────────

type HoverInfo = { type: 'month' | 'week' | 'event' | 'ring'; label: string; sublabel?: string }

interface YearWheelProps {
  orgId: string
}

// ─── Main component ─────────────────────────────────────────────

export function YearWheel({ orgId }: YearWheelProps) {
  const year = new Date().getFullYear()
  // Live clock: tick every 20 s so the minute display is always fresh
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 20_000)
    return () => clearInterval(id)
  }, [])
  const today = now

  const [view, setView] = useState<ViewMode>('disk')
  const { events, refetch: refetchEvents } = useEvents(orgId, year)
  const [orgLogo, setOrgLogo] = useState<string | null>(null)
  const [orgName, setOrgName] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<OrgEvent | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [editingEvent, setEditingEvent] = useState<OrgEvent | null>(null)

  // Fullscreen: only on the disk view — list/calendar read better at page scale
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
  }, [])

  useEffect(() => {
    function onFsChange() { setIsFullscreen(!!document.fullscreenElement) }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  // "F" shortcut mirrors the dashboard's behaviour; only active on the disk view.
  useEffect(() => {
    if (view !== 'disk') return
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        toggleFullscreen()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view, toggleFullscreen])

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('organizations')
      .select('logo_url, name')
      .eq('id', orgId)
      .maybeSingle()
      .then(({ data }) => {
        setOrgLogo(data?.logo_url ?? null)
        setOrgName(data?.name ?? null)
      })
  }, [orgId])

  const onEditorClose = () => {
    setShowEditor(false)
    setEditingEvent(null)
    setSelectedEvent(null)
  }

  const openEditor = (ev: OrgEvent | null) => {
    setEditingEvent(ev)
    setSelectedEvent(ev)
    setShowEditor(true)
  }

  const showDiskChrome = view === 'disk' && !isFullscreen
  const hours   = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const currentWeekNum = getISOWeek(today)

  return (
    <div
      ref={containerRef}
      className={
        isFullscreen
          ? 'relative h-screen w-screen flex flex-col overflow-hidden'
          : 'relative w-full flex flex-col items-center gap-5'
      }
      style={isFullscreen ? { background: 'var(--bg-primary)' } : undefined}
    >
      {!isFullscreen && (
        <Toolbar view={view} onViewChange={setView} onCreate={() => openEditor(null)} />
      )}

      {/* Fullscreen header: org name, year, live clock */}
      {isFullscreen && view === 'disk' && (
        <header className="flex items-center justify-between px-10 pt-8 pb-2 flex-shrink-0">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring.gentle, delay: 0.1 }}
          >
            {orgName && (
              <p
                className="text-[12px] font-semibold tracking-[0.28em] uppercase"
                style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
              >
                {orgName}
              </p>
            )}
            <p
              className="text-[32px] font-semibold tracking-tight leading-none mt-1"
              style={{
                fontFamily: 'var(--font-sora)',
                color: 'var(--text-primary)',
                letterSpacing: '-0.015em',
              }}
            >
              Årshjulet · {year}
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring.gentle, delay: 0.18 }}
            className="flex items-baseline gap-4"
          >
            <span
              className="text-[11px] font-semibold tracking-[0.24em] uppercase tabular-nums"
              style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
            >
              UKE {String(currentWeekNum).padStart(2, '0')}
            </span>
            <span
              className="tabular-nums"
              style={{
                fontSize: '56px',
                fontWeight: 700,
                fontFamily: 'var(--font-sora)',
                letterSpacing: '-0.04em',
                color: 'var(--text-primary)',
                lineHeight: 1,
              }}
            >
              {hours}:{minutes}
            </span>
          </motion.div>
        </header>
      )}

      <AnimatePresence mode="wait">
        {view === 'disk' && (
          <motion.div
            key="disk"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className={
              isFullscreen
                ? 'flex-1 min-h-0 w-full flex items-stretch gap-6 px-10 pb-10'
                : 'w-full flex justify-center'
            }
          >
            {isFullscreen ? (
              <>
                {/* Wheel card (fills remaining width, aspect-square by height) */}
                <div
                  className="flex-1 relative rounded-3xl flex items-center justify-center overflow-hidden"
                  style={{
                    background:
                      'linear-gradient(155deg, color-mix(in oklab, var(--bg-elevated) 50%, transparent) 0%, color-mix(in oklab, var(--bg-elevated) 18%, transparent) 100%)',
                    border: '1px solid var(--border-subtle)',
                    boxShadow: 'inset 0 1px 0 color-mix(in oklab, white 6%, transparent)',
                  }}
                >
                  {/* Inner padding wrapper: stops bloom/today-pin glow from clipping
                      on the viewport edge and gives the circle breathing room. */}
                  <div className="relative h-full w-full flex items-center justify-center p-6">
                    <DiskView
                      year={year}
                      today={today}
                      events={events}
                      orgLogo={orgLogo}
                      selectedEvent={selectedEvent}
                      onSelectEvent={openEditor}
                      hideAgenda
                    />
                  </div>
                </div>

                {/* Agenda rail — premium sidebar with today + upcoming events.
                    No-op onSelect: the editor modal is intentionally disabled in
                    fullscreen so the wheel stays the hero. */}
                <aside className="w-[380px] flex-shrink-0">
                  <Agenda events={events} today={today} onSelect={() => {}} />
                </aside>
              </>
            ) : (
              <DiskView
                year={year}
                today={today}
                events={events}
                orgLogo={orgLogo}
                selectedEvent={selectedEvent}
                onSelectEvent={openEditor}
              />
            )}
          </motion.div>
        )}

        {view === 'list' && !isFullscreen && (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="w-full"
          >
            <ListView
              year={year}
              today={today}
              events={events}
              onSelect={openEditor}
            />
          </motion.div>
        )}

        {view === 'calendar' && !isFullscreen && (
          <motion.div
            key="cal"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="w-full"
          >
            <CalendarView
              year={year}
              today={today}
              events={events}
              onSelect={openEditor}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Editor modal (never during fullscreen — the hero is the wheel itself) */}
      {!isFullscreen && (
        <EventEditor
          open={showEditor}
          onClose={onEditorClose}
          orgId={orgId}
          event={editingEvent}
          onMutated={refetchEvents}
        />
      )}

      {/* Floating fullscreen button — only on the disk view. Bottom-left so it
          never fights the Toolbar (top) or Agenda (right). */}
      {(showDiskChrome || isFullscreen) && (
        <motion.button
          onClick={toggleFullscreen}
          type="button"
          aria-label={isFullscreen ? 'Avslutt fullskjerm (F)' : 'Fullskjerm (F)'}
          title={isFullscreen ? 'Avslutt fullskjerm (F)' : 'Fullskjerm (F)'}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.3 }}
          whileHover={{ scale: 1.04, y: -1 }}
          whileTap={{ scale: 0.96 }}
          className="fixed bottom-6 right-6 z-40 flex items-center justify-center w-11 h-11 rounded-full"
          style={{
            background: 'color-mix(in oklab, var(--bg-elevated) 82%, transparent)',
            backdropFilter: 'blur(22px) saturate(180%)',
            WebkitBackdropFilter: 'blur(22px) saturate(180%)',
            border: '1px solid var(--border-subtle)',
            boxShadow: 'var(--shadow-md), inset 0 1px 0 color-mix(in oklab, white 14%, transparent)',
            color: 'var(--text-primary)',
          }}
        >
          {isFullscreen ? (
            <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4" aria-hidden>
              <path d="M7 3H3v4M13 3h4v4M7 17H3v-4M13 17h4v-4" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4" aria-hidden>
              <path d="M3 7V3h4M17 7V3h-4M3 13v4h4M17 13v4h-4" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </motion.button>
      )}
    </div>
  )
}

// ─── Toolbar: Tabs + Create button ──────────────────────────────

const TABS: Array<{ key: ViewMode; label: string; icon: string }> = [
  { key: 'disk',     label: 'Årshjul',  icon: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z' },
  { key: 'list',     label: 'Liste',    icon: 'M4 6h16 M4 12h16 M4 18h10' },
  { key: 'calendar', label: 'Kalender', icon: 'M4 5h16v15H4z M4 9h16 M9 3v4 M15 3v4' },
]

function Toolbar({
  view, onViewChange, onCreate,
}: {
  view: ViewMode
  onViewChange: (v: ViewMode) => void
  onCreate: () => void
}) {
  return (
    <div className="flex items-center justify-between w-full max-w-[1180px] gap-4">
      <div
        className="relative flex items-center gap-0.5 p-1 rounded-full"
        style={{
          background: 'color-mix(in oklab, var(--bg-elevated) 70%, transparent)',
          backdropFilter: 'blur(18px) saturate(180%)',
          WebkitBackdropFilter: 'blur(18px) saturate(180%)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {TABS.map(t => {
          const active = view === t.key
          return (
            <button
              key={t.key}
              onClick={() => onViewChange(t.key)}
              className="relative flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-medium transition-colors"
              style={{
                color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
                fontFamily: 'var(--font-body)',
              }}
            >
              {active && (
                <motion.div
                  layoutId="active-tab-pill"
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: 'color-mix(in oklab, var(--bg-primary) 90%, transparent)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px var(--border-subtle) inset',
                  }}
                  transition={{ type: 'spring', bounce: 0.25, duration: 0.5 }}
                />
              )}
              <svg viewBox="0 0 24 24" className="relative w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d={t.icon} />
              </svg>
              <span className="relative">{t.label}</span>
            </button>
          )
        })}
      </div>

      <motion.button
        onClick={onCreate}
        whileHover={{ scale: 1.03, y: -1 }} whileTap={{ scale: 0.97 }}
        transition={spring.snappy}
        className="flex items-center gap-2 px-4 py-2.5 rounded-full text-[13px] font-medium"
        style={{
          background: 'color-mix(in oklab, var(--accent-color) 92%, transparent)',
          color: '#fff',
          fontFamily: 'var(--font-body)',
          boxShadow: 'var(--shadow-accent), 0 1px 0 rgba(255,255,255,0.35) inset',
          backdropFilter: 'blur(18px) saturate(180%)',
          WebkitBackdropFilter: 'blur(18px) saturate(180%)',
        }}
      >
        <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
          <path d="M8 3v10M3 8h10" stroke="white" strokeWidth={2} strokeLinecap="round" />
        </svg>
        Ny hendelse
      </motion.button>
    </div>
  )
}

// ─── Disk View: the wheel + agenda ─────────────────────────────

export interface DiskViewProps {
  year: number
  today: Date
  events: OrgEvent[]
  orgLogo: string | null
  selectedEvent: OrgEvent | null
  onSelectEvent: (ev: OrgEvent | null) => void
  /**
   * TV/ambient mode: disables hover tooltips, month-focus click, and mouse
   * parallax. Replaces pointer-driven motion with a slow autonomous drift so
   * the wheel feels alive on a display nobody is touching.
   */
  tvMode?: boolean
  /**
   * Hides the Agenda side panel. Dashboard loop uses this so the wheel alone
   * carries the view.
   */
  hideAgenda?: boolean
}

export function DiskView({
  year, today, events, orgLogo, selectedEvent, onSelectEvent,
  tvMode = false, hideAgenda = false,
}: DiskViewProps) {
  const t = useT()
  const MONTH_FULL_L = monthFullT(t)
  const CATEGORY_LABELS_L = categoryLabelsT(t)
  const RING_NAMES_L = ringNamesT(t)
  const uid = useId().replace(/:/g, '')

  const todayDeg = (dayOfYear(today) / daysInYear(year)) * 360
  const currentWeek = getISOWeek(today)
  const currentMonth = today.getMonth()

  // Seasonal tint: derive hue from the current month's outer-palette colour
  const seasonHue = useMemo(() => {
    const match = MONTH_HSL[currentMonth][0].match(/hsl\((\s*-?\d+(?:\.\d+)?)/)
    return match ? Number(match[1].trim()) : 220
  }, [currentMonth])

  const monthSegs = getMonthSegments(year)
  const weekSegs  = getWeekSegments(year)

  // Auto-place each ring's watermark label into its largest event-free arc.
  // null = no clean gap, so we skip rendering that label entirely.
  const ringLabelRanges = useMemo(
    () => RINGS.map((_, i) => computeRingLabelRange(events, i, year)),
    [events, year],
  )

  const [hover, setHoverState] = useState<HoverInfo | null>(null)
  const setHover = useCallback((info: HoverInfo | null) => {
    if (tvMode) return
    setHoverState(info)
  }, [tvMode])
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const [focusedMonth, setFocusedMonth] = useState<number | null>(null)
  // Normalised pointer offset for aurora parallax: [-1..1] in both axes, 0 = no hover
  const [parallax, setParallax] = useState({ x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement>(null)

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (tvMode) return
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    // Normalise to [-1, 1]
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1
    setParallax({ x: nx, y: ny })
  }
  function onMouseLeaveWheel() {
    if (tvMode) return
    setHoverState(null)
    setParallax({ x: 0, y: 0 })
  }

  // TV/ambient drift: sweep parallax around the wheel in a slow Lissajous loop
  // so the aurora blobs keep breathing even when no cursor is present.
  useEffect(() => {
    if (!tvMode) return
    let frame = 0
    const start = performance.now()
    function tick(now: number) {
      const t = (now - start) / 1000
      setParallax({
        x: Math.sin(t * 0.11) * 0.55,
        y: Math.cos(t * 0.09) * 0.55,
      })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [tvMode])

  const enterFocus = useCallback((idx: number) => {
    if (tvMode) return
    onSelectEvent(null)
    setFocusedMonth(idx)
  }, [onSelectEvent, tvMode])

  const exitFocus = useCallback(() => setFocusedMonth(null), [])

  // Esc exits focus mode
  useEffect(() => {
    if (focusedMonth === null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setFocusedMonth(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focusedMonth])

  // Precompute data for focused-month rendering
  const focus = useMemo(() => {
    if (focusedMonth === null) return null
    const m = focusedMonth
    const daySegs = getDaySegments(year, m)
    const weekSegsM = getMonthWeekSegments(year, m)
    const mEvents = events
      .map(ev => {
        const arc = monthEventArc(ev, year, m)
        return arc ? { ev, arc } : null
      })
      .filter((x): x is { ev: OrgEvent; arc: NonNullable<ReturnType<typeof monthEventArc>> } => x !== null)
    return {
      month: m,
      daySegs,
      weekSegs: weekSegsM,
      events: mEvents,
      todayDeg: todayDegInMonth(today, year, m),
    }
  }, [focusedMonth, year, today, events])

  // Active today-deg depending on view mode
  const activeTodayDeg = focus ? focus.todayDeg : todayDeg
  const activeTodayTip = activeTodayDeg !== null ? polarPoint(R.monthOuter - 2, activeTodayDeg) : null

  const ID = {
    glow: `glow-${uid}`,
    bloom: `bloom-${uid}`,
    softShadow: `softShadow-${uid}`,
    aurora: `aurora-${uid}`,
    centerBg: `centerBg-${uid}`,
    weekActive: `weekActive-${uid}`,
    todayBeam: `todayBeam-${uid}`,
    month: (i: number) => `month-${i}-${uid}`,
    monthPath: (i: number) => `mp-${i}-${uid}`,
    event: (id: string) => `ev-${id}-${uid}`,
    eventPath: (id: string) => `evp-${id}-${uid}`,
    eventPathM: (id: string) => `evpm-${id}-${uid}`,
    eventRadial:  (id: string) => `evr-${id}-${uid}`,
    eventRadialM: (id: string) => `evrm-${id}-${uid}`,
    dayPath: (d: number) => `dp-${d}-${uid}`,
    ringPath: (i: number) => `rp-${i}-${uid}`,
  }

  return (
    <div
      className={
        hideAgenda
          ? 'relative h-full w-full flex items-center justify-center'
          : 'relative w-full max-w-[1180px] flex items-start gap-5 xl:gap-7 justify-center flex-wrap xl:flex-nowrap'
      }
    >
      {/* Wheel container. In hideAgenda mode the wheel is sized by the
          container's height — this keeps the circle from clipping when the
          parent is wider than it is tall (dashboard glass card). */}
      <div
        className={
          hideAgenda
            ? 'relative h-full aspect-square max-w-full flex-shrink-0'
            : 'relative w-full max-w-[820px] aspect-square flex-shrink-0'
        }
      >
        {/* Back chip — shown in month-focus mode */}
        <AnimatePresence>
          {focus !== null && (
            <motion.button
              key="back-chip"
              onClick={exitFocus}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={spring.snappy}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="absolute top-2 left-2 z-20 flex items-center gap-1.5 px-3 py-2 rounded-full text-[12px] font-medium"
              style={{
                background: 'color-mix(in oklab, var(--bg-elevated) 82%, transparent)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-body)',
                backdropFilter: 'blur(18px) saturate(180%)',
                WebkitBackdropFilter: 'blur(18px) saturate(180%)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-sm)',
              }}
              aria-label="Tilbake til årsvisning"
            >
              <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5">
                <path d="M10 3l-5 5 5 5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Tilbake
              <span
                className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold tabular-nums"
                style={{
                  color: 'var(--text-tertiary)',
                  background: 'var(--bg-subtle)',
                  letterSpacing: '0.08em',
                }}
              >
                ESC
              </span>
            </motion.button>
          )}
        </AnimatePresence>

        {/* Aurora backdrop + grain. Seasonal hue comes from current month; blobs drift + parallax on hover. */}
        <div className="absolute inset-0 overflow-hidden rounded-full pointer-events-none" aria-hidden>
          <motion.div
            className="absolute inset-[-18%] rounded-full"
            style={{
              background: `radial-gradient(circle at 30% 30%, hsla(${seasonHue}, 88%, 66%, 0.30), transparent 58%)`,
              filter: 'blur(44px)',
            }}
            animate={{
              x: [0, 20, -10, 0].map(v => v + parallax.x * 18),
              y: [0, -15, 10, 0].map(v => v + parallax.y * 18),
            }}
            transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute inset-[-18%] rounded-full"
            style={{
              background: `radial-gradient(circle at 75% 40%, hsla(${(seasonHue + 60) % 360}, 92%, 62%, 0.22), transparent 58%)`,
              filter: 'blur(44px)',
            }}
            animate={{
              x: [0, -18, 12, 0].map(v => v - parallax.x * 22),
              y: [0, 14, -8, 0].map(v => v - parallax.y * 22),
            }}
            transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute inset-[-18%] rounded-full"
            style={{
              background: `radial-gradient(circle at 50% 80%, hsla(${(seasonHue + 300) % 360}, 65%, 62%, 0.24), transparent 58%)`,
              filter: 'blur(46px)',
            }}
            animate={{
              x: [0, 14, -16, 0].map(v => v + parallax.x * 14),
              y: [0, -10, 12, 0].map(v => v + parallax.y * 14),
            }}
            transition={{ duration: 30, repeat: Infinity, ease: 'easeInOut' }}
          />
          <div
            className="absolute inset-0 mix-blend-overlay"
            style={{
              opacity: 0.08,
              backgroundImage:
                "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='4' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.9 0'/></filter><rect width='240' height='240' filter='url(%23n)'/></svg>\")",
              backgroundSize: '240px 240px',
            }}
          />
        </div>

        <motion.svg
          ref={svgRef}
          viewBox="0 0 800 800"
          className="relative w-full h-full"
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeaveWheel}
          initial={{ opacity: 0, rotate: -6, scale: 0.96 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          transition={{ ...spring.smooth, delay: 0.05 }}
        >
          <defs>
            {/* Soft bloom */}
            <filter id={ID.bloom} x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="6" result="b1" />
              <feGaussianBlur stdDeviation="2" in="SourceGraphic" result="b2" />
              <feMerge>
                <feMergeNode in="b1" />
                <feMergeNode in="b2" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <filter id={ID.glow} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <filter id={ID.softShadow} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.12" />
            </filter>

            {/* Month gradients */}
            {MONTH_HSL.map(([light, dark], i) => (
              <radialGradient
                key={i}
                id={ID.month(i)}
                cx={CX} cy={CY}
                r={R.monthOuter}
                gradientUnits="userSpaceOnUse"
              >
                <stop offset={R.monthInner / R.monthOuter} stopColor={dark} />
                <stop offset="1" stopColor={light} />
              </radialGradient>
            ))}

            {/* Per-event gradients — positioned at the correct ring */}
            {events.map(ev => {
              const base = ev.color ?? CATEGORY_COLORS[ev.category]
              const ri = ringIdxForCategory(ev.category)
              const rOut = RING_BOUNDS[ri].outer
              const rIn  = RING_BOUNDS[ri].inner
              return (
                <radialGradient
                  key={ev.id}
                  id={ID.event(ev.id)}
                  cx={CX} cy={CY}
                  r={rOut}
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset={rIn / rOut} stopColor={base} stopOpacity="0.62" />
                  <stop offset="1" stopColor={base} stopOpacity="0.95" />
                </radialGradient>
              )
            })}

            {/* Current-week ring — Nordlys gradient.
                The wheel's "once per flate" signature moment. The current
                week is literally "det ene du ser tydelig akkurat nå" — so
                Nordlys makes the most brand-loaded beat available. */}
            <linearGradient id={ID.weekActive} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#00F5A0" />
              <stop offset="55%" stopColor="#00D9F5" />
              <stop offset="100%" stopColor="#7C3AED" />
            </linearGradient>

            <radialGradient id={ID.aurora} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--accent-color)" stopOpacity="0.28" />
              <stop offset="55%" stopColor="var(--accent-color)" stopOpacity="0.08" />
              <stop offset="100%" stopColor="var(--accent-color)" stopOpacity="0" />
            </radialGradient>

            <radialGradient id={ID.centerBg} cx="50%" cy="35%" r="80%">
              <stop offset="0%" stopColor="var(--bg-elevated)" stopOpacity="0.98" />
              <stop offset="65%" stopColor={`hsla(${seasonHue}, 70%, 88%, 0.38)`} stopOpacity="0.95" />
              <stop offset="100%" stopColor="var(--bg-elevated)" stopOpacity="0.82" />
            </radialGradient>

            {/* Today beam gradient — soft spotlight */}
            <radialGradient id={ID.todayBeam} cx={CX} cy={CY} r={R.monthOuter + 12} gradientUnits="userSpaceOnUse">
              <stop offset={(R.centerRing - 4) / (R.monthOuter + 12)} stopColor="var(--accent-color)" stopOpacity="0" />
              <stop offset={R.ring3Inner / (R.monthOuter + 12)} stopColor="var(--accent-color)" stopOpacity="0.10" />
              <stop offset={R.weekInner / (R.monthOuter + 12)} stopColor="var(--accent-color)" stopOpacity="0.22" />
              <stop offset={R.monthInner / (R.monthOuter + 12)} stopColor="var(--accent-color)" stopOpacity="0.42" />
              <stop offset={R.monthOuter / (R.monthOuter + 12)} stopColor="var(--accent-color)" stopOpacity="0.58" />
              <stop offset="1" stopColor="var(--accent-color)" stopOpacity="0" />
            </radialGradient>

            {/* Year-mode: month label paths */}
            {!focus && monthSegs.map(m => (
              <path
                key={`mp-${m.idx}`}
                id={ID.monthPath(m.idx)}
                d={labelArcPath((R.monthOuter + R.monthInner) / 2, m.start, m.end)}
                fill="none"
              />
            ))}

            {/* Year-mode: event label paths (tangential arc + radial line).
                The radial path is the Plandisc-style label track that lets a
                title read outward from the wheel centre even on very narrow
                arcs where a tangential label wouldn't fit. */}
            {!focus && events.map(ev => {
              const startDeg = dateStringToDeg(ev.start_date, year)
              const endDeg   = dateStringToDeg(ev.end_date, year) + (360 / daysInYear(year))
              if (endDeg <= startDeg) return null
              const ri = ringIdxForCategory(ev.category)
              const midDeg = (startDeg + endDeg) / 2
              return (
                <Fragment key={`evpath-${ev.id}`}>
                  <path
                    id={ID.eventPath(ev.id)}
                    d={labelArcPath(RING_BOUNDS[ri].mid, startDeg, endDeg)}
                    fill="none"
                  />
                  <path
                    id={ID.eventRadial(ev.id)}
                    d={radialLinePath(RING_BOUNDS[ri].inner + 4, RING_BOUNDS[ri].outer - 4, midDeg)}
                    fill="none"
                  />
                </Fragment>
              )
            })}

            {/* Month-mode: day label paths */}
            {focus && focus.daySegs.map(d => (
              <path
                key={`dp-${d.day}`}
                id={ID.dayPath(d.day)}
                d={labelArcPath((R.monthOuter + R.monthInner) / 2, d.start, d.end)}
                fill="none"
              />
            ))}

            {/* Month-mode: event label paths (tangential + radial) */}
            {focus && focus.events.map(({ ev, arc }) => {
              const ri = ringIdxForCategory(ev.category)
              const midDeg = (arc.startDeg + arc.endDeg) / 2
              return (
                <Fragment key={`evpm-${ev.id}`}>
                  <path
                    id={ID.eventPathM(ev.id)}
                    d={labelArcPath(RING_BOUNDS[ri].mid, arc.startDeg, arc.endDeg)}
                    fill="none"
                  />
                  <path
                    id={ID.eventRadialM(ev.id)}
                    d={radialLinePath(RING_BOUNDS[ri].inner + 4, RING_BOUNDS[ri].outer - 4, midDeg)}
                    fill="none"
                  />
                </Fragment>
              )
            })}

            {/* Ring category label paths (shared) */}
            {RINGS.map((_, i) => {
              const range = ringLabelRanges[i]
              if (!range) return null
              const [s, e] = range
              return (
                <path
                  key={`rp-${i}`}
                  id={ID.ringPath(i)}
                  d={labelArcPath(RING_BOUNDS[i].mid, s, e)}
                  fill="none"
                />
              )
            })}
          </defs>

          {/* ── Three named rings: shared background tracks ── */}
          {RINGS.map((ring, ri) => {
            const bounds = RING_BOUNDS[ri]
            return (
              <g key={`track-${ring.key}`}>
                <circle
                  cx={CX} cy={CY}
                  r={bounds.mid}
                  fill="none"
                  stroke={`hsl(${ring.hue}, 30%, 68%)`}
                  strokeWidth={bounds.outer - bounds.inner}
                  strokeOpacity={0.08}
                />
                <circle
                  cx={CX} cy={CY} r={bounds.outer}
                  fill="none"
                  stroke="var(--border-subtle)"
                  strokeWidth={0.5}
                  strokeOpacity={0.45}
                />
                <circle
                  cx={CX} cy={CY} r={bounds.inner}
                  fill="none"
                  stroke="var(--border-subtle)"
                  strokeWidth={0.5}
                  strokeOpacity={0.45}
                />
              </g>
            )
          })}

          {/* ── Mode-specific: Months|Weeks|Events  OR  Days|Weeks-in-month|Events-in-month ── */}
          <AnimatePresence mode="wait">
            {focus === null ? (
              <motion.g
                key="year-mode"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.28 }}
              >
                {/* Months */}
                {monthSegs.map((m) => {
                  const isCurrent = m.idx === currentMonth
                  const path = annularArc(R.monthOuter, R.monthInner, m.start, m.end, 0.5)
                  return (
                    <motion.g key={m.name}
                      onClick={() => enterFocus(m.idx)}
                      onMouseEnter={() => setHover({ type: 'month', label: MONTH_FULL_L[m.idx], sublabel: 'Klikk for å fokusere' })}
                      onMouseLeave={() => setHover(null)}
                      whileHover={{ scale: 1.018 }}
                      style={{ cursor: 'pointer', transformOrigin: `${CX}px ${CY}px` }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.05 + m.idx * 0.025, duration: 0.3 }}
                    >
                      <path
                        d={path}
                        fill={`url(#${ID.month(m.idx)})`}
                        stroke="var(--bg-primary)"
                        strokeWidth={1}
                        style={isCurrent ? { filter: `url(#${ID.glow})` } : undefined}
                      />
                      <text
                        fontSize={isCurrent ? 13 : 12}
                        fontWeight={isCurrent ? 700 : 600}
                        fill="white"
                        fillOpacity={0.96}
                        style={{
                          fontFamily: 'var(--font-body)',
                          letterSpacing: '0.1em',
                          userSelect: 'none',
                          pointerEvents: 'none',
                          textShadow: '0 1px 2px rgba(0,0,0,0.28)',
                        }}
                      >
                        <textPath href={`#${ID.monthPath(m.idx)}`} startOffset="50%" textAnchor="middle">
                          {MONTH_FULL_L[m.idx].toUpperCase()}
                        </textPath>
                      </text>
                    </motion.g>
                  )
                })}

                {/* Weeks (year) */}
                {weekSegs.map(w => {
                  const isCurrent = w.weekNum === currentWeek
                  const path = annularArc(R.weekOuter, R.weekInner, w.start, w.end, isCurrent ? 0.4 : 0.25)
                  const mid = (w.start + w.end) / 2
                  const showLabel = w.weekNum % 4 === 0 || w.weekNum === 1 || isCurrent
                  const lblPoint = showLabel ? polarPoint((R.weekOuter + R.weekInner) / 2, mid) : null
                  return (
                    <g key={w.weekNum}
                      onMouseEnter={() => setHover({ type: 'week', label: `Uke ${w.weekNum}`, sublabel: `${year}` })}
                      onMouseLeave={() => setHover(null)}
                      style={{ cursor: 'default' }}
                    >
                      {isCurrent && (
                        <motion.path
                          d={annularArc(R.weekOuter + 6, R.weekInner - 6, w.start, w.end, 0.2)}
                          fill="#00D9F5"
                          style={{ filter: `url(#${ID.bloom})` }}
                          initial={{ opacity: 0.3 }}
                          animate={{ opacity: [0.35, 0.7, 0.35] }}
                          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                        />
                      )}
                      <path
                        d={path}
                        fill={isCurrent ? `url(#${ID.weekActive})` : 'var(--bg-subtle)'}
                        fillOpacity={isCurrent ? 1 : 0.5}
                        stroke="var(--bg-primary)"
                        strokeWidth={0.8}
                      />
                      {/* Current week: show 7 weekday subdivisions with today highlighted */}
                      {isCurrent && (() => {
                        const dayWidth = (w.end - w.start) / 7
                        const todayIdx = getWeekdayIdx(today)
                        const todayStart = w.start + dayWidth * todayIdx
                        const todayEnd = todayStart + dayWidth
                        return (
                          <>
                            {/* 6 hairline dividers between days */}
                            {Array.from({ length: 6 }, (_, i) => {
                              const deg = w.start + dayWidth * (i + 1)
                              const o = polarPoint(R.weekOuter - 0.5, deg)
                              const n = polarPoint(R.weekInner + 0.5, deg)
                              return (
                                <line key={`wd-div-${i}`}
                                  x1={f(o.x)} y1={f(o.y)}
                                  x2={f(n.x)} y2={f(n.y)}
                                  stroke="white" strokeOpacity={0.28} strokeWidth={0.5}
                                  style={{ pointerEvents: 'none' }}
                                />
                              )
                            })}
                            {/* Today's weekday: brightened wedge inside the week ring */}
                            <path
                              d={annularArc(R.weekOuter - 1, R.weekInner + 1, todayStart, todayEnd, 0.05)}
                              fill="white"
                              fillOpacity={0.38}
                              style={{ pointerEvents: 'none' }}
                            />
                          </>
                        )
                      })()}
                      {lblPoint && (
                        <text
                          x={lblPoint.x} y={lblPoint.y}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize={isCurrent ? 11 : 9}
                          fontWeight={isCurrent ? 700 : 500}
                          fill={isCurrent ? 'white' : 'var(--text-tertiary)'}
                          style={{
                            fontFamily: 'var(--font-sora)',
                            userSelect: 'none',
                            pointerEvents: 'none',
                            fontVariantNumeric: 'tabular-nums',
                            textShadow: isCurrent ? '0 1px 2px rgba(0,0,0,0.3)' : undefined,
                          }}
                        >
                          {w.weekNum}
                        </text>
                      )}
                    </g>
                  )
                })}

                {/* Events (year) */}
                {events.map((ev, i) => {
                  const startDeg = dateStringToDeg(ev.start_date, year)
                  const endDeg   = dateStringToDeg(ev.end_date, year) + (360 / daysInYear(year))
                  if (endDeg <= startDeg) return null
                  const ri = ringIdxForCategory(ev.category)
                  const bounds = RING_BOUNDS[ri]
                  const color = ev.color ?? CATEGORY_COLORS[ev.category]
                  const arcSpan = endDeg - startDeg
                  const isSelected = selectedEvent?.id === ev.id
                  const arcLenPx = (arcSpan / 360) * 2 * Math.PI * bounds.mid

                  // Single-day (or ≤1.5°) events render as a visible pin. An
                  // arc that narrow is effectively invisible at wheel scale,
                  // so we stack a circle marker on top with the event color.
                  const isPin = arcSpan <= 1.6
                  const midDeg = (startDeg + endDeg) / 2
                  const pinCenter = polarPoint(bounds.mid, midDeg)
                  const pinR = isSelected ? 8 : 7
                  const path = annularArc(bounds.outer, bounds.inner, startDeg, endDeg, isPin ? 0 : 0.35)

                  // Label strategy:
                  //   • Wide events (arcSpan ≥ 3.5°): tangential label along
                  //     the arc. Reads straight, fits the full title, centered.
                  //   • Narrow events (1.6° ≤ arcSpan < 3.5°): radial label.
                  //     The arc is too short for tangential text, so we turn
                  //     the text outward along the ring's radial width.
                  //   • Pins (< 1.6°): no label; the pin + hover tooltip does it.
                  const labelMode: 'tangential' | 'radial' | null =
                    arcSpan >= 3.5 ? 'tangential' :
                    arcSpan >= 1.6 ? 'radial' : null
                  const radialWidthPx = bounds.outer - bounds.inner - 8
                  // Truncate rather than squeeze — squeezed text becomes
                  // illegible on tiny radial slots. ~6 chars max at 9px.
                  const radialMaxChars = Math.max(4, Math.floor(radialWidthPx / 5.2))
                  const radialTitle = ev.title.length > radialMaxChars
                    ? ev.title.slice(0, radialMaxChars - 1) + '…'
                    : ev.title

                  return (
                    <motion.g key={ev.id}
                      onClick={(e) => { e.stopPropagation(); onSelectEvent(ev) }}
                      onMouseEnter={() => setHover({ type: 'event', label: ev.title, sublabel: CATEGORY_LABELS_L[ev.category] })}
                      onMouseLeave={() => setHover(null)}
                      style={{ cursor: 'pointer', transformOrigin: `${CX}px ${CY}px` }}
                      whileHover={{ scale: 1.018 }}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.4 + i * 0.03, ...spring.gentle }}
                    >
                      {/* Underlying arc — kept even for pins so the color
                          still reaches the ring edge where the event sits. */}
                      <path
                        d={path}
                        fill={`url(#${ID.event(ev.id)})`}
                        stroke={isSelected ? color : 'var(--bg-primary)'}
                        strokeWidth={isSelected ? 2 : 1}
                        style={isSelected ? { filter: `url(#${ID.glow})` } : undefined}
                      />
                      {isPin && (
                        <>
                          {/* Soft halo */}
                          <circle
                            cx={f(pinCenter.x)} cy={f(pinCenter.y)}
                            r={pinR + 3}
                            fill={color}
                            fillOpacity={0.22}
                          />
                          {/* Solid core with inner highlight */}
                          <circle
                            cx={f(pinCenter.x)} cy={f(pinCenter.y)}
                            r={pinR}
                            fill={color}
                            stroke="rgba(255,255,255,0.85)"
                            strokeWidth={1.2}
                            style={isSelected ? { filter: `url(#${ID.bloom})` } : { filter: `url(#${ID.glow})` }}
                          />
                          <circle
                            cx={f(pinCenter.x)} cy={f(pinCenter.y - 1.5)}
                            r={pinR * 0.4}
                            fill="white"
                            fillOpacity={0.55}
                          />
                        </>
                      )}
                      {labelMode === 'tangential' && (
                        <text
                          fontSize={ri === 0 ? 10 : 9.5}
                          fontWeight={600}
                          fill="white"
                          fillOpacity={0.96}
                          style={{
                            fontFamily: 'var(--font-body)',
                            userSelect: 'none',
                            pointerEvents: 'none',
                            textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                            letterSpacing: '0.01em',
                          }}
                        >
                          <textPath
                            href={`#${ID.eventPath(ev.id)}`}
                            startOffset="50%"
                            textAnchor="middle"
                            textLength={Math.min(ev.title.length * 6.2, arcLenPx - 8)}
                            lengthAdjust="spacingAndGlyphs"
                          >
                            {ev.title}
                          </textPath>
                        </text>
                      )}
                      {labelMode === 'radial' && (
                        <text
                          fontSize={9}
                          fontWeight={600}
                          fill="white"
                          fillOpacity={0.96}
                          style={{
                            fontFamily: 'var(--font-body)',
                            userSelect: 'none',
                            pointerEvents: 'none',
                            textShadow: '0 1px 2px rgba(0,0,0,0.45)',
                            letterSpacing: '0.01em',
                          }}
                        >
                          <textPath
                            href={`#${ID.eventRadial(ev.id)}`}
                            startOffset="50%"
                            textAnchor="middle"
                          >
                            {radialTitle}
                          </textPath>
                        </text>
                      )}
                    </motion.g>
                  )
                })}
              </motion.g>
            ) : (
              <motion.g
                key={`month-mode-${focus.month}`}
                initial={{ opacity: 0, scale: 1.03 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.32, ease: 'easeOut' }}
                style={{ transformOrigin: `${CX}px ${CY}px` }}
              >
                {/* Days ring */}
                {focus.daySegs.map((d, i) => {
                  const isToday = focus.todayDeg !== null && today.getDate() === d.day
                  const path = annularArc(R.monthOuter, R.monthInner, d.start, d.end, 0.3)
                  return (
                    <motion.g key={`d-${d.day}`}
                      onMouseEnter={() => setHover({
                        type: 'month',
                        label: `${d.day}. ${MONTH_FULL_L[focus.month].toLowerCase()}`,
                        sublabel: `${year}`,
                      })}
                      onMouseLeave={() => setHover(null)}
                      style={{ cursor: 'default' }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.02 * i, duration: 0.24 }}
                    >
                      <path
                        d={path}
                        fill={`url(#${ID.month(focus.month)})`}
                        fillOpacity={d.isWeekend ? 0.72 : 1}
                        stroke="var(--bg-primary)"
                        strokeWidth={0.6}
                        style={isToday ? { filter: `url(#${ID.glow})` } : undefined}
                      />
                      <text
                        fontSize={isToday ? 14 : 12}
                        fontWeight={isToday ? 800 : 600}
                        fill="white"
                        fillOpacity={d.isWeekend ? 0.78 : 0.98}
                        style={{
                          fontFamily: 'var(--font-sora)',
                          fontVariantNumeric: 'tabular-nums',
                          userSelect: 'none',
                          pointerEvents: 'none',
                          textShadow: '0 1px 2px rgba(0,0,0,0.28)',
                          letterSpacing: '-0.01em',
                        }}
                      >
                        <textPath href={`#${ID.dayPath(d.day)}`} startOffset="50%" textAnchor="middle">
                          {d.day}
                        </textPath>
                      </text>
                    </motion.g>
                  )
                })}

                {/* Weeks (within month) */}
                {focus.weekSegs.map(w => {
                  const isCurrent = w.weekNum === currentWeek && focus.month === currentMonth
                  const path = annularArc(R.weekOuter, R.weekInner, w.start, w.end, isCurrent ? 0.4 : 0.3)
                  const mid = (w.start + w.end) / 2
                  const lblPoint = polarPoint((R.weekOuter + R.weekInner) / 2, mid)
                  return (
                    <g key={`mw-${w.weekNum}`}
                      onMouseEnter={() => setHover({ type: 'week', label: `Uke ${w.weekNum}`, sublabel: `${year}` })}
                      onMouseLeave={() => setHover(null)}
                    >
                      {isCurrent && (
                        <motion.path
                          d={annularArc(R.weekOuter + 6, R.weekInner - 6, w.start, w.end, 0.2)}
                          fill="#00D9F5"
                          style={{ filter: `url(#${ID.bloom})` }}
                          initial={{ opacity: 0.3 }}
                          animate={{ opacity: [0.35, 0.7, 0.35] }}
                          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                        />
                      )}
                      <path
                        d={path}
                        fill={isCurrent ? `url(#${ID.weekActive})` : 'var(--bg-subtle)'}
                        fillOpacity={isCurrent ? 1 : 0.5}
                        stroke="var(--bg-primary)"
                        strokeWidth={0.8}
                      />
                      <text
                        x={lblPoint.x} y={lblPoint.y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={isCurrent ? 12 : 10}
                        fontWeight={isCurrent ? 700 : 600}
                        fill={isCurrent ? 'white' : 'var(--text-secondary)'}
                        style={{
                          fontFamily: 'var(--font-sora)',
                          userSelect: 'none',
                          pointerEvents: 'none',
                          fontVariantNumeric: 'tabular-nums',
                          textShadow: isCurrent ? '0 1px 2px rgba(0,0,0,0.3)' : undefined,
                        }}
                      >
                        {w.weekNum}
                      </text>
                    </g>
                  )
                })}

                {/* Events (within month) */}
                {focus.events.map(({ ev, arc }, i) => {
                  const ri = ringIdxForCategory(ev.category)
                  const bounds = RING_BOUNDS[ri]
                  const color = ev.color ?? CATEGORY_COLORS[ev.category]
                  const path = annularArc(bounds.outer, bounds.inner, arc.startDeg, arc.endDeg, 0.35)
                  const arcSpan = arc.endDeg - arc.startDeg
                  const isSelected = selectedEvent?.id === ev.id
                  const arcLenPx = (arcSpan / 360) * 2 * Math.PI * bounds.mid
                  const showLabel = arcSpan > 2

                  return (
                    <motion.g key={`mev-${ev.id}`}
                      onClick={(e) => { e.stopPropagation(); onSelectEvent(ev) }}
                      onMouseEnter={() => setHover({
                        type: 'event',
                        label: ev.title + (arc.continuesBefore || arc.continuesAfter ? ' (↔ fortsetter)' : ''),
                        sublabel: CATEGORY_LABELS_L[ev.category],
                      })}
                      onMouseLeave={() => setHover(null)}
                      style={{ cursor: 'pointer', transformOrigin: `${CX}px ${CY}px` }}
                      whileHover={{ scale: 1.015 }}
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.15 + i * 0.035, ...spring.gentle }}
                    >
                      <path
                        d={path}
                        fill={`url(#${ID.event(ev.id)})`}
                        stroke={isSelected ? color : 'var(--bg-primary)'}
                        strokeWidth={isSelected ? 2 : 1}
                        style={isSelected ? { filter: `url(#${ID.glow})` } : undefined}
                      />
                      {/* Continuation markers: dashed edge line where arc was clipped */}
                      {arc.continuesBefore && (
                        <line
                          x1={f(polarPoint(bounds.outer, arc.startDeg).x)} y1={f(polarPoint(bounds.outer, arc.startDeg).y)}
                          x2={f(polarPoint(bounds.inner, arc.startDeg).x)} y2={f(polarPoint(bounds.inner, arc.startDeg).y)}
                          stroke={color}
                          strokeWidth={2.5}
                          strokeLinecap="round"
                          strokeDasharray="1.5 3"
                          opacity={0.9}
                        />
                      )}
                      {arc.continuesAfter && (
                        <line
                          x1={f(polarPoint(bounds.outer, arc.endDeg).x)} y1={f(polarPoint(bounds.outer, arc.endDeg).y)}
                          x2={f(polarPoint(bounds.inner, arc.endDeg).x)} y2={f(polarPoint(bounds.inner, arc.endDeg).y)}
                          stroke={color}
                          strokeWidth={2.5}
                          strokeLinecap="round"
                          strokeDasharray="1.5 3"
                          opacity={0.9}
                        />
                      )}
                      {showLabel && (
                        <text
                          fontSize={11}
                          fontWeight={600}
                          fill="white"
                          fillOpacity={0.97}
                          style={{
                            fontFamily: 'var(--font-body)',
                            userSelect: 'none',
                            pointerEvents: 'none',
                            textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                            letterSpacing: '0.01em',
                          }}
                        >
                          <textPath
                            href={`#${ID.eventPathM(ev.id)}`}
                            startOffset="50%"
                            textAnchor="middle"
                            textLength={Math.min(ev.title.length * 6.6, arcLenPx - 10)}
                            lengthAdjust="spacingAndGlyphs"
                          >
                            {ev.title}
                          </textPath>
                        </text>
                      )}
                    </motion.g>
                  )
                })}
              </motion.g>
            )}
          </AnimatePresence>

          {/* Ring category labels — textPath watermarks. Hidden on rings whose
              event distribution leaves no clean gap to land in. */}
          {RINGS.map((ring, ri) => {
            if (!ringLabelRanges[ri]) return null
            return (
              <text
                key={`rlbl-${ri}`}
                fontSize={9}
                fontWeight={700}
                fill={`hsl(${ring.hue}, 35%, 42%)`}
                fillOpacity={0.62}
                style={{
                  fontFamily: 'var(--font-body)',
                  letterSpacing: '0.36em',
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}
              >
                <textPath href={`#${ID.ringPath(ri)}`} startOffset="50%" textAnchor="middle">
                  {RING_NAMES_L[ri].toUpperCase()}
                </textPath>
              </text>
            )
          })}

          {/* ── Center: aurora → glass → hero content ── */}
          <circle cx={CX} cy={CY} r={R.centerRing + 24} fill={`url(#${ID.aurora})`} />

          <circle
            cx={CX} cy={CY} r={R.centerRing}
            fill="none"
            stroke="var(--border-subtle)"
            strokeWidth={1}
            strokeOpacity={0.7}
          />

          <circle
            cx={CX} cy={CY} r={R.centerGlass}
            fill={`url(#${ID.centerBg})`}
            stroke="var(--border-subtle)"
            strokeWidth={1}
            style={{
              filter: `url(#${ID.softShadow})`,
              cursor: focus !== null ? 'pointer' : 'default',
            }}
            onClick={focus !== null ? exitFocus : undefined}
          />

          <circle
            cx={CX} cy={CY} r={R.centerGlass - 0.5}
            fill="none"
            stroke="white"
            strokeOpacity={0.25}
            strokeWidth={1}
            style={{ pointerEvents: 'none' }}
          />

          {/* Center hero — morphs between year and month modes */}
          <AnimatePresence mode="wait">
            {focus === null ? (
              <motion.g
                key="center-year"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.22 }}
                style={{ transformOrigin: `${CX}px ${CY}px`, pointerEvents: 'none' }}
              >
                <text
                  x={CX} y={CY - 92}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={12}
                  fontWeight={500}
                  fill="var(--text-tertiary)"
                  style={{
                    fontFamily: 'var(--font-manrope), system-ui, sans-serif',
                    letterSpacing: '0.32em',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {year}
                </text>
                {/* The day — Fraunces 300 with opsz 144, SOFT 80.
                    At 116px this is the type-monster; the soft axis rounds
                    the terminals so the glyph reads as warm, not mechanical. */}
                <text
                  x={CX} y={CY - 20}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={116}
                  fontWeight={300}
                  fill="var(--text-primary)"
                  style={{
                    fontFamily: 'var(--font-fraunces), "Iowan Old Style", Georgia, serif',
                    fontVariationSettings: '"opsz" 144, "SOFT" 80',
                    letterSpacing: '-0.045em',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {today.getDate()}
                </text>
                {/* Weekday + month — Fraunces italic, weekday in Ember */}
                <text
                  x={CX} y={CY + 54}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={18}
                  style={{
                    fontFamily: 'var(--font-fraunces), "Iowan Old Style", Georgia, serif',
                    fontStyle: 'italic',
                    fontVariationSettings: '"opsz" 24, "SOFT" 80',
                    fontWeight: 300,
                    letterSpacing: '-0.018em',
                  }}
                >
                  <tspan fill="var(--ember, var(--accent-color))">
                    {weekdayFullT(today, t).toLowerCase()}
                  </tspan>
                  <tspan fill="var(--text-secondary)">
                    {', '}{MONTH_FULL_L[today.getMonth()].toLowerCase()}
                  </tspan>
                </text>
                <text
                  x={CX} y={CY + 78}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={10.5}
                  fontWeight={500}
                  fill="var(--text-tertiary)"
                  style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
                    letterSpacing: '0.22em',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  UKE {currentWeek} · {String(today.getHours()).padStart(2, '0')}:{String(today.getMinutes()).padStart(2, '0')}
                </text>
                {orgLogo && (
                  <image
                    href={orgLogo}
                    x={CX - 44} y={CY + 100}
                    width={88} height={32}
                    preserveAspectRatio="xMidYMid meet"
                    opacity={0.85}
                  />
                )}
              </motion.g>
            ) : (
              <motion.g
                key={`center-month-${focus.month}`}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.26 }}
                style={{ transformOrigin: `${CX}px ${CY}px`, pointerEvents: 'none' }}
              >
                <text
                  x={CX} y={CY - 92}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={12}
                  fontWeight={500}
                  fill="var(--text-tertiary)"
                  style={{
                    fontFamily: 'var(--font-manrope), system-ui, sans-serif',
                    letterSpacing: '0.32em',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {year}
                </text>
                {/* Month name — Fraunces italic as the month's spiritual signature */}
                <text
                  x={CX} y={CY - 22}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={focus.month === 8 ? 64 : 76}
                  fontWeight={300}
                  fill="var(--text-primary)"
                  style={{
                    fontFamily: 'var(--font-fraunces), "Iowan Old Style", Georgia, serif',
                    fontStyle: 'italic',
                    fontVariationSettings: '"opsz" 144, "SOFT" 100',
                    letterSpacing: '-0.04em',
                    textTransform: 'capitalize',
                  }}
                >
                  {MONTH_FULL_L[focus.month].toLowerCase()}
                </text>
                {focus.todayDeg !== null ? (
                  <>
                    <text
                      x={CX} y={CY + 36}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={16}
                      style={{
                        fontFamily: 'var(--font-fraunces), "Iowan Old Style", Georgia, serif',
                        fontStyle: 'italic',
                        fontVariationSettings: '"opsz" 24, "SOFT" 80',
                        fontWeight: 300,
                        letterSpacing: '-0.015em',
                      }}
                    >
                      <tspan fill="var(--text-tertiary)">i dag · </tspan>
                      <tspan fill="var(--ember, var(--accent-color))">
                        {today.getDate()}. {weekdayFullT(today, t).toLowerCase()}
                      </tspan>
                    </text>
                    <text
                      x={CX} y={CY + 64}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={10.5}
                      fontWeight={500}
                      fill="var(--text-tertiary)"
                      style={{
                        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
                        letterSpacing: '0.22em',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      UKE {currentWeek}
                    </text>
                  </>
                ) : (
                  <text
                    x={CX} y={CY + 42}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={14}
                    style={{
                      fontFamily: 'var(--font-fraunces), "Iowan Old Style", Georgia, serif',
                      fontStyle: 'italic',
                      fontVariationSettings: '"opsz" 18, "SOFT" 60',
                      fontWeight: 300,
                      letterSpacing: '-0.005em',
                      fill: 'var(--text-tertiary)',
                    }}
                  >
                    {focus.events.length === 0
                      ? t.wheel.noEvents
                      : `${focus.events.length} ${focus.events.length === 1 ? 'hendelse' : 'hendelser'}`}
                  </text>
                )}
                <text
                  x={CX} y={CY + 92}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={10}
                  fontWeight={600}
                  fill="var(--text-tertiary)"
                  style={{
                    fontFamily: 'var(--font-body)',
                    letterSpacing: '0.2em',
                  }}
                >
                  KLIKK FOR Å GÅ TILBAKE
                </text>
              </motion.g>
            )}
          </AnimatePresence>

          {/* Today: spotlight beam + hairline ray + pin (label lives in the center disc) */}
          {activeTodayDeg !== null && activeTodayTip && (
            <g key={`today-${focus ? `month-${focus.month}` : 'year'}`}>
              {/* Soft wedge beam behind today */}
              <motion.path
                d={pieSlice(R.monthOuter + 10, activeTodayDeg - (focus ? 2.4 : 1.8), activeTodayDeg + (focus ? 2.4 : 1.8))}
                fill={`url(#${ID.todayBeam})`}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.85, 1, 0.85] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              />
              {/* Hairline ray from center out through today — iOS-clean clarity line */}
              <line
                x1={f(polarPoint(R.centerRing + 2, activeTodayDeg).x)}
                y1={f(polarPoint(R.centerRing + 2, activeTodayDeg).y)}
                x2={f(polarPoint(R.monthOuter + 2, activeTodayDeg).x)}
                y2={f(polarPoint(R.monthOuter + 2, activeTodayDeg).y)}
                stroke="var(--accent-color)"
                strokeOpacity={0.38}
                strokeWidth={1}
                strokeLinecap="round"
                style={{ pointerEvents: 'none' }}
              />
              {/* Halo pulse at today-tip */}
              <motion.circle
                cx={f(activeTodayTip.x)} cy={f(activeTodayTip.y)}
                fill="var(--accent-color)"
                initial={{ r: 6, opacity: 0.5 }}
                animate={{ r: [6, 16, 6], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
              />
              <circle
                cx={f(activeTodayTip.x)} cy={f(activeTodayTip.y)}
                r={5}
                fill="var(--accent-color)"
                style={{ filter: `url(#${ID.bloom})` }}
              />
              <circle
                cx={f(activeTodayTip.x)} cy={f(activeTodayTip.y)}
                r={3}
                fill="white"
              />
            </g>
          )}
        </motion.svg>

        {/* Hover tooltip */}
        <AnimatePresence>
          {hover && (
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 4 }}
              transition={{ duration: 0.12 }}
              className="absolute pointer-events-none z-20 px-3 py-2 rounded-xl text-[13px] font-medium"
              style={{
                left: tooltipPos.x + 14,
                top: tooltipPos.y - 10,
                background: 'color-mix(in oklab, var(--bg-elevated) 80%, transparent)',
                backdropFilter: 'blur(18px) saturate(180%)',
                WebkitBackdropFilter: 'blur(18px) saturate(180%)',
                color: 'var(--text-primary)',
                boxShadow: 'var(--shadow-lg)',
                fontFamily: 'var(--font-body)',
                border: '1px solid var(--border-subtle)',
                whiteSpace: 'nowrap',
              }}
            >
              {hover.label}
              {hover.sublabel && (
                <span style={{ color: 'var(--text-tertiary)', marginLeft: 6 }}>{hover.sublabel}</span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Agenda side panel */}
      {!hideAgenda && <Agenda events={events} today={today} onSelect={onSelectEvent} />}
    </div>
  )
}

// ─── Agenda side panel ─────────────────────────────────────────

function Agenda({
  events, today, onSelect,
}: {
  events: OrgEvent[]
  today: Date
  onSelect: (ev: OrgEvent) => void
}) {
  const t = useT()
  const todayYmd = today.toISOString().slice(0, 10)

  const { todayEvents, futureEvents } = useMemo(() => {
    const ongoing = events.filter(e => e.start_date <= todayYmd && e.end_date >= todayYmd)
    const future = events
      .filter(e => e.start_date > todayYmd)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
      .slice(0, 6)
    return { todayEvents: ongoing, futureEvents: future }
  }, [events, todayYmd])

  return (
    <motion.aside
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...spring.gentle, delay: 0.3 }}
      className="w-full xl:w-[320px] flex-shrink-0 flex flex-col gap-3"
    >
      <AgendaSection
        title="I dag"
        meta={formatAgendaMeta(today, t)}
        empty={t.wheel.noEventsToday}
      >
        {todayEvents.map(ev => (
          <AgendaRow key={ev.id} event={ev} onSelect={onSelect} />
        ))}
      </AgendaSection>

      <AgendaSection
        title="Kommende"
        empty={t.wheel.noUpcoming}
      >
        {futureEvents.map(ev => (
          <AgendaRow key={ev.id} event={ev} onSelect={onSelect} />
        ))}
      </AgendaSection>
    </motion.aside>
  )
}

function formatAgendaMeta(d: Date, t: Dictionary): string {
  const day = d.getDate()
  const wd = weekdayAbbrT(d, t)
  return `${day}. ${wd}.`
}

function AgendaSection({
  title, meta, empty, children,
}: {
  title: string
  meta?: string
  empty: string
  children: React.ReactNode
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children
  return (
    <section
      className="rounded-2xl p-4 flex flex-col gap-2"
      style={{
        background: 'color-mix(in oklab, var(--bg-elevated) 70%, transparent)',
        backdropFilter: 'blur(18px) saturate(180%)',
        WebkitBackdropFilter: 'blur(18px) saturate(180%)',
        border: '1px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <header className="flex items-baseline justify-between">
        <h3
          className="text-[11px] font-bold uppercase"
          style={{
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-body)',
            letterSpacing: '0.22em',
          }}
        >
          {title}
        </h3>
        {meta && (
          <span
            className="text-[11px] font-medium tabular-nums"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
          >
            {meta}
          </span>
        )}
      </header>
      {hasChildren ? (
        <ul className="flex flex-col gap-1.5">{children}</ul>
      ) : (
        <p
          className="text-[13px] py-1"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
        >
          {empty}
        </p>
      )}
    </section>
  )
}

function AgendaRow({
  event, onSelect,
}: {
  event: OrgEvent
  onSelect: (ev: OrgEvent) => void
}) {
  const t = useT()
  const CATEGORY_LABELS_L = categoryLabelsT(t)
  const color = event.color ?? CATEGORY_COLORS[event.category]
  const start = new Date(event.start_date + 'T12:00:00')
  const end   = new Date(event.end_date   + 'T12:00:00')
  const multiDay = event.start_date !== event.end_date
  const crossesMonth = start.getMonth() !== end.getMonth()

  return (
    <motion.li
      whileHover={{ x: 2 }}
      onClick={() => onSelect(event)}
      className="flex items-start gap-3 px-2 py-2 -mx-2 rounded-xl cursor-pointer transition-colors hover:bg-[var(--bg-subtle)]"
    >
      {/* Date block: day · month · weekday stacked. Compact, tabular, premium. */}
      <div className="flex flex-col items-center justify-center w-10 flex-shrink-0 pt-0.5 gap-0.5">
        <span
          className="text-[17px] font-semibold tabular-nums leading-none"
          style={{
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sora)',
            letterSpacing: '-0.02em',
          }}
        >
          {multiDay && !crossesMonth
            ? `${start.getDate()}–${end.getDate()}`
            : start.getDate()}
        </span>
        <span
          className="text-[9px] uppercase font-semibold"
          style={{
            color: color,
            fontFamily: 'var(--font-body)',
            letterSpacing: '0.14em',
          }}
        >
          {MONTH_NAMES[start.getMonth()]}
          {crossesMonth && `–${MONTH_NAMES[end.getMonth()]}`}
        </span>
        <span
          className="text-[9px] uppercase mt-0.5"
          style={{
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
            letterSpacing: '0.14em',
          }}
        >
          {weekdayAbbrT(start, t)}
        </span>
      </div>

      <div
        className="w-[2px] rounded-full flex-shrink-0 self-stretch"
        style={{
          background: `linear-gradient(180deg, ${color}ee, ${color}55)`,
        }}
      />

      <div className="flex-1 min-w-0 flex flex-col gap-0.5 py-0.5">
        <p
          className="text-[13.5px] font-medium truncate leading-snug"
          style={{
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
          }}
        >
          {event.title}
        </p>
        <span
          className="text-[10px] font-semibold uppercase"
          style={{
            color: color,
            letterSpacing: '0.1em',
            fontFamily: 'var(--font-body)',
          }}
        >
          {CATEGORY_LABELS_L[event.category]}
        </span>
      </div>
    </motion.li>
  )
}

