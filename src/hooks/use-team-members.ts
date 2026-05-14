'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Member } from '@/lib/supabase/types'
import { useDocumentVisibility } from '@/hooks/use-document-visibility'

const MILESTONES = new Set([1, 5, 10, 15, 20, 25, 30, 35, 40])

type MemberSlim = Pick<Member,
  | 'id' | 'org_id' | 'display_name' | 'full_name' | 'initials' | 'avatar_url'
  | 'birth_date' | 'start_date' | 'birthday_visible' | 'anniversary_visible'
  | 'is_active' | 'hidden_from_overview'
>

const SELECT = 'id, org_id, display_name, full_name, initials, avatar_url, birth_date, start_date, birthday_visible, anniversary_visible, is_active, hidden_from_overview'

export type DerivedBirthday = {
  member: MemberSlim
  /** Local Date for the next occurrence (this year or next). */
  nextDate: Date
  /** Whole days from start of today to start of nextDate. 0 = today. */
  daysUntil: number
  /** How old they will be on `nextDate`. Null if birth year unknown/invalid. */
  ageOnDate: number | null
  /** True when Feb 29 was clamped to Feb 28 in a non-leap year. */
  clampedLeapDay: boolean
}

export type DerivedAnniversary = {
  member: MemberSlim
  nextDate: Date
  daysUntil: number
  /** Years they will reach on `nextDate`. */
  yearsOnDate: number
  /** Whole years already completed (for the wheel pin label). */
  completedYears: number
  isMilestone: boolean
  startDate: Date
  clampedLeapDay: boolean
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function diffDays(from: Date, to: Date): number {
  const a = startOfDay(from).getTime()
  const b = startOfDay(to).getTime()
  return Math.round((b - a) / 86400000)
}

function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.slice(0, 10))
  if (!m) return null
  const y = Number(m[1]); const mo = Number(m[2]) - 1; const d = Number(m[3])
  return new Date(y, mo, d, 12, 0, 0)
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

function nextOccurrence(month: number, day: number, today: Date): {
  date: Date
  clampedLeapDay: boolean
} {
  const todayKey = startOfDay(today)
  const tryYear = (y: number) => {
    const m = month
    let d = day
    let clampedLeapDay = false
    if (m === 1 && d === 29 && !isLeapYear(y)) {
      d = 28
      clampedLeapDay = true
    }
    return { date: new Date(y, m, d, 12, 0, 0), clampedLeapDay }
  }
  const thisYear = tryYear(today.getFullYear())
  if (startOfDay(thisYear.date).getTime() >= todayKey.getTime()) return thisYear
  return tryYear(today.getFullYear() + 1)
}

/**
 * Accepts a single orgId or an array — combined "Alle" view passes
 * multiple ids so the wheel/timeline aggregates across every workspace
 * the user belongs to. Single-string callers stay source-compatible.
 */
