'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { addDays, getISOWeek, getISOWeekYear } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { MemberAvatar } from '@/components/member-avatar'
import { CellEditor } from '@/components/cell-editor'
import { EmptyState } from '@/components/empty-state'
import { StatusSegment, type SegmentDay } from '@/components/status-segment'
import {
  toDateString,
  isToday,
  formatDateLabelLong,
  getWeekStart,
  getLastISOWeek,
} from '@/lib/dates'
import type { Entry, EntryStatus } from '@/lib/supabase/types'
import { spring } from '@/lib/motion'
import { useT } from '@/lib/i18n/context'
import type { Dictionary } from '@/lib/i18n/types'
import { useStatusColors } from '@/lib/status-colors/context'

interface MyPlanProps {
  orgId: string
  memberId: string
  memberName: string
  memberInitials?: string | null
  avatarUrl: string | null
}

interface WeekBlock {
  weekNumber: number
  year: number
  start: Date
  days: Date[]
  monthLabel: string
  isCurrentWeek: boolean
}

function buildYearWeeks(year: number, t: Dictionary): WeekBlock[] {
  const today = new Date()
  const todayWeek = getISOWeek(today)
  const todayYear = getISOWeekYear(today)
  const lastWeek = getLastISOWeek(year)

  return Array.from({ length: lastWeek }, (_, i) => {
    const weekNumber = i + 1
    const start = getWeekStart(weekNumber, year)
    const days = Array.from({ length: 5 }, (_, d) => addDays(start, d))
    const midWeek = days[2]
    const monthLabel = t.dates.monthsLong[midWeek.getMonth()]
    return {
      weekNumber,
      year,
      start,
      days,
      monthLabel,
      isCurrentWeek: weekNumber === todayWeek && year === todayYear,
    }
  })
}

interface RowSegment {
  days: SegmentDay[]
  dates: Date[]
  entry: Entry | null
}

function entriesMergeable(a: Entry | null, b: Entry | null): boolean {
  if (a === null || b === null) return false
  return (
    a.status === b.status &&
    (a.location_label ?? null) === (b.location_label ?? null) &&
    (a.note ?? null) === (b.note ?? null)
  )
}

function formatDateRange(dates: Date[]): string {
  if (dates.length === 0) return ''
  if (dates.length === 1) return `${dates[0].getDate()}.`
  return `${dates[0].getDate()}.–${dates[dates.length - 1].getDate()}.`
}

interface MonthGroup {
  monthIdx: number
  year: number
  label: string
  weeks: WeekBlock[]
}

function groupWeeksByMonth(weeks: WeekBlock[], monthsLongCap: string[]): MonthGroup[] {
  const groups: MonthGroup[] = []
  weeks.forEach((wk) => {
    const mid = wk.days[2]
    const monthIdx = mid.getMonth()
    const year = mid.getFullYear()
    const last = groups[groups.length - 1]
    if (last && last.monthIdx === monthIdx && last.year === year) {
      last.weeks.push(wk)
    } else {
      groups.push({ monthIdx, year, label: monthsLongCap[monthIdx], weeks: [wk] })
    }
  })
  return groups
}

function buildWeekSegments(weekDays: Date[], entryByDate: Map<string, Entry>, t: Dictionary): RowSegment[] {
  const segments: RowSegment[] = []
  let i = 0
  while (i < weekDays.length) {
    const startEntry = entryByDate.get(toDateString(weekDays[i])) ?? null
    let j = i + 1
    while (j < weekDays.length) {
      const nextEntry = entryByDate.get(toDateString(weekDays[j])) ?? null
      if (!entriesMergeable(startEntry, nextEntry)) break
      j++
    }
    const dates = weekDays.slice(i, j)
    segments.push({
      dates,
      entry: startEntry,
      days: dates.map((date) => ({
        date: toDateString(date),
        dateLabel: formatDateLabelLong(date, t),
        isToday: isToday(date),
      })),
    })
    i = j
  }
  return segments
}

interface SelectedCell {
  date: string
  dateLabel: string
  endDate: string
  status: EntryStatus | null
  location: string | null
  note: string | null
}

interface DragPoint {
  wk: number
  d: number
}

