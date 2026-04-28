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
import { TodayHero } from '@/components/today-hero'
import { StatusSegment, type SegmentDay } from '@/components/status-segment'
import { useStatusColors } from '@/lib/status-colors/context'
import { usePresenceCtx } from '@/lib/presence/context'
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
import type { Entry, EntryStatus, PresenceAssumption } from '@/lib/supabase/types'
import { inferStatus } from '@/lib/presence'
import {
  getHolidayForDate,
  getHolidaysForCountries,
  isSupportedCountry,
  flagFor,
  type CountryCode,
} from '@/lib/holidays'

interface RowSegment {
  days: SegmentDay[]
  dates: Date[]
  /** Set when the segment comes from a real registered entry. */
  entry: Entry | null
  /** Set when the segment is inferred from the org / member default. Mutually
   *  exclusive with `entry` — a segment is either real or assumed, never both. */
  assumedStatus: EntryStatus | null
}

function entriesMergeable(a: Entry | null, b: Entry | null): boolean {
  if (a === null || b === null) return false
  return (
    a.status === b.status &&
    (a.location_label ?? null) === (b.location_label ?? null) &&
    (a.note ?? null) === (b.note ?? null)
  )
}

function segmentsMergeable(
  aEntry: Entry | null,
  aAssumed: EntryStatus | null,
  bEntry: Entry | null,
  bAssumed: EntryStatus | null,
): boolean {
  if (aEntry && bEntry) return entriesMergeable(aEntry, bEntry)
  // Both assumed (entries absent) → merge when they share the same inferred
  // status. Mixed (one real, one assumed) → never merge.
  if (!aEntry && !bEntry) return aAssumed !== null && aAssumed === bAssumed
  return false
}

