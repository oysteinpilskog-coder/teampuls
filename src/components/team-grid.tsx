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
import dynamic from 'next/dynamic'
// CellEditor is a 558-line modal that's invisible until a cell is clicked.
// Lazy-loading drops ~50-100 KB from the home page's first-load JS.
const CellEditor = dynamic(
  () => import('@/components/cell-editor').then(m => ({ default: m.CellEditor })),
  { ssr: false }
)
import { spring } from '@/lib/motion'
import { useEntries, dispatchEntriesChanged } from '@/hooks/use-entries'
import { useT } from '@/lib/i18n/context'
import type { Dictionary } from '@/lib/i18n/types'
import type { Entry, EntryStatus, PresenceAssumption, WorkspaceSummary } from '@/lib/supabase/types'
import { WorkspaceBadge } from '@/components/workspace-switcher'
import { CountryBadge } from '@/components/country-badge'
import { inferStatus } from '@/lib/presence'
import {
  getHolidayFromMap,
  getHolidaysFromMapForCountries,
  flagFor,
  memberCountryCode,
  type CountryCode,
  type HolidayMap,
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
  // Dates (YYYY-MM-DD) der medlemmets land har offisiell helligdag. På slike
  // dager skal ikke org-antakelsen tegne en «kontor»-pille — kun ekte
  // (overstyrte) entries vises. Tom Set når landet ikke støttes.
  holidayDates: Set<string>,
): RowSegment[] {
  const segments: RowSegment[] = []
  let i = 0
  // Local wrapper — avoids recomputing the assumption on every iteration.
  const inferred = (entry: Entry | null, dateStr: string) => {
    if (entry) return null
    if (holidayDates.has(dateStr)) return null
    return inferStatus({ default_status: memberDefaultStatus }, assumption)
  }

  while (i < weekDays.length) {
    const startDate = toDateString(weekDays[i])
    const startEntry = entryMap.get(`${memberId}_${startDate}`) ?? null
    const startAssumed = inferred(startEntry, startDate)
    let j = i + 1
    while (j < weekDays.length) {
      const nextDate = toDateString(weekDays[j])
      const nextEntry = entryMap.get(`${memberId}_${nextDate}`) ?? null
      const nextAssumed = inferred(nextEntry, nextDate)
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

// Render-rad for matrise-kroppen: enten en medlemsrad eller et tynt
// org-skille mellom organisasjoner i kombinert visning. Holder rowIdx
// for medlems-radene så animasjons-staggeren holder seg jevn — skillene
// teller ikke som en rad.
type GridRow =
  | { kind: 'member'; member: Member; rowIdx: number }
  | { kind: 'divider'; key: string }

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
  /** All workspaces the user belongs to. Used in combined view to render
   *  per-row org badges and the workspace filter pill row. */
  workspaces?: WorkspaceSummary[]
  /** When true: render org badge per member row + filter pill row, and
   *  read members from multiple workspaces. */
  combinedView?: boolean
  /** Optional — when set, only entries whose status is in the list are
   *  visible. Used by /sommer (statusFilter=['vacation']) to reuse this
   *  matrix as a focused vacation surface. When active we also force
   *  presence inference off and always show every member, since the
   *  meaning of an "empty" cell shifts from "unregistered" to
   *  "not on vacation that day". */
  statusFilter?: EntryStatus[]
  /** Server-precomputed holiday map (3-year window × NO/SE/LT/GB). Lets us
   *  render holiday treatment without bundling `date-holidays` + moment on
   *  the client. */
  holidays?: HolidayMap
}

// Tom holidays-Set som returneres for medlemmer hvis land ikke er støttet.
// Stabil referanse så useMemo-keys og buildRowSegments-merge-logikken ikke
// får nye Set-instanser per render.
const EMPTY_DATE_SET: Set<string> = new Set()

// Shared grid template — single source of truth for the four call sites
// (header row, member row, skeleton row). Width is fixed at 136 px because
// the matrix's decorative overlays (today chord, weekend shading, column
// dividers) are positioned via inline calc() that bakes in 136 + paddings.
// On narrow viewports the matrix card has min-w-[640px] + overflow-x-auto,
// so phones get horizontal scroll instead of squashed cells.
const GRID_COLS = '136px repeat(5, 1fr)'

// Tynt skille mellom organisasjons-grupper i kombinert visning. Ingen
// label — workspace-badgen lever per rad og forteller allerede hvilken
// org du ser på. Hairline-en bruker samme soft divider-token som
// kolonne-skiller i matrisa, så all skille-grafikk i kortet snakker
// samme språk.
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
      style={{ gridTemplateColumns: GRID_COLS }}
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
  workspaces,
  combinedView = false,
  statusFilter,
  holidays,
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
  const { entries: rawEntries, loading: entriesLoading, refetch, applyOptimistic } = useEntries(
    combinedView && workspaces && workspaces.length > 0
      ? workspaces.map((w) => w.org_id)
      : orgId,
    dateStrings,
    ssrEntriesMatchWeek ? { initial: initialEntries } : {},
  )
  const loading = membersLoading || entriesLoading

  // When the host scopes us to a subset of statuses (e.g. /sommer →
  // vacation only), drop everything else BEFORE downstream consumers see
  // the data. The drag/edit handlers still write whatever status the user
  // picks — we only filter what's *displayed*.
  const entries = useMemo(() => {
    if (!statusFilter || statusFilter.length === 0) return rawEntries
    const allowed = new Set(statusFilter)
    return rawEntries.filter((e) => allowed.has(e.status))
  }, [rawEntries, statusFilter])

  // Build entry lookup: member_id + date → Entry
  const entryMap = useMemo(() => {
    const map = new Map<string, typeof entries[number]>()
    entries.forEach((e) => map.set(`${e.member_id}_${e.date}`, e))
    return map
  }, [entries])

  // Distinct location labels from the entries we already hold in memory —
  // CellEditor renders these as `<datalist>` autocomplete suggestions. Doing
  // it here means opening the editor doesn't fire a separate `select(...)`
  // round-trip on every click, which used to add ~50–200 ms of perceived
  // latency before the suggestions populated.
  const locationSuggestions = useMemo(() => {
    const set = new Set<string>()
    for (const e of rawEntries) {
      const v = e.location_label?.trim()
      if (v) set.add(v)
    }
    return Array.from(set).sort()
  }, [rawEntries])

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

  // Workspace filter pills — null = "Alle", otherwise an org_id from the
  // workspaces list. Only meaningful in combinedView; reset to null when
  // the user leaves the combined surface.
  const [orgFilter, setOrgFilter] = useState<string | null>(null)

  // Only show members that have at least one entry in the visible week —
  // unless the org opted into an assumption, in which case every active
  // member gets a row (their empty days render as assumed segments).
  // In combined view we then narrow further by the orgFilter pill.
  //
  // gridRows er den endelige render-listen: medlemsrader interleavet med
  // tynne skille-rader mellom organisasjoner i kombinert visning. Single-
  // workspace og filtrert kombinert visning får ingen skiller — der er
  // det bare én gruppe.
  // When the matrix is scoped to a status (e.g. /sommer = vacation),
  // every member should keep their row regardless of whether they have a
  // registered vacation that week — empty cells convey "not on vacation",
  // which is itself useful info. Without this override, a quiet week
  // would render as an empty matrix.
  const keepAllMembers = !!statusFilter && statusFilter.length > 0

  const { visibleMembers, gridRows } = useMemo(() => {
    let pool = members
    if (presenceAssumption === 'none' && !keepAllMembers) {
      const memberIdsWithEntries = new Set(entries.map((e) => e.member_id))
      pool = members.filter((m) => memberIdsWithEntries.has(m.id))
    }
    if (combinedView && orgFilter) {
      pool = pool.filter((m) => m.org_id === orgFilter)
    }

    // Kombinert visning uten aktivt filter: grupper etter org. UK-org
    // (country_code='GB') havner alltid nederst; resten sorteres
    // alfabetisk på workspace-navn. Skiller settes inn mellom hver
    // org-gruppe så «Alle CalWin» leses som blokker, ikke ett blandet
    // alfabet.
    if (combinedView && !orgFilter && workspaces && workspaces.length > 1) {
      const ukOrgIds = new Set(
        workspaces
          .filter((w) => w.country_code === 'GB')
          .map((w) => w.org_id),
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
      const sorted = pool
        .map((m, idx) => ({ m, idx, rank: orgRank.get(m.org_id) ?? 999 }))
        .sort((a, b) => a.rank - b.rank || a.idx - b.idx)
        .map(({ m }) => m)
      const rows: GridRow[] = []
      let lastOrg: string | null = null
      let memberIdx = 0
      for (const m of sorted) {
        if (lastOrg !== null && m.org_id !== lastOrg) {
          rows.push({ kind: 'divider', key: `divider-${m.org_id}` })
        }
        rows.push({ kind: 'member', member: m, rowIdx: memberIdx++ })
        lastOrg = m.org_id
      }
      return { visibleMembers: sorted, gridRows: rows }
    }

    // Single-workspace (eller filtrert kombinert visning): UK-medlemmer
    // (home office GB) sorteres alltid nederst. Stabil sort bevarer
    // alfabetisk rekkefølge fra .order('display_name') innenfor hver
    // gruppe. Ingen skiller — alt er én gruppe her.
    const ukOfficeIds = new Set(
      offices.filter((o) => o.country_code === 'GB').map((o) => o.id),
    )
    const isUK = (m: Member) =>
      !!m.home_office_id && ukOfficeIds.has(m.home_office_id)
    const sorted = [...pool].sort((a, b) => Number(isUK(a)) - Number(isUK(b)))
    const rows: GridRow[] = sorted.map((m, i) => ({
      kind: 'member',
      member: m,
      rowIdx: i,
    }))
    return { visibleMembers: sorted, gridRows: rows }
  }, [members, entries, presenceAssumption, keepAllMembers, combinedView, orgFilter, offices, workspaces])

  // Per-workspace member counts for the filter pills.
  const memberCountsByOrg = useMemo(() => {
    const map = new Map<string, number>()
    members.forEach((m) => {
      map.set(m.org_id, (map.get(m.org_id) ?? 0) + 1)
    })
    return map
  }, [members])

  // Workspace lookup keyed by org_id — used for the org-chip rendered
  // after each member's display name in combined view.
  const workspaceByOrgId = useMemo(() => {
    const map = new Map<string, WorkspaceSummary>()
    if (workspaces) {
      workspaces.forEach((w) => map.set(w.org_id, w))
    }
    return map
  }, [workspaces])

  // Fetch supporting data once. When SSR has already seeded `members` we
  // skip the members query and only fetch the things SSR didn't provide
  // (offices for the hover card + the org's presence-assumption setting),
  // saving one round trip on every cold load of the home page.
  // Combined view broadens the scope to every workspace the user
  // belongs to. We pre-compute the org_id list so the fetch query
  // can swap eq() for in() in one place.
  const scopedOrgIds = useMemo(
    () => (combinedView && workspaces && workspaces.length > 0
      ? workspaces.map((w) => w.org_id)
      : [orgId]),
    [combinedView, workspaces, orgId],
  )

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
          .in('org_id', scopedOrgIds)
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
        .in('org_id', scopedOrgIds)
        .eq('is_active', true)
        .eq('hidden_from_overview', false)
        .order('display_name'),
      supabase
        .from('offices')
        .select('*')
        .in('org_id', scopedOrgIds)
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
  }, [orgId, scopedOrgIds])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  // Office lookup by id — cheap and stable across renders.
  const officeById = useMemo(() => {
    const map = new Map<string, Office>()
    offices.forEach((o) => map.set(o.id, o))
    return map
  }, [offices])

  // Countries we always probe for the day-header. Filtering down to
  // "countries with active members" sounds clever but breaks the day-
  // header signal: if no UK member is in the office data yet, a UK
  // bank holiday becomes invisible. Surfacing all four CalWin offices
  // is genuinely useful info — a Norwegian planning a Vilnius meeting
  // wants to see LT holidays even before any LT member exists in the
  // member list. Per-cell corner-stripes still only render on real
  // members, so we don't add noise to rows that aren't there.
  const activeCountries = useMemo<CountryCode[]>(
    () => ['NO', 'SE', 'LT', 'GB'],
    [],
  )

  // Pre-compute holiday data for the visible week. NO drives the column-wide
  // red treatment + inline name; the per-country map drives the tooltip and
  // the SE/LT/GB header badges shown only on dates where NO has no holiday.
  const weekHolidays = useMemo(() => {
    return weekDays.map((date) => ({
      date,
      no: getHolidayFromMap(holidays, date, 'NO'),
      byCountry: getHolidaysFromMapForCountries(holidays, date, activeCountries),
    }))
  }, [weekDays, activeCountries, holidays])

  // For hver medlems land: hvilke datoer i den synlige uka er helligdager?
  // Brukes til å undertrykke org-antakelsen («kontor», «hjemme», eller
  // per_member-default) på røde dager — kun ekte overstyringer skal vises.
  // Workspace-fallback dekker medlemmer uten hjemmekontor i combined view;
  // single-workspace uten kontor på medlemmet får tom Set (ingen suppress).
  const workspaceCountryByOrgId = useMemo(() => {
    const map = new Map<string, string | null>()
    if (workspaces) {
      workspaces.forEach((w) => map.set(w.org_id, w.country_code))
    }
    return map
  }, [workspaces])

  const memberHolidayDates = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const m of members) {
      const cc = memberCountryCode(
        m.home_office_id,
        officeById,
        workspaceCountryByOrgId.get(m.org_id) ?? null,
      )
      const dates = new Set<string>()
      if (cc) {
        for (const d of weekDays) {
          if (getHolidayFromMap(holidays, d, cc)) dates.add(toDateString(d))
        }
      }
      map.set(m.id, dates)
    }
    return map
  }, [members, officeById, workspaceCountryByOrgId, weekDays, holidays])

  function holidayDatesFor(memberId: string): Set<string> {
    return memberHolidayDates.get(memberId) ?? EMPTY_DATE_SET
  }

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

        const { data: written, error: upErr } = await supabase
          .from('entries')
          .upsert(rows, { onConflict: 'org_id,member_id,date' })
          .select()
        if (upErr) {
          toast.error('Kunne ikke endre datoområdet')
          await refetch() // restore server truth
          return
        }
        let deletedIds: string[] = []
        const toDelete = origDates.filter((d) => !newDates.includes(d))
        if (toDelete.length > 0) {
          const { data: del } = await supabase
            .from('entries')
            .delete()
            .eq('org_id', orgId)
            .eq('member_id', rz.memberId)
            .in('date', toDelete)
            .select('id')
          deletedIds = (del ?? []).map((r: { id: string }) => r.id)
        }
        // Pass the canonical rows so consumers (incl. our own hook) replace
        // the synthesized "optimistic-…" entries with the server's truth in
        // a single render — no second `select('*')` round-trip.
        dispatchEntriesChanged({ upserted: (written ?? []) as Entry[], deletedIds })
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

        const { data: written, error: upErr } = await supabase
          .from('entries')
          .upsert(rows, { onConflict: 'org_id,member_id,date' })
          .select()
        if (upErr) {
          toast.error('Kunne ikke flytte oppføringen')
          await refetch()
          return
        }
        let deletedIds: string[] = []
        const toDelete = srcDates.filter((d) => !dstDates.includes(d))
        if (toDelete.length > 0) {
          const { data: del } = await supabase
            .from('entries')
            .delete()
            .eq('org_id', orgId)
            .eq('member_id', mv.memberId)
            .in('date', toDelete)
            .select('id')
          deletedIds = (del ?? []).map((r: { id: string }) => r.id)
        }
        dispatchEntriesChanged({ upserted: (written ?? []) as Entry[], deletedIds })
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
      const segments = buildRowSegments(
        weekDays,
        memberId,
        entryMap,
        t,
        memberDefault,
        presenceAssumption,
        holidayDatesFor(memberId),
      )
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
      // Helligdag i medlemmets land → ingen antatt status. «Akkurat nå»
      // skal kun vise folk som faktisk har overstyrt dagen (ferie, kunde
      // o.l.) — ikke org-antakelsen.
      const holidayToday = holidayDatesFor(m.id).has(todayStr)
      const assumed = holidayToday
        ? null
        : inferStatus(
            { default_status: m.default_status },
            presenceAssumption,
          )
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

      {/* Matrix — dark liquid glass panel.
          On small screens the matrix needs more horizontal room than a phone
          can give it (the calc-driven column geometry assumes ~640px+), so we
          wrap it in a horizontal scroll container that bleeds to the page
          edges. ≥ sm we collapse to natural width. */}
      <div className="-mx-3 sm:mx-0 px-3 sm:px-0 overflow-x-auto sm:overflow-visible" style={{ WebkitOverflowScrolling: 'touch' }}>
      <div
        className="relative rounded-2xl overflow-hidden min-w-[640px] sm:min-w-0"
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
                    ? 'color-mix(in oklab, var(--lg-accent) 22%, transparent)'
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
                // Vertikal Nordlys-tråd — fades ved kantene så den ikke
                // klipper hardt mot toppbar/bunn. Bruker tokens slik at
                // per-org brand-pair restainer hele linjen i ett.
                background:
                  'linear-gradient(180deg, transparent 0%, var(--nordlys-a) 20%, var(--nordlys-b) 50%, var(--nordlys-c) 80%, transparent 100%)',
                boxShadow:
                  '0 0 12px color-mix(in oklab, var(--nordlys-b) 45%, transparent), 0 0 24px color-mix(in oklab, var(--nordlys-a) 22%, transparent)',
              }}
            />
          )
        })()}

        {/* Workspace filter pills — combined view only. The "Alle" pill
            shows everyone; per-workspace pills filter the matrix down to
            members of one CalWin entity. Pure client state — does not
            change the cookie or the active workspace. */}
        {combinedView && workspaces && workspaces.length >= 2 && (
          <div
            className="px-4 pt-3 flex items-center gap-1.5 flex-wrap"
            style={{ borderBottom: '1px solid var(--lg-divider-soft)' }}
          >
            <FilterPill
              active={orgFilter === null}
              onClick={() => setOrgFilter(null)}
              label={t.workspace.combinedFilterAll}
              count={members.length}
              accent="var(--accent-color)"
            />
            {workspaces.map((w) => (
              <FilterPill
                key={w.org_id}
                active={orgFilter === w.org_id}
                onClick={() => setOrgFilter(w.org_id)}
                workspace={w}
                count={memberCountsByOrg.get(w.org_id) ?? 0}
              />
            ))}
            <span
              className="ml-auto text-[10.5px] uppercase tracking-wider"
              style={{ color: 'var(--text-tertiary)', letterSpacing: '0.12em' }}
            >
              {t.workspace.combinedAll}
            </span>
          </div>
        )}

        {/* Day header */}
        <div
          className="relative grid gap-2 px-4 pt-5 pb-4 z-10"
          style={{
            gridTemplateColumns: GRID_COLS,
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
            // SE/LT/GB-only badges: when NO has no holiday today but another
            // active office does, surface that as a small flag+name badge
            // under the day-number. NO suppresses these because the column
            // is already painted red and labelled — adding more would just
            // crowd the header. Tooltip still lists every country, so hover
            // reveals the full picture either way.
            const otherHolidays: Array<[CountryCode, string]> = noHoliday
              ? []
              : Array.from(allHolidays.entries())
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
                    // Norwegian holidays paint the weekday red since CalWin
                    // is NO-primary and that day is collectively red. Non-NO
                    // holidays don't recolour the weekday/orb — they appear
                    // as a small flag+name badge below the day-number.
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
                    // Today-orb: Light Blue solo (var(--ember)). Nordlys-
                    // signaturen på Oversikt eier den vertikale today-tråden
                    // (matcher /min-plan); orb-en dempes så Nordlys ikke
                    // dukker opp to ganger på samme flate. Norwegian
                    // holidays swap to red. If today is *also* a NO holiday
                    // we keep the Light Blue but wrap it in a red ring so
                    // the holiday still reads.
                    color: today || noHoliday ? '#0E0B08' : 'var(--lg-text-1)',
                    width: today || noHoliday ? 40 : 'auto',
                    height: today || noHoliday ? 40 : 'auto',
                    borderRadius: 9999,
                    background: today
                      ? 'var(--ember)'
                      : noHoliday
                        ? 'linear-gradient(135deg, #FB7185 0%, #F43F5E 55%, #E11D48 100%)'
                        : 'transparent',
                    boxShadow: today && noHoliday
                      ? '0 0 0 3px rgba(244, 63, 94, 0.55), 0 0 28px color-mix(in oklab, var(--ember) 50%, transparent), inset 0 1px 0 rgba(255, 255, 255, 0.35)'
                      : today
                        ? '0 0 0 3px color-mix(in oklab, var(--ember) 22%, transparent), 0 0 28px color-mix(in oklab, var(--ember) 45%, transparent), inset 0 1px 0 rgba(255, 255, 255, 0.35)'
                        : noHoliday
                          ? '0 0 0 3px rgba(244, 63, 94, 0.18), 0 0 28px rgba(244, 63, 94, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25)'
                          : 'none',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {day}
                </div>
                {/* Inline label below the day-orb. Priority:
                    1) NO holiday name (red, mirrors the column wash)
                    2) Non-NO holiday badges (flag + name, neutral colour)
                    3) Month label at a mid-week month transition
                    Otherwise nothing. */}
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
                ) : otherHolidays.length > 0 ? (
                  <div
                    className="flex flex-col items-center gap-0.5"
                    style={{ maxWidth: '100%', lineHeight: 1.15 }}
                  >
                    {otherHolidays.map(([country, name]) => {
                      const truncated =
                        name.length > 16 ? name.slice(0, 15) + '…' : name
                      return (
                        <div
                          key={country}
                          className="lg-serif flex items-center gap-1"
                          style={{
                            color: 'var(--lg-text-2)',
                            fontSize: 11,
                            opacity: 0.85,
                            letterSpacing: '-0.005em',
                            fontWeight: 500,
                            maxWidth: '100%',
                          }}
                        >
                          <span style={{ fontSize: 11, lineHeight: 1 }}>
                            {flagFor(country)}
                          </span>
                          <span
                            style={{
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {truncated}
                          </span>
                        </div>
                      )
                    })}
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
              : gridRows.map((row) => {
                if (row.kind === 'divider') {
                  return <GroupDivider key={row.key} />
                }
                const { member, rowIdx } = row
                // Hairline above each row except the first — gives the
                // matrix horizontal "rules" so it's easy to scan across
                // a row and see which day belongs to which person. Same
                // soft divider token used by the org GroupDivider for
                // visual coherence.
                const showDivider = rowIdx > 0
                return (
                  <motion.div
                    key={member.id}
                    className="relative grid gap-2 items-center"
                    style={{
                      gridTemplateColumns: GRID_COLS,
                      borderTop: showDivider ? '1px solid var(--lg-divider-soft)' : undefined,
                      paddingTop: showDivider ? 6 : undefined,
                    }}
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
                          <div className="flex items-center gap-2 px-1 h-[32px] w-full min-w-0">
                            <MemberAvatar
                              name={member.display_name}
                              initials={member.initials}
                              avatarUrl={member.avatar_url}
                              size="sm"
                            />
                            <span
                              className="text-[13px] truncate leading-tight min-w-0 flex-1"
                              style={{
                                color: 'var(--lg-text-1)',
                                fontWeight: 500,
                                letterSpacing: '-0.01em',
                              }}
                            >
                              {member.full_name || member.display_name}
                            </span>
                            <CountryBadge countryCode={office?.country_code} />
                            {combinedView && workspaceByOrgId.get(member.org_id) && (
                              <span className="ml-auto flex-shrink-0">
                                <WorkspaceBadge
                                  workspace={workspaceByOrgId.get(member.org_id)!}
                                  size="sm"
                                />
                              </span>
                            )}
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
                        holidayDatesFor(member.id),
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
                )
              })}

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
        locationSuggestions={locationSuggestions}
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
  const order: EntryStatus[] = ['office', 'remote', 'customer', 'event', 'travel', 'vacation', 'absent', 'off']
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
        background: 'var(--lg-panel-bg)',
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
          background: 'color-mix(in oklab, var(--lg-accent) 12%, transparent)',
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

/**
 * Pill button used in the combined-view filter row. Either a workspace
 * (renders its WorkspaceBadge + name + count) or the "Alle" pill (uses
 * the violet combined accent). Active state is a tinted background +
 * inset ring in the matching accent.
 */
function FilterPill({
  active,
  onClick,
  workspace,
  label,
  count,
  accent: accentOverride,
}: {
  active: boolean
  onClick: () => void
  workspace?: WorkspaceSummary
  label?: string
  count: number
  accent?: string
}) {
  const accent =
    accentOverride ??
    (workspace?.accent_color?.match(/^#[0-9a-fA-F]{3,8}$/)?.[0] ?? 'var(--accent-color)')
  const displayLabel = label ?? workspace?.name ?? '?'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11.5px] font-medium transition-[background,box-shadow] duration-150"
      style={{
        background: active
          ? `linear-gradient(135deg, color-mix(in oklab, ${accent} 28%, transparent), color-mix(in oklab, ${accent} 16%, transparent))`
          : 'color-mix(in oklab, var(--bg-subtle) 60%, transparent)',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        boxShadow: active
          ? `inset 0 0 0 1px color-mix(in oklab, ${accent} 50%, transparent)`
          : '0 0 0 1px color-mix(in oklab, var(--border-subtle) 40%, transparent)',
        fontFamily: 'var(--font-body)',
      }}
    >
      {workspace && <WorkspaceBadge workspace={workspace} size="sm" />}
      <span>{displayLabel}</span>
      <span
        className="text-[10px] font-semibold tabular-nums"
        style={{
          color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
          opacity: active ? 0.85 : 1,
        }}
      >
        {count}
      </span>
    </button>
  )
}
