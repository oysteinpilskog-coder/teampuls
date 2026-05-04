'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from 'next-themes'
import { addDays, getISOWeek } from 'date-fns'
import { toast } from 'sonner'
import { useEntries } from '@/hooks/use-entries'
import { useT } from '@/lib/i18n/context'
import { useStatusColors } from '@/lib/status-colors/context'
import { MemberAvatar } from '@/components/member-avatar'
import { createClient } from '@/lib/supabase/client'
import { toDateString } from '@/lib/dates'
import { spring, ease } from '@/lib/motion'
import type { Entry, Member, MemberRole } from '@/lib/supabase/types'

interface SummerViewProps {
  year: number
  orgIds: string[]
  /** UUID of the signed-in user's membership in this org. Used to gate
   *  drag-create to "your own row" unless the user is an admin. */
  currentMemberId: string
  currentMemberRole: MemberRole
  initialMembers: Member[]
  initialEntries: Entry[]
}

interface VacationBlock {
  startDay: number   // 0-indexed offset from June 1
  endDay: number     // inclusive
  startDate: Date
  endDate: Date
  locationLabel: string | null
  note: string | null
}

interface MemberRow {
  member: Member
  blocks: VacationBlock[]
  firstDay: number    // POSITIVE_INFINITY when no vacation
  totalDays: number
}