function buildRowSegments(
  weekDays: Date[],
  memberId: string,
  entryMap: Map<string, Entry>,
  t: Dictionary,
  memberDefaultStatus: EntryStatus | null,
  assumption: PresenceAssumption,
): RowSegment[] {
  const segments: RowSegment[] = []
  let i = 0
  // Local wrapper — avoids recomputing the assumption on every iteration.
  const inferred = (entry: Entry | null) =>
    entry ? null : inferStatus({ default_status: memberDefaultStatus }, assumption)

  while (i < weekDays.length) {
    const startEntry = entryMap.get(`${memberId}_${toDateString(weekDays[i])}`) ?? null
    const startAssumed = inferred(startEntry)
    let j = i + 1
    while (j < weekDays.length) {
      const nextEntry = entryMap.get(`${memberId}_${toDateString(weekDays[j])}`) ?? null
      const nextAssumed = inferred(nextEntry)
      if (!segmentsMergeable(startEntry, startAssumed, nextEntry, nextAssumed)) break
      j++
    }
    const dates = weekDays.slice(i, j)
    segments.push({
      dates,
      entry: startEntry,
      assumedStatus: startEntry ? null : startAssumed,
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
  source: 'manual' | 'ai_web' | 'ai_email' | null
  sourceText: string | null
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
  /** Optional — server-rendered member list for instant hydration. */
  initialMembers?: Member[]
  /** Optional — server-rendered entries for the current visible week. */
  initialEntries?: Entry[]
  /** Optional — the ISO week these initialEntries belong to. Must match for the seed to kick in. */
  initialWeek?: number
  /** Optional — the ISO year these initialEntries belong to. Must match for the seed to kick in. */
  initialYear?: number
  /** Server-computed today metrics — rendered in the compact WeekNav strip
   *  only when the user is viewing the current week. */
  todayMetrics?: {
    memberCount: number
    registeredToday: number
    distinctLocations: number
  }
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

export function TeamGrid({
  orgId,
  initialMembers,
  initialEntries,
  initialWeek,
  initialYear,
  todayMetrics,
}: TeamGridProps) {
  const t = useT()
  const { week: todayWeek, year: todayYear } = getTodayWeekAndYear()
  const [week, setWeek] = useState(initialWeek ?? todayWeek)
  const [year, setYear] = useState(initialYear ?? todayYear)
  const [slideDir, setSlideDir] = useState<'next' | 'prev'>('next')

  const [members, setMembers] = useState<Member[]>(initialMembers ?? [])
  const [offices, setOffices] = useState<Office[]>([])
  const [presenceAssumption, setPresenceAssumption] = useState<PresenceAssumption>('none')
  const [membersLoading, setMembersLoading] = useState(!initialMembers)
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null)

  const [dragStart, setDragStart] = useState<DragPoint | null>(null)
  const [dragCurrent, setDragCurrent] = useState<DragPoint | null>(null)
  const isDragging = dragStart !== null

  const [moveDrag, setMoveDrag] = useState<MoveDrag | null>(null)
  const [resizeDrag, setResizeDrag] = useState<ResizeDrag | null>(null)
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const palettes = useStatusColors()
  const { editorsOf } = usePresenceCtx()

  const weekDays = useMemo(() => getWeekDays(week, year), [week, year])
  const dateStrings = useMemo(() => weekDays.map(toDateString), [weekDays])
  const isCurrentWeek = week === todayWeek && year === todayYear

  // Realtime entries hook — handles fetch + live subscription. We also keep
  // `refetch` so drag mutations can force an immediate reload instead of
  // waiting for the realtime round-trip (which can lag or drop silently).
  // Only hand the SSR entries to useEntries when the initial week matches
  // what the page rendered on the server. Navigating to a different week
  // before the hook has a chance to fetch should still trigger a fetch.
  const ssrEntriesMatchWeek = initialWeek === week && initialYear === year
  const { entries, loading: entriesLoading, refetch, applyOptimistic } = useEntries(
    orgId,
    dateStrings,
    ssrEntriesMatchWeek ? { initial: initialEntries } : {},
  )
  const loading = membersLoading || entriesLoading

  // Build entry lookup: member_id + date → Entry
  const entryMap = useMemo(() => {
    const map = new Map<string, typeof entries[number]>()
    entries.forEach((e) => map.set(`${e.member_id}_${e.date}`, e))
    return map
  }, [entries])

  // AI-query highlights: set of `${memberId}_${date}` keys for cells the
  // last query wanted to surface. Cleared after 14 seconds, on user click,
  // on week change, or when a new highlight request arrives.
  const [highlightKeys, setHighlightKeys] = useState<Set<string>>(() => new Set())
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    type Detail = { cells: Array<{ memberId: string; date: string }> }
    const handler = (e: Event) => {
      const d = (e as CustomEvent<Detail>).detail
      if (!d?.cells?.length) return
      const next = new Set(d.cells.map((c) => `${c.memberId}_${c.date}`))
      setHighlightKeys(next)
      if (highlightTimer.current) clearTimeout(highlightTimer.current)
      highlightTimer.current = setTimeout(() => setHighlightKeys(new Set()), 14_000)
      // If the first match is outside the visible week, jump the grid to it.
      // Falls back silently when dynamic imports aren't available.
      const anyMatch = d.cells.some((c) => dateStrings.includes(c.date))
      if (!anyMatch && d.cells[0]) {
        import('@/lib/dates').then(({ getISOWeek, getISOWeekYear }) => {
          const target = new Date(d.cells[0].date)
          setWeek(getISOWeek(target))
          setYear(getISOWeekYear(target))
        })
      }
    }
    window.addEventListener('teampulse:ai-query:highlight', handler)
    return () => {
      window.removeEventListener('teampulse:ai-query:highlight', handler)
      if (highlightTimer.current) clearTimeout(highlightTimer.current)
    }
  }, [dateStrings])

  // Clear highlights when the user navigates away from the matched week.
  useEffect(() => {
    if (highlightKeys.size === 0) return
    const stillVisible = Array.from(highlightKeys).some((k) => {
      const date = k.split('_').slice(1).join('_')
      return dateStrings.includes(date)
    })
    if (!stillVisible) setHighlightKeys(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week, year])

  // Only show members that have at least one entry in the visible week —
  // unless the org opted into an assumption, in which case every active
  // member gets a row (their empty days render as assumed segments).
  const visibleMembers = useMemo(() => {
    if (presenceAssumption !== 'none') return members
    const memberIdsWithEntries = new Set(entries.map((e) => e.member_id))
    return members.filter((m) => memberIdsWithEntries.has(m.id))
  }, [members, entries, presenceAssumption])

  // Fetch supporting data once. When SSR has already seeded `members` we
  // skip the members query and only fetch the things SSR didn't provide
  // (offices for the hover card + the org's presence-assumption setting),
  // saving one round trip on every cold load of the home page.
  const firstFetchWithSSR = useRef(!!initialMembers)
  const fetchMembers = useCallback(async () => {
    const skipMembers = firstFetchWithSSR.current
    if (!skipMembers) {
      setMembersLoading(true)
    }
    firstFetchWithSSR.current = false
    const supabase = createClient()
    if (skipMembers) {
      const [{ data: os }, { data: org }] = await Promise.all([
        supabase
          .from('offices')
          .select('*')
          .eq('org_id', orgId)
          .order('sort_order'),
        supabase
          .from('organizations')
          .select('default_presence_assumption')
          .eq('id', orgId)
          .maybeSingle(),
      ])
      setOffices(os ?? [])
      setPresenceAssumption((org?.default_presence_assumption ?? 'none') as PresenceAssumption)
      setMembersLoading(false)
      return
    }
    const [{ data: ms }, { data: os }, { data: org }] = await Promise.all([
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
      supabase
        .from('organizations')
        .select('default_presence_assumption')
        .eq('id', orgId)
        .maybeSingle(),
    ])
    setMembers(ms ?? [])
    setOffices(os ?? [])
    setPresenceAssumption((org?.default_presence_assumption ?? 'none') as PresenceAssumption)
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

  // Country codes that have at least one active member assigned to an office.
  // Empty until offices/members load — used to decide which countries to
  // probe for holidays in the day-header tooltip.
  const activeCountries = useMemo<CountryCode[]>(() => {
    const set = new Set<CountryCode>()
    for (const m of members) {
      if (!m.home_office_id) continue
      const office = officeById.get(m.home_office_id)
      if (office && isSupportedCountry(office.country_code)) {
        set.add(office.country_code)
      }
    }
    return Array.from(set)
  }, [members, officeById])

  // Pre-compute holiday data for the visible week. NO drives the column-wide
  // red treatment; the per-country map drives the tooltip and per-member
  // corner-stripes.
  const weekHolidays = useMemo(() => {
    return weekDays.map((date) => ({
      date,
      no: getHolidayForDate(date, 'NO'),
      byCountry: getHolidaysForCountries(date, activeCountries),
    }))
  }, [weekDays, activeCountries])

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
              memberName: member.full_name || member.display_name,
              date: toDateString(startDate),
              endDate: toDateString(endDate),
              dateLabel: formatDateLabelLong(startDate, t),
              status: rz.entry.status,
              location: rz.entry.location_label,
              note: rz.entry.note,
              source: rz.entry.source,
              sourceText: rz.entry.source_text,
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
              memberName: member.full_name || member.display_name,
              date: toDateString(startDate),
              endDate: toDateString(endDate),
              dateLabel: formatDateLabelLong(startDate, t),
              status: mv.entry.status,
              location: mv.entry.location_label,
              note: mv.entry.note,
              source: mv.entry.source,
              sourceText: mv.entry.source_text,
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
            memberName: member.full_name || member.display_name,
            date: startStr,
            endDate: endStr,
            dateLabel: formatDateLabelLong(startDate, t),
            status: entry?.status ?? null,
            location: entry?.location_label ?? null,
            note: entry?.note ?? null,
            source: entry?.source ?? null,
            sourceText: entry?.source_text ?? null,
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
      const memberDefault = members.find((m) => m.id === memberId)?.default_status ?? null
      const segments = buildRowSegments(weekDays, memberId, entryMap, t, memberDefault, presenceAssumption)
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

  // Today's entries for the Pulse widget. When the org opts into an
  // assumption, members without a real entry are included too — their row
  // carries `assumed: true` so TodayPulse can render them at lower opacity.
  const todayStr = toDateString(new Date())
  const todayEntries = members
    .map((m) => {
      const entry = entryMap.get(`${m.id}_${todayStr}`)
      if (entry) {
        return {
          id: m.id,
          display_name: m.display_name,
          full_name: m.full_name,
          initials: m.initials,
          avatar_url: m.avatar_url,
          status: entry.status,
          location_label: entry.location_label,
          assumed: false,
        }
      }
      const assumed = inferStatus({ default_status: m.default_status }, presenceAssumption)
      if (!assumed) return null
      return {
        id: m.id,
        display_name: m.display_name,
        full_name: m.full_name,
        initials: m.initials,
        avatar_url: m.avatar_url,
        status: assumed,
        location_label: null,
        assumed: true,
      }
    })
    .filter(Boolean) as Array<{
      id: string
      display_name: string
      full_name: string | null
      initials: string | null
      avatar_url: string | null
      status: import('@/lib/supabase/types').EntryStatus
      location_label: string | null
      assumed: boolean
    }>

  return (
    <div className="space-y-5">
      {/* Today's date as a serif "oppslag" — the compact strip below carries
          the week number, range, NÅ pulse and metrics. */}
      {isCurrentWeek && <TodayHero />}

      {/* Week navigation */}
      <WeekNav
        week={week}
        year={year}
        isCurrentWeek={isCurrentWeek}
        onPrev={goToPrev}
        onNext={goToNext}
        onToday={goToToday}
        onJumpTo={jumpTo}
        metrics={todayMetrics ?? null}
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
                // Subtle Ember-tint column so the Nordlys day-orb reads as
                // the only signature note; a violet column backdrop would
                // muddy the gradient above.
                background:
                  'linear-gradient(180deg, rgba(251, 191, 36, 0.08) 0%, rgba(251, 191, 36, 0.035) 40%, rgba(251, 191, 36, 0.015) 100%)',
              }}
            />
          )
        })()}

        {/* Norwegian holiday columns — soft red light-shaft mirroring the
            today column, so a NO red day reads at a glance even before you
            see the orb. Rendered before the today chord so today still wins
            visually when both apply. */}
        {weekHolidays.map((dh, idx) => {
          if (!dh.no) return null
          if (isToday(dh.date)) return null
          const left = `calc(160px + ${idx} * ((100% - 208px) / 5 + 8px))`
          const width = `calc((100% - 208px) / 5)`
          return (
            <div
              key={`no-hol-col-${idx}`}
              aria-hidden
              className="absolute pointer-events-none z-0"
              style={{
                top: 0,
                bottom: 0,
                left,
                width,
                background:
                  'linear-gradient(180deg, rgba(244, 63, 94, 0.10) 0%, rgba(244, 63, 94, 0.045) 40%, rgba(244, 63, 94, 0.018) 100%)',
              }}
            />
          )
        })}

        {/* Today chord — the Nordlys signature gradient line running through
            today's column, same as on /min-plan's current-week row. Gives the
            matrix the same "horisonten gjort vertikal" moment here. */}
        {(() => {
          const todayIdx = weekDays.findIndex(isToday)
          if (todayIdx === -1) return null
          const left = `calc(160px + ${todayIdx} * ((100% - 208px) / 5 + 8px) + ((100% - 208px) / 5) / 2 - 1px)`
          return (
            <div
              aria-hidden
              className="absolute pointer-events-none z-[4]"
              style={{
                top: 0,
                bottom: 0,
                left,
                width: 2,
                background:
                  'linear-gradient(180deg, rgba(0, 245, 160, 0) 0%, #00F5A0 20%, #00D9F5 50%, #7C3AED 80%, rgba(124, 58, 237, 0) 100%)',
                boxShadow:
                  '0 0 12px rgba(0, 217, 245, 0.45), 0 0 24px rgba(0, 245, 160, 0.22)',
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
            // Show month only at a true month transition within the week.
            // The header strip already names the current month, so labelling
            // Monday with it again is noise — we only earn the ink when the
            // month actually changes mid-week (e.g. apr→mai on Fri 1).
            const prev = i > 0 ? getDayLabel(weekDays[i - 1]) : null
            const showMonth = prev != null && prev.month !== month
            const dayHol = weekHolidays[i]
            const noHoliday = dayHol?.no ?? null
            const allHolidays = dayHol?.byCountry ?? new Map<CountryCode, string>()
            // Tooltip lists every active country with a holiday today, with
            // flag + local name. NO comes first when present.
            const tooltipParts: string[] = []
            if (allHolidays.has('NO')) tooltipParts.push(`${flagFor('NO')} ${allHolidays.get('NO')}`)
            for (const [c, name] of allHolidays) {
              if (c === 'NO') continue
              tooltipParts.push(`${flagFor(c)} ${name}`)
            }
            const tooltip = tooltipParts.join(' · ')
            return (
              <div
                key={date.toISOString()}
                className="text-center relative flex flex-col items-center gap-1.5"
                title={tooltip || undefined}
              >
                <div
                  className="lg-mono text-[10px] uppercase"
                  style={{
                    // Today's weekday gets Ember-glow warmth — the Nordlys
                    // gradient is reserved for the day-number orb below.
                    // Norwegian holidays paint the weekday in the same red as
                    // the orb so the column reads as red at a glance.
                    color: today
                      ? 'var(--ember-glow, #FBBF24)'
                      : noHoliday
                        ? '#F43F5E'
                        : 'var(--lg-text-3)',
                    fontWeight: today || noHoliday ? 600 : 500,
                    letterSpacing: '0.2em',
                    textShadow: today
                      ? '0 0 10px rgba(251, 191, 36, 0.35)'
                      : noHoliday
                        ? '0 0 10px rgba(244, 63, 94, 0.35)'
                        : undefined,
                  }}
                >
                  {weekday}
                </div>
                <div
                  className="lg-mono flex items-center justify-center leading-none"
                  style={{
                    fontSize: today ? 22 : 26,
                    fontWeight: today ? 600 : 400,
                    // Nordlys-signature: today's day number sits inside a
                    // gradient orb. Norwegian holidays swap that for a red
                    // ember-orb. If today is *also* a Norwegian holiday we
                    // keep the Nordlys gradient (today wins visually) but
                    // wrap it in a red ring so the holiday still reads.
                    color: today || noHoliday ? '#0E0B08' : 'var(--lg-text-1)',
                    width: today || noHoliday ? 40 : 'auto',
                    height: today || noHoliday ? 40 : 'auto',
                    borderRadius: 9999,
                    background: today
                      ? 'linear-gradient(135deg, #00F5A0 0%, #00D9F5 55%, #7C3AED 100%)'
                      : noHoliday
                        ? 'linear-gradient(135deg, #FB7185 0%, #F43F5E 55%, #E11D48 100%)'
                        : 'transparent',
                    boxShadow: today && noHoliday
                      ? '0 0 0 3px rgba(244, 63, 94, 0.55), 0 0 28px rgba(0, 217, 245, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.35)'
                      : today
                        ? '0 0 0 3px rgba(0, 245, 160, 0.18), 0 0 28px rgba(0, 217, 245, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.35)'
                        : noHoliday
                          ? '0 0 0 3px rgba(244, 63, 94, 0.18), 0 0 28px rgba(244, 63, 94, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25)'
                          : 'none',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {day}
                </div>
                {/* Inline label: holiday name takes precedence over month. */}
                {noHoliday ? (
                  <div
                    className="lg-serif capitalize text-center"
                    style={{
                      color: '#F43F5E',
                      fontSize: 11,
                      opacity: 0.95,
                      maxWidth: '100%',
                      lineHeight: 1.2,
                      letterSpacing: '-0.005em',
                      fontWeight: 500,
                      wordBreak: 'break-word',
                    }}
                  >
                    {noHoliday.name}
                  </div>
                ) : showMonth ? (
                  <div
                    className="lg-serif capitalize"
                    style={{
                      color: today ? 'var(--ember-glow, #FBBF24)' : 'var(--lg-text-3)',
                      fontSize: 12,
                      opacity: today ? 0.9 : 0.65,
                    }}
                  >
                    {month}
                  </div>
                ) : null}
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
            className="relative pt-4 px-4 pb-2 space-y-2 z-10"
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
                          orgId={orgId}
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
                              {member.full_name || member.display_name}
                            </span>
                          </div>
                        </MemberHoverCard>
                      )
                    })()}

                    {/* Day cells — merged into segments when consecutive days share status + location + note */}
                    {(() => {
                      const segments = buildRowSegments(
                        weekDays,
                        member.id,
                        entryMap,
                        t,
                        member.default_status ?? null,
                        presenceAssumption,
                      )
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
                        const segHighlight = seg.days.some((d) =>
                          highlightKeys.has(`${member.id}_${d.date}`),
                        )
                        // Who else is currently editing any day in this segment?
                        const coEditor = (() => {
                          for (const d of seg.days) {
                            const list = editorsOf(member.id, d.date)
                            if (list.length > 0) return list[0]
                          }
                          return null
                        })()
                        return (
                          <StatusSegment
                            key={`${member.id}-${segIdx}-${seg.days[0].date}`}
                            status={seg.entry?.status ?? seg.assumedStatus ?? null}
                            location={seg.entry?.location_label ?? null}
                            note={seg.entry?.note ?? null}
                            assumed={!seg.entry && seg.assumedStatus !== null}
                            lowConfidence={seg.entry?.confidence != null && seg.entry.confidence < 0.7}
                            highlight={segHighlight}
                            editingBy={coEditor ? {
                              display_name: coEditor.display_name,
                              avatar_url: coEditor.avatar_url,
                              initials: coEditor.initials,
                            } : null}
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

                    {/* Holiday corner-stripes — for SE/LT/GB members on days
                        where their home country has a holiday but Norway
                        doesn't. NO holidays already paint the whole column,
                        so we suppress the per-cell stripe to avoid double
                        signal. */}
                    {(() => {
                      const office = member.home_office_id
                        ? officeById.get(member.home_office_id)
                        : undefined
                      const country = office?.country_code
                      if (!isSupportedCountry(country) || country === 'NO') return null
                      return weekHolidays.map((dh, dayIdx) => {
                        if (dh.no) return null
                        const name = dh.byCountry.get(country)
                        if (!name) return null
                        const leftCalc = `calc(144px + ${dayIdx} * ((100% - 176px) / 5 + 8px))`
                        const widthCalc = `calc((100% - 176px) / 5)`
                        return (
                          <div
                            key={`hol-stripe-${dayIdx}`}
                            aria-hidden
                            title={`${flagFor(country)} ${name}`}
                            style={{
                              position: 'absolute',
                              top: 0,
                              height: 36,
                              left: leftCalc,
                              width: widthCalc,
                              borderRadius: 8,
                              pointerEvents: 'none',
                              zIndex: 6,
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                position: 'absolute',
                                top: 0,
                                right: 0,
                                width: 14,
                                height: 14,
                                background:
                                  'linear-gradient(225deg, #F43F5E 0%, #F43F5E 50%, transparent 50%)',
                                boxShadow: '0 0 8px rgba(244, 63, 94, 0.45)',
                                borderTopRightRadius: 8,
                              }}
                            />
                          </div>
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
        initialSource={selectedCell?.source ?? null}
        initialSourceText={selectedCell?.sourceText ?? null}
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
    confidence: null,
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
  const order: EntryStatus[] = ['office', 'remote', 'customer', 'event', 'travel', 'vacation', 'sick', 'off']
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
