'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from 'next-themes'
import { getISOWeek } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { useEntries } from '@/hooks/use-entries'
import { useT } from '@/lib/i18n/context'
import { useStatusColors } from '@/lib/status-colors/context'
import { MemberAvatar } from '@/components/member-avatar'
import { VacationIcon } from '@/components/icons/status-icons'
import { WorkspaceBadge } from '@/components/workspace-switcher'
import { createClient } from '@/lib/supabase/client'
import { toDateString } from '@/lib/dates'
import { ease } from '@/lib/motion'
import type { Entry, Member, MemberRole, WorkspaceSummary } from '@/lib/supabase/types'

interface Props {
  orgIds: string[]
  currentMemberId: string
  currentMemberRole: MemberRole
  initialMembers: Member[]
  initialEntries: Entry[]
  initialMonth: number   // 0–11
  initialYear: number    // calendar year
  /** All workspaces the user belongs to. Used in combined view for the
   *  per-row workspace badge and to rank the UK org (country_code='GB')
   *  to the bottom of the list. */
  workspaces?: WorkspaceSummary[]
  /** When true: render workspace badge per row + group rows by org with
   *  a divider between groups. Mirrors Oversikt's TeamGrid combined view. */
  combinedView?: boolean
  /** Office ids whose country_code='GB'. Single-workspace UK detection
   *  hooks `member.home_office_id` against this set so UK-based members
   *  always sort to the bottom — same rule TeamGrid uses. */
  ukOfficeIds?: string[]
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

type GridRow =
  | { kind: 'member'; row: MemberRow; rowIdx: number }
  | { kind: 'divider'; key: string }

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
  workspaces,
  combinedView,
  ukOfficeIds,
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

  // Workspace lookup keyed by org_id — drives the per-row badge in
  // combined view and the UK-org rank in the sort below.
  const workspaceByOrgId = useMemo(() => {
    const map = new Map<string, WorkspaceSummary>()
    if (workspaces) for (const w of workspaces) map.set(w.org_id, w)
    return map
  }, [workspaces])

  // Set of UK home office ids — used in single-workspace view to push
  // UK-based members to the bottom even when the org itself isn't UK.
  const ukOfficeIdSet = useMemo(() => new Set(ukOfficeIds ?? []), [ukOfficeIds])

  // Build vacation blocks per member. We collapse consecutive weekday
  // entries — including over weekends — so "uke 28" reads as one bar.
  // Sort puts UK members/orgs at the bottom (matches Oversikt's TeamGrid)
  // and otherwise keeps the alphabetical order from .order('display_name').
  const { memberRows, gridRows } = useMemo(() => {
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

    if (combinedView && workspaces && workspaces.length > 1) {
      // Group by org with UK org (country_code='GB') always at the bottom;
      // remaining orgs alphabetised on workspace name. Mirrors TeamGrid.
      const ukOrgIds = new Set(
        workspaces.filter((w) => w.country_code === 'GB').map((w) => w.org_id),
      )
      const orgRank = new Map<string, number>()
      workspaces
        .slice()
        .sort((a, b) => {
          const aUk = ukOrgIds.has(a.org_id) ? 1 : 0
          const bUk = ukOrgIds.has(b.org_id) ? 1 : 0
          if (aUk !== bUk) return aUk - bUk
          return a.name.localeCompare(b.name)
        })
        .forEach((w, i) => orgRank.set(w.org_id, i))
      rows.sort((a, b) => {
        const ra = orgRank.get(a.member.org_id) ?? 999
        const rb = orgRank.get(b.member.org_id) ?? 999
        if (ra !== rb) return ra - rb
        return a.member.display_name.localeCompare(b.member.display_name)
      })
      const out: GridRow[] = []
      let lastOrg: string | null = null
      let memberIdx = 0
      for (const r of rows) {
        if (lastOrg !== null && r.member.org_id !== lastOrg) {
          out.push({ kind: 'divider', key: `divider-${r.member.org_id}` })
        }
        out.push({ kind: 'member', row: r, rowIdx: memberIdx++ })
        lastOrg = r.member.org_id
      }
      return { memberRows: rows, gridRows: out }
    }

    // Single workspace (or unfiltered): UK home-office members sort to
    // the bottom; alphabetical order is preserved otherwise. A divider
    // sits between the non-UK and UK groups so the split reads at a
    // glance, matching the combined-view treatment.
    const isUK = (m: Member) =>
      !!m.home_office_id && ukOfficeIdSet.has(m.home_office_id)
    rows.sort((a, b) => {
      const ua = isUK(a.member) ? 1 : 0
      const ub = isUK(b.member) ? 1 : 0
      if (ua !== ub) return ua - ub
      return a.member.display_name.localeCompare(b.member.display_name)
    })
    const out: GridRow[] = []
    let memberIdx = 0
    let lastUK = false
    for (const r of rows) {
      const ukNow = isUK(r.member)
      if (memberIdx > 0 && ukNow && !lastUK) {
        out.push({ kind: 'divider', key: 'divider-uk' })
      }
      out.push({ kind: 'member', row: r, rowIdx: memberIdx++ })
      lastUK = ukNow
    }
    return { memberRows: rows, gridRows: out }
  }, [initialMembers, entries, colByDate, combinedView, workspaces, ukOfficeIdSet])

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

