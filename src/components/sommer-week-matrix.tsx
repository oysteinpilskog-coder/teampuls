'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from 'next-themes'
import { getISOWeek, getISOWeekYear } from 'date-fns'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { useEntries, dispatchEntriesChanged } from '@/hooks/use-entries'
import { useT } from '@/lib/i18n/context'
import { useStatusColors } from '@/lib/status-colors/context'
import { MemberAvatar } from '@/components/member-avatar'
import { VacationIcon } from '@/components/icons/status-icons'
import { WorkspaceBadge } from '@/components/workspace-switcher'
import { CountryBadge } from '@/components/country-badge'
import { createClient } from '@/lib/supabase/client'
import { toDateString } from '@/lib/dates'
import { ease } from '@/lib/motion'
import type { Entry, Member, MemberRole, WorkspaceSummary } from '@/lib/supabase/types'

interface Props {
  orgIds: string[]
  currentMemberId: string
  currentMemberRole: MemberRole
  initialMembers: Member[]
  /** Whole-year vacation entries — drives auto-fit + the live window. */
  initialEntries: Entry[]
  /** Calendar year the view spans. */
  year: number
  workspaces?: WorkspaceSummary[]
  combinedView?: boolean
  ukOfficeIds?: string[]
}

interface WeekBucket {
  key: string            // `${isoWeekYear}-${weekNo}`
  weekNo: number
  monthOfMonday: number  // 0–11, for the month band
  dateStrings: string[]  // Mon–Fri ISO date strings in this week
}

interface MemberRow {
  member: Member
  /** Vacation weekday count per *visible* week column (0–5). */
  counts: number[]
  totalDays: number
}

type GridRow =
  | { kind: 'member'; row: MemberRow; rowIdx: number }
  | { kind: 'divider'; key: string }

/**
 * Whole-summer vacation overview for /sommer. One column per ISO week,
 * auto-fitted to the span of weeks that actually contain vacation across
 * the year (plus a week of air on each side) so empty months never eat
 * horizontal space — the "see the whole summer at a glance" view, mirroring
 * the old CalWin Excel sheet. Members on rows; a filled tile per week, with
 * a small day-count when a week is only partially booked. Drag across week
 * columns to register whole weeks at once.
 */
