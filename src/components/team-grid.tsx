'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import type { Member, Office } from '@/lib/supabase/types'
import {
  getWeekDays,
  getLastISOWeek,
  getDayLabel,
  toDateString,
  isToday,
  getTodayWeekAndYear,
  formatDateLabelLong,
} from '@/lib/dates'
import { WeekNav } from '@/components/week-nav'
import { StatusSegment, type SegmentDay } from '@/components/status-segment'
import { useStatusColors } from '@/lib/status-colors/context'
import { toast } from 'sonner'
import { useTheme } from 'next-themes'
import { MemberAvatar } from '@/components/member-avatar'
import { MemberHoverCard } from '@/components/member-hover-card'
import { TodayPulse } from '@/components/today-pulse'
import { CellEditor } from '@/components/cell-editor'
import { spring } from '@/lib/motion'
import { useEntries } from '@/hooks/use-entries'
import { useT } from '@/lib/i18n/context'
import type { Dictionary } from '@/lib/i18n/types'
import type { Entry, EntryStatus } from '@/lib/supabase/types'

interface RowSegment {
  days: SegmentDay[]
  dates: Date[]
  entry: Entry | null
}

function entriesMergeable(a: Entry | null, b: Entry | null): boolean {
  // Never merge empty days — each empty slot stays clickable on its own.
  if (a === null || b === null) return false
  return (
    a.status === b.status &&
    (a.location_label ?? null) === (b.location_label ?? null) &&
    (a.note ?? null) === (b.note ?? null)
  )
}