export function SummerView({
  year, orgIds, currentMemberId, currentMemberRole,
  initialMembers, initialEntries,
}: SummerViewProps) {
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()
  const reduce = useReducedMotion()
  const palettes = useStatusColors()
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const isLight = mounted ? resolvedTheme !== 'dark' : true

  // We always fetch the whole year — entries are tiny rows (≤ a few hundred
  // even for a big org) and this lets the timeline expand to include any
  // shoulder-season ferie outside the default June–Aug window without a
  // refetch.
  const yearRange = useMemo(() => {
    const start = new Date(year, 0, 1)
    const end = new Date(year, 11, 31)
    const totalDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
    return { start, end, totalDays }
  }, [year])

  const dateStrings = useMemo(() => {
    const out: string[] = []
    for (let i = 0; i < yearRange.totalDays; i++) {
      out.push(toDateString(addDays(yearRange.start, i)))
    }
    return out
  }, [yearRange])

  const { entries, applyOptimistic, refetch } = useEntries(orgIds, dateStrings, { initial: initialEntries })

  // Visible range = at least June–August, extended to include any month
  // with a vacation entry. Reads off the realtime entries so it stays in
  // sync with optimistic writes / drags.
  const range = useMemo(() => {
    let minMonth = 5  // June (0-indexed)
    let maxMonth = 7  // August
    for (const e of entries) {
      if (e.status !== 'vacation') continue
      const d = parseDateString(e.date)
      if (d.getFullYear() !== year) continue
      if (d.getMonth() < minMonth) minMonth = d.getMonth()
      if (d.getMonth() > maxMonth) maxMonth = d.getMonth()
    }
    const start = new Date(year, minMonth, 1)
    const end = new Date(year, maxMonth + 1, 0)  // last day of maxMonth
    const totalDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
    return { start, end, totalDays, minMonth, maxMonth }
  }, [year, entries])

  // Resolve which org the dragged member belongs to. In combined-mode the
  // page passes multiple orgIds, but a single member only lives in one.
  const orgIdByMember = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of initialMembers) map.set(m.id, m.org_id)
    return map
  }, [initialMembers])

  // Drag-create commit: write a contiguous vacation block for one member.
  // Optimistic-paint first, then UPSERT, then broadcast so other live
  // surfaces (matrix, my-plan, dashboard) stay in lockstep.
  const commitVacation = useCallback(async (
    memberId: string,
    startDay: number,
    endDay: number,
    memberName: string,
  ) => {
    const lo = Math.min(startDay, endDay)
    const hi = Math.max(startDay, endDay)
    const memberOrgId = orgIdByMember.get(memberId) ?? orgIds[0]
    const dates: string[] = []
    for (let i = lo; i <= hi; i++) {
      dates.push(toDateString(addDays(range.start, i)))
    }
    if (dates.length === 0) return

    // Paint immediately — replace any non-vacation rows the user had on
    // these dates with vacation rows. Other statuses stay overwritten,
    // matching the cell-editor's UPSERT semantics.
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
    // Mirror ai-input.tsx — realtime can lag so emit a sync-now broadcast.
    window.dispatchEvent(new CustomEvent('teampulse:entries-changed'))
  }, [orgIdByMember, orgIds, range.start, applyOptimistic, refetch, t.status.vacation, t.summer.dayMany, t.summer.dragError])

  // Resize commit: drag a block's edge → some days are added (extension)
  // and/or some are removed (shrink). Computes the diff, upserts the new
  // days as vacation, deletes the dropped days, then broadcasts.
  const commitResize = useCallback(async (
    memberId: string,
    oldStartDay: number,
    oldEndDay: number,
    newStartDay: number,
    newEndDay: number,
    memberName: string,
  ) => {
    const memberOrgId = orgIdByMember.get(memberId) ?? orgIds[0]
    const oldLo = Math.min(oldStartDay, oldEndDay)
    const oldHi = Math.max(oldStartDay, oldEndDay)
    const newLo = Math.min(newStartDay, newEndDay)
    const newHi = Math.max(newStartDay, newEndDay)

    const dayToISO = (d: number) => toDateString(addDays(range.start, d))
    const oldDates = new Set<string>()
    for (let i = oldLo; i <= oldHi; i++) oldDates.add(dayToISO(i))
    const newDates = new Set<string>()
    for (let i = newLo; i <= newHi; i++) newDates.add(dayToISO(i))

    const toAdd: string[] = [...newDates].filter(d => !oldDates.has(d))
    const toRemove: string[] = [...oldDates].filter(d => !newDates.has(d))

    // No-op if the user dropped at the same edge they grabbed.
    if (toAdd.length === 0 && toRemove.length === 0) return

    const nowIso = new Date().toISOString()
    applyOptimistic((prev) => {
      // Drop any vacation rows the member has on `toRemove` dates AND
      // any rows on `toAdd` dates (so we replace, not duplicate).
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

    // Toast — pick the verb that matches what dominated the diff so the
    // copy reads honestly ("forlenget", "forkortet", or "justert" mix).
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
  }, [orgIdByMember, orgIds, range.start, applyOptimistic, refetch, t.summer.dayOne, t.summer.dayMany, t.summer.dragError, t.summer.resizeExtended, t.summer.resizeShortened, t.summer.resizeAdjusted])

  // Per-member vacation blocks. We collapse consecutive vacation days into
  // a single visual block — including weekends, since "uke 28" reads as one
  // ferie even though the weekend rows technically aren't in the DB.
  const memberRows = useMemo<MemberRow[]>(() => {
    const byMember = new Map<string, Entry[]>()
    for (const e of entries) {
      if (e.status !== 'vacation') continue
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
        const date = parseDateString(e.date)
        const dayOffset = Math.round((date.getTime() - range.start.getTime()) / 86_400_000)
        if (dayOffset < 0 || dayOffset >= range.totalDays) continue
        // Bridge across weekends: any gap of ≤ 3 days counts as the same
        // vacation block (covers Fri → Mon as well as a Thursday gap).
        if (cur && dayOffset - cur.endDay <= 3) {
          cur.endDay = dayOffset
          cur.endDate = date
          if (e.location_label && !cur.locationLabel) cur.locationLabel = e.location_label
          if (e.note && !cur.note) cur.note = e.note
        } else {
          if (cur) blocks.push(cur)
          cur = {
            startDay: dayOffset,
            endDay: dayOffset,
            startDate: date,
            endDate: date,
            locationLabel: e.location_label ?? null,
            note: e.note ?? null,
          }
        }
      }
      if (cur) blocks.push(cur)
      const firstDay = blocks.length > 0 ? blocks[0].startDay : Number.POSITIVE_INFINITY
      const totalDays = blocks.reduce((sum, b) => sum + (b.endDay - b.startDay + 1), 0)
      rows.push({ member, blocks, firstDay, totalDays })
    }
    rows.sort((a, b) => {
      if (a.firstDay === b.firstDay) return a.member.display_name.localeCompare(b.member.display_name)
      return a.firstDay - b.firstDay
    })
    return rows
  }, [initialMembers, entries, range])

  // Day-by-day "people on vacation" count, drives the coverage rail.
  const coverage = useMemo(() => {
    const counts = new Array<number>(range.totalDays).fill(0)
    for (const e of entries) {
      if (e.status !== 'vacation') continue
      const date = parseDateString(e.date)
      const off = Math.round((date.getTime() - range.start.getTime()) / 86_400_000)
      if (off >= 0 && off < range.totalDays) counts[off]++
    }
    return counts
  }, [entries, range])

  const totalActiveMembers = initialMembers.length
  const membersWithVacation = memberRows.filter(r => r.totalDays > 0).length
  const totalVacationDays = memberRows.reduce((sum, r) => sum + r.totalDays, 0)
  const peak = coverage.length === 0 ? 0 : Math.max(...coverage)
  const peakDayIdx = coverage.indexOf(peak)
  const peakDate = peak > 0 ? addDays(range.start, peakDayIdx) : null

  const today = useMemo(() => new Date(), [])
  const todayDayOffset = Math.round((today.getTime() - range.start.getTime()) / 86_400_000)
  const todayInRange = todayDayOffset >= 0 && todayDayOffset < range.totalDays

  // Year nav
  const todayDate = new Date()
  const defaultYear = todayDate.getMonth() >= 8 ? todayDate.getFullYear() + 1 : todayDate.getFullYear()
  const yearOptions = [year - 1, year, year + 1]

  function setYear(y: number) {
    const url = y === defaultYear ? pathname : `${pathname}?year=${y}`
    router.replace(url, { scroll: false })
  }

  const monthSpans = useMemo(() => {
    const out: { label: string; days: number }[] = []
    for (let m = range.minMonth; m <= range.maxMonth; m++) {
      const days = new Date(year, m + 1, 0).getDate()
      out.push({ label: t.dates.monthsLong[m], days })
    }
    return out
  }, [t, year, range])

  // Week-tick positions (Mondays inside the range)
  const weekTicks = useMemo(() => {
    const ticks: { dayOffset: number; weekNo: number }[] = []
    for (let i = 0; i < range.totalDays; i++) {
      const d = addDays(range.start, i)
      if (d.getDay() === 1) {
        ticks.push({ dayOffset: i, weekNo: getISOWeek(d) })
      }
    }
    return ticks
  }, [range])

  const peakLabel = peakDate
    ? `${t.dates.weekdaysShort[peakDate.getDay()].toLowerCase()} ${peakDate.getDate()}. ${t.dates.monthsShort[peakDate.getMonth()]}`
    : null

  const palette = palettes.vacation
  const barGradient = isLight ? palette.gradient.light : palette.gradient.dark
  const barGlow = palette.glow

  return (
    <div className="w-full flex flex-col gap-7">
      <Hero
        year={year}
        membersWithVacation={membersWithVacation}
        totalActiveMembers={totalActiveMembers}
        totalVacationDays={totalVacationDays}
        t={t}
      />

      <YearSwitcher year={year} options={yearOptions} onChange={setYear} t={t} />

      <Timeline
        range={range}
        memberRows={memberRows}
        monthSpans={monthSpans}
        weekTicks={weekTicks}
        coverage={coverage}
        peak={peak}
        peakLabel={peakLabel}
        todayInRange={todayInRange}
        todayDayOffset={todayDayOffset}
        totalActiveMembers={totalActiveMembers}
        barGradient={barGradient}
        barGlow={barGlow}
        isLight={isLight}
        reduce={!!reduce}
        currentMemberId={currentMemberId}
        currentMemberRole={currentMemberRole}
        commitVacation={commitVacation}
        commitResize={commitResize}
        t={t}
      />
    </div>
  )
}