export function useTeamMembers(
  orgIdOrIds: string | string[],
  opts: { initial?: MemberSlim[] } = {},
) {
  const orgIds = useMemo(
    () => (Array.isArray(orgIdOrIds) ? orgIdOrIds : [orgIdOrIds]),
    [orgIdOrIds],
  )
  // Stable key for deps so [a,b] vs new array with same contents doesn't
  // refetch. Sorted to make order-insensitive.
  const orgIdsKey = useMemo(() => [...orgIds].sort().join(','), [orgIds])

  // SSR seed lets the hook hydrate straight into populated state — no
  // empty-then-data flash on cold load. We only honour the seed on first
  // mount; after that any orgIds change (workspace switch) forces a fresh
  // fetch.
  const [members, setMembers] = useState<MemberSlim[]>(opts.initial ?? [])
  const [loading, setLoading] = useState(opts.initial === undefined)
  const visible = useDocumentVisibility()
  const wasHiddenRef = useRef(false)
  const seedConsumed = useRef(opts.initial === undefined)

  // Re-derive at midnight: a key that changes once per local day.
  const [todayKey, setTodayKey] = useState(() => startOfDay(new Date()).toISOString())
  useEffect(() => {
    const tick = () => setTodayKey(startOfDay(new Date()).toISOString())
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [])

  const orgIdsSet = useMemo(() => new Set(orgIds), [orgIds])

  const fetchMembers = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('members')
      .select(SELECT)
      .in('org_id', orgIds)
      .eq('is_active', true)
      .eq('hidden_from_overview', false)
      .order('display_name')
    setMembers((data as MemberSlim[]) ?? [])
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgIdsKey])

  useEffect(() => {
    if (!seedConsumed.current) {
      // First mount with SSR seed — keep what's in state, just open the
      // realtime channel below.
      seedConsumed.current = true
      setLoading(false)
      return
    }
    setLoading(true)
    fetchMembers()
  }, [fetchMembers])

  useEffect(() => {
    if (!visible) {
      wasHiddenRef.current = true
      return
    }
    const supabase = createClient()

    function upsertHandler(payload: { new: MemberSlim }) {
      const upserted = payload.new
      if (!orgIdsSet.has(upserted.org_id)) return
      if (!upserted.is_active || upserted.hidden_from_overview) {
        setMembers(prev => prev.filter(m => m.id !== upserted.id))
        return
      }
      setMembers(prev => {
        const without = prev.filter(m => m.id !== upserted.id)
        const next = [...without, upserted]
        next.sort((a, b) => a.display_name.localeCompare(b.display_name))
        return next
      })
    }

    // One channel per org so combined view receives realtime from every
    // side — mirrors the entries hook.
    const channels = orgIds.map((id) =>
      supabase
        .channel(`members:org:${id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'members', filter: `org_id=eq.${id}` }, upsertHandler)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'members', filter: `org_id=eq.${id}` }, upsertHandler)
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'members' }, (payload) => {
          const deletedId = (payload.old as Partial<MemberSlim>)?.id
          if (!deletedId) return
          setMembers(prev => prev.filter(m => m.id !== deletedId))
        })
        .subscribe(),
    )

    if (wasHiddenRef.current) {
      wasHiddenRef.current = false
      fetchMembers()
    }

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgIdsKey, visible, fetchMembers])

  const derived = useMemo(() => {
    const today = new Date(todayKey)

    const birthdays: DerivedBirthday[] = []
    for (const m of members) {
      if (!m.birthday_visible || !m.birth_date) continue
      const birth = parseYmd(m.birth_date)
      if (!birth) continue
      const occ = nextOccurrence(birth.getMonth(), birth.getDate(), today)
      const days = diffDays(today, occ.date)
      const age = occ.date.getFullYear() - birth.getFullYear()
      birthdays.push({
        member: m,
        nextDate: occ.date,
        daysUntil: days,
        ageOnDate: Number.isFinite(age) ? age : null,
        clampedLeapDay: occ.clampedLeapDay,
      })
    }
    birthdays.sort((a, b) => a.daysUntil - b.daysUntil)

    const anniversaries: DerivedAnniversary[] = []
    const upcomingHires: { member: MemberSlim; startDate: Date; daysUntil: number }[] = []
    for (const m of members) {
      if (m.anniversary_visible === false || !m.start_date) continue
      const start = parseYmd(m.start_date)
      if (!start) continue
      if (start.getTime() > today.getTime()) {
        upcomingHires.push({
          member: m,
          startDate: start,
          daysUntil: diffDays(today, start),
        })
        continue
      }
      const occ = nextOccurrence(start.getMonth(), start.getDate(), today)
      const days = diffDays(today, occ.date)
      const yearsOnDate = occ.date.getFullYear() - start.getFullYear()
      // Completed years today: floor difference excluding partial year.
      const yearDelta = today.getFullYear() - start.getFullYear()
      const beforeAnniversaryThisYear =
        today.getMonth() < start.getMonth() ||
        (today.getMonth() === start.getMonth() && today.getDate() < start.getDate())
      const completedYears = Math.max(0, yearDelta - (beforeAnniversaryThisYear ? 1 : 0))
      anniversaries.push({
        member: m,
        nextDate: occ.date,
        daysUntil: days,
        yearsOnDate,
        completedYears,
        isMilestone: MILESTONES.has(yearsOnDate),
        startDate: start,
        clampedLeapDay: occ.clampedLeapDay,
      })
    }
    anniversaries.sort((a, b) => a.daysUntil - b.daysUntil)
    upcomingHires.sort((a, b) => a.daysUntil - b.daysUntil)

    const visibleBirthdayCount = birthdays.length
    const visibleAnniversaryCount = anniversaries.length

    const nextBirthday = birthdays[0] ?? null
    const nextAnniversary = anniversaries[0] ?? null

    // Tenure ranking for the timeline view (descending).
    const tenureRanked = anniversaries
      .slice()
      .sort((a, b) => b.completedYears - a.completedYears
        || a.startDate.getTime() - b.startDate.getTime())

    return {
      birthdays,
      anniversaries,
      upcomingHires,
      nextBirthday,
      nextAnniversary,
      visibleBirthdayCount,
      visibleAnniversaryCount,
      tenureRanked,
      today,
    }
  }, [members, todayKey])

  return { ...derived, members, loading }
}

export type { MemberSlim }
