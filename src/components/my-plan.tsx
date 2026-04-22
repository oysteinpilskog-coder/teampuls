'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { addDays, getISOWeek, getISOWeekYear } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { useTheme } from 'next-themes'
import { createClient } from '@/lib/supabase/client'
import { MemberAvatar } from '@/components/member-avatar'
import { CellEditor } from '@/components/cell-editor'
import { EmptyState } from '@/components/empty-state'
import { StatusSegment, type SegmentDay } from '@/components/status-segment'
import {
  toDateString,
  isToday,
  MONTH_LONG_NB,
  formatDateLabelLong,
  getWeekStart,
  getLastISOWeek,
} from '@/lib/dates'
import type { Entry, EntryStatus } from '@/lib/supabase/types'
import { spring } from '@/lib/motion'
import { no } from '@/lib/i18n/no'
import { useStatusColors } from '@/lib/status-colors/context'

interface MyPlanProps {
  orgId: string
  memberId: string
  memberName: string
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

function buildYearWeeks(year: number): WeekBlock[] {
  const today = new Date()
  const todayWeek = getISOWeek(today)
  const todayYear = getISOWeekYear(today)
  const lastWeek = getLastISOWeek(year)

  return Array.from({ length: lastWeek }, (_, i) => {
    const weekNumber = i + 1
    const start = getWeekStart(weekNumber, year)
    const days = Array.from({ length: 5 }, (_, d) => addDays(start, d))
    const midWeek = days[2]
    const monthLabel = MONTH_LONG_NB[midWeek.getMonth()]
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

function buildWeekSegments(weekDays: Date[], entryByDate: Map<string, Entry>): RowSegment[] {
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
        dateLabel: formatDateLabelLong(date),
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

export function MyPlan({ orgId, memberId, memberName, avatarUrl }: MyPlanProps) {
  const currentYear = useMemo(() => getISOWeekYear(new Date()), [])
  const [year, setYear] = useState(currentYear)
  const [dirY, setDirY] = useState<'next' | 'prev'>('next')

  const weeks = useMemo(() => buildYearWeeks(year), [year])
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

  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
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
            dateLabel: formatDateLabelLong(startDate),
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
            dateLabel: formatDateLabelLong(startDate),
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
          dateLabel: formatDateLabelLong(startDate),
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
      const segments = buildWeekSegments(weeks[wk].days, entryByDate)
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
          <MemberAvatar name={memberName} avatarUrl={avatarUrl} size="md" />
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
                  ? `Ingen oppføringer i ${year}`
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
            aria-label="Forrige år"
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
            aria-label="Neste år"
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

      {/* Weeks */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={year}
          initial={{ x: dirY === 'next' ? 32 : -32, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: dirY === 'next' ? -32 : 32, opacity: 0 }}
          transition={spring.snappy}
          className="space-y-3"
        >
          {weeks.map((wk, wkIdx) => {
            const segments = buildWeekSegments(wk.days, entryByDate)
            const hasEntries = segments.some((s) => s.entry !== null)
            const highlights = dayHighlightsForWeek(wkIdx, wk.days.length)

            // Map segment index → array of highlight flags for that segment's days.
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
                className="relative rounded-2xl overflow-hidden"
                style={{
                  background: wk.isCurrentWeek
                    ? 'rgba(22, 22, 27, 0.55)'
                    : 'var(--lg-surface-1)',
                  backdropFilter: wk.isCurrentWeek
                    ? 'blur(20px) saturate(180%)'
                    : undefined,
                  WebkitBackdropFilter: wk.isCurrentWeek
                    ? 'blur(20px) saturate(180%)'
                    : undefined,
                  border: `1px solid ${wk.isCurrentWeek ? 'rgba(139, 92, 246, 0.28)' : 'var(--lg-divider)'}`,
                  boxShadow: wk.isCurrentWeek
                    ? '0 0 0 3px rgba(139, 92, 246, 0.10), 0 0 24px -6px var(--lg-accent-glow)'
                    : 'none',
                  opacity: !hasEntries && !wk.isCurrentWeek ? 0.5 : 1,
                }}
              >
                <div
                  className="grid items-stretch gap-2 px-4 py-3"
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
                          letterSpacing: '0.2em',
                        }}
                      >
                        {no.matrix.weekLabel}
                      </span>
                      <span
                        className="lg-mono text-[22px] leading-none"
                        style={{
                          color: wk.isCurrentWeek
                            ? 'var(--lg-accent)'
                            : 'var(--lg-text-1)',
                          textShadow: wk.isCurrentWeek
                            ? '0 0 18px var(--lg-accent-glow)'
                            : undefined,
                          fontWeight: 500,
                        }}
                      >
                        {wk.weekNumber}
                      </span>
                    </div>
                    <div
                      className="lg-serif mt-0.5 capitalize"
                      style={{
                        color: wk.isCurrentWeek
                          ? 'var(--lg-text-2)'
                          : 'var(--lg-text-3)',
                        fontSize: 14,
                      }}
                    >
                      {wk.monthLabel}
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
                    const [g0, g1] = isDark ? palette.gradient.dark : palette.gradient.light
                    // Row: px-4 (16) + 128 name col + 8 gap + 5 * 1fr with 8 gaps + px-4 (16).
                    // Day 0 starts at 16 + 128 + 8 = 152px. Per-day = (100% - 200px) / 5.
                    const leftCalc = `calc(152px + ${targetStart} * ((100% - 200px) / 5 + 8px))`
                    const widthCalc = `calc(${span} * ((100% - 200px) / 5) + ${(span - 1) * 8}px)`
                    return (
                      <div
                        aria-hidden
                        style={{
                          position: 'absolute',
                          top: 12,
                          height: 36,
                          left: leftCalc,
                          width: widthCalc,
                          borderRadius: 9,
                          backgroundImage: `linear-gradient(180deg, ${g0} 0%, ${g1} 100%)`,
                          backgroundColor: g1,
                          boxShadow: isDark
                            ? '0 0 0 1.5px rgba(255,255,255,0.65), 0 10px 24px -6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.18)'
                            : '0 0 0 1.5px rgba(255,255,255,0.9), 0 10px 24px -6px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.35)',
                          opacity: 0.92,
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
  return (
    <EmptyState
      icon={
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none">
          <rect x="3.5" y="5" width="17" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.75" />
          <path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          <circle cx="12" cy="14.5" r="1.25" fill="currentColor" />
        </svg>
      }
      title={`Ingen oppføringer i ${year} ennå`}
      description={
        <>
          Skriv en statusoppdatering på <strong style={{ color: 'var(--text-primary)' }}>Oversikt</strong>,
          eller klikk en dag i rutenettet nedenfor for å komme i gang. Planen fyller seg selv etter hvert
          som teamet sender oppdateringer.
        </>
      }
    />
  )
}