function Hero({
  year, membersWithVacation, totalActiveMembers, totalVacationDays, t,
}: {
  year: number
  membersWithVacation: number
  totalActiveMembers: number
  totalVacationDays: number
  t: ReturnType<typeof useT>
}) {
  return (
    <header className="px-1">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: ease.horizon }}
      >
        <div
          className="text-[12px] font-semibold uppercase tracking-[0.22em]"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
        >
          {t.summer.eyebrow}
        </div>
        <h1
          className="mt-2 text-[56px] sm:text-[72px] md:text-[88px] leading-[0.95]"
          style={{
            fontFamily: 'var(--font-display), Georgia, serif',
            fontVariationSettings: '"opsz" 96, "SOFT" 60, "wght" 540',
            letterSpacing: '-0.02em',
            color: 'var(--text-primary)',
          }}
        >
          {t.summer.title} <SummerYear year={year} />
        </h1>
        <p
          className="mt-3 max-w-2xl text-[15px] sm:text-[16px]"
          style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
        >
          {t.summer.subline
            .replace('{withVac}', String(membersWithVacation))
            .replace('{total}', String(totalActiveMembers))
            .replace('{days}', String(totalVacationDays))}
        </p>
      </motion.div>
    </header>
  )
}

function SummerYear({ year }: { year: number }) {
  // The year gets the warm sun-gradient — the only place we lean Nordlys-ish
  // on this surface, used once.
  return (
    <span
      style={{
        background: 'linear-gradient(120deg, var(--ember-glow) 0%, var(--ember-soft) 50%, var(--nordlys-c) 100%)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        color: 'transparent',
      }}
    >
      {year}
    </span>
  )
}