interface MoveDrag {
  wk: number
  segmentStart: number   // first day-idx of the source segment within the week
  segmentSpan: number    // number of days in the source segment
  grabOffset: number     // which day within the segment was grabbed (0..span-1)
  currentDayIdx: number  // where the cursor is now (0..4)
  entry: Entry           // source entry (status + location + note to carry over)
}

interface ResizeDrag {
  wk: number
  edge: 'left' | 'right'
  origStart: number      // segment's original first day-idx
  origSpan: number       // segment's original span
  currentDayIdx: number  // where the cursor is now
  entry: Entry
}

export function MyPlan({ orgId, memberId, memberName, memberInitials, avatarUrl }: MyPlanProps) {
  const t = useT()
  const currentYear = useMemo(() => getISOWeekYear(new Date()), [])
  const [year, setYear] = useState(currentYear)
  const [dirY, setDirY] = useState<'next' | 'prev'>('next')

  const weeks = useMemo(() => buildYearWeeks(year, t), [year, t])
  const monthGroups = useMemo(() => groupWeeksByMonth(weeks, t.dates.monthsLongCap), [weeks, t])
  const todayWeekdayIdx = useMemo(() => {
    const day = new Date().getDay() // 0=Sun, 1=Mon … 5=Fri, 6=Sat
    return day >= 1 && day <= 5 ? day - 1 : -1
  }, [])
  const todayIsWeekday = todayWeekdayIdx !== -1
  const weekdayLabels = useMemo(
    () => t.dates.weekdaysShort.slice(1, 6), // Man, Tir, Ons, Tor, Fre
    [t],
  )
  const rangeStart = toDateString(weeks[0].start)
  const rangeEnd = toDateString(addDays(weeks[weeks.length - 1].start, 4))

  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null)

  const [dragStart, setDragStart] = useState<DragPoint | null>(null)
  const [dragCurrent, setDragCurrent] = useState<DragPoint | null>(null)
  const isDragging = dragStart !== null

  const [moveDrag, setMoveDrag] = useState<MoveDrag | null>(null)
  const [resizeDrag, setResizeDrag] = useState<ResizeDrag | null>(null)

  const palettes = useStatusColors()

  const currentWeekRef = useRef<HTMLDivElement | null>(null)
  const didScrollToCurrentWeek = useRef(false)

  useEffect(() => {
    if (didScrollToCurrentWeek.current) return
    if (year !== currentYear) return
    const el = currentWeekRef.current
    if (!el) return
    didScrollToCurrentWeek.current = true
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [year, currentYear, weeks])

  // Hoisted so CellEditor can trigger a refetch after save/delete without
  // waiting for Supabase Realtime (which can lag for self-initiated mutations).
  const loadEntries = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('entries')
      .select('*')
      .eq('org_id', orgId)
      .eq('member_id', memberId)
      .gte('date', rangeStart)
      .lte('date', rangeEnd)
      .order('date')
    setEntries(data ?? [])
    setLoading(false)
  }, [orgId, memberId, rangeStart, rangeEnd])

  useEffect(() => {
    let active = true
    setLoading(true)
    loadEntries().then(() => {
      if (!active) return
    })

    const supabase = createClient()
    const channel = supabase
      .channel(`my-plan:${memberId}:${year}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'entries',
          filter: `member_id=eq.${memberId}`,
        },
        () => {
          if (active) loadEntries()
        }
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [loadEntries, memberId, year])

  const entryByDate = useMemo(() => {
    const map = new Map<string, Entry>()
    entries.forEach((e) => map.set(e.date, e))
    return map
  }, [entries])

  // Clamp helpers for in-progress drags.
  function moveTargetStart(m: MoveDrag): number {
    const wkDays = weeks[m.wk].days.length
    const desired = m.currentDayIdx - m.grabOffset
    const maxStart = Math.max(0, wkDays - m.segmentSpan)
    return Math.max(0, Math.min(maxStart, desired))
  }

  function resizeTargetRange(r: ResizeDrag): { start: number; end: number } {
    const wkDays = weeks[r.wk].days.length
    const anchorStart = r.origStart
    const anchorEnd = r.origStart + r.origSpan - 1
    if (r.edge === 'right') {
      const newEnd = Math.max(anchorStart, Math.min(wkDays - 1, r.currentDayIdx))
      return { start: anchorStart, end: newEnd }
    }
    const newStart = Math.max(0, Math.min(anchorEnd, r.currentDayIdx))
    return { start: newStart, end: anchorEnd }
  }

  function ghostRangeFor(wkIdx: number): { start: number; span: number; entry: Entry } | null {
    if (resizeDrag && resizeDrag.wk === wkIdx) {
      const { start, end } = resizeTargetRange(resizeDrag)
      return { start, span: end - start + 1, entry: resizeDrag.entry }
    }
    if (moveDrag && moveDrag.wk === wkIdx) {
      return { start: moveTargetStart(moveDrag), span: moveDrag.segmentSpan, entry: moveDrag.entry }
    }
    return null
  }

  function sourceSegmentFor(wkIdx: number): { start: number; span: number } | null {
    if (resizeDrag && resizeDrag.wk === wkIdx) {
      return { start: resizeDrag.origStart, span: resizeDrag.origSpan }
    }
    if (moveDrag && moveDrag.wk === wkIdx) {
      return { start: moveDrag.segmentStart, span: moveDrag.segmentSpan }
    }
    return null
  }

  // Commit drag on global mouseup. Handles: resize, move, tap-on-bar, select-drag (empty cells).
  useEffect(() => {
    if (!isDragging && !moveDrag && !resizeDrag) return
    async function onUp() {
      if (resizeDrag) {
        const rz = resizeDrag
        setResizeDrag(null)
        const wkDays = weeks[rz.wk].days
        const { start: newStart, end: newEnd } = resizeTargetRange(rz)
        const origStart = rz.origStart
        const origEnd = rz.origStart + rz.origSpan - 1
        const noChange = newStart === origStart && newEnd === origEnd
        if (noChange) {
          const startDate = wkDays[origStart]
          const endDate = wkDays[origEnd]
          setSelectedCell({
            date: toDateString(startDate),
            endDate: toDateString(endDate),
            dateLabel: formatDateLabelLong(startDate, t),
            status: rz.entry.status,
            location: rz.entry.location_label,
            note: rz.entry.note,
          })
          return
        }
        const supabase = createClient()
        const newDates = wkDays.slice(newStart, newEnd + 1).map(toDateString)
        const origDates = wkDays.slice(origStart, origEnd + 1).map(toDateString)
        const rows = newDates.map((d) => ({
          org_id: orgId,
          member_id: memberId,
          date: d,
          status: rz.entry.status,
          location_label: rz.entry.location_label,
          note: rz.entry.note,
          source: 'manual' as const,
        }))
        const { error: upErr } = await supabase
          .from('entries')
          .upsert(rows, { onConflict: 'org_id,member_id,date' })
        if (upErr) {
          toast.error('Kunne ikke endre datoområdet')
          return
        }
        const toDelete = origDates.filter((d) => !newDates.includes(d))
        if (toDelete.length > 0) {
          await supabase
            .from('entries')
            .delete()
            .eq('org_id', orgId)
            .eq('member_id', memberId)
            .in('date', toDelete)
        }
        await loadEntries()
        return
      }

      if (moveDrag) {
        const mv = moveDrag
        setMoveDrag(null)
        const wkDays = weeks[mv.wk].days
        const targetStart = moveTargetStart(mv)
        const noMove = targetStart === mv.segmentStart
        if (noMove) {
          const startDate = wkDays[mv.segmentStart]
          const endDate = wkDays[mv.segmentStart + mv.segmentSpan - 1]
          setSelectedCell({
            date: toDateString(startDate),
            endDate: toDateString(endDate),
            dateLabel: formatDateLabelLong(startDate, t),
            status: mv.entry.status,
            location: mv.entry.location_label,
            note: mv.entry.note,
          })
          return
        }
        const supabase = createClient()
        const srcDates = wkDays
          .slice(mv.segmentStart, mv.segmentStart + mv.segmentSpan)
          .map(toDateString)
        const dstDates = wkDays
          .slice(targetStart, targetStart + mv.segmentSpan)
          .map(toDateString)
        const rows = dstDates.map((d) => ({
          org_id: orgId,
          member_id: memberId,
          date: d,
          status: mv.entry.status,
          location_label: mv.entry.location_label,
          note: mv.entry.note,
          source: 'manual' as const,
        }))
        const { error: upErr } = await supabase
          .from('entries')
          .upsert(rows, { onConflict: 'org_id,member_id,date' })
        if (upErr) {
          toast.error('Kunne ikke flytte oppføringen')
          return
        }
        const toDelete = srcDates.filter((d) => !dstDates.includes(d))
        if (toDelete.length > 0) {
          await supabase
            .from('entries')
            .delete()
            .eq('org_id', orgId)
            .eq('member_id', memberId)
            .in('date', toDelete)
        }
        await loadEntries()
        return
      }

      if (dragStart && dragCurrent && dragStart.wk === dragCurrent.wk) {
        const wk = weeks[dragStart.wk]
        const lo = Math.min(dragStart.d, dragCurrent.d)
        const hi = Math.max(dragStart.d, dragCurrent.d)
        const startDate = wk.days[lo]
        const endDate = wk.days[hi]
        const startStr = toDateString(startDate)
        const endStr = toDateString(endDate)
        const entry = entryByDate.get(startStr) ?? null
        setSelectedCell({
          date: startStr,
          endDate: endStr,
          dateLabel: formatDateLabelLong(startDate, t),
          status: entry?.status ?? null,
          location: entry?.location_label ?? null,
          note: entry?.note ?? null,
        })
      }
      setDragStart(null)
      setDragCurrent(null)
    }
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
  }, [isDragging, moveDrag, resizeDrag, dragStart, dragCurrent, weeks, entryByDate, orgId, memberId, loadEntries])

  function handleDayMouseDown(wk: number, d: number) {
    // If this cell has an entry, start a move-drag for the whole segment.
    // Otherwise start a select-drag for creating a new range.
    const dateStr = toDateString(weeks[wk].days[d])
    const entry = entryByDate.get(dateStr)
    if (entry) {
      const segments = buildWeekSegments(weeks[wk].days, entryByDate, t)
      let cursor = 0
      for (const seg of segments) {
        const n = seg.days.length
        if (d >= cursor && d < cursor + n && seg.entry) {
          setMoveDrag({
            wk,
            segmentStart: cursor,
            segmentSpan: n,
            grabOffset: d - cursor,
            currentDayIdx: d,
            entry: seg.entry,
          })
          return
        }
        cursor += n
      }
      return
    }
    setDragStart({ wk, d })
    setDragCurrent({ wk, d })
  }

  function handleDayMouseEnter(wk: number, d: number) {
    if (resizeDrag) {
      if (resizeDrag.wk !== wk) return
      if (resizeDrag.currentDayIdx === d) return
      setResizeDrag({ ...resizeDrag, currentDayIdx: d })
      return
    }
    if (moveDrag) {
      if (moveDrag.wk !== wk) return
      if (moveDrag.currentDayIdx === d) return
      setMoveDrag({ ...moveDrag, currentDayIdx: d })
      return
    }
    if (!isDragging || !dragStart) return
    if (dragStart.wk !== wk) return
    setDragCurrent({ wk, d })
  }

  function handleSegmentResizeStart(
    wk: number,
    segStart: number,
    segSpan: number,
    edge: 'left' | 'right',
    entry: Entry
  ) {
    setResizeDrag({
      wk,
      edge,
      origStart: segStart,
      origSpan: segSpan,
      currentDayIdx: edge === 'left' ? segStart : segStart + segSpan - 1,
      entry,
    })
  }

  function dayHighlightsForWeek(wkIdx: number, daysInWeek: number): boolean[] {
    if (!isDragging || !dragStart || !dragCurrent) return new Array(daysInWeek).fill(false)
    if (dragStart.wk !== wkIdx) return new Array(daysInWeek).fill(false)
    const lo = Math.min(dragStart.d, dragCurrent.d)
    const hi = Math.max(dragStart.d, dragCurrent.d)
    return Array.from({ length: daysInWeek }, (_, i) => i >= lo && i <= hi)
  }

  // Refetch on explicit broadcast — AIInput emits this after a successful parse.
  useEffect(() => {
    const handler = () => loadEntries()
    window.addEventListener('teampulse:entries-changed', handler)
    return () => window.removeEventListener('teampulse:entries-changed', handler)
  }, [loadEntries])

  function goPrevYear() {
    setDirY('prev')
    setYear((y) => y - 1)
  }
  function goNextYear() {
    setDirY('next')
    setYear((y) => y + 1)
  }
  function goCurrentYear() {
    setDirY(year < currentYear ? 'next' : 'prev')
    setYear(currentYear)
    didScrollToCurrentWeek.current = false
  }

  const totalEntries = entries.length

  return (
    <div className="relative space-y-6">
      {/* Scoped ambient aurora — violet + teal diagonal, 8% opacity */}
      <div className="lg-aurora" aria-hidden />

      {/* Header */}
      <div className="relative flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 min-w-0">
          <MemberAvatar name={memberName} initials={memberInitials ?? null} avatarUrl={avatarUrl} size="md" />
          <div className="min-w-0">
            <div className="lg-eyebrow mb-1.5">{memberName}</div>
            <h1
              className="lg-serif leading-[0.95]"
              style={{
                color: 'var(--lg-text-1)',
                fontSize: 'clamp(40px, 5vw, 56px)',
              }}
            >
              Min plan
            </h1>
            <p
              className="text-[12.5px] mt-2"
              style={{ color: 'var(--lg-text-3)', fontFamily: 'var(--font-body)' }}
            >
              {loading
                ? 'Laster…'
                : totalEntries === 0
                  ? t.myPlan.emptyYear.replace('{year}', String(year))
                  : `${totalEntries} ${totalEntries === 1 ? 'oppføring' : 'oppføringer'} i ${year}`}
            </p>
          </div>
        </div>

        {/* Year picker — glass toolbar */}
        <div
          className="flex items-center gap-1 rounded-full p-1"
          style={{
            background: 'rgba(22, 22, 27, 0.5)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid var(--lg-divider)',
          }}
        >
          <button
            onClick={goPrevYear}
            className="flex items-center justify-center w-8 h-8 rounded-full transition-colors duration-150 focus:outline-none"
            style={{ color: 'var(--lg-text-2)' }}
            aria-label={t.matrix.prevYear}
          >
            <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
          </button>

          <motion.span
            key={year}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring.gentle}
            className="lg-mono px-3 text-[15px] font-medium"
            style={{
              color:
                year === currentYear ? 'var(--lg-accent)' : 'var(--lg-text-1)',
              textShadow:
                year === currentYear ? '0 0 18px var(--lg-accent-glow)' : undefined,
            }}
          >
            {year}
          </motion.span>

          <button
            onClick={goNextYear}
            className="flex items-center justify-center w-8 h-8 rounded-full transition-colors duration-150 focus:outline-none"
            style={{ color: 'var(--lg-text-2)' }}
            aria-label={t.matrix.nextYear}
          >
            <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
          </button>

          {year !== currentYear && (
            <motion.button
              onClick={goCurrentYear}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={spring.snappy}
              className="ml-1 px-3 h-8 rounded-full text-[11.5px] font-medium focus:outline-none transition-[box-shadow,background] duration-150"
              style={{
                color: '#fff',
                background: 'var(--lg-accent)',
                boxShadow:
                  '0 0 0 3px rgba(139, 92, 246, 0.18), 0 0 20px var(--lg-accent-glow)',
                fontFamily: 'var(--font-body)',
              }}
            >
              {currentYear}
            </motion.button>
          )}
        </div>
      </div>

      {/* First-time / empty-year encouragement — shown above the grid so the
          structure is still visible underneath and clickable. */}
      {!loading && totalEntries === 0 && <MyPlanEmpty year={year} />}

      {/* Sticky weekday header — Man Tir Ons Tor Fre, today gets an Nå capsule.
          Sits just below the app-header (h-16) and fades content scrolling under it. */}
      <div
        className="sticky z-20 -mx-1 px-1 pt-3 pb-3"
        style={{
          top: 64,
          background:
            'linear-gradient(180deg, var(--lg-bg) 0%, var(--lg-bg) 72%, transparent 100%)',
        }}
      >
        <div
          className="grid gap-2 px-4 py-2 rounded-2xl"
          style={{
            gridTemplateColumns: '128px repeat(5, 1fr)',
            background: 'rgba(31, 25, 19, 0.65)',
            backdropFilter: 'blur(18px) saturate(160%)',
            WebkitBackdropFilter: 'blur(18px) saturate(160%)',
            border: '1px solid var(--lg-divider)',
          }}
        >
          <div />
          {weekdayLabels.map((lbl, i) => {
            const isToday = i === todayWeekdayIdx
            return (
              <div key={i} className="flex items-center justify-center py-0.5">
                <span
                  className="lg-mono text-[10.5px] font-medium uppercase"
                  style={{
                    color: isToday ? 'var(--lg-accent)' : 'var(--lg-text-3)',
                    letterSpacing: '0.22em',
                  }}
                >
                  {lbl}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Weeks — grouped by month, each group gets a serif header */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={year}
          initial={{ x: dirY === 'next' ? 32 : -32, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: dirY === 'next' ? -32 : 32, opacity: 0 }}
          transition={spring.snappy}
          className="flex flex-col gap-10"
        >
          {monthGroups.map((group) => {
            return (
              <section key={`${group.year}-${group.monthIdx}`} className="flex flex-col">
                <header className="flex items-baseline gap-3 mb-4 px-1">
                  <h2
                    className="lg-serif"
                    style={{ color: 'var(--lg-text-1)', fontSize: 32, lineHeight: 1 }}
                  >
                    {group.label}
                  </h2>
                  <span
                    className="lg-mono text-[11px] uppercase"
                    style={{
                      color: 'var(--lg-text-3)',
                      letterSpacing: '0.22em',
                    }}
                  >
                    {group.year}
                  </span>
                </header>

                <div className="flex flex-col gap-2.5">
                  {group.weeks.map((wk) => {
                    const wkIdx = weeks.indexOf(wk)
                    const segments = buildWeekSegments(wk.days, entryByDate, t)
                    const hasEntries = segments.some((s) => s.entry !== null)
                    const highlights = dayHighlightsForWeek(wkIdx, wk.days.length)

                    let cursor = 0
                    const segmentHighlights: boolean[][] = segments.map((seg) => {
                      const slice = highlights.slice(cursor, cursor + seg.days.length)
                      cursor += seg.days.length
                      return slice
                    })

                    return (
                      <motion.div
                        key={`${wk.year}-${wk.weekNumber}`}
                        ref={wk.isCurrentWeek ? currentWeekRef : undefined}
                        initial={{ y: 6, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ duration: 0.2, delay: Math.min(wkIdx, 18) * 0.015, ease: [0.4, 0, 0.2, 1] }}
                        className="group relative rounded-2xl overflow-hidden"
                        style={{
                          // Current-week row uses a warm Ember tint so the
                          // Nordlys today-chord is the lone signature.
                          background: wk.isCurrentWeek
                            ? 'linear-gradient(180deg, rgba(251, 191, 36, 0.06) 0%, rgba(251, 191, 36, 0.015) 100%), var(--lg-surface-1)'
                            : 'var(--lg-surface-1)',
                          border: `1px solid ${wk.isCurrentWeek ? 'rgba(251, 191, 36, 0.22)' : 'var(--lg-divider)'}`,
                          boxShadow: wk.isCurrentWeek
                            ? 'inset 0 0 0 1px rgba(251, 191, 36, 0.05)'
                            : 'none',
                        }}
                      >
                        {/* Today chord — THE /min-plan Nordlys moment.
                            A single vertical gradient line through today's
                            column on the current week's row. "Horisonten
                            gjort vertikal": the one-line signature that
                            marks akkurat nå on this flate. */}
                        {wk.isCurrentWeek && todayIsWeekday && (
                          <div
                            aria-hidden
                            className="absolute pointer-events-none z-[4]"
                            style={{
                              top: 0,
                              bottom: 0,
                              left: `calc(152px + ${todayWeekdayIdx} * ((100% - 200px) / 5 + 8px) + ((100% - 200px) / 5) / 2 - 1px)`,
                              width: 2,
                              background:
                                'linear-gradient(180deg, rgba(0, 245, 160, 0) 0%, #00F5A0 20%, #00D9F5 50%, #7C3AED 80%, rgba(124, 58, 237, 0) 100%)',
                              boxShadow:
                                '0 0 12px rgba(0, 217, 245, 0.45), 0 0 24px rgba(0, 245, 160, 0.22)',
                            }}
                          />
                        )}

                        {/* Empty-week dashed baseline + hover hint */}
                        {!hasEntries && (
                          <>
                            <div
                              aria-hidden
                              className="absolute pointer-events-none z-[2]"
                              style={{
                                left: 'calc(16px + 128px + 8px)',
                                right: 16,
                                top: '50%',
                                borderTop: '1px dashed var(--lg-divider)',
                              }}
                            />
                            <div
                              aria-hidden
                              className="absolute pointer-events-none z-[3] opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex justify-center"
                              style={{
                                left: 'calc(16px + 128px + 8px)',
                                right: 16,
                                top: '50%',
                                transform: 'translateY(-50%)',
                              }}
                            >
                              <span
                                className="lg-mono uppercase"
                                style={{
                                  fontSize: 9.5,
                                  letterSpacing: '0.22em',
                                  color: 'var(--lg-text-3)',
                                  background: 'var(--lg-surface-1)',
                                  padding: '4px 10px',
                                  borderRadius: 999,
                                  border: '1px solid var(--lg-divider)',
                                }}
                              >
                                Klikk for å planlegge
                              </span>
                            </div>
                          </>
                        )}

                        <div
                          className="grid items-center gap-2 px-4 py-3.5"
                          style={{
                            gridTemplateColumns: '128px repeat(5, 1fr)',
                            userSelect: 'none',
                          }}
                        >
                          {/* Week label column */}
                          <div className="flex flex-col justify-center pr-2">
                            <div className="flex items-baseline gap-2">
                              <span
                                className="lg-mono text-[10px] font-medium uppercase"
                                style={{
                                  color: wk.isCurrentWeek
                                    ? 'var(--lg-accent)'
                                    : 'var(--lg-text-3)',
                                  letterSpacing: '0.22em',
                                }}
                              >
                                {t.matrix.weekLabel}
                              </span>
                              <span
                                className="lg-mono text-[22px] leading-none"
                                style={{
                                  color: wk.isCurrentWeek
                                    ? 'var(--lg-accent)'
                                    : 'var(--lg-text-1)',
                                  textShadow: wk.isCurrentWeek
                                    ? '0 0 14px var(--lg-accent-glow)'
                                    : undefined,
                                  fontWeight: 500,
                                }}
                              >
                                {wk.weekNumber}
                              </span>
                            </div>
                          </div>

                          {/* Segments — multi-day blocks like oversikt/Outlook */}
                          {(() => {
                            let cursor2 = 0
                            const segmentStarts: number[] = segments.map((seg) => {
                              const start = cursor2
                              cursor2 += seg.days.length
                              return start
                            })
                            const src = sourceSegmentFor(wkIdx)
                            return segments.map((seg, segIdx) => {
                              const isDragSource =
                                src !== null &&
                                segmentStarts[segIdx] === src.start &&
                                seg.days.length === src.span
                              const rangeLabel =
                                seg.entry && seg.dates.length > 1
                                  ? formatDateRange(seg.dates)
                                  : undefined
                              return (
                                <StatusSegment
                                  key={`${wkIdx}-${segIdx}-${seg.days[0].date}`}
                                  status={seg.entry?.status ?? null}
                                  location={seg.entry?.location_label ?? null}
                                  note={seg.entry?.note ?? null}
                                  days={seg.days}
                                  onSelectDay={() => {
                                    /* replaced by drag mousedown/mouseup flow */
                                  }}
                                  onDayMouseDown={(dayIdx) => {
                                    const absoluteIdx = wk.days.findIndex(
                                      (d) => toDateString(d) === seg.days[dayIdx].date
                                    )
                                    if (absoluteIdx >= 0) handleDayMouseDown(wkIdx, absoluteIdx)
                                  }}
                                  onDayMouseEnter={(dayIdx) => {
                                    const absoluteIdx = wk.days.findIndex(
                                      (d) => toDateString(d) === seg.days[dayIdx].date
                                    )
                                    if (absoluteIdx >= 0) handleDayMouseEnter(wkIdx, absoluteIdx)
                                  }}
                                  dayHighlight={segmentHighlights[segIdx]}
                                  muted={isDragSource}
                                  dateRangeLabel={rangeLabel}
                                  hideToday={wk.isCurrentWeek}
                                  onSegmentResizeStart={
                                    seg.entry
                                      ? (edge) =>
                                          handleSegmentResizeStart(
                                            wkIdx,
                                            segmentStarts[segIdx],
                                            seg.days.length,
                                            edge,
                                            seg.entry!
                                          )
                                      : undefined
                                  }
                                />
                              )
                            })
                          })()}

                          {/* Drag ghost — shown for move OR resize while the user drags a bar in this week */}
                          {(() => {
                            const ghost = ghostRangeFor(wkIdx)
                            if (!ghost) return null
                            const { start: targetStart, span, entry } = ghost
                            const palette = palettes[entry.status]
                            const tone = palette.icon
                            const leftCalc = `calc(152px + ${targetStart} * ((100% - 200px) / 5 + 8px))`
                            const widthCalc = `calc(${span} * ((100% - 200px) / 5) + ${(span - 1) * 8}px)`
                            return (
                              <div
                                aria-hidden
                                style={{
                                  position: 'absolute',
                                  top: '50%',
                                  transform: 'translateY(-50%)',
                                  height: 32,
                                  left: leftCalc,
                                  width: widthCalc,
                                  borderRadius: 8,
                                  background: `linear-gradient(180deg, ${tone}33 0%, ${tone}22 100%)`,
                                  boxShadow: `inset 3px 0 0 ${tone}, inset 0 0 0 1px ${tone}55, 0 0 24px -4px ${tone}88`,
                                  opacity: 0.95,
                                  pointerEvents: 'none',
                                  zIndex: 25,
                                  transition:
                                    'left 120ms cubic-bezier(0.2, 0.8, 0.2, 1), width 120ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                                }}
                              />
                            )
                          })()}
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </motion.div>
      </AnimatePresence>

      {/* Cell editor */}
      <CellEditor
        open={selectedCell !== null}
        onClose={() => setSelectedCell(null)}
        orgId={orgId}
        memberId={memberId}
        memberName={memberName}
        date={selectedCell?.date ?? ''}
        dateLabel={selectedCell?.dateLabel ?? ''}
        initialStatus={selectedCell?.status ?? null}
        initialLocation={selectedCell?.location ?? null}
        initialNote={selectedCell?.note ?? null}
        initialRangeEnd={selectedCell?.endDate ?? null}
        onMutated={loadEntries}
        onOptimisticSave={(dates, payload) => {
          const nowISO = new Date().toISOString()
          const affected = new Set(dates)
          setEntries((prev) => {
            const filtered = prev.filter(
              (e) => !(e.member_id === memberId && affected.has(e.date)),
            )
            const inserts: Entry[] = dates.map((d) => ({
              id: `optimistic-${memberId}-${d}`,
              org_id: orgId,
              member_id: memberId,
              date: d,
              status: payload.status,
              location_label: payload.location_label,
              note: payload.note,
              source: 'manual',
              source_text: null,
              created_by: null,
              created_at: nowISO,
              updated_at: nowISO,
            }))
            return [...filtered, ...inserts]
          })
        }}
        onOptimisticDelete={(dates) => {
          const affected = new Set(dates)
          setEntries((prev) =>
            prev.filter((e) => !(e.member_id === memberId && affected.has(e.date))),
          )
        }}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function MyPlanEmpty({ year }: { year: number }) {
  const t = useT()
  return (
    <EmptyState
      icon={
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none">
          <rect x="3.5" y="5" width="17" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.75" />
          <path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          <circle cx="12" cy="14.5" r="1.25" fill="currentColor" />
        </svg>
      }
      title={t.myPlan.emptyListTitle.replace('{year}', String(year))}
      description={t.myPlan.emptyListHint}
    />
  )
}