function buildRowSegments(
  weekDays: Date[],
  memberId: string,
  entryMap: Map<string, Entry>,
  t: Dictionary,
): RowSegment[] {
  const segments: RowSegment[] = []
  let i = 0
  while (i < weekDays.length) {
    const startEntry = entryMap.get(`${memberId}_${toDateString(weekDays[i])}`) ?? null
    let j = i + 1
    while (j < weekDays.length) {
      const nextEntry = entryMap.get(`${memberId}_${toDateString(weekDays[j])}`) ?? null
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
  memberId: string
  memberName: string
  date: string
  endDate: string
  dateLabel: string
  status: EntryStatus | null
  location: string | null
  note: string | null
}

interface DragPoint {
  memberId: string
  dayIdx: number
}

interface MoveDrag {
  memberId: string
  segmentStart: number    // first day-idx of the source segment within the week
  segmentSpan: number     // number of days in the source segment
  grabOffset: number      // which day within the segment was grabbed (0..span-1)
  currentDayIdx: number   // where the cursor is now (0..weekDays.length-1)
  entry: Entry            // source entry (status + location + note to carry over)
}

interface ResizeDrag {
  memberId: string
  edge: 'left' | 'right'
  origStart: number       // segment's original first day-idx
  origSpan: number        // segment's original span
  currentDayIdx: number   // where the cursor is now (0..weekDays.length-1)
  entry: Entry
}

interface TeamGridProps {
  orgId: string
}

// Skeleton row for loading state
function SkeletonRow({ index = 0 }: { index?: number }) {
  // A content-shaped skeleton: avatar, name bar, and 5 day cells that don't
  // all shimmer in lockstep. Staggered animation delays sell the liveness
  // without requiring JS — a pure CSS shimmer.
  const delay = `${index * 80}ms`
  // Name bar length varies so rows don't look stamped out.
  const nameWidth = [58, 72, 44, 64, 52, 76][index % 6]
  // A sparse pattern of "cells" per row so the skeleton hints at real data.
  const filled = [[0, 4], [1, 3], [], [0, 1, 4], [2], [0, 2, 3]][index % 6]
  return (
    <div
      className="grid gap-2 items-center"
      style={{ gridTemplateColumns: '136px repeat(5, 1fr)' }}
    >
      <div className="flex items-center gap-2 px-1">
        <span
          className="shrink-0 tp-shimmer"
          style={{ width: 28, height: 28, borderRadius: '9999px', animationDelay: delay }}
        />
        <span
          className="tp-shimmer"
          style={{ height: 10, width: `${nameWidth}%`, borderRadius: 4, animationDelay: delay }}
        />
      </div>
      {Array.from({ length: 5 }).map((_, i) => {
        const isFilled = filled.includes(i)
        return (
          <span
            key={i}
            className="tp-shimmer"
            style={{
              height: 36,
              borderRadius: 10,
              animationDelay: `${index * 80 + i * 40}ms`,
              opacity: isFilled ? 1 : 0.45,
            }}
          />
        )
      })}
    </div>
  )
}

export function TeamGrid({ orgId }: TeamGridProps) {
  const t = useT()
  const { week: todayWeek, year: todayYear } = getTodayWeekAndYear()
  const [week, setWeek] = useState(todayWeek)
  const [year, setYear] = useState(todayYear)
  const [slideDir, setSlideDir] = useState<'next' | 'prev'>('next')

  const [members, setMembers] = useState<Member[]>([])
  const [offices, setOffices] = useState<Office[]>([])
  const [membersLoading, setMembersLoading] = useState(true)
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null)

  const [dragStart, setDragStart] = useState<DragPoint | null>(null)
  const [dragCurrent, setDragCurrent] = useState<DragPoint | null>(null)
  const isDragging = dragStart !== null

  const [moveDrag, setMoveDrag] = useState<MoveDrag | null>(null)
  const [resizeDrag, setResizeDrag] = useState<ResizeDrag | null>(null)
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const palettes = useStatusColors()

  const weekDays = useMemo(() => getWeekDays(week, year), [week, year])
  const dateStrings = useMemo(() => weekDays.map(toDateString), [weekDays])
  const isCurrentWeek = week === todayWeek && year === todayYear

  // Realtime entries hook — handles fetch + live subscription. We also keep
  // `refetch` so drag mutations can force an immediate reload instead of
  // waiting for the realtime round-trip (which can lag or drop silently).
  const { entries, loading: entriesLoading, refetch, applyOptimistic } = useEntries(orgId, dateStrings)
  const loading = membersLoading || entriesLoading

  // Build entry lookup: member_id + date → Entry
  const entryMap = useMemo(() => {
    const map = new Map<string, typeof entries[number]>()
    entries.forEach((e) => map.set(`${e.member_id}_${e.date}`, e))
    return map
  }, [entries])

  // Only show members that have at least one entry in the visible week.
  const visibleMembers = useMemo(() => {
    const memberIdsWithEntries = new Set(entries.map((e) => e.member_id))
    return members.filter((m) => memberIdsWithEntries.has(m.id))
  }, [members, entries])

  // Fetch members once (they rarely change)
  const fetchMembers = useCallback(async () => {
    setMembersLoading(true)
    const supabase = createClient()
    // Fetch members and offices in parallel — the hover card needs the home
    // office's name + timezone to show each member's local time.
    const [{ data: ms }, { data: os }] = await Promise.all([
      supabase
        .from('members')
        .select('*')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .order('display_name'),
      supabase
        .from('offices')
        .select('*')
        .eq('org_id', orgId)
        .order('sort_order'),
    ])
    setMembers(ms ?? [])
    setOffices(os ?? [])
    setMembersLoading(false)
  }, [orgId])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  // Office lookup by id — cheap and stable across renders.
  const officeById = useMemo(() => {
    const map = new Map<string, Office>()
    offices.forEach((o) => map.set(o.id, o))
    return map
  }, [offices])

  // Compute clamped target start for an in-progress move drag.
  function moveTargetStart(m: MoveDrag): number {
    const desired = m.currentDayIdx - m.grabOffset
    const maxStart = Math.max(0, weekDays.length - m.segmentSpan)
    return Math.max(0, Math.min(maxStart, desired))
  }

  // Compute clamped new range for an in-progress resize drag.
  function resizeTargetRange(r: ResizeDrag): { start: number; end: number } {
    const anchorStart = r.origStart
    const anchorEnd = r.origStart + r.origSpan - 1
    if (r.edge === 'right') {
      const newEnd = Math.max(anchorStart, Math.min(weekDays.length - 1, r.currentDayIdx))
      return { start: anchorStart, end: newEnd }
    }
    const newStart = Math.max(0, Math.min(anchorEnd, r.currentDayIdx))
    return { start: newStart, end: anchorEnd }
  }

  // Unified ghost-range query: what range should the ghost bar occupy for this row?
  function ghostRangeFor(memberId: string): { start: number; span: number; entry: Entry } | null {
    if (resizeDrag && resizeDrag.memberId === memberId) {
      const { start, end } = resizeTargetRange(resizeDrag)
      return { start, span: end - start + 1, entry: resizeDrag.entry }
    }
    if (moveDrag && moveDrag.memberId === memberId) {
      return { start: moveTargetStart(moveDrag), span: moveDrag.segmentSpan, entry: moveDrag.entry }
    }
    return null
  }

  // What segment (origStart, origSpan) is currently being dragged in this row?
  function sourceSegmentFor(memberId: string): { start: number; span: number } | null {
    if (resizeDrag && resizeDrag.memberId === memberId) {
      return { start: resizeDrag.origStart, span: resizeDrag.origSpan }
    }
    if (moveDrag && moveDrag.memberId === memberId) {
      return { start: moveDrag.segmentStart, span: moveDrag.segmentSpan }
    }
    return null
  }

  // Commit drag on global mouseup. Handles four cases:
  //  - Resize-drag on a bar edge → UPSERT new dates + DELETE trimmed leftovers
  //  - Move-drag on a colored bar → reschedule (UPSERT new dates + DELETE leftovers)
  //  - Tap on a colored bar (move/resize with no change) → open editor
  //  - Select-drag on empty cells → open editor with a pre-selected range
  useEffect(() => {
    if (!isDragging && !moveDrag && !resizeDrag) return
    async function onUp() {
      if (resizeDrag) {
        const rz = resizeDrag
        setResizeDrag(null)
        const { start: newStart, end: newEnd } = resizeTargetRange(rz)
        const origStart = rz.origStart
        const origEnd = rz.origStart + rz.origSpan - 1
        const member = members.find((m) => m.id === rz.memberId)
        const noChange = newStart === origStart && newEnd === origEnd
        if (noChange || !member) {
          if (member) {
            const startDate = weekDays[origStart]
            const endDate = weekDays[origEnd]
            setSelectedCell({
              memberId: member.id,
              memberName: member.display_name,
              date: toDateString(startDate),
              endDate: toDateString(endDate),
              dateLabel: formatDateLabelLong(startDate, t),
              status: rz.entry.status,
              location: rz.entry.location_label,
              note: rz.entry.note,
            })
          }
          return
        }
        const supabase = createClient()
        const newDates = weekDays.slice(newStart, newEnd + 1).map(toDateString)
        const origDates = weekDays.slice(origStart, origEnd + 1).map(toDateString)
        const rows = newDates.map((d) => ({
          org_id: orgId,
          member_id: rz.memberId,
          date: d,
          status: rz.entry.status,
          location_label: rz.entry.location_label,
          note: rz.entry.note,
          source: 'manual' as const,
        }))

        // Paint the new range in the grid immediately — the DB write races
        // behind it. If it fails, refetch() rebuilds from the server's truth.
        applyOptimistic((prev) =>
          upsertDatesForMember(prev, rz.memberId, origDates, newDates, {
            org_id: orgId,
            status: rz.entry.status,
            location_label: rz.entry.location_label,
            note: rz.entry.note,
          }),
        )

        const { error: upErr } = await supabase
          .from('entries')
          .upsert(rows, { onConflict: 'org_id,member_id,date' })
        if (upErr) {
          toast.error('Kunne ikke endre datoområdet')
          await refetch() // restore server truth
          return
        }
        const toDelete = origDates.filter((d) => !newDates.includes(d))
        if (toDelete.length > 0) {
          await supabase
            .from('entries')
            .delete()
            .eq('org_id', orgId)
            .eq('member_id', rz.memberId)
            .in('date', toDelete)
        }
        await refetch()
        return
      }

      if (moveDrag) {
        const mv = moveDrag
        setMoveDrag(null)
        const targetStart = moveTargetStart(mv)
        const noMove = targetStart === mv.segmentStart
        const member = members.find((m) => m.id === mv.memberId)
        if (noMove || !member) {
          // Tap on bar — open editor for the full segment
          if (member) {
            const startDate = weekDays[mv.segmentStart]
            const endDate = weekDays[mv.segmentStart + mv.segmentSpan - 1]
            setSelectedCell({
              memberId: member.id,
              memberName: member.display_name,
              date: toDateString(startDate),
              endDate: toDateString(endDate),
              dateLabel: formatDateLabelLong(startDate, t),
              status: mv.entry.status,
              location: mv.entry.location_label,
              note: mv.entry.note,
            })
          }
          return
        }
        // Execute reschedule
        const supabase = createClient()
        const srcDates = weekDays
          .slice(mv.segmentStart, mv.segmentStart + mv.segmentSpan)
          .map(toDateString)
        const dstDates = weekDays
          .slice(targetStart, targetStart + mv.segmentSpan)
          .map(toDateString)
        const rows = dstDates.map((d) => ({
          org_id: orgId,
          member_id: mv.memberId,
          date: d,
          status: mv.entry.status,
          location_label: mv.entry.location_label,
          note: mv.entry.note,
          source: 'manual' as const,
        }))

        // Optimistic paint — the bar jumps to its new slot the moment
        // the mouse releases. refetch() reconciles after the write.
        applyOptimistic((prev) =>
          upsertDatesForMember(prev, mv.memberId, srcDates, dstDates, {
            org_id: orgId,
            status: mv.entry.status,
            location_label: mv.entry.location_label,
            note: mv.entry.note,
          }),
        )

        const { error: upErr } = await supabase
          .from('entries')
          .upsert(rows, { onConflict: 'org_id,member_id,date' })
        if (upErr) {
          toast.error('Kunne ikke flytte oppføringen')
          await refetch()
          return
        }
        const toDelete = srcDates.filter((d) => !dstDates.includes(d))
        if (toDelete.length > 0) {
          await supabase
            .from('entries')
            .delete()
            .eq('org_id', orgId)
            .eq('member_id', mv.memberId)
            .in('date', toDelete)
        }
        await refetch()
        return
      }

      // Select-drag (empty cells) → open editor with range
      if (dragStart && dragCurrent && dragStart.memberId === dragCurrent.memberId) {
        const member = members.find((m) => m.id === dragStart.memberId)
        if (member) {
          const lo = Math.min(dragStart.dayIdx, dragCurrent.dayIdx)
          const hi = Math.max(dragStart.dayIdx, dragCurrent.dayIdx)
          const startDate = weekDays[lo]
          const endDate = weekDays[hi]
          const startStr = toDateString(startDate)
          const endStr = toDateString(endDate)
          const entry = entryMap.get(`${member.id}_${startStr}`)
          setSelectedCell({
            memberId: member.id,
            memberName: member.display_name,
            date: startStr,
            endDate: endStr,
            dateLabel: formatDateLabelLong(startDate, t),
            status: entry?.status ?? null,
            location: entry?.location_label ?? null,
            note: entry?.note ?? null,
          })
        }
      }
      setDragStart(null)
      setDragCurrent(null)
    }
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
  }, [isDragging, moveDrag, resizeDrag, dragStart, dragCurrent, members, weekDays, entryMap, orgId, refetch])

  function handleDayMouseDown(memberId: string, dayIdx: number) {
    // If this cell has an entry, start a move-drag for the whole segment.
    // Otherwise, start a select-drag for creating a new range.
    const dateStr = toDateString(weekDays[dayIdx])
    const entry = entryMap.get(`${memberId}_${dateStr}`)
    if (entry) {
      const segments = buildRowSegments(weekDays, memberId, entryMap, t)
      let cursor = 0
      for (const seg of segments) {
        const n = seg.days.length
        if (dayIdx >= cursor && dayIdx < cursor + n && seg.entry) {
          setMoveDrag({
            memberId,
            segmentStart: cursor,
            segmentSpan: n,
            grabOffset: dayIdx - cursor,
            currentDayIdx: dayIdx,
            entry: seg.entry,
          })
          return
        }
        cursor += n
      }
      return
    }
    setDragStart({ memberId, dayIdx })
    setDragCurrent({ memberId, dayIdx })
  }

  function handleDayMouseEnter(memberId: string, dayIdx: number) {
    if (resizeDrag) {
      if (resizeDrag.memberId !== memberId) return
      if (resizeDrag.currentDayIdx === dayIdx) return
      setResizeDrag({ ...resizeDrag, currentDayIdx: dayIdx })
      return
    }
    if (moveDrag) {
      if (moveDrag.memberId !== memberId) return
      if (moveDrag.currentDayIdx === dayIdx) return
      setMoveDrag({ ...moveDrag, currentDayIdx: dayIdx })
      return
    }
    if (!isDragging || !dragStart) return
    if (dragStart.memberId !== memberId) return
    setDragCurrent({ memberId, dayIdx })
  }

  function handleSegmentResizeStart(
    memberId: string,
    segStart: number,
    segSpan: number,
    edge: 'left' | 'right',
    entry: Entry
  ) {
    setResizeDrag({
      memberId,
      edge,
      origStart: segStart,
      origSpan: segSpan,
      currentDayIdx: edge === 'left' ? segStart : segStart + segSpan - 1,
      entry,
    })
  }

  function dayHighlightsForMember(memberId: string): boolean[] {
    if (!isDragging || !dragStart || !dragCurrent) return new Array(weekDays.length).fill(false)
    if (dragStart.memberId !== memberId) return new Array(weekDays.length).fill(false)
    const lo = Math.min(dragStart.dayIdx, dragCurrent.dayIdx)
    const hi = Math.max(dragStart.dayIdx, dragCurrent.dayIdx)
    return Array.from({ length: weekDays.length }, (_, i) => i >= lo && i <= hi)
  }

  // Weekly summary toast — when the user navigates to a new week, briefly
  // show a breakdown like "Uke 18 — 5 kontor · 3 borte" so they get a
  // one-glance read of the week they just landed on. Skips the initial
  // mount and empty weeks (nothing useful to summarise).
  const lastToastedKey = useRef<string>(`${todayWeek}-${todayYear}`)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const key = `${week}-${year}`
    if (lastToastedKey.current === key) return
    if (entriesLoading) return
    if (entries.length === 0) {
      lastToastedKey.current = key
      return
    }
    // Debounce — rapid arrow-presses shouldn't fire a toast per step.
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => {
      const summary = summariseWeek(entries, palettes, t)
      toast.custom((id) => (
        <WeeklySummaryToast
          weekNumber={week}
          summary={summary}
          onDismiss={() => toast.dismiss(id)}
        />
      ))
      lastToastedKey.current = key
    }, 250)
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [week, year, entries, entriesLoading, palettes])

  // Keyboard navigation — ←/→ for week paging, T for "jump to this week".
  // Guarded against typing targets so we never steal arrows inside inputs.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if ((e.target as HTMLElement | null)?.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); goToPrev() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goToNext() }
      else if (e.key.toLowerCase() === 't') { e.preventDefault(); goToToday() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [week, year]) // eslint-disable-line react-hooks/exhaustive-deps

  function goToPrev() {
    setSlideDir('prev')
    if (week === 1) {
      const prevYear = year - 1
      setWeek(getLastISOWeek(prevYear))
      setYear(prevYear)
    } else {
      setWeek(week - 1)
    }
  }

  function goToNext() {
    setSlideDir('next')
    const lastWeek = getLastISOWeek(year)
    if (week === lastWeek) {
      setWeek(1)
      setYear(year + 1)
    } else {
      setWeek(week + 1)
    }
  }

  function goToToday() {
    setSlideDir(
      year < todayYear || (year === todayYear && week < todayWeek) ? 'next' : 'prev'
    )
    setWeek(todayWeek)
    setYear(todayYear)
  }

  function jumpTo({ week: nextWeek, year: nextYear }: { week: number; year: number }) {
    const isForward =
      nextYear > year || (nextYear === year && nextWeek > week)
    setSlideDir(isForward ? 'next' : 'prev')
    setWeek(nextWeek)
    setYear(nextYear)
  }

  // Today's entries for the Pulse widget
  const todayStr = toDateString(new Date())
  const todayEntries = members
    .map((m) => {
      const entry = entryMap.get(`${m.id}_${todayStr}`)
      if (!entry) return null
      return {
        id: m.id,
        display_name: m.display_name,
        avatar_url: m.avatar_url,
        status: entry.status,
        location_label: entry.location_label,
      }
    })
    .filter(Boolean) as Array<{
      id: string
      display_name: string
      avatar_url: string | null
      status: import('@/lib/supabase/types').EntryStatus
      location_label: string | null
    }>

  return (
    <div className="space-y-5">
      {/* Week navigation */}
      <WeekNav
        week={week}
        year={year}
        isCurrentWeek={isCurrentWeek}
        onPrev={goToPrev}
        onNext={goToNext}
        onToday={goToToday}
        onJumpTo={jumpTo}
      />

      {/* Matrix — dark liquid glass panel */}
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          background: 'var(--lg-surface-1)',
          border: '1px solid var(--lg-divider)',
        }}
      >
        {/* Vertical column dividers — hairlines between each day column,
            from top of the matrix to the bottom. Gives the header real
            calendar structure instead of floating day-chips. */}
        {(() => {
          const todayIdx = weekDays.findIndex(isToday)
          return weekDays.map((_, i) => {
            // Column starts at: 16 (px-4) + 136 (name col) + 8 (gap) + i * ((100% - 208px)/5 + 8px)
            // We draw the left edge of each column (skip i=0 which would sit flush with the name-col).
            const left = `calc(160px + ${i} * ((100% - 208px) / 5 + 8px) - 4px)`
            const isTodayEdge = i === todayIdx || i === todayIdx + 1
            return (
              <div
                key={`divider-${i}`}
                aria-hidden
                className="absolute top-0 bottom-0 w-px pointer-events-none z-0"
                style={{
                  left,
                  background: isTodayEdge
                    ? 'rgba(139, 92, 246, 0.22)'
                    : 'var(--lg-divider-soft)',
                  display: i === 0 ? 'none' : undefined,
                }}
              />
            )
          })
        })()}

        {/* Today column highlight — subtle violet light-shaft, brighter at top
            (under the date disk), fading as it goes down through the rows. */}
        {(() => {
          const todayIdx = weekDays.findIndex(isToday)
          if (todayIdx === -1) return null
          const left = `calc(160px + ${todayIdx} * ((100% - 208px) / 5 + 8px))`
          const width = `calc((100% - 208px) / 5)`
          return (
            <div
              aria-hidden
              className="absolute pointer-events-none z-0"
              style={{
                top: 0,
                bottom: 0,
                left,
                width,
                background:
                  'linear-gradient(180deg, rgba(139, 92, 246, 0.14) 0%, rgba(139, 92, 246, 0.06) 40%, rgba(139, 92, 246, 0.03) 100%)',
              }}
            />
          )
        })()}

        {/* Day header */}
        <div
          className="relative grid gap-2 px-4 pt-5 pb-4 z-10"
          style={{
            gridTemplateColumns: '136px repeat(5, 1fr)',
            borderBottom: '1px solid var(--lg-divider-soft)',
          }}
        >
          <div /> {/* empty for name column */}
          {weekDays.map((date, i) => {
            const { weekday, day, month } = getDayLabel(date)
            const today = isToday(date)
            // Show month only when it changes from the previous day (or on the
            // first day of the week). For a typical Mon-Fri view within April,
            // only Monday would render "Apr". Saves us from five identical
            // "Apr" labels stacked under every day.
            const prev = i > 0 ? getDayLabel(weekDays[i - 1]) : null
            const showMonth = !prev || prev.month !== month
            return (
              <div
                key={date.toISOString()}
                className="text-center relative flex flex-col items-center gap-1.5"
              >
                <div
                  className="lg-mono text-[10px] uppercase"
                  style={{
                    color: today ? 'var(--lg-accent)' : 'var(--lg-text-3)',
                    fontWeight: today ? 600 : 500,
                    letterSpacing: '0.2em',
                    textShadow: today ? '0 0 10px var(--lg-accent-glow)' : undefined,
                  }}
                >
                  {weekday}
                </div>
                <div
                  className="lg-mono flex items-center justify-center leading-none"
                  style={{
                    fontSize: today ? 22 : 26,
                    fontWeight: today ? 600 : 400,
                    color: today ? '#ffffff' : 'var(--lg-text-1)',
                    width: today ? 40 : 'auto',
                    height: today ? 40 : 'auto',
                    borderRadius: 9999,
                    background: today ? 'var(--lg-accent)' : 'transparent',
                    boxShadow: today
                      ? '0 0 0 3px rgba(139, 92, 246, 0.18), 0 0 22px var(--lg-accent-glow)'
                      : 'none',
                    letterSpacing: today ? '-0.02em' : '-0.02em',
                  }}
                >
                  {day}
                </div>
                {showMonth && (
                  <div
                    className="lg-serif capitalize"
                    style={{
                      color: today ? 'var(--lg-accent)' : 'var(--lg-text-3)',
                      fontSize: 12,
                      opacity: today ? 0.9 : 0.65,
                    }}
                  >
                    {month}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Rows */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${week}-${year}`}
            initial={{ x: slideDir === 'next' ? 32 : -32, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: slideDir === 'next' ? -32 : 32, opacity: 0 }}
            transition={spring.snappy}
            className="relative p-4 space-y-2 z-10"
            style={{ userSelect: 'none' }}
          >
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} index={i} />)
              : visibleMembers.map((member, rowIdx) => (
                  <motion.div
                    key={member.id}
                    className="relative grid gap-2 items-center"
                    style={{ gridTemplateColumns: '136px repeat(5, 1fr)' }}
                    initial={{ y: 16, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ ...spring.gentle, delay: rowIdx * 0.04 }}
                  >
                    {/* Avatar + name — horizontal, matches bar height.
                        Hover reveals a card with the member's office + local time + today's status. */}
                    {(() => {
                      const office = member.home_office_id
                        ? officeById.get(member.home_office_id)
                        : undefined
                      const todayStr = toDateString(new Date())
                      const todayEntry = entries.find((e) => e.member_id === member.id && e.date === todayStr)
                      return (
                        <MemberHoverCard
                          memberId={member.id}
                          displayName={member.display_name}
                          fullName={member.full_name}
                          avatarUrl={member.avatar_url}
                          initials={member.initials}
                          officeName={office?.name ?? null}
                          officeCity={office?.city ?? null}
                          timezone={office?.timezone ?? null}
                          todayStatus={todayEntry?.status ?? null}
                          todayLocation={todayEntry?.location_label ?? null}
                          todayNote={todayEntry?.note ?? null}
                        >
                          <div className="flex items-center gap-2.5 px-1 h-[32px]">
                            <MemberAvatar
                              name={member.display_name}
                              initials={member.initials}
                              avatarUrl={member.avatar_url}
                              size="sm"
                            />
                            <span
                              className="text-[13px] truncate leading-tight"
                              style={{
                                color: 'var(--lg-text-1)',
                                fontWeight: 500,
                                letterSpacing: '-0.01em',
                              }}
                            >
                              {member.display_name.split(' ')[0]}
                            </span>
                          </div>
                        </MemberHoverCard>
                      )
                    })()}

                    {/* Day cells — merged into segments when consecutive days share status + location + note */}
                    {(() => {
                      const segments = buildRowSegments(weekDays, member.id, entryMap, t)
                      const highlights = dayHighlightsForMember(member.id)
                      let cursor = 0
                      const segmentHighlights: boolean[][] = segments.map((seg) => {
                        const slice = highlights.slice(cursor, cursor + seg.days.length)
                        cursor += seg.days.length
                        return slice
                      })
                      // Track segment starting day index to detect the dragged source.
                      let cursor2 = 0
                      const segmentStarts: number[] = segments.map((seg) => {
                        const start = cursor2
                        cursor2 += seg.days.length
                        return start
                      })
                      const src = sourceSegmentFor(member.id)
                      return segments.map((seg, segIdx) => {
                        const isDragSource =
                          src !== null &&
                          segmentStarts[segIdx] === src.start &&
                          seg.days.length === src.span
                        return (
                          <StatusSegment
                            key={`${member.id}-${segIdx}-${seg.days[0].date}`}
                            status={seg.entry?.status ?? null}
                            location={seg.entry?.location_label ?? null}
                            note={seg.entry?.note ?? null}
                            days={seg.days}
                            onSelectDay={() => {
                              /* replaced by drag mousedown/mouseup flow */
                            }}
                            onDayMouseDown={(dayIdx) => {
                              const absoluteIdx = weekDays.findIndex(
                                (d) => toDateString(d) === seg.days[dayIdx].date
                              )
                              if (absoluteIdx >= 0) handleDayMouseDown(member.id, absoluteIdx)
                            }}
                            onDayMouseEnter={(dayIdx) => {
                              const absoluteIdx = weekDays.findIndex(
                                (d) => toDateString(d) === seg.days[dayIdx].date
                              )
                              if (absoluteIdx >= 0) handleDayMouseEnter(member.id, absoluteIdx)
                            }}
                            dayHighlight={segmentHighlights[segIdx]}
                            muted={isDragSource}
                            onSegmentResizeStart={
                              seg.entry
                                ? (edge) =>
                                    handleSegmentResizeStart(
                                      member.id,
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

                    {/* Drag ghost — shown for move OR resize while the user drags a bar in this row */}
                    {(() => {
                      const ghost = ghostRangeFor(member.id)
                      if (!ghost) return null
                      const { start: targetStart, span, entry } = ghost
                      const palette = palettes[entry.status]
                      const [g0, g1] = isDark ? palette.gradient.dark : palette.gradient.light
                      // Row coords: 136px name col + 8px gap + N day cols with 8px gaps.
                      // Per-day width = (rowWidth - 176) / 5. Day 0 starts at 144px.
                      const leftCalc = `calc(144px + ${targetStart} * ((100% - 176px) / 5 + 8px))`
                      const widthCalc = `calc(${span} * ((100% - 176px) / 5) + ${(span - 1) * 8}px)`
                      return (
                        <div
                          aria-hidden
                          style={{
                            position: 'absolute',
                            top: 0,
                            height: 36,
                            left: leftCalc,
                            width: widthCalc,
                            borderRadius: 8,
                            backgroundImage: `linear-gradient(180deg, ${g0} 0%, ${g1} 100%)`,
                            backgroundColor: g1,
                            boxShadow: isDark
                              ? '0 0 0 1.5px rgba(255,255,255,0.65), 0 10px 24px -6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.18)'
                              : '0 0 0 1.5px rgba(255,255,255,0.9), 0 10px 24px -6px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.35)',
                            opacity: 0.92,
                            pointerEvents: 'none',
                            zIndex: 25,
                            transition: 'left 120ms cubic-bezier(0.2, 0.8, 0.2, 1), width 120ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                          }}
                        />
                      )
                    })()}
                  </motion.div>
                ))}

            {!loading && members.length === 0 && (
              <div className="py-16 text-center text-[var(--text-tertiary)] text-[15px]">
                {t.matrix.noMembers}{' '}
                <span className="text-[var(--accent-color)]">Legg til i Innstillinger →</span>
              </div>
            )}

            {!loading && members.length > 0 && visibleMembers.length === 0 && (
              <div className="py-16 text-center text-[var(--text-tertiary)] text-[15px]">
                {t.matrix.noEntriesWeek}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Today Pulse widget — only shown when viewing current week */}
      {isCurrentWeek && todayEntries.length > 0 && (
        <TodayPulse entries={todayEntries} />
      )}

      {/* Cell editor — single instance shared across all cells */}
      <CellEditor
        open={selectedCell !== null}
        onClose={() => setSelectedCell(null)}
        orgId={orgId}
        memberId={selectedCell?.memberId ?? ''}
        memberName={selectedCell?.memberName ?? ''}
        date={selectedCell?.date ?? ''}
        dateLabel={selectedCell?.dateLabel ?? ''}
        initialStatus={selectedCell?.status ?? null}
        initialLocation={selectedCell?.location ?? null}
        initialNote={selectedCell?.note ?? null}
        initialRangeEnd={selectedCell?.endDate ?? null}
        onMutated={refetch}
        onOptimisticSave={(dates, payload) => {
          if (!selectedCell) return
          applyOptimistic((prev) =>
            upsertDatesForMember(prev, selectedCell.memberId, [], dates, {
              org_id: orgId,
              status: payload.status,
              location_label: payload.location_label,
              note: payload.note,
            }),
          )
        }}
        onOptimisticDelete={(dates) => {
          if (!selectedCell) return
          const memberId = selectedCell.memberId
          const dateSet = new Set(dates)
          applyOptimistic((prev) =>
            prev.filter((e) => !(e.member_id === memberId && dateSet.has(e.date))),
          )
        }}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the next entries list for an optimistic update: drop any existing
 * entries for this member on `oldDates` ∪ `newDates`, then insert synthetic
 * entries on `newDates` carrying `payload`. The synthetic entries use an
 * "optimistic-*" ID so the realtime upsert for the real server row doesn't
 * collide (last-write-wins via our Map keyed on member_id+date anyway).
 */
function upsertDatesForMember(
  prev: Entry[],
  memberId: string,
  oldDates: string[],
  newDates: string[],
  payload: {
    org_id: string
    status: EntryStatus
    location_label: string | null
    note: string | null
  },
): Entry[] {
  const affected = new Set<string>([...oldDates, ...newDates])
  const filtered = prev.filter((e) => !(e.member_id === memberId && affected.has(e.date)))
  const nowISO = new Date().toISOString()
  const inserts: Entry[] = newDates.map((d) => ({
    id: `optimistic-${memberId}-${d}`,
    org_id: payload.org_id,
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
}

// ─────────────────────────────────────────────────────────────────────────────

interface WeekSummaryItem {
  status: EntryStatus
  label: string
  count: number
  tone: string
}

function summariseWeek(
  entries: Entry[],
  palettes: ReturnType<typeof useStatusColors>,
  t: Dictionary,
): WeekSummaryItem[] {
  // Count unique members per status within the visible week — one person
  // listed multiple times across days shouldn't inflate the number.
  const byStatus = new Map<EntryStatus, Set<string>>()
  for (const e of entries) {
    if (!byStatus.has(e.status)) byStatus.set(e.status, new Set())
    byStatus.get(e.status)!.add(e.member_id)
  }
  const order: EntryStatus[] = ['office', 'remote', 'customer', 'travel', 'vacation', 'sick', 'off']
  const labels: Record<EntryStatus, string> = t.status
  return order
    .map((status) => ({
      status,
      label: labels[status],
      count: byStatus.get(status)?.size ?? 0,
      tone: palettes[status].icon,
    }))
    .filter((x) => x.count > 0)
}

function WeeklySummaryToast({
  weekNumber,
  summary,
  onDismiss,
}: {
  weekNumber: number
  summary: WeekSummaryItem[]
  onDismiss: () => void
}) {
  const t = useT()
  // Show top three statuses by count; the rest collapse into a "+N mer" chip.
  const sorted = [...summary].sort((a, b) => b.count - a.count)
  const top = sorted.slice(0, 3)
  const rest = sorted.slice(3).reduce((acc, x) => acc + x.count, 0)
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-2xl"
      style={{
        background: 'rgba(22, 22, 27, 0.5)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: '1px solid var(--lg-divider)',
        color: 'var(--lg-text-1)',
        fontFamily: 'var(--font-body)',
        fontSize: 13,
        minWidth: 260,
      }}
    >
      <span
        className="lg-mono flex items-center justify-center rounded-lg shrink-0"
        style={{
          width: 30,
          height: 30,
          background: 'rgba(139, 92, 246, 0.12)',
          color: 'var(--lg-accent)',
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        {weekNumber}
      </span>
      <div className="flex-1 min-w-0">
        <div className="lg-eyebrow">
          {t.matrix.weekLabel} {weekNumber}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          {top.map((x) => (
            <span key={x.status} className="inline-flex items-center gap-1">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: x.tone }}
              />
              <span className="lg-mono font-medium">{x.count}</span>
              <span style={{ color: 'var(--lg-text-2)' }}>{x.label.toLowerCase()}</span>
            </span>
          )).reduce<React.ReactNode[]>((acc, node, i) => {
            if (i > 0) acc.push(<span key={`sep-${i}`} style={{ color: 'var(--lg-text-3)' }}>·</span>)
            acc.push(node)
            return acc
          }, [])}
          {rest > 0 && (
            <>
              <span style={{ color: 'var(--lg-text-3)' }}>·</span>
              <span style={{ color: 'var(--lg-text-3)' }}>+{rest} andre</span>
            </>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
        style={{ color: 'var(--text-tertiary)' }}
        aria-label="Lukk"
      >
        <svg viewBox="0 0 10 10" width="10" height="10" fill="none">
          <path d="M1.5 1.5 8.5 8.5M8.5 1.5 1.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