export function SommerWeekMatrix({
  orgIds,
  currentMemberId,
  currentMemberRole,
  initialMembers,
  initialEntries,
  year,
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

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Bucket every weekday (Mon–Fri) of the year into ISO weeks. These are the
  // candidate columns; the visible slice is auto-fitted below.
  const { allBuckets, allDateStrings } = useMemo(() => {
    const buckets: WeekBucket[] = []
    const byKey = new Map<string, WeekBucket>()
    const dates: string[] = []
    const last = new Date(year, 11, 31)
    const cursor = new Date(year, 0, 1)
    while (cursor <= last) {
      const dow = cursor.getDay()
      if (dow >= 1 && dow <= 5) {
        const ds = toDateString(cursor)
        dates.push(ds)
        const key = `${getISOWeekYear(cursor)}-${getISOWeek(cursor)}`
        let b = byKey.get(key)
        if (!b) {
          b = {
            key,
            weekNo: getISOWeek(cursor),
            monthOfMonday: cursor.getMonth(),
            dateStrings: [],
          }
          byKey.set(key, b)
          buckets.push(b)
        }
        b.dateStrings.push(ds)
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    return { allBuckets: buckets, allDateStrings: dates }
  }, [year])

  const { entries, applyOptimistic, refetch } = useEntries(orgIds, allDateStrings, { initial: initialEntries })

  const orgIdByMember = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of initialMembers) map.set(m.id, m.org_id)
    return map
  }, [initialMembers])

  // member_id → set of vacation date strings.
  const vacationByMember = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const e of entries) {
      if (e.status !== 'vacation') continue
      const set = map.get(e.member_id) ?? new Set<string>()
      set.add(e.date)
      map.set(e.member_id, set)
    }
    return map
  }, [entries])

  // Auto-fit: the first..last bucket index that holds any vacation, padded by
  // one empty week each side. Falls back to the summer months (Jun–Aug) when
  // nothing is registered yet, so the grid still reads as a summer planner.
  const visibleBuckets = useMemo(() => {
    if (allBuckets.length === 0) return []
    const anyVac = new Set<string>()
    for (const set of vacationByMember.values()) for (const d of set) anyVac.add(d)
    let minI = Infinity
    let maxI = -Infinity
    allBuckets.forEach((b, i) => {
      if (b.dateStrings.some((d) => anyVac.has(d))) {
        if (i < minI) minI = i
        if (i > maxI) maxI = i
      }
    })
    if (maxI < 0) {
      const summer = allBuckets
        .map((b, i) => ({ b, i }))
        .filter(({ b }) => b.monthOfMonday >= 5 && b.monthOfMonday <= 7)
      if (summer.length === 0) return allBuckets
      return allBuckets.slice(summer[0].i, summer[summer.length - 1].i + 1)
    }
    const lo = Math.max(0, minI - 1)
    const hi = Math.min(allBuckets.length - 1, maxI + 1)
    return allBuckets.slice(lo, hi + 1)
  }, [allBuckets, vacationByMember])

  const totalCols = visibleBuckets.length
  const colPct = (n: number) => totalCols === 0 ? 0 : (n / totalCols) * 100

  // Month band — consecutive visible weeks grouped by the month of their
  // Monday, so "Juni / Juli / August" sit above the week numbers.
  const monthGroups = useMemo(() => {
    const groups: { month: number; startCol: number; endCol: number }[] = []
    visibleBuckets.forEach((b, i) => {
      const prev = groups[groups.length - 1]
      if (prev && prev.month === b.monthOfMonday) prev.endCol = i
      else groups.push({ month: b.monthOfMonday, startCol: i, endCol: i })
    })
    return groups
  }, [visibleBuckets])

  const ukOfficeIdSet = useMemo(() => new Set(ukOfficeIds ?? []), [ukOfficeIds])
  const workspaceByOrgId = useMemo(() => {
    const map = new Map<string, WorkspaceSummary>()
    if (workspaces) for (const w of workspaces) map.set(w.org_id, w)
    return map
  }, [workspaces])

  // Build per-member counts across the visible weeks, then sort/group exactly
  // like the day view (UK members/orgs sink to the bottom, with a divider).
  const { memberRows, gridRows } = useMemo(() => {
    const rows: MemberRow[] = initialMembers.map((member) => {
      const vac = vacationByMember.get(member.id)
      const counts = visibleBuckets.map((b) =>
        vac ? b.dateStrings.reduce((n, d) => n + (vac.has(d) ? 1 : 0), 0) : 0,
      )
      const totalDays = counts.reduce((a, b) => a + b, 0)
      return { member, counts, totalDays }
    })

    if (combinedView && workspaces && workspaces.length > 1) {
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
  }, [initialMembers, vacationByMember, visibleBuckets, combinedView, workspaces, ukOfficeIdSet])

  // Today marker — which visible week (if any) contains today.
  const todayCol = useMemo(() => {
    const todayStr = toDateString(now)
    return visibleBuckets.findIndex((b) => b.dateStrings.includes(todayStr))
  }, [now, visibleBuckets])

  // Set whole weeks of vacation (Mon–Fri) for a member across a column range.
  const commitSetWeeks = useCallback(async (
    memberId: string,
    loCol: number,
    hiCol: number,
    memberName: string,
  ) => {
    const lo = Math.min(loCol, hiCol)
    const hi = Math.max(loCol, hiCol)
    const memberOrgId = orgIdByMember.get(memberId) ?? orgIds[0]
    const dates: string[] = []
    for (let i = lo; i <= hi; i++) {
      const b = visibleBuckets[i]
      if (b) dates.push(...b.dateStrings)
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

    toast.success(`${t.status.vacation} — ${memberName}`)

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
    const { data: written, error } = await supabase
      .from('entries')
      .upsert(rows, { onConflict: 'org_id,member_id,date' })
      .select()
    if (error) {
      toast.error(t.summer.dragError)
      await refetch()
      return
    }
    dispatchEntriesChanged({ upserted: written ?? [] })
  }, [orgIdByMember, orgIds, visibleBuckets, applyOptimistic, refetch, t.status.vacation, t.summer.dragError])

  // Clear all vacation in a single week for a member. Undoable.
  const commitClearWeek = useCallback(async (
    memberId: string,
    col: number,
    memberName: string,
  ) => {
    const bucket = visibleBuckets[col]
    if (!bucket) return
    const memberOrgId = orgIdByMember.get(memberId) ?? orgIds[0]
    const vac = vacationByMember.get(memberId)
    const dates = bucket.dateStrings.filter((d) => vac?.has(d))
    if (dates.length === 0) return

    applyOptimistic((prev) =>
      prev.filter(e => !(e.member_id === memberId && dates.includes(e.date))),
    )

    const days = dates.length
    const dayWord = days === 1 ? t.summer.dayOne : t.summer.dayMany
    toast.success(`${t.summer.deleted} — ${memberName} · ${days} ${dayWord}`, {
      action: {
        label: t.summer.undo,
        onClick: async () => {
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
          const { data: written, error } = await supabase
            .from('entries')
            .upsert(rows, { onConflict: 'org_id,member_id,date' })
            .select()
          if (error) {
            toast.error(t.summer.dragError)
            await refetch()
            return
          }
          dispatchEntriesChanged({ upserted: written ?? [] })
        },
      },
    })

    const supabase = createClient()
    const { data: deleted, error } = await supabase
      .from('entries')
      .delete()
      .eq('member_id', memberId)
      .in('date', dates)
      .select('id')
    if (error) {
      toast.error(t.summer.deleteError)
      await refetch()
      return
    }
    dispatchEntriesChanged({
      deletedIds: (deleted ?? []).map((r: { id: string }) => r.id),
    })
  }, [orgIdByMember, orgIds, visibleBuckets, vacationByMember, applyOptimistic, refetch, t.summer.dayOne, t.summer.dayMany, t.summer.deleted, t.summer.deleteError, t.summer.dragError, t.summer.undo])

  const canEditAny = currentMemberRole === 'admin'
  const palette = palettes.vacation
  const minWidth = Math.max(720, NAME_COL + totalCols * 58)

  return (
    <div className="w-full flex flex-col gap-5">
      <section
        className="relative w-full rounded-2xl overflow-auto"
        style={{
          background: 'var(--lg-surface-1)',
          border: '1px solid var(--lg-divider)',
          maxHeight: 'calc(100dvh - 14rem)',
        }}
      >
        <div style={{ minWidth }}>
          <Header
            visibleBuckets={visibleBuckets}
            monthGroups={monthGroups}
            colPct={colPct}
            todayCol={todayCol}
            t={t}
          />

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
                // Workspace badge only in combined view — in single-workspace
                // view the per-member CountryBadge already carries the location
                // signal, so a second badge here is redundant. Mirrors the day
                // view and Oversikt.
                const workspace = combinedView
                  ? workspaceByOrgId.get(row.member.org_id) ?? null
                  : null
                const countryCode = row.member.location_code ?? null
                return (
                  <Row
                    key={row.member.id}
                    row={row}
                    idx={rowIdx}
                    totalCols={totalCols}
                    colPct={colPct}
                    todayCol={todayCol}
                    palette={palette}
                    isLight={isLight}
                    reduce={!!reduce}
                    editable={editable}
                    isSelf={row.member.id === currentMemberId}
                    workspace={workspace}
                    countryCode={countryCode}
                    commitSetWeeks={commitSetWeeks}
                    commitClearWeek={commitClearWeek}
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
  visibleBuckets, monthGroups, colPct, todayCol, t,
}: {
  visibleBuckets: WeekBucket[]
  monthGroups: { month: number; startCol: number; endCol: number }[]
  colPct: (n: number) => number
  todayCol: number
  t: ReturnType<typeof useT>
}) {
  return (
    <div
      className="sticky top-0 z-30 px-3 pt-4 pb-2"
      style={{ background: 'var(--lg-surface-1)' }}
    >
      {/* Month band */}
      <div
        className="relative grid items-center pl-1"
        style={{ gridTemplateColumns: `${NAME_COL}px 1fr`, marginBottom: 4 }}
      >
        <div className="sticky left-0 z-10" style={{ background: 'var(--lg-surface-1)' }} />
        <div className="relative h-5">
          {monthGroups.map((g) => {
            const left = colPct(g.startCol)
            const width = colPct(g.endCol - g.startCol + 1)
            return (
              <div
                key={`${g.month}-${g.startCol}`}
                className="absolute top-0 bottom-0 flex items-end pl-1"
                style={{ left: `${left}%`, width: `${width}%` }}
              >
                <span
                  className="text-[10px] font-semibold uppercase"
                  style={{
                    color: 'var(--text-tertiary)',
                    fontFamily: 'var(--font-body)',
                    letterSpacing: '0.16em',
                  }}
                >
                  {t.dates.monthsLongCap[g.month]}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Week numbers */}
      <div
        className="relative grid items-center pl-1"
        style={{ gridTemplateColumns: `${NAME_COL}px 1fr` }}
      >
        <div className="sticky left-0 z-10" style={{ background: 'var(--lg-surface-1)' }} />
        <div className="relative h-7">
          {visibleBuckets.map((b, i) => {
            const left = colPct(i)
            const width = colPct(1)
            const isToday = i === todayCol
            return (
              <div
                key={b.key}
                className="absolute top-0 bottom-0 flex items-end justify-center pb-0.5"
                style={{ left: `${left}%`, width: `${width}%` }}
              >
                <span
                  className="text-[11px] font-semibold uppercase tabular-nums px-1.5 py-0.5 rounded-md"
                  style={{
                    color: isToday ? 'var(--lg-accent)' : 'var(--text-secondary)',
                    background: isToday
                      ? 'color-mix(in oklab, var(--lg-accent) 12%, transparent)'
                      : 'transparent',
                    fontFamily: 'var(--font-body)',
                    letterSpacing: '0.08em',
                  }}
                >
                  {t.summer.weekShort}{b.weekNo}
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
  row, idx, totalCols, colPct, todayCol,
  palette, isLight, reduce,
  editable, isSelf, workspace, countryCode, commitSetWeeks, commitClearWeek, t,
}: {
  row: MemberRow
  idx: number
  totalCols: number
  colPct: (n: number) => number
  todayCol: number
  palette: import('@/lib/status-colors/derive').StatusPalette
  isLight: boolean
  reduce: boolean
  editable: boolean
  isSelf: boolean
  workspace: WorkspaceSummary | null
  countryCode: string | null
  commitSetWeeks: (memberId: string, loCol: number, hiCol: number, memberName: string) => void | Promise<void>
  commitClearWeek: (memberId: string, col: number, memberName: string) => void | Promise<void>
  t: ReturnType<typeof useT>
}) {
  const tone = palette.icon
  const baseTint = isLight ? palette.text : palette.textDark
  const tint = `color-mix(in oklab, ${baseTint} 65%, ${isLight ? '#000' : '#fff'})`
  const fillTopAlpha    = isLight ? '6E' : '38'
  const fillBottomAlpha = isLight ? '47' : '22'
  const innerRimAlpha   = isLight ? '70' : '4D'
  const tileFill = `linear-gradient(180deg, ${tone}${fillTopAlpha} 0%, ${tone}${fillBottomAlpha} 100%)`
  const partialFill = `linear-gradient(180deg, ${tone}${isLight ? '40' : '24'} 0%, ${tone}${isLight ? '28' : '16'} 100%)`
  const tileShadow = `inset 3px 0 0 ${tone}, inset 0 0 0 1px ${tone}${innerRimAlpha}, 0 0 14px -4px ${tone}66`
  const ghostShadow = `inset 3px 0 0 ${tone}, inset 0 0 0 1px ${tone}${innerRimAlpha}, 0 0 22px -4px ${tone}99`

  const trackRef = useRef<HTMLDivElement | null>(null)
  const [drag, setDrag] = useState<{ startCol: number; endCol: number } | null>(null)
  const hasVacation = row.totalDays > 0

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
    if (!drag) return
    const col = pointerToCol(e.clientX)
    setDrag(prev => (prev && prev.endCol !== col) ? { ...prev, endCol: col } : prev)
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag) return
    const { startCol, endCol } = drag
    setDrag(null)
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ }
    void commitSetWeeks(row.member.id, startCol, endCol, row.member.display_name)
  }

  function handlePointerCancel() {
    setDrag(null)
  }

  const ghostLo = drag ? Math.min(drag.startCol, drag.endCol) : 0
  const ghostHi = drag ? Math.max(drag.startCol, drag.endCol) : 0
  const ghostLeft = drag ? colPct(ghostLo) : 0
  const ghostWidth = drag ? colPct(ghostHi - ghostLo + 1) : 0

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
      <div
        className="sticky left-0 z-20 flex items-center gap-2 px-1 min-w-0 w-full h-full"
        style={{ background: 'var(--lg-surface-1)' }}
      >
        <MemberAvatar
          name={row.member.display_name}
          initials={row.member.initials}
          avatarUrl={row.member.avatar_url}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-[13px] flex items-center gap-2"
            style={{
              color: 'var(--lg-text-1)',
              fontWeight: 500,
              letterSpacing: '-0.01em',
            }}
          >
            <span className="truncate flex-1">{row.member.full_name || row.member.display_name}</span>
            <CountryBadge countryCode={countryCode} />
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
        className="relative h-full isolate"
        style={{
          cursor: editable ? (drag ? 'grabbing' : 'crosshair') : 'default',
          touchAction: editable ? 'none' : 'auto',
        }}
        title={editable && !drag ? t.summer.dragWeekHint : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {/* Week dividers — vertical hairlines between columns */}
        {Array.from({ length: Math.max(0, totalCols - 1) }).map((_, i) => (
          <div
            key={i}
            aria-hidden
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{
              left: `${colPct(i + 1)}%`,
              width: '1px',
              background: 'color-mix(in oklab, var(--border-subtle) 50%, transparent)',
              opacity: 0.6,
            }}
          />
        ))}

        {/* Today column tint */}
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

        {/* Week tiles */}
        {row.counts.map((count, i) => {
          if (count <= 0) return null
          const left = colPct(i)
          const width = colPct(1)
          const full = count >= 5
          return (
            <motion.div
              key={i}
              className="absolute top-1/2 -translate-y-1/2 rounded-[8px] overflow-hidden group/bar"
              style={{
                left: `calc(${left}% + 2px)`,
                width: `calc(${width}% - 4px)`,
                height: 32,
                background: full ? tileFill : partialFill,
                boxShadow: tileShadow,
              }}
              initial={reduce ? false : { scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={reduce ? { duration: 0 } : { delay: 0.1 + i * 0.02, duration: 0.4, ease: ease.horizon }}
              title={full ? undefined : `${count} ${count === 1 ? t.summer.dayOne : t.summer.dayMany}`}
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
                className="relative h-full flex items-center justify-center gap-0.5 text-[11px] font-semibold whitespace-nowrap z-10"
                style={{
                  color: tint,
                  fontFamily: 'var(--font-body)',
                  letterSpacing: '-0.005em',
                }}
              >
                {full
                  ? <VacationIcon size={12} color={tint} />
                  : <span className="tabular-nums">{count}d</span>}
              </div>
              {editable && (
                <button
                  type="button"
                  aria-label={t.summer.clearWeekHint}
                  title={t.summer.clearWeekHint}
                  onPointerDown={(e) => { e.stopPropagation() }}
                  onClick={(e) => {
                    e.stopPropagation()
                    void commitClearWeek(row.member.id, i, row.member.display_name)
                  }}
                  className="absolute top-0.5 right-0.5 z-40 flex items-center justify-center rounded-full opacity-0 group-hover/bar:opacity-100 focus-visible:opacity-100 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lg-accent)]"
                  style={{
                    width: 15,
                    height: 15,
                    background: `color-mix(in oklab, ${tone} 92%, transparent)`,
                    color: '#fff',
                    boxShadow: `0 1px 3px ${tone}66`,
                  }}
                >
                  <X size={9} strokeWidth={2.5} />
                </button>
              )}
            </motion.div>
          )
        })}

        {/* Drag ghost */}
        {drag && (
          <div
            className="absolute top-1/2 -translate-y-1/2 rounded-[8px] pointer-events-none overflow-hidden"
            style={{
              left: `calc(${ghostLeft}% + 2px)`,
              width: `calc(${ghostWidth}% - 4px)`,
              height: 32,
              background: tileFill,
              boxShadow: ghostShadow,
              opacity: 0.95,
            }}
          >
            <div
              className="relative h-full flex items-center justify-center gap-1 text-[11px] font-semibold whitespace-nowrap z-10"
              style={{ color: tint, fontFamily: 'var(--font-body)' }}
            >
              <VacationIcon size={12} color={tint} />
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}