function YearSwitcher({
  year, options, onChange, t,
}: {
  year: number
  options: number[]
  onChange: (y: number) => void
  t: ReturnType<typeof useT>
}) {
  return (
    <div
      role="tablist"
      aria-label={t.summer.yearSwitcherAria}
      className="self-start inline-flex items-center gap-1 p-1 rounded-2xl"
      style={{
        background: 'color-mix(in oklab, var(--bg-elevated) 70%, transparent)',
        border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
        backdropFilter: 'blur(14px) saturate(180%)',
        WebkitBackdropFilter: 'blur(14px) saturate(180%)',
      }}
    >
      {options.map((y) => {
        const isActive = y === year
        return (
          <button
            key={y}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(y)}
            className="relative px-4 py-1.5 text-[13px] font-semibold rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
            style={{
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontFamily: 'var(--font-body)',
            }}
          >
            {isActive && (
              <motion.span
                layoutId="summer-year-active"
                className="absolute inset-0 rounded-xl"
                style={{
                  background: 'color-mix(in oklab, var(--bg-primary) 88%, transparent)',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05), 0 0 0 1px color-mix(in oklab, var(--border-subtle) 60%, transparent)',
                }}
                transition={spring.snappy}
              />
            )}
            <span className="relative z-10">{y}</span>
          </button>
        )
      })}
    </div>
  )
}

interface TimelineProps {
  range: { start: Date; end: Date; totalDays: number }
  memberRows: MemberRow[]
  monthSpans: { label: string; days: number }[]
  weekTicks: { dayOffset: number; weekNo: number }[]
  coverage: number[]
  peak: number
  peakLabel: string | null
  todayInRange: boolean
  todayDayOffset: number
  totalActiveMembers: number
  barGradient: [string, string]
  barGlow: string
  isLight: boolean
  reduce: boolean
  currentMemberId: string
  currentMemberRole: MemberRole
  commitVacation: (memberId: string, startDay: number, endDay: number, memberName: string) => void | Promise<void>
  commitResize: (memberId: string, oldStartDay: number, oldEndDay: number, newStartDay: number, newEndDay: number, memberName: string) => void | Promise<void>
  t: ReturnType<typeof useT>
}

const NAME_COL = 'clamp(116px, 18vw, 196px)'
const ROW_H = 52

