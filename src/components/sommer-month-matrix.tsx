'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from 'next-themes'
import { getISOWeek } from 'date-fns'
import { toast } from 'sonner'
import { useEntries } from '@/hooks/use-entries'
import { useT } from '@/lib/i18n/context'
import { useStatusColors } from '@/lib/status-colors/context'
import { MemberAvatar } from '@/components/member-avatar'
import { createClient } from '@/lib/supabase/client'
import { toDateString } from '@/lib/dates'
import { ease } from '@/lib/motion'
import type { Entry, Member, MemberRole } from '@/lib/supabase/types'

interface Props {
  orgIds: string[]
  currentMemberId: string
  currentMemberRole: MemberRole
  initialMembers: Member[]
  initialEntries: Entry[]
  initialMonth: number   // 0–11
  initialYear: number    // calendar year
}

interface VacationBlock {
  startCol: number       // 0-indexed weekday column in the month
  endCol: number         // inclusive
  startDate: Date
  endDate: Date
  locationLabel: string | null
  note: string | null
}

interface MemberRow {
  member: Member
  blocks: VacationBlock[]
  totalDays: number
  firstCol: number       // POSITIVE_INFINITY when no vacation
}

/**
 * Month-by-month vacation matrix for /sommer. Members on rows, every
 * weekday (Mon–Fri) of the month as a column. Vacation registers as
 * rose-gradient bars that stretch across consecutive weekdays — same
 * line/bar visual language as Oversikt's TeamGrid, but spanning ~22
 * columns (a full month) instead of 5 (one week).
 */