  return (
    <div className="w-full flex flex-col gap-5">
      {/* Month nav — same chevron icons as Oversikt's WeekNav (Lucide
          ChevronLeft / ChevronRight, not text arrows), and the "I dag"
          affordance uses the CalWin Light Blue brand accent (--lg-accent)
          so this page lives in the same color family as the rest of the
          app instead of riding the workspace tint. */}
      <div className="flex items-center justify-between gap-3 px-1 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navMonth(-1)}
            aria-label={prevMonthName}
            className="inline-flex items-center gap-1 pl-2 pr-3 h-8 rounded-xl text-[12.5px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lg-accent)]"
            style={{
              color: 'var(--text-secondary)',
              background: 'color-mix(in oklab, var(--bg-elevated) 70%, transparent)',
              border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
              fontFamily: 'var(--font-body)',
            }}
          >
            <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.75} />
            {prevMonthName}
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
            className="inline-flex items-center gap-1 pl-3 pr-2 h-8 rounded-xl text-[12.5px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lg-accent)]"
            style={{
              color: 'var(--text-secondary)',
              background: 'color-mix(in oklab, var(--bg-elevated) 70%, transparent)',
              border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
              fontFamily: 'var(--font-body)',
            }}
          >
            {nextMonthName}
            <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.75} />
          </button>
        </div>
        {!isCurrentMonth && (
          <button
            type="button"
            onClick={navToday}
            className="px-3 h-8 rounded-xl text-[12.5px] font-medium"
            style={{
              color: 'var(--lg-accent)',
              background: 'color-mix(in oklab, var(--lg-accent) 10%, transparent)',
              border: '1px solid color-mix(in oklab, var(--lg-accent) 30%, transparent)',
              fontFamily: 'var(--font-body)',
            }}
          >
            {t.matrix.thisWeek === 'Denne uken' ? 'I dag' : 'Today'}
          </button>
        )}
      </div>

      {/* Matrix card — same liquid-glass surface treatment as Oversikt's
          TeamGrid panel so both pages read as the same product. */}
      <section
        className="relative w-full rounded-2xl overflow-hidden overflow-x-auto"
        style={{
          background: 'var(--lg-surface-1)',
          border: '1px solid var(--lg-divider)',
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
              {gridRows.map((gr) => {
                if (gr.kind === 'divider') {
                  return <GroupDivider key={gr.key} />
                }
                const { row, rowIdx } = gr
                const editable = canEditAny || row.member.id === currentMemberId
                const workspace = workspaceByOrgId.get(row.member.org_id) ?? null
                return (
                  <Row
                    key={row.member.id}
                    row={row}
                    idx={rowIdx}
                    totalCols={totalCols}
                    weekGroups={weekGroups}
                    colPct={colPct}
                    todayCol={todayCol}
                    palette={palette}
                    isLight={isLight}
                    reduce={!!reduce}
                    editable={editable}
                    isSelf={row.member.id === currentMemberId}
                    workspace={workspace}
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

// Hairline between org groups (combined view) or between the non-UK and
// UK members of a single workspace. Mirrors TeamGrid.GroupDivider so both
// surfaces share the same visual language.
function GroupDivider() {
  return (
    <div aria-hidden className="relative h-2 my-1">
      <div
        className="absolute left-3 right-3 top-1/2 -translate-y-1/2 h-px"
        style={{ background: 'var(--lg-divider-soft)' }}
      />
    </div>
  )
}

const NAME_COL = 200

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
  palette, isLight, reduce,
  editable, isSelf, workspace, commitVacation, commitResize, t,
}: {
  row: MemberRow
  idx: number
  totalCols: number
  weekGroups: { weekNo: number; startCol: number; endCol: number }[]
  colPct: (n: number) => number
  todayCol: number
  palette: import('@/lib/status-colors/derive').StatusPalette
  isLight: boolean
  reduce: boolean
  editable: boolean
  isSelf: boolean
  workspace: WorkspaceSummary | null
  commitVacation: (memberId: string, startCol: number, endCol: number, memberName: string) => void | Promise<void>
  commitResize: (memberId: string, oldStartCol: number, oldEndCol: number, newStartCol: number, newEndCol: number, memberName: string) => void | Promise<void>
  t: ReturnType<typeof useT>
}) {
  // Match StatusSegment's translucent tile look so /sommer reads as the same
  // bar as Oversikt: tone-tinted fill (not saturated), tinted text/icon, left
  // rim accent + inner rim + soft outer glow. Alphas mirror StatusSegment.
  const tone = palette.icon
  const baseTint = isLight ? palette.text : palette.textDark
  const tint = `color-mix(in oklab, ${baseTint} 65%, ${isLight ? '#000' : '#fff'})`
  const fillTopAlpha    = isLight ? '6E' : '38'
  const fillBottomAlpha = isLight ? '47' : '22'
  const innerRimAlpha   = isLight ? '70' : '4D'
  const tileFill = `linear-gradient(180deg, ${tone}${fillTopAlpha} 0%, ${tone}${fillBottomAlpha} 100%)`
  const tileShadow = `inset 3px 0 0 ${tone}, inset 0 0 0 1px ${tone}${innerRimAlpha}, 0 0 14px -4px ${tone}66`
  const tileShadowResizing = `inset 3px 0 0 ${tone}, inset 0 0 0 1px ${tone}${innerRimAlpha}, 0 0 22px -4px ${tone}99`
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

  // Hairline above each row except the first — same divider treatment
  // as Oversikt's TeamGrid so it's easy to scan across a long row of
  // weekdays and see which date belongs to which person.
  const showDivider = idx > 0
  return (
    <motion.div
      className="grid items-center"
      style={{
        gridTemplateColumns: `${NAME_COL}px 1fr`,
        height: showDivider ? ROW_H + 7 : ROW_H,
        opacity: hasVacation ? 1 : 0.62,
        borderTop: showDivider ? '1px solid var(--lg-divider-soft)' : undefined,
        paddingTop: showDivider ? 6 : undefined,
      }}
      initial={reduce ? { opacity: hasVacation ? 1 : 0.62 } : { opacity: 0, x: -6 }}
      animate={{ opacity: hasVacation ? 1 : 0.62, x: 0 }}
      transition={reduce ? { duration: 0 } : { delay: 0.03 + idx * 0.02, duration: 0.4, ease: ease.horizon }}
    >
      <div className="flex items-center gap-2 px-1 min-w-0 w-full">
        <MemberAvatar
          name={row.member.display_name}
          initials={row.member.initials}
          avatarUrl={row.member.avatar_url}
          size="sm"
        />
        <div className="min-w-0">
          <div
            className="truncate text-[13px] flex items-center gap-1"
            style={{
              color: 'var(--lg-text-1)',
              fontWeight: 500,
              letterSpacing: '-0.01em',
            }}
          >
            <span className="truncate">{row.member.full_name || row.member.display_name}</span>
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
        {workspace && (
          <span className="ml-auto flex-shrink-0">
            <WorkspaceBadge workspace={workspace} size="sm" />
          </span>
        )}
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

        {/* Today marker — Light Blue brand accent, matching Oversikt's
            today edges. */}
        {todayCol >= 0 && (
          <div
            aria-hidden
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{
              left: `${colPct(todayCol)}%`,
              width: `${colPct(1)}%`,
              background: 'color-mix(in oklab, var(--lg-accent) 12%, transparent)',
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
              className="absolute top-1/2 -translate-y-1/2 rounded-[8px] overflow-hidden"
              style={{
                left: `calc(${left}% + 2px)`,
                width: `calc(${width}% - 4px)`,
                height: 32,
                background: tileFill,
                boxShadow: isResizingThis ? tileShadowResizing : tileShadow,
              }}
              initial={reduce ? false : { scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={reduce ? { duration: 0 } : { delay: 0.12 + i * 0.04, duration: 0.5, ease: ease.horizon }}
              title={tooltip}
            >
              {/* Top sheen — same quiet 35% white-fade as StatusSegment so the
                  tile doesn't read flat. */}
              <div
                aria-hidden
                className="absolute top-0 left-0 right-0 pointer-events-none z-[2]"
                style={{
                  height: '35%',
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 100%)',
                }}
              />
              {width > 8 && (
                <div
                  className="relative h-full flex items-center justify-center gap-1 px-2 text-[11px] font-semibold whitespace-nowrap z-10"
                  style={{
                    color: tint,
                    fontFamily: 'var(--font-body)',
                    letterSpacing: '-0.005em',
                  }}
                >
                  <VacationIcon size={12} color={tint} />
                  {days}d
                </div>
              )}
              {editable && (
                <>
                  <div
                    role="presentation"
                    className="absolute top-0 bottom-0 left-0 z-30 group/handle"
                    style={{ width: 10, cursor: 'ew-resize', touchAction: 'none' }}
                    onPointerDown={(e) => startResize(e, i, 'start')}
                    title={t.summer.resizeHint}
                  >
                    <span
                      aria-hidden
                      className="absolute top-1/2 -translate-y-1/2 left-0.5 w-[2px] h-3 rounded-full opacity-0 group-hover/handle:opacity-80 transition-opacity"
                      style={{ background: tone }}
                    />
                  </div>
                  <div
                    role="presentation"
                    className="absolute top-0 bottom-0 right-0 z-30 group/handle"
                    style={{ width: 10, cursor: 'ew-resize', touchAction: 'none' }}
                    onPointerDown={(e) => startResize(e, i, 'end')}
                    title={t.summer.resizeHint}
                  >
                    <span
                      aria-hidden
                      className="absolute top-1/2 -translate-y-1/2 right-0.5 w-[2px] h-3 rounded-full opacity-0 group-hover/handle:opacity-80 transition-opacity"
                      style={{ background: tone }}
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
            className="absolute top-1/2 -translate-y-1/2 rounded-[8px] pointer-events-none overflow-hidden"
            style={{
              left: `calc(${ghostLeft}% + 2px)`,
              width: `calc(${ghostWidth}% - 4px)`,
              height: 32,
              background: tileFill,
              boxShadow: tileShadowResizing,
              opacity: 0.95,
            }}
          >
            <div
              aria-hidden
              className="absolute top-0 left-0 right-0 pointer-events-none z-[2]"
              style={{
                height: '35%',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 100%)',
              }}
            />
            <div
              className="relative h-full flex items-center justify-center gap-1 text-[11px] font-semibold whitespace-nowrap z-10"
              style={{
                color: tint,
                fontFamily: 'var(--font-body)',
                letterSpacing: '-0.005em',
              }}
            >
              <VacationIcon size={12} color={tint} />
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