function Timeline({
  range, memberRows, monthSpans, weekTicks, coverage,
  peak, peakLabel, todayInRange, todayDayOffset, totalActiveMembers,
  barGradient, barGlow, isLight, reduce,
  currentMemberId, currentMemberRole, commitVacation, commitResize,
  t,
}: TimelineProps) {
  const canEditAny = currentMemberRole === 'admin'
  const total = range.totalDays
  const dayPct = (n: number) => (n / total) * 100

  return (
    <section
      className="relative w-full rounded-[28px] overflow-hidden"
      style={{
        background: 'color-mix(in oklab, var(--bg-elevated) 86%, transparent)',
        border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
        boxShadow: isLight
          ? '0 24px 60px -28px rgba(180, 83, 9, 0.18), 0 1px 0 rgba(255,255,255,0.6) inset'
          : '0 24px 60px -28px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.04) inset',
      }}
    >
      {/* Soft horizon glow at the top — the "summer sky" hint */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-32 pointer-events-none"
        style={{
          background: isLight
            ? 'radial-gradient(120% 100% at 50% 0%, rgba(251, 191, 36, 0.18), transparent 60%)'
            : 'radial-gradient(120% 100% at 50% 0%, rgba(251, 191, 36, 0.10), transparent 60%)',
        }}
      />

      {/* Month band */}
      <div
        className="relative grid items-center"
        style={{
          gridTemplateColumns: `${NAME_COL} 1fr`,
          paddingTop: 18,
          paddingBottom: 10,
          paddingLeft: 18,
          paddingRight: 24,
        }}
      >
        <div />
        <div className="relative h-7">
          {monthSpans.map((m, i) => {
            const offset = monthSpans.slice(0, i).reduce((sum, prev) => sum + prev.days, 0)
            const left = dayPct(offset)
            const width = dayPct(m.days)
            return (
              <div
                key={i}
                className="absolute top-0 bottom-0 flex items-end pl-3"
                style={{ left: `${left}%`, width: `${width}%` }}
              >
                <span
                  className="text-[11px] font-semibold uppercase tracking-[0.24em]"
                  style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
                >
                  {m.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Week ticks rule */}
      <div
        className="relative grid"
        style={{
          gridTemplateColumns: `${NAME_COL} 1fr`,
          paddingLeft: 18,
          paddingRight: 24,
          paddingBottom: 10,
        }}
      >
        <div />
        <div className="relative h-5">
          {weekTicks.map((tick) => (
            <div
              key={tick.weekNo}
              className="absolute top-0 bottom-0 flex items-start"
              style={{ left: `${dayPct(tick.dayOffset)}%`, transform: 'translateX(-50%)' }}
            >
              <span
                className="text-[10px] font-medium tabular-nums"
                style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)', letterSpacing: '0.05em' }}
              >
                {t.summer.weekShort}{tick.weekNo}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Background week stripes — sit behind the rows */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          left: `calc(${NAME_COL} + 18px)`,
          right: 24,
          // Match rows section vertical bounds exactly via inline anchors
          top: 78,
          bottom: 110,
        }}
      >
        <div className="relative w-full h-full">
          {weekTicks.map((tick, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0"
              style={{
                left: `${dayPct(tick.dayOffset)}%`,
                width: '1px',
                background: 'color-mix(in oklab, var(--border-subtle) 50%, transparent)',
                opacity: 0.5,
              }}
            />
          ))}
          {/* Today line */}
          {todayInRange && (
            <motion.div
              className="absolute top-0 bottom-0 pointer-events-none"
              style={{
                left: `${dayPct(todayDayOffset)}%`,
                width: '2px',
                transform: 'translateX(-1px)',
                background: 'linear-gradient(180deg, var(--nordlys-b), color-mix(in oklab, var(--nordlys-c) 60%, transparent))',
                boxShadow: '0 0 14px rgba(0, 217, 245, 0.55), 0 0 32px rgba(124, 58, 237, 0.22)',
                borderRadius: 2,
              }}
              animate={reduce ? undefined : { opacity: [0.85, 1, 0.85] }}
              transition={reduce ? undefined : { duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
        </div>
      </div>

      {/* Member rows */}
      <div
        className="relative"
        style={{
          paddingLeft: 18,
          paddingRight: 24,
          paddingBottom: 18,
        }}
      >
        {memberRows.length === 0 ? (
          <div
            className="py-12 text-center text-[14px]"
            style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
          >
            {t.summer.empty}
          </div>
        ) : (
          <div className="flex flex-col">
            {memberRows.map((row, idx) => {
              const editable = canEditAny || row.member.id === currentMemberId
              return (
                <Row
                  key={row.member.id}
                  row={row}
                  idx={idx}
                  totalDays={range.totalDays}
                  dayPct={dayPct}
                  barGradient={barGradient}
                  barGlow={barGlow}
                  isLight={isLight}
                  reduce={reduce}
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

      {/* Coverage rail */}
      <Coverage
        coverage={coverage}
        totalActiveMembers={totalActiveMembers}
        peak={peak}
        peakLabel={peakLabel}
        dayPct={dayPct}
        weekTicks={weekTicks}
        t={t}
      />
    </section>
  )
}

function Row({
  row, idx, totalDays, dayPct, barGradient, barGlow, isLight, reduce,
  editable, isSelf, commitVacation, commitResize, t,
}: {
  row: MemberRow
  idx: number
  totalDays: number
  dayPct: (n: number) => number
  barGradient: [string, string]
  barGlow: string
  isLight: boolean
  reduce: boolean
  editable: boolean
  isSelf: boolean
  commitVacation: (memberId: string, startDay: number, endDay: number, memberName: string) => void | Promise<void>
  commitResize: (memberId: string, oldStartDay: number, oldEndDay: number, newStartDay: number, newEndDay: number, memberName: string) => void | Promise<void>
  t: ReturnType<typeof useT>
}) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [drag, setDrag] = useState<{ startDay: number; endDay: number } | null>(null)
  // Resize state — separate from create-drag so the two interactions can't
  // collide. `blockIdx` identifies which existing block is being resized,
  // `edge` is which side the user grabbed.
  const [resize, setResize] = useState<{
    blockIdx: number
    edge: 'start' | 'end'
    oldStart: number
    oldEnd: number
    newStart: number
    newEnd: number
  } | null>(null)
  const hasVacation = row.blocks.length > 0

  // Map a clientX to a 0..(totalDays-1) day index based on the track rect.
  // Recomputed on every move so a mid-drag scroll/resize doesn't drift.
  const pointerToDay = useCallback((clientX: number): number => {
    const el = trackRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const ratio = (clientX - rect.left) / Math.max(rect.width, 1)
    const day = Math.floor(ratio * totalDays)
    return Math.max(0, Math.min(totalDays - 1, day))
  }, [totalDays])

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!editable) return
    if (e.button !== 0) return
    // Skip if the press started on an existing block or a resize handle —
    // those sit as descendants of the track and have their own handlers.
    // Empty-area presses target the track itself.
    if (e.target !== e.currentTarget) return
    e.preventDefault()
    const day = pointerToDay(e.clientX)
    setDrag({ startDay: day, endDay: day })
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* noop */ }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    // Both create-drag and resize-drag funnel their move through the track
    // since the track owns the pointer capture in both cases.
    if (drag) {
      const day = pointerToDay(e.clientX)
      setDrag(prev => (prev && prev.endDay !== day) ? { ...prev, endDay: day } : prev)
      return
    }
    if (resize) {
      const day = pointerToDay(e.clientX)
      setResize(prev => {
        if (!prev) return prev
        if (prev.edge === 'start') {
          // Clamp to ≤ newEnd so the block can't flip inside-out.
          const next = Math.min(day, prev.newEnd)
          return next === prev.newStart ? prev : { ...prev, newStart: next }
        } else {
          const next = Math.max(day, prev.newStart)
          return next === prev.newEnd ? prev : { ...prev, newEnd: next }
        }
      })
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (drag) {
      const { startDay, endDay } = drag
      setDrag(null)
      try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ }
      void commitVacation(row.member.id, startDay, endDay, row.member.display_name)
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

  // Resize-handle pointerdown — kicks off a resize and steals capture to
  // the track so subsequent move/up flow through the same handlers.
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
      oldStart: block.startDay,
      oldEnd: block.endDay,
      newStart: block.startDay,
      newEnd: block.endDay,
    })
    // Capture on the track (not the handle) — handlePointerMove/Up live
    // there and need the events even if the pointer leaves the handle.
    try { trackRef.current?.setPointerCapture(e.pointerId) } catch { /* noop */ }
  }

  const ghostLo = drag ? Math.min(drag.startDay, drag.endDay) : 0
  const ghostHi = drag ? Math.max(drag.startDay, drag.endDay) : 0
  const ghostDays = drag ? ghostHi - ghostLo + 1 : 0
  const ghostLeft = drag ? dayPct(ghostLo) : 0
  const ghostWidth = drag ? Math.max(dayPct(ghostHi - ghostLo + 1), 1.4) : 0

  return (
    <motion.div
      className="grid items-center group"
      style={{
        gridTemplateColumns: `${NAME_COL} 1fr`,
        height: ROW_H,
        opacity: hasVacation ? 1 : 0.55,
      }}
      initial={reduce ? { opacity: hasVacation ? 1 : 0.55 } : { opacity: 0, x: -8 }}
      animate={{ opacity: hasVacation ? 1 : 0.55, x: 0 }}
      transition={reduce ? { duration: 0 } : { delay: 0.04 + idx * 0.025, duration: 0.45, ease: ease.horizon }}
    >
      {/* Name col */}
      <div className="flex items-center gap-2.5 pr-3 min-w-0">
        <MemberAvatar
          name={row.member.display_name}
          initials={row.member.initials}
          avatarUrl={row.member.avatar_url}
          size="sm"
        />
        <div className="min-w-0">
          <div
            className="truncate text-[13px] font-medium flex items-center gap-1"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
          >
            <span className="truncate">{row.member.display_name}</span>
            {isSelf && (
              <span
                aria-hidden
                className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.12em] px-1 py-px rounded"
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
              className="text-[10.5px] font-medium tabular-nums"
              style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)', letterSpacing: '0.04em' }}
            >
              {row.totalDays}{' '}{row.totalDays === 1 ? t.summer.dayOne : t.summer.dayMany}
            </div>
          )}
        </div>
      </div>

      {/* Bars track — also the drag-create surface when editable. */}
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
        {row.blocks.map((b, i) => {
          // During an active resize on this block, mirror the in-flight
          // edges so the bar visibly stretches/contracts under the cursor.
          // Other blocks render as normal.
          const isResizingThis = resize?.blockIdx === i
          const renderStart = isResizingThis ? resize.newStart : b.startDay
          const renderEnd = isResizingThis ? resize.newEnd : b.endDay
          const left = dayPct(renderStart)
          // Inclusive width: span = endDay - startDay + 1
          const width = Math.max(dayPct(renderEnd - renderStart + 1), 1.4)
          const days = renderEnd - renderStart + 1
          const labelStartDate = isResizingThis ? addDays(b.startDate, renderStart - b.startDay) : b.startDate
          const labelEndDate = isResizingThis ? addDays(b.endDate, renderEnd - b.endDay) : b.endDate
          const dateRange = formatBlockRange(labelStartDate, labelEndDate, t)
          const tooltip = b.locationLabel
            ? `${dateRange} · ${b.locationLabel}`
            : dateRange
          return (
            <motion.div
              key={i}
              className="absolute top-1/2 -translate-y-1/2 rounded-full overflow-hidden"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                height: 30,
                background: `linear-gradient(180deg, ${barGradient[0]}, ${barGradient[1]})`,
                boxShadow: isResizingThis
                  ? `0 6px 20px ${hexToRgba(barGlow, 0.55)}, 0 0 0 1px ${hexToRgba(barGlow, 0.5)} inset, inset 0 1px 0 rgba(255,255,255,0.45)`
                  : `0 4px 14px ${hexToRgba(barGlow, 0.32)}, 0 0 0 1px ${hexToRgba(barGlow, 0.18)} inset, inset 0 1px 0 ${isLight ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.10)'}`,
              }}
              initial={reduce ? false : { scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={reduce ? { duration: 0 } : { delay: 0.18 + i * 0.05, duration: 0.55, ease: ease.horizon }}
              title={tooltip}
            >
              {/* Sun shimmer overlay */}
              {!reduce && (
                <motion.div
                  aria-hidden
                  className="absolute inset-y-0 w-1/3 pointer-events-none"
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)',
                    mixBlendMode: 'overlay',
                  }}
                  initial={{ x: '-120%' }}
                  animate={{ x: '380%' }}
                  transition={{
                    duration: 7 + (i % 3) * 1.3,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: 1 + i * 0.6,
                  }}
                />
              )}
              {/* Inner label — only when block is wide enough */}
              {width > 7 && (
                <div
                  className="relative h-full flex items-center justify-between px-3 text-[11px] font-semibold whitespace-nowrap"
                  style={{
                    color: isLight ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.92)',
                    textShadow: '0 1px 2px rgba(0,0,0,0.18)',
                    fontFamily: 'var(--font-body)',
                    letterSpacing: '0.01em',
                  }}
                >
                  <span className="truncate">{formatBlockShort(labelStartDate, labelEndDate, t)}</span>
                  <span className="ml-2 tabular-nums opacity-90">{days}d</span>
                </div>
              )}

              {/* Resize handles — invisible 10px hitboxes on each edge,
                  only when the block is editable. The thin glow lines on
                  hover are the visible affordance. */}
              {editable && (
                <>
                  <div
                    role="presentation"
                    className="absolute top-0 bottom-0 left-0 z-10 group/handle"
                    style={{ width: 10, cursor: 'ew-resize', touchAction: 'none' }}
                    onPointerDown={(e) => startResize(e, i, 'start')}
                    title={t.summer.resizeHint}
                  >
                    <span
                      aria-hidden
                      className="absolute top-1/2 -translate-y-1/2 left-1 w-[3px] h-3.5 rounded-full opacity-0 group-hover/handle:opacity-100 transition-opacity"
                      style={{ background: 'rgba(255,255,255,0.85)' }}
                    />
                  </div>
                  <div
                    role="presentation"
                    className="absolute top-0 bottom-0 right-0 z-10 group/handle"
                    style={{ width: 10, cursor: 'ew-resize', touchAction: 'none' }}
                    onPointerDown={(e) => startResize(e, i, 'end')}
                    title={t.summer.resizeHint}
                  >
                    <span
                      aria-hidden
                      className="absolute top-1/2 -translate-y-1/2 right-1 w-[3px] h-3.5 rounded-full opacity-0 group-hover/handle:opacity-100 transition-opacity"
                      style={{ background: 'rgba(255,255,255,0.85)' }}
                    />
                  </div>
                </>
              )}
            </motion.div>
          )
        })}

        {/* Drag-create ghost — pointer-events:none so it doesn't fight the
            pointermove on the track underneath. Renders only while a drag
            is in progress. */}
        {drag && (
          <div
            className="absolute top-1/2 -translate-y-1/2 rounded-full pointer-events-none overflow-hidden"
            style={{
              left: `${ghostLeft}%`,
              width: `${ghostWidth}%`,
              height: 30,
              background: `linear-gradient(180deg, ${barGradient[0]}, ${barGradient[1]})`,
              boxShadow: `0 6px 18px ${hexToRgba(barGlow, 0.5)}, 0 0 0 1px ${hexToRgba(barGlow, 0.55)} inset, inset 0 1px 0 rgba(255,255,255,0.4)`,
              opacity: 0.92,
            }}
          >
            <div
              className="relative h-full flex items-center justify-center text-[11px] font-semibold whitespace-nowrap"
              style={{
                color: isLight ? 'rgba(255,255,255,0.98)' : 'rgba(255,255,255,0.95)',
                textShadow: '0 1px 2px rgba(0,0,0,0.22)',
                fontFamily: 'var(--font-body)',
                letterSpacing: '0.01em',
              }}
            >
              {ghostDays}{' '}{ghostDays === 1 ? t.summer.dayOne : t.summer.dayMany}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}

function Coverage({
  coverage, totalActiveMembers, peak, peakLabel, dayPct, weekTicks, t,
}: {
  coverage: number[]
  totalActiveMembers: number
  peak: number
  peakLabel: string | null
  dayPct: (n: number) => number
  weekTicks: { dayOffset: number; weekNo: number }[]
  t: ReturnType<typeof useT>
}) {
  const totalDays = coverage.length
  const max = Math.max(peak, Math.max(1, Math.round(totalActiveMembers * 0.35)))
  // Build a smooth area path
  const areaPath = useMemo(() => {
    if (totalDays === 0) return ''
    const w = 1000
    const h = 100
    const stepX = w / (totalDays - 1 || 1)
    const points = coverage.map((v, i) => {
      const x = i * stepX
      const y = h - (v / max) * h
      return [x, y] as const
    })
    let d = `M 0 ${h} L ${points[0][0]} ${points[0][1]}`
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1]
      const [x1, y1] = points[i]
      const cx = (x0 + x1) / 2
      d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`
    }
    d += ` L ${points[points.length - 1][0]} ${h} Z`
    return d
  }, [coverage, max, totalDays])

  const linePath = useMemo(() => {
    if (totalDays === 0) return ''
    const w = 1000
    const h = 100
    const stepX = w / (totalDays - 1 || 1)
    const points = coverage.map((v, i) => {
      const x = i * stepX
      const y = h - (v / max) * h
      return [x, y] as const
    })
    let d = `M ${points[0][0]} ${points[0][1]}`
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1]
      const [x1, y1] = points[i]
      const cx = (x0 + x1) / 2
      d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`
    }
    return d
  }, [coverage, max, totalDays])

  return (
    <div
      className="relative grid"
      style={{
        gridTemplateColumns: `${NAME_COL} 1fr`,
        padding: '18px 24px 22px 18px',
        borderTop: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
        background: 'color-mix(in oklab, var(--bg-subtle) 38%, transparent)',
      }}
    >
      <div className="pr-3">
        <div
          className="text-[10.5px] font-semibold uppercase tracking-[0.22em]"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
        >
          {t.summer.coverageLabel}
        </div>
        <div
          className="mt-1 text-[12px]"
          style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
        >
          {peak === 0
            ? t.summer.coverageNone
            : t.summer.coveragePeak
                .replace('{n}', String(peak))
                .replace('{date}', peakLabel ?? '')}
        </div>
      </div>

      <div className="relative" style={{ height: 76 }}>
        <svg
          viewBox="0 0 1000 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
          aria-hidden
        >
          <defs>
            <linearGradient id="summer-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ember-glow)" stopOpacity="0.55" />
              <stop offset="100%" stopColor="var(--ember-glow)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {areaPath && <path d={areaPath} fill="url(#summer-area)" />}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="var(--ember-soft)"
              strokeWidth="1.4"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {/* Week guides */}
        {weekTicks.map((tick) => (
          <div
            key={tick.weekNo}
            className="absolute top-0 bottom-0"
            style={{
              left: `${dayPct(tick.dayOffset)}%`,
              width: '1px',
              background: 'color-mix(in oklab, var(--border-subtle) 50%, transparent)',
              opacity: 0.4,
            }}
          />
        ))}
      </div>
    </div>
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

function formatBlockShort(start: Date, end: Date, t: ReturnType<typeof useT>): string {
  // For inside-bar labels: "uke 28" reads cleaner than full dates when the
  // span aligns with an ISO week. Otherwise fall back to date range.
  const startWeek = getISOWeek(start)
  const endWeek = getISOWeek(end)
  const span = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  if (start.getDay() === 1 && (end.getDay() === 0 || end.getDay() === 5) && startWeek === endWeek) {
    return `${t.summer.weekShort}${startWeek}`
  }
  if (startWeek !== endWeek && span >= 6) {
    return `${t.summer.weekShort}${startWeek}–${endWeek}`
  }
  return formatBlockRange(start, end, t)
}