export function SommerMonthMatrix({
  orgIds,
  currentMemberId,
  currentMemberRole,
  initialMembers,
  initialEntries,
  initialMonth,
  initialYear,
}: Props) {
  const t = useT()
  const reduce = useReducedMotion()
  const palettes = useStatusColors()
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const isLight = mounted ? resolvedTheme !== 'dark' : true

  const [month, setMonth] = useState(initialMonth)
  const [year, setYear] = useState(initialYear)

  // Today — bumped every minute so the today-marker stays accurate even
  // on a TV that's been open for hours.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Mon–Fri columns for the active month, plus their ISO-week groupings
  // for the visual separators in the header.
  const { weekdays, weekGroups, dateStrings } = useMemo(() => {
    const days: Date[] = []
    const last = new Date(year, month + 1, 0).getDate()
    for (let d = 1; d <= last; d++) {
      const date = new Date(year, month, d)
      const dow = date.getDay()
      if (dow >= 1 && dow <= 5) days.push(date)
    }
    const groups: { weekNo: number; startCol: number; endCol: number }[] = []
    let i = 0
    while (i < days.length) {
      const w = getISOWeek(days[i])
      let j = i + 1
      while (j < days.length && getISOWeek(days[j]) === w) j++
      groups.push({ weekNo: w, startCol: i, endCol: j - 1 })
      i = j
    }
    return {
      weekdays: days,
      weekGroups: groups,
      dateStrings: days.map(toDateString),
    }
  }, [year, month])

  const totalCols = weekdays.length
  const colPct = (n: number) => totalCols === 0 ? 0 : (n / totalCols) * 100

  const { entries, applyOptimistic, refetch } = useEntries(orgIds, dateStrings, { initial: initialEntries })

  // Member → org_id lookup so combined-mode commits write into the
  // member's actual org rather than the first one in the array.
  const orgIdByMember = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of initialMembers) map.set(m.id, m.org_id)
    return map
  }, [initialMembers])

  const colByDate = useMemo(() => {
    const map = new Map<string, number>()
    dateStrings.forEach((d, i) => map.set(d, i))
    return map
  }, [dateStrings])

  // Build vacation blocks per member. We collapse consecutive weekday
  // entries — including over weekends — so "uke 28" reads as one bar.
  const memberRows = useMemo<MemberRow[]>(() => {
    const byMember = new Map<string, Entry[]>()
    for (const e of entries) {
      if (e.status !== 'vacation') continue
      if (!colByDate.has(e.date)) continue
      const arr = byMember.get(e.member_id) ?? []
      arr.push(e)
      byMember.set(e.member_id, arr)
    }
    const rows: MemberRow[] = []
    for (const member of initialMembers) {
      const memberEntries = (byMember.get(member.id) ?? []).slice()
        .sort((a, b) => a.date.localeCompare(b.date))
      const blocks: VacationBlock[] = []
      let cur: VacationBlock | null = null
      for (const e of memberEntries) {
        const col = colByDate.get(e.date)
        if (col === undefined) continue
        const date = parseDateString(e.date)
        // Bridge over weekend gaps: column index increments by 1 per
        // weekday in the array, so consecutive weekdays differ by 1
        // even across a Sat/Sun boundary. Allow gap ≤ 1.
        if (cur && col - cur.endCol <= 1) {
          cur.endCol = col
          cur.endDate = date
          if (e.location_label && !cur.locationLabel) cur.locationLabel = e.location_label
          if (e.note && !cur.note) cur.note = e.note
        } else {
          if (cur) blocks.push(cur)
          cur = {
            startCol: col,
            endCol: col,
            startDate: date,
            endDate: date,
            locationLabel: e.location_label ?? null,
            note: e.note ?? null,
          }
        }
      }
      if (cur) blocks.push(cur)
      const totalDays = blocks.reduce((sum, b) => sum + (b.endCol - b.startCol + 1), 0)
      const firstCol = blocks.length > 0 ? blocks[0].startCol : Number.POSITIVE_INFINITY
      rows.push({ member, blocks, totalDays, firstCol })
    }
    rows.sort((a, b) => {
      if (a.firstCol === b.firstCol) return a.member.display_name.localeCompare(b.member.display_name)
      return a.firstCol - b.firstCol
    })
    return rows
  }, [initialMembers, entries, colByDate])

  // Today marker — only shown when today is one of the visible weekdays.
  const todayCol = useMemo(() => {
    const todayStr = toDateString(now)
    return colByDate.get(todayStr) ?? -1
  }, [now, colByDate])

  // Month nav -----------------------------------------------------------
  const monthName = t.dates.monthsLongCap[month]
  const prevMonthName = t.dates.monthsLongCap[(month + 11) % 12]
  const nextMonthName = t.dates.monthsLongCap[(month + 1) % 12]
  const todayMonth = now.getMonth()
  const todayYear = now.getFullYear()
  const isCurrentMonth = month === todayMonth && year === todayYear

  function navMonth(delta: number) {
    const next = new Date(year, month + delta, 1)
    setMonth(next.getMonth())
    setYear(next.getFullYear())
  }
  function navToday() {
    setMonth(todayMonth)
    setYear(todayYear)
  }

  // Drag-create / resize commits ---------------------------------------
  const commitVacation = useCallback(async (
    memberId: string,
    startCol: number,
    endCol: number,
    memberName: string,
  ) => {
    const lo = Math.min(startCol, endCol)
    const hi = Math.max(startCol, endCol)
    const memberOrgId = orgIdByMember.get(memberId) ?? orgIds[0]
    const dates: string[] = []
    for (let i = lo; i <= hi; i++) {
      const d = weekdays[i]
      if (d) dates.push(toDateString(d))
    }
    if (dates.length === 0) return

    const nowIso = new Date().toISOString()
    applyOptimistic((prev) => {
      const keep = prev.filter(e => !(e.member_id === memberId && dates.includes(e.date)))
      const added: Entry[] = dates.map(d => ({
        id: `optimistic-${memberId}-${d}`,
        org_id: memberOrgId,
        member_id: memberId,
        date: d,
        status: 'vacation',
        location_label: null,
        note: null,
        source: 'manual',
        source_text: null,
        confidence: null,
        created_by: null,
        created_at: nowIso,
        updated_at: nowIso,
      }))
      return [...keep, ...added]
    })

    const suffix = dates.length === 1 ? '' : ` · ${dates.length} ${t.summer.dayMany}`
    toast.success(`${t.status.vacation} — ${memberName}${suffix}`)

    const supabase = createClient()
    const rows = dates.map(d => ({
      org_id: memberOrgId,
      member_id: memberId,
      date: d,
      status: 'vacation' as const,
      location_label: null,
      note: null,
      source: 'manual' as const,
      confidence: null,
    }))
    const { error } = await supabase
      .from('entries')
      .upsert(rows, { onConflict: 'org_id,member_id,date' })
    if (error) {
      toast.error(t.summer.dragError)
      await refetch()
      return
    }
    window.dispatchEvent(new CustomEvent('teampulse:entries-changed'))
  }, [orgIdByMember, orgIds, weekdays, applyOptimistic, refetch, t.status.vacation, t.summer.dayMany, t.summer.dragError])

  const commitResize = useCallback(async (
    memberId: string,
    oldStartCol: number,
    oldEndCol: number,
    newStartCol: number,
    newEndCol: number,
    memberName: string,
  ) => {
    const memberOrgId = orgIdByMember.get(memberId) ?? orgIds[0]
    const oldLo = Math.min(oldStartCol, oldEndCol)
    const oldHi = Math.max(oldStartCol, oldEndCol)
    const newLo = Math.min(newStartCol, newEndCol)
    const newHi = Math.max(newStartCol, newEndCol)
    const colToISO = (c: number) => weekdays[c] ? toDateString(weekdays[c]) : null
    const oldDates = new Set<string>()
    for (let i = oldLo; i <= oldHi; i++) {
      const d = colToISO(i)
      if (d) oldDates.add(d)
    }
    const newDates = new Set<string>()
    for (let i = newLo; i <= newHi; i++) {
      const d = colToISO(i)
      if (d) newDates.add(d)
    }
    const toAdd = [...newDates].filter(d => !oldDates.has(d))
    const toRemove = [...oldDates].filter(d => !newDates.has(d))
    if (toAdd.length === 0 && toRemove.length === 0) return

    const nowIso = new Date().toISOString()
    applyOptimistic((prev) => {
      const drop = new Set([...toRemove, ...toAdd])
      const keep = prev.filter(e => !(e.member_id === memberId && drop.has(e.date)))
      const added: Entry[] = toAdd.map(d => ({
        id: `optimistic-${memberId}-${d}`,
        org_id: memberOrgId,
        member_id: memberId,
        date: d,
        status: 'vacation',
        location_label: null,
        note: null,
        source: 'manual',
        source_text: null,
        confidence: null,
        created_by: null,
        created_at: nowIso,
        updated_at: nowIso,
      }))
      return [...keep, ...added]
    })

    const totalNewDays = newHi - newLo + 1
    const dayWord = totalNewDays === 1 ? t.summer.dayOne : t.summer.dayMany
    let verb: string
    if (toAdd.length > 0 && toRemove.length === 0) verb = t.summer.resizeExtended
    else if (toRemove.length > 0 && toAdd.length === 0) verb = t.summer.resizeShortened
    else verb = t.summer.resizeAdjusted
    toast.success(`${verb} — ${memberName} · ${totalNewDays} ${dayWord}`)

    const supabase = createClient()
    let writeErr: unknown = null
    if (toAdd.length > 0) {
      const rows = toAdd.map(d => ({
        org_id: memberOrgId,
        member_id: memberId,
        date: d,
        status: 'vacation' as const,
        location_label: null,
        note: null,
        source: 'manual' as const,
        confidence: null,
      }))
      const { error } = await supabase
        .from('entries')
        .upsert(rows, { onConflict: 'org_id,member_id,date' })
      if (error) writeErr = error
    }
    if (!writeErr && toRemove.length > 0) {
      const { error } = await supabase
        .from('entries')
        .delete()
        .eq('member_id', memberId)
        .in('date', toRemove)
      if (error) writeErr = error
    }
    if (writeErr) {
      toast.error(t.summer.dragError)
      await refetch()
      return
    }
    window.dispatchEvent(new CustomEvent('teampulse:entries-changed'))
  }, [orgIdByMember, orgIds, weekdays, applyOptimistic, refetch, t.summer.dayOne, t.summer.dayMany, t.summer.dragError, t.summer.resizeExtended, t.summer.resizeShortened, t.summer.resizeAdjusted])

  const canEditAny = currentMemberRole === 'admin'
  const palette = palettes.vacation
  const barGradient = isLight ? palette.gradient.light : palette.gradient.dark
  const barGlow = palette.glow

  return (
    <div className="w-full flex flex-col gap-5">
      {/* Month nav */}
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navMonth(-1)}
            aria-label={prevMonthName}
            className="px-3 h-8 rounded-xl text-[12.5px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
            style={{
              color: 'var(--text-secondary)',
              background: 'color-mix(in oklab, var(--bg-elevated) 70%, transparent)',
              border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
              fontFamily: 'var(--font-body)',
            }}
          >
            ← {prevMonthName}
          </button>
          <h2
            className="text-[20px] sm:text-[24px] font-semibold mx-2 tabular-nums"
            style={{
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-display), Georgia, serif',
              fontVariationSettings: '"opsz" 28, "SOFT" 60, "wght" 540',
              letterSpacing: '-0.01em',
            }}
          >
            {monthName} {year}
          </h2>
          <button
            type="button"
            onClick={() => navMonth(+1)}
            aria-label={nextMonthName}
            className="px-3 h-8 rounded-xl text-[12.5px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
            style={{
              color: 'var(--text-secondary)',
              background: 'color-mix(in oklab, var(--bg-elevated) 70%, transparent)',
              border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
              fontFamily: 'var(--font-body)',
            }}
          >
            {nextMonthName} →
          </button>
        </div>
        {!isCurrentMonth && (
          <button
            type="button"
            onClick={navToday}
            className="px-3 h-8 rounded-xl text-[12.5px] font-medium"
            style={{
              color: 'var(--accent-color)',
              background: 'color-mix(in oklab, var(--accent-color) 10%, transparent)',
              border: '1px solid color-mix(in oklab, var(--accent-color) 30%, transparent)',
              fontFamily: 'var(--font-body)',
            }}
          >
            {t.matrix.thisWeek === 'Denne uken' ? 'I dag' : 'Today'}
          </button>
        )}
      </div>

      {/* Matrix card */}
      <section
        className="relative w-full rounded-[24px] overflow-hidden overflow-x-auto"
        style={{
          background: 'color-mix(in oklab, var(--bg-elevated) 86%, transparent)',
          border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
          boxShadow: isLight
            ? '0 18px 48px -28px rgba(180, 83, 9, 0.16), 0 1px 0 rgba(255,255,255,0.6) inset'
            : '0 18px 48px -28px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.04) inset',
        }}
      >
        <div className="min-w-[720px]">
          {/* Header row: week labels + weekday labels */}
          <Header
            weekdays={weekdays}
            weekGroups={weekGroups}
            colPct={colPct}
            t={t}
          />

          {/* Member rows */}
          {memberRows.length === 0 ? (
            <div
              className="px-6 py-12 text-center text-[14px]"
              style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
            >
              {t.summer.empty}
            </div>
          ) : (
            <div className="px-3 pb-4">
              {memberRows.map((row, idx) => {
                const editable = canEditAny || row.member.id === currentMemberId
                return (
                  <Row
                    key={row.member.id}
                    row={row}
                    idx={idx}
                    totalCols={totalCols}
                    weekGroups={weekGroups}
                    colPct={colPct}
                    todayCol={todayCol}
                    barGradient={barGradient}
                    barGlow={barGlow}
                    isLight={isLight}
                    reduce={!!reduce}
                    editable={editable}
                    isSelf={row.member.id === currentMemberId}
                    commitVacation={commitVacation}
                    commitResize={commitResize}
                    t={t}
                  />
                )
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

// --------------------------------------------------------------------------

const NAME_COL = 152

function Header({
  weekdays, weekGroups, colPct, t,
}: {
  weekdays: Date[]
  weekGroups: { weekNo: number; startCol: number; endCol: number }[]
  colPct: (n: number) => number
  t: ReturnType<typeof useT>
}) {
  return (
    <div className="px-3 pt-4 pb-2">
      {/* Week labels row */}
      <div
        className="relative grid items-center pl-1"
        style={{ gridTemplateColumns: `${NAME_COL}px 1fr`, marginBottom: 4 }}
      >
        <div />
        <div className="relative h-5">
          {weekGroups.map((g) => {
            const left = colPct(g.startCol)
            const width = colPct(g.endCol - g.startCol + 1)
            return (
              <div
                key={g.weekNo}
                className="absolute top-0 bottom-0 flex items-end pl-1"
                style={{ left: `${left}%`, width: `${width}%` }}
              >
                <span
                  className="text-[10px] font-semibold uppercase tabular-nums"
                  style={{
                    color: 'var(--text-tertiary)',
                    fontFamily: 'var(--font-body)',
                    letterSpacing: '0.16em',
                  }}
                >
                  {t.summer.weekShort}{g.weekNo}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Day labels row */}
      <div
        className="relative grid items-center pl-1"
        style={{ gridTemplateColumns: `${NAME_COL}px 1fr` }}
      >
        <div />
        <div className="relative h-7">
          {weekdays.map((d, i) => {
            const left = colPct(i)
            const width = colPct(1)
            const dayShort = t.dates.weekdaysShort[d.getDay()].slice(0, 2)
            return (
              <div
                key={i}
                className="absolute top-0 bottom-0 flex flex-col items-center justify-end gap-0.5"
                style={{ left: `${left}%`, width: `${width}%` }}
              >
                <span
                  className="text-[9px] font-semibold uppercase"
                  style={{
                    color: 'var(--text-tertiary)',
                    fontFamily: 'var(--font-body)',
                    letterSpacing: '0.06em',
                  }}
                >
                  {dayShort}
                </span>
                <span
                  className="text-[10.5px] font-medium tabular-nums"
                  style={{
                    color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  {d.getDate()}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const ROW_H = 44

function Row({
  row, idx, totalCols, weekGroups, colPct, todayCol,
  barGradient, barGlow, isLight, reduce,
  editable, isSelf, commitVacation, commitResize, t,
}: {
  row: MemberRow
  idx: number
  totalCols: number
  weekGroups: { weekNo: number; startCol: number; endCol: number }[]
  colPct: (n: number) => number
  todayCol: number
  barGradient: [string, string]
  barGlow: string
  isLight: boolean
  reduce: boolean
  editable: boolean
  isSelf: boolean
  commitVacation: (memberId: string, startCol: number, endCol: number, memberName: string) => void | Promise<void>
  commitResize: (memberId: string, oldStartCol: number, oldEndCol: number, newStartCol: number, newEndCol: number, memberName: string) => void | Promise<void>
  t: ReturnType<typeof useT>
}) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [drag, setDrag] = useState<{ startCol: number; endCol: number } | null>(null)
  const [resize, setResize] = useState<{
    blockIdx: number
    edge: 'start' | 'end'
    oldStart: number
    oldEnd: number
    newStart: number
    newEnd: number
  } | null>(null)
  const hasVacation = row.blocks.length > 0

  const pointerToCol = useCallback((clientX: number): number => {
    const el = trackRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const ratio = (clientX - rect.left) / Math.max(rect.width, 1)
    const col = Math.floor(ratio * totalCols)
    return Math.max(0, Math.min(totalCols - 1, col))
  }, [totalCols])

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!editable) return
    if (e.button !== 0) return
    if (e.target !== e.currentTarget) return
    e.preventDefault()
    const col = pointerToCol(e.clientX)
    setDrag({ startCol: col, endCol: col })
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* noop */ }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (drag) {
      const col = pointerToCol(e.clientX)
      setDrag(prev => (prev && prev.endCol !== col) ? { ...prev, endCol: col } : prev)
      return
    }
    if (resize) {
      const col = pointerToCol(e.clientX)
      setResize(prev => {
        if (!prev) return prev
        if (prev.edge === 'start') {
          const next = Math.min(col, prev.newEnd)
          return next === prev.newStart ? prev : { ...prev, newStart: next }
        } else {
          const next = Math.max(col, prev.newStart)
          return next === prev.newEnd ? prev : { ...prev, newEnd: next }
        }
      })
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (drag) {
      const { startCol, endCol } = drag
      setDrag(null)
      try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ }
      void commitVacation(row.member.id, startCol, endCol, row.member.display_name)
      return
    }
    if (resize) {
      const { oldStart, oldEnd, newStart, newEnd } = resize
      setResize(null)
      try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ }
      void commitResize(row.member.id, oldStart, oldEnd, newStart, newEnd, row.member.display_name)
    }
  }

  function handlePointerCancel() {
    setDrag(null)
    setResize(null)
  }

  function startResize(e: React.PointerEvent<HTMLDivElement>, blockIdx: number, edge: 'start' | 'end') {
    if (!editable) return
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const block = row.blocks[blockIdx]
    if (!block) return
    setResize({
      blockIdx,
      edge,
      oldStart: block.startCol,
      oldEnd: block.endCol,
      newStart: block.startCol,
      newEnd: block.endCol,
    })
    try { trackRef.current?.setPointerCapture(e.pointerId) } catch { /* noop */ }
  }

  const ghostLo = drag ? Math.min(drag.startCol, drag.endCol) : 0
  const ghostHi = drag ? Math.max(drag.startCol, drag.endCol) : 0
  const ghostDays = drag ? ghostHi - ghostLo + 1 : 0
  const ghostLeft = drag ? colPct(ghostLo) : 0
  const ghostWidth = drag ? colPct(ghostHi - ghostLo + 1) : 0

  return (
    <motion.div
      className="grid items-center"
      style={{
        gridTemplateColumns: `${NAME_COL}px 1fr`,
        height: ROW_H,
        opacity: hasVacation ? 1 : 0.62,
      }}
      initial={reduce ? { opacity: hasVacation ? 1 : 0.62 } : { opacity: 0, x: -6 }}
      animate={{ opacity: hasVacation ? 1 : 0.62, x: 0 }}
      transition={reduce ? { duration: 0 } : { delay: 0.03 + idx * 0.02, duration: 0.4, ease: ease.horizon }}
    >
      <div className="flex items-center gap-2 pr-3 min-w-0 pl-1">
        <MemberAvatar
          name={row.member.display_name}
          initials={row.member.initials}
          avatarUrl={row.member.avatar_url}
          size="sm"
        />
        <div className="min-w-0">
          <div
            className="truncate text-[12.5px] font-medium flex items-center gap-1"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
          >
            <span className="truncate">{row.member.display_name}</span>
            {isSelf && (
              <span
                aria-hidden
                className="shrink-0 text-[8.5px] font-semibold uppercase px-1 py-px rounded"
                style={{
                  color: 'var(--text-tertiary)',
                  background: 'color-mix(in oklab, var(--bg-subtle) 70%, transparent)',
                  border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
                  letterSpacing: '0.08em',
                }}
              >
                {t.summer.youBadge}
              </span>
            )}
          </div>
          {hasVacation && (
            <div
              className="text-[10px] font-medium tabular-nums"
              style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
            >
              {row.totalDays}{' '}{row.totalDays === 1 ? t.summer.dayOne : t.summer.dayMany}
            </div>
          )}
        </div>
      </div>

      <div
        ref={trackRef}
        className="relative h-full"
        style={{
          cursor: editable ? (drag ? 'grabbing' : 'crosshair') : 'default',
          touchAction: editable ? 'none' : 'auto',
        }}
        title={editable && !drag ? t.summer.dragHint : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {/* Week dividers — vertical hairlines between ISO weeks */}
        {weekGroups.slice(1).map((g) => (
          <div
            key={g.weekNo}
            aria-hidden
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{
              left: `${colPct(g.startCol)}%`,
              width: '1px',
              background: 'color-mix(in oklab, var(--border-subtle) 50%, transparent)',
              opacity: 0.6,
            }}
          />
        ))}

        {/* Today marker */}
        {todayCol >= 0 && (
          <div
            aria-hidden
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{
              left: `${colPct(todayCol)}%`,
              width: `${colPct(1)}%`,
              background: 'color-mix(in oklab, var(--nordlys-b) 12%, transparent)',
            }}
          />
        )}

        {/* Vacation blocks */}
        {row.blocks.map((b, i) => {
          const isResizingThis = resize?.blockIdx === i
          const renderStart = isResizingThis ? resize.newStart : b.startCol
          const renderEnd = isResizingThis ? resize.newEnd : b.endCol
          const left = colPct(renderStart)
          const width = colPct(renderEnd - renderStart + 1)
          const days = renderEnd - renderStart + 1
          const dateRange = formatBlockRange(b.startDate, b.endDate, t)
          const tooltip = b.locationLabel
            ? `${dateRange} · ${b.locationLabel}`
            : dateRange
          return (
            <motion.div
              key={i}
              className="absolute top-1/2 -translate-y-1/2 rounded-full overflow-hidden"
              style={{
                left: `calc(${left}% + 2px)`,
                width: `calc(${width}% - 4px)`,
                height: 28,
                background: `linear-gradient(180deg, ${barGradient[0]}, ${barGradient[1]})`,
                boxShadow: isResizingThis
                  ? `0 6px 20px ${hexToRgba(barGlow, 0.55)}, 0 0 0 1px ${hexToRgba(barGlow, 0.5)} inset, inset 0 1px 0 rgba(255,255,255,0.45)`
                  : `0 3px 12px ${hexToRgba(barGlow, 0.32)}, 0 0 0 1px ${hexToRgba(barGlow, 0.18)} inset, inset 0 1px 0 ${isLight ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.10)'}`,
              }}
              initial={reduce ? false : { scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={reduce ? { duration: 0 } : { delay: 0.12 + i * 0.04, duration: 0.5, ease: ease.horizon }}
              title={tooltip}
            >
              {width > 8 && (
                <div
                  className="relative h-full flex items-center justify-center px-2 text-[10.5px] font-semibold whitespace-nowrap"
                  style={{
                    color: isLight ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.92)',
                    textShadow: '0 1px 2px rgba(0,0,0,0.18)',
                    fontFamily: 'var(--font-body)',
                    letterSpacing: '0.01em',
                  }}
                >
                  {days}d
                </div>
              )}
              {editable && (
                <>
                  <div
                    role="presentation"
                    className="absolute top-0 bottom-0 left-0 z-10 group/handle"
                    style={{ width: 8, cursor: 'ew-resize', touchAction: 'none' }}
                    onPointerDown={(e) => startResize(e, i, 'start')}
                    title={t.summer.resizeHint}
                  >
                    <span
                      aria-hidden
                      className="absolute top-1/2 -translate-y-1/2 left-0.5 w-[2.5px] h-3 rounded-full opacity-0 group-hover/handle:opacity-100 transition-opacity"
                      style={{ background: 'rgba(255,255,255,0.85)' }}
                    />
                  </div>
                  <div
                    role="presentation"
                    className="absolute top-0 bottom-0 right-0 z-10 group/handle"
                    style={{ width: 8, cursor: 'ew-resize', touchAction: 'none' }}
                    onPointerDown={(e) => startResize(e, i, 'end')}
                    title={t.summer.resizeHint}
                  >
                    <span
                      aria-hidden
                      className="absolute top-1/2 -translate-y-1/2 right-0.5 w-[2.5px] h-3 rounded-full opacity-0 group-hover/handle:opacity-100 transition-opacity"
                      style={{ background: 'rgba(255,255,255,0.85)' }}
                    />
                  </div>
                </>
              )}
            </motion.div>
          )
        })}

        {/* Drag-create ghost */}
        {drag && (
          <div
            className="absolute top-1/2 -translate-y-1/2 rounded-full pointer-events-none overflow-hidden"
            style={{
              left: `calc(${ghostLeft}% + 2px)`,
              width: `calc(${ghostWidth}% - 4px)`,
              height: 28,
              background: `linear-gradient(180deg, ${barGradient[0]}, ${barGradient[1]})`,
              boxShadow: `0 6px 18px ${hexToRgba(barGlow, 0.5)}, 0 0 0 1px ${hexToRgba(barGlow, 0.55)} inset, inset 0 1px 0 rgba(255,255,255,0.4)`,
              opacity: 0.92,
            }}
          >
            <div
              className="relative h-full flex items-center justify-center text-[10.5px] font-semibold whitespace-nowrap"
              style={{
                color: isLight ? 'rgba(255,255,255,0.98)' : 'rgba(255,255,255,0.95)',
                textShadow: '0 1px 2px rgba(0,0,0,0.22)',
                fontFamily: 'var(--font-body)',
              }}
            >
              {ghostDays}d
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// --------------------------------------------------------------------------
// helpers

function parseDateString(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function hexToRgba(hex: string, a: number): string {
  const m = /^#?([a-f\d]{6})$/i.exec(hex.trim())
  if (!m) return `rgba(180, 83, 9, ${a})`
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 0xff
  const g = (n >> 8) & 0xff
  const b = n & 0xff
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

function formatBlockRange(start: Date, end: Date, t: ReturnType<typeof useT>): string {
  const sm = t.dates.monthsShort[start.getMonth()]
  const em = t.dates.monthsShort[end.getMonth()]
  if (start.getMonth() === end.getMonth() && start.getDate() === end.getDate()) {
    return `${start.getDate()}. ${sm}`
  }
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}.–${end.getDate()}. ${sm}`
  }
  return `${start.getDate()}. ${sm} – ${end.getDate()}. ${em}`
}

