'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { addDays, getISOWeek, getISOWeekYear } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { MemberAvatar } from '@/components/member-avatar'
import { CellEditor } from '@/components/cell-editor'
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

  useEffect(() => {
    const supabase = createClient()
    let active = true
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('entries')
        .select('*')
        .eq('org_id', orgId)
        .eq('member_id', memberId)
        .gte('date', rangeStart)
        .lte('date', rangeEnd)
        .order('date')
      if (!active) return
      setEntries(data ?? [])
      setLoading(false)
    }
    load()

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
        () => load()
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [orgId, memberId, rangeStart, rangeEnd, year])

  const entryByDate = useMemo(() => {
    const map = new Map<string, Entry>()
    entries.forEach((e) => map.set(e.date, e))
    return map
  }, [entries])

  // Commit drag on global mouseup. Single-day drag (no movement) opens single-day editor;
  // multi-day drag opens with a pre-selected range.
  useEffect(() => {
    if (!isDragging) return
    function onUp() {
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
  }, [isDragging, dragStart, dragCurrent, weeks, entryByDate])

  function handleDayMouseDown(wk: number, d: number) {
    setDragStart({ wk, d })
    setDragCurrent({ wk, d })
  }

  function handleDayMouseEnter(wk: number, d: number) {
    if (!isDragging || !dragStart) return
    if (dragStart.wk !== wk) return
    setDragCurrent({ wk, d })
  }

  function dayHighlightsForWeek(wkIdx: number, daysInWeek: number): boolean[] {
    if (!isDragging || !dragStart || !dragCurrent) return new Array(daysInWeek).fill(false)
    if (dragStart.wk !== wkIdx) return new Array(daysInWeek).fill(false)
    const lo = Math.min(dragStart.d, dragCurrent.d)
    const hi = Math.max(dragStart.d, dragCurrent.d)
    return Array.from({ length: daysInWeek }, (_, i) => i >= lo && i <= hi)
  }

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <MemberAvatar name={memberName} avatarUrl={avatarUrl} size="md" />
          <div>
            <h1
              className="text-[32px] font-bold leading-none"
              style={{
                fontFamily: 'var(--font-sora)',
                letterSpacing: '-0.03em',
                color: 'var(--text-primary)',
              }}
            >
              Min plan
            </h1>
            <p
              className="text-[13px] mt-1.5"
              style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
            >
              {loading
                ? 'Laster…'
                : totalEntries === 0
                  ? `Ingen oppføringer i ${year}`
                  : `${totalEntries} ${totalEntries === 1 ? 'oppføring' : 'oppføringer'} i ${year}`}
            </p>
          </div>
        </div>

        {/* Year picker */}
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-1 rounded-xl p-1"
            style={{
              background: 'color-mix(in oklab, var(--bg-elevated) 60%, transparent)',
              backdropFilter: 'blur(14px) saturate(180%)',
              WebkitBackdropFilter: 'blur(14px) saturate(180%)',
              border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}
          >
            <motion.button
              onClick={goPrevYear}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.94 }}
              transition={spring.snappy}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
              aria-label="Forrige år"
            >
              <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
            </motion.button>
            <motion.button
              onClick={goNextYear}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.94 }}
              transition={spring.snappy}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
              aria-label="Neste år"
            >
              <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
            </motion.button>
          </div>

          <motion.span
            key={year}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring.gentle}
            className="text-[28px] font-bold tabular-nums leading-none"
            style={{
              fontFamily: 'var(--font-sora)',
              letterSpacing: '-0.03em',
              color: 'var(--text-primary)',
              background:
                year === currentYear
                  ? 'linear-gradient(135deg, var(--accent-color), color-mix(in oklab, var(--accent-color) 55%, #6B2ECB))'
                  : undefined,
              WebkitBackgroundClip: year === currentYear ? 'text' : undefined,
              WebkitTextFillColor: year === currentYear ? 'transparent' : undefined,
              backgroundClip: year === currentYear ? 'text' : undefined,
            }}
          >
            {year}
          </motion.span>

          {year !== currentYear && (
            <motion.button
              onClick={goCurrentYear}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              transition={spring.snappy}
              className="ml-1 px-3.5 h-8 rounded-xl text-[12px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
              style={{
                color: '#fff',
                background: 'linear-gradient(135deg, var(--accent-color), color-mix(in oklab, var(--accent-color) 70%, black))',
                boxShadow: '0 4px 12px color-mix(in oklab, var(--accent-color) 35%, transparent)',
                fontFamily: 'var(--font-body)',
              }}
            >
              {currentYear}
            </motion.button>
          )}
        </div>
      </div>

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
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ ...spring.gentle, delay: Math.min(wkIdx, 18) * 0.015 }}
                className="relative rounded-3xl overflow-hidden"
                style={{
                  background: 'color-mix(in oklab, var(--bg-elevated) 78%, transparent)',
                  backdropFilter: 'blur(22px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(22px) saturate(180%)',
                  border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
                  boxShadow:
                    '0 12px 32px -16px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.03)',
                  opacity: !hasEntries && !wk.isCurrentWeek ? 0.62 : 1,
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
                    <div className="flex items-baseline gap-1.5">
                      <span
                        className="text-[10px] font-bold uppercase tracking-[0.18em]"
                        style={{
                          color: wk.isCurrentWeek
                            ? 'var(--accent-color)'
                            : 'var(--text-tertiary)',
                          fontFamily: 'var(--font-body)',
                        }}
                      >
                        {no.matrix.weekLabel}
                      </span>
                      <span
                        className="text-[22px] font-bold tabular-nums leading-none"
                        style={{
                          fontFamily: 'var(--font-sora)',
                          letterSpacing: '-0.03em',
                          color: 'var(--text-primary)',
                          background: wk.isCurrentWeek
                            ? 'linear-gradient(135deg, var(--accent-color), color-mix(in oklab, var(--accent-color) 55%, #6B2ECB))'
                            : undefined,
                          WebkitBackgroundClip: wk.isCurrentWeek ? 'text' : undefined,
                          WebkitTextFillColor: wk.isCurrentWeek ? 'transparent' : undefined,
                          backgroundClip: wk.isCurrentWeek ? 'text' : undefined,
                        }}
                      >
                        {wk.weekNumber}
                      </span>
                    </div>
                    <div
                      className="text-[11px] font-medium mt-0.5 capitalize"
                      style={{
                        color: 'var(--text-tertiary)',
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      {wk.monthLabel}
                    </div>
                  </div>

                  {/* Segments — multi-day blocks like oversikt/Outlook */}
                  {segments.map((seg, segIdx) => (
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
                        // `dayIdx` is within the segment; translate to week-day index.
                        const absoluteIdx =
                          wk.days.findIndex(
                            (d) => toDateString(d) === seg.days[dayIdx].date
                          )
                        if (absoluteIdx >= 0) handleDayMouseDown(wkIdx, absoluteIdx)
                      }}
                      onDayMouseEnter={(dayIdx) => {
                        const absoluteIdx =
                          wk.days.findIndex(
                            (d) => toDateString(d) === seg.days[dayIdx].date
                          )
                        if (absoluteIdx >= 0) handleDayMouseEnter(wkIdx, absoluteIdx)
                      }}
                      dayHighlight={segmentHighlights[segIdx]}
                    />
                  ))}
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
      />
    </div>
  )
}
