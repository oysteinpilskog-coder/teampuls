'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useEntries } from '@/hooks/use-entries'
// Heavy view bundles (Leaflet, d3-geo, big SVG wheel, …) are split out so the
// dashboard shell paints fast and each view chunk loads on first use. Aurora
// stays statically imported because it owns the immediate background.
const TodayView = dynamic(
  () => import('@/components/dashboard-views/today-view').then(m => ({ default: m.TodayView })),
  { ssr: false }
)
const MonthView = dynamic(
  () => import('@/components/dashboard-views/month-view').then(m => ({ default: m.MonthView })),
  { ssr: false }
)
const OfficeMapView = dynamic(
  () => import('@/components/dashboard-views/office-map-view').then(m => ({ default: m.OfficeMapView })),
  { ssr: false }
)
const CustomerMapView = dynamic(
  () => import('@/components/dashboard-views/customer-map-view').then(m => ({ default: m.CustomerMapView })),
  { ssr: false }
)
const WheelView = dynamic(
  () => import('@/components/dashboard-views/wheel-view').then(m => ({ default: m.WheelView })),
  { ssr: false }
)
const WelcomeView = dynamic(
  () => import('@/components/dashboard-views/welcome-view').then(m => ({ default: m.WelcomeView })),
  { ssr: false }
)
import { AuroraBackground } from '@/components/dashboard-views/aurora-background'
import { OffiviewSignature } from '@/components/brand/offiview-signature'
import { BrandTransition } from '@/components/brand/brand-transition'
import { TimezoneStrip } from '@/components/dashboard/timezone-strip'
import { applyQuietHours, resolveViewDuration, welcomeDwellSec } from '@/lib/dashboard-defaults'
import { trackBrandImpression } from '@/lib/analytics'
import { getDayPhase, getWeekDays, getTodayWeekAndYear, toDateString } from '@/lib/dates'
import type { Entry, Member, Office, Organization, Customer, DashboardViewKey } from '@/lib/supabase/types'
import { spring } from '@/lib/motion'
import { useT } from '@/lib/i18n/context'
import { seedWeatherCache, type WeatherSnapshot } from '@/lib/weather/use-weather'
import { useActiveWelcomes } from '@/hooks/use-active-welcomes'

type OrgRow = Pick<Organization, 'name' | 'timezone' | 'dashboard_show_sick' | 'dashboard_rotation_views' | 'dashboard_view_durations'>

interface DashboardClientProps {
  /** All workspace org_ids the dashboard scopes to. Single-workspace
   *  → one entry; «Alle CalWin» combined-mode → every workspace under
   *  the account. Members/offices/customers/entries fan out across
   *  this list. */
  orgIds: string[]
  /** Canonical org for non-tenant data — toggles, rotation views, view
   *  durations, and analytics impressions. Always one of `orgIds`. */
  headerOrgId: string
  /** True when the active surface is the synthetic «Alle CalWin» view.
   *  Drives header naming and any combined-only UI affordances. */
  isCombined: boolean
  /** Header label when combined (e.g. «Alle CalWin»). Falls back to
   *  the headerOrg's name when null. */
  combinedName?: string | null
  /** Server-prefetched org row. Skips the first client fetch when present. */
  initialOrg?: OrgRow | null
  initialMembers?: Member[]
  initialOffices?: Office[]
  initialCustomers?: Customer[]
  /** Server-prefetched vær per kontor-koordinat (key = `lat.toFixed(2),lng.toFixed(2)`).
   *  Seedes inn i `useWeather`-cachen ved første render så TV-en aldri viser
   *  bynavn uten ikon+grader på cold load. */
  initialWeather?: Record<string, WeatherSnapshot>
}

type ViewKey = DashboardViewKey
const ALL_VIEWS: ViewKey[] = ['A', 'B', 'C', 'D', 'E']
// View F (Velkomst) er IKKE i ALL_VIEWS — den injiseres dynamisk når et
// besøk er innenfor sitt vindu (60 min før → 15 min etter start_time).
// Den lagres aldri i organizations.dashboard_rotation_views.

function dedupeByMember(rows: Entry[], members: Member[]): Entry[] {
  const activeIds = new Set(members.map(m => m.id))
  const map = new Map<string, Entry>()
  for (const e of rows) {
    if (!activeIds.has(e.member_id)) continue
    const existing = map.get(e.member_id)
    if (!existing || new Date(e.updated_at).getTime() > new Date(existing.updated_at).getTime()) {
      map.set(e.member_id, e)
    }
  }
  return Array.from(map.values())
}

export function DashboardClient({
  orgIds,
  headerOrgId,
  isCombined,
  combinedName,
  initialOrg,
  initialMembers,
  initialOffices,
  initialCustomers,
  initialWeather,
}: DashboardClientProps) {
  // Seed klient-cachen FØR noen `OfficeMapLabel` monterer. Idempotent
  // (skriver kun nøkler som ikke alt finnes) så det er trygt å kalle
  // synkront i render-kroppen. Uten dette ville første frame av
  // `Kontorene`-visningen hatt navn-uten-vær i 1–3 s.
  if (initialWeather) seedWeatherCache(initialWeather)

  // Stable join key so effects/memos can depend on the list contents
  // without re-running on every render of an inline array literal.
  const orgIdsKey = orgIds.join(',')
  const t = useT()
  // Memoized so the segmented switcher and aria-labels keep stable refs
  // across the once-per-second clock tick.
  const VIEW_LABELS = useMemo<Record<ViewKey, string>>(() => ({
    A: t.dashboard.views.now,
    B: t.dashboard.views.week,
    C: t.dashboard.views.offices,
    D: t.dashboard.views.customers,
    E: t.dashboard.views.wheel,
    F: t.dashboard.views.welcome,
  }), [t])
  const searchParams = useSearchParams()
  // ?brand=off disables the 3.2s brand-transition moment for the entire
  // session (kundepresentasjoner der dashbordet skal være helt stille).
  // Manual keyboard navigation always uses the quick crossfade regardless.
  const brandOff = searchParams.get('brand') === 'off'

  const [time, setTime] = useState(new Date())
  const [viewIdx, setViewIdx] = useState(0)
  // pendingViewIdx is set when an auto-rotation tick has captured the
  // signature position and BrandTransition is mounted. Null = idle (the
  // current view is shown via the lightweight crossfade AnimatePresence).
  const [pendingViewIdx, setPendingViewIdx] = useState<number | null>(null)
  // Captured at the moment the auto-tick fires, before the signature is
  // hidden — the hero mark uses this as its flight target.
  const [signaturePos, setSignaturePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  // Wall-clock ms when the current view was entered. Used for the rotation
  // progress hairline so we can prove the auto-rotate timer is alive.
  const [viewStartedAt, setViewStartedAt] = useState(() => Date.now())
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [members, setMembers] = useState<Member[]>(initialMembers ?? [])
  const [offices, setOffices] = useState<Office[]>(initialOffices ?? [])
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers ?? [])
  const [org, setOrg] = useState<OrgRow | null>(initialOrg ?? null)
  const [dataReady, setDataReady] = useState(initialMembers !== undefined)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Skip the first client fetch when SSR gave us everything — saves four
  // round-trips on every cold load of the dashboard. Subsequent route
  // navigations (which bypass SSR via the App Router cache) still fetch.
  const firstFetchWithSSR = useRef(initialMembers !== undefined)
  const containerRef = useRef<HTMLDivElement>(null)
  const signatureRef = useRef<HTMLDivElement>(null)

  // Aktive velkomstbesøk — drives av `visits`-tabellen + realtime-kanal.
  // Tom array når ingen er innenfor sitt vindu, så Velkomst-slide F dukker
  // opp og forsvinner uten å berøre admin-konfigurert rotasjon.
  const activeWelcomes = useActiveWelcomes(orgIds, time)

  // Active carousel views come from the org setting. Preserve canonical
  // A..E order so the rotation sequence stays predictable, and fall back
  // to the full set if the setting is missing or empty (shouldn't happen,
  // but we never want a blank TV).
  //
  // Velkomst-view F injiseres dynamisk i toppen av rotasjonen kun når et
  // besøk er innenfor sitt vindu. Aldri lagret i admin-konfigurasjonen.
  const VIEWS = useMemo<ViewKey[]>(() => {
    const raw = org?.dashboard_rotation_views
    const baseList = (() => {
      if (!raw || raw.length === 0) return ALL_VIEWS
      const set = new Set(raw)
      const filtered = ALL_VIEWS.filter(v => set.has(v))
      return filtered.length > 0 ? filtered : ALL_VIEWS
    })()
    return activeWelcomes.length > 0 ? (['F', ...baseList] as ViewKey[]) : baseList
  }, [org?.dashboard_rotation_views, activeWelcomes.length])
  const showSick = org?.dashboard_show_sick ?? true

  // Rebuilds across midnight as `time` ticks past 00:00 — keeps the dashboard
  // showing today's week without a manual refresh. Stable through the day.
  const todayKey = toDateString(time)
  const { weekDays, dateStrings } = useMemo(() => {
    const { week, year } = getTodayWeekAndYear()
    const days = getWeekDays(week, year)
    return { weekDays: days, dateStrings: days.map(toDateString) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayKey])

  // Live clock — pauses while the tab is hidden so we don't rerender the
  // whole dashboard tree once a second for nobody. Resumes immediately on
  // visibility change with a fresh time so the clock doesn't show a frozen
  // wall-time when the user comes back.
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (id !== null) return
      setTime(new Date())
      id = setInterval(() => setTime(new Date()), 1000)
    }
    const stop = () => {
      if (id === null) return
      clearInterval(id)
      id = null
    }
    const onVis = () => (document.hidden ? stop() : start())
    if (typeof document !== 'undefined') {
      if (!document.hidden) start()
      document.addEventListener('visibilitychange', onVis)
    }
    return () => {
      stop()
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVis)
      }
    }
  }, [])

  // Clamp the active index if the admin just removed the current view from
  // the carousel (or the settings payload arrives after first paint).
  useEffect(() => {
    if (viewIdx >= VIEWS.length) setViewIdx(0)
  }, [VIEWS.length, viewIdx])

  // Når et velkomst-besøk dukker opp innenfor sitt vindu, avbryt pågående
  // rotasjon og hopp umiddelbart til Velkomst-slide F. Uten dette ville TV
  // måttet vente på at gjeldende view skulle telle ferdig før velkomsten
  // dukker opp — kunden er kanskje allerede gjennom døra. F sitter på
  // index 0 i VIEWS når activeWelcomes.length > 0.
  const prevWelcomeCountRef = useRef(0)
  useEffect(() => {
    if (activeWelcomes.length > 0 && prevWelcomeCountRef.current === 0) {
      setPendingViewIdx(null)
      setViewIdx(0)
    }
    prevWelcomeCountRef.current = activeWelcomes.length
  }, [activeWelcomes.length])

  // Auto-rotate views with per-view durations from Settings. When the timer
  // fires we either jump straight to the next view (?brand=off, or during
  // an in-flight transition) or capture the signature position and arm
  // BrandTransition by setting pendingViewIdx.
  // After 18:00 / before 07:00 we also apply a quiet-hours stretch so the
  // empty reception breathes slower instead of marching at the same pace
  // as a Tuesday lunch.
  const safeIdx = viewIdx % VIEWS.length
  const currentViewKey = VIEWS[safeIdx]
  // Velkomst-slide har dynamisk varighet basert på antall samtidige besøk
  // (ca. 12 s per besøkende) så cycling rekker minst én runde før vi
  // går videre. quiet-hours-stretch hopper vi over for F siden velkomster
  // er forretningskritiske selv etter 18:00.
  const baseDwell = currentViewKey === 'F'
    ? welcomeDwellSec(activeWelcomes.length)
    : resolveViewDuration(currentViewKey, org?.dashboard_view_durations)
  const currentDwellSec = currentViewKey === 'F'
    ? baseDwell
    : applyQuietHours(baseDwell, time.getHours())
  useEffect(() => {
    // Pause the rotation timer while a brand transition is mid-flight —
    // BrandTransition.onComplete advances the index itself.
    if (pendingViewIdx !== null) return
    setViewStartedAt(Date.now())
    const id = setTimeout(() => {
      const nextIdx = (viewIdx + 1) % VIEWS.length
      if (brandOff) {
        setViewIdx(nextIdx)
        return
      }
      const rect = signatureRef.current?.getBoundingClientRect()
      const pos = rect
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        : { x: window.innerWidth - 96, y: window.innerHeight - 72 }
      setSignaturePos(pos)
      trackBrandImpression({
        view_key: VIEWS[safeIdx],
        dwell_sec: currentDwellSec,
        org_id: headerOrgId,
      })
      setPendingViewIdx(nextIdx)
    }, currentDwellSec * 1000)
    return () => clearTimeout(id)
  }, [viewIdx, VIEWS, currentDwellSec, brandOff, pendingViewIdx, headerOrgId, safeIdx])

  // Fetch org + members + offices + customers once. Errors are caught so
  // the TV never shows React's red overlay; instead a quiet "could not load"
  // pill appears and aurora + clock keep running so the screen never goes
  // dark. Realtime subscriptions still try to recover the state.
  const fetchData = useCallback(async () => {
    if (firstFetchWithSSR.current) {
      firstFetchWithSSR.current = false
      return
    }
    const supabase = createClient()
    try {
      const [orgRes, membersRes, officesRes, customersRes] = await Promise.all([
        supabase
          .from('organizations')
          .select('name, timezone, dashboard_show_sick, dashboard_rotation_views, dashboard_view_durations')
          .eq('id', headerOrgId)
          .maybeSingle(),
        supabase
          .from('members')
          .select('*')
          .in('org_id', orgIds)
          .eq('is_active', true)
          .order('display_name'),
        supabase
          .from('offices')
          .select('*')
          .in('org_id', orgIds)
          .order('sort_order'),
        supabase
          .from('customers')
          .select('*')
          .in('org_id', orgIds)
          .order('name'),
      ])
      if (orgRes.error) throw orgRes.error
      if (membersRes.error) throw membersRes.error
      if (officesRes.error) throw officesRes.error
      if (customersRes.error) throw customersRes.error
      setOrg(orgRes.data ?? null)
      setMembers(membersRes.data ?? [])
      setOffices(officesRes.data ?? [])
      setCustomers(customersRes.data ?? [])
      setLoadError(null)
      setDataReady(true)
    } catch (err) {
      console.error('[dashboard] fetchData failed', err)
      setLoadError(t.dashboard.loadError)
      setDataReady(true)
    }
  // orgIdsKey covers the contents of orgIds; React-hooks lint can't see
  // through the join so we rely on the joined string for stability.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgIdsKey, headerOrgId, t])

  useEffect(() => { fetchData() }, [fetchData])

  // Realtime customers — the settings page writes directly to the DB, so
  // without this the customer map stays frozen until the next reload.
  // One channel per scoped workspace so combined-mode receives writes
  // from every side of «Alle CalWin».
  useEffect(() => {
    const supabase = createClient()
    const channels = orgIds.map((id) =>
      supabase
        .channel(`customers:org:${id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'customers',
            filter: `org_id=eq.${id}`,
          },
          (payload) => {
            if (payload.eventType === 'DELETE') {
              const deleted = payload.old as Partial<Customer>
              if (!deleted.id) return
              setCustomers(prev => prev.filter(c => c.id !== deleted.id))
              return
            }
            const upserted = payload.new as Customer
            if (!upserted?.id) return
            setCustomers(prev => {
              const without = prev.filter(c => c.id !== upserted.id)
              return [...without, upserted].sort((a, b) => a.name.localeCompare(b.name))
            })
          }
        )
        .subscribe()
    )
    return () => { channels.forEach((ch) => supabase.removeChannel(ch)) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgIdsKey])

  // Realtime members — without this the TV shows a stale roster until the
  // next reload when admin (de)activates a member or edits their profile.
  // is_active=false is treated as a soft delete so headcounts stay honest.
  // One channel per scoped workspace so combined-mode receives roster
  // changes from every side of «Alle CalWin».
  useEffect(() => {
    const supabase = createClient()
    const channels = orgIds.map((id) =>
      supabase
        .channel(`members:org:${id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'members',
            filter: `org_id=eq.${id}`,
          },
          (payload) => {
            if (payload.eventType === 'DELETE') {
              const deleted = payload.old as Partial<Member>
              if (!deleted.id) return
              setMembers(prev => prev.filter(m => m.id !== deleted.id))
              return
            }
            const upserted = payload.new as Member
            if (!upserted?.id) return
            setMembers(prev => {
              const without = prev.filter(m => m.id !== upserted.id)
              if (!upserted.is_active) return without
              return [...without, upserted].sort((a, b) =>
                (a.display_name ?? '').localeCompare(b.display_name ?? '')
              )
            })
          }
        )
        .subscribe()
    )
    return () => { channels.forEach((ch) => supabase.removeChannel(ch)) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgIdsKey])

  // Realtime entries for the current week (includes today). useEntries
  // takes a string | string[]; combined-mode passes the full scope so the
  // matrix and «Akkurat nå»-widget stay live across every workspace.
  const { entries: rawEntries } = useEntries(orgIds, dateStrings)

  // Privacy: when the org has opted out of exposing sick leave on the public
  // dashboard, collapse sick → off so the display only reveals that someone
  // is away, not why. Keeps the count honest while hiding the health detail.
  const entries = useMemo(
    () => showSick
      ? rawEntries
      : rawEntries.map(e => (e.status === 'sick' ? { ...e, status: 'off' as const } : e)),
    [rawEntries, showSick]
  )

  // Today's entries only, deduped to one per member (most recently updated wins)
  const todayStr = toDateString(new Date())
  const todayEntries = useMemo(
    () => entries.filter(e => e.date === todayStr),
    [entries, todayStr]
  )
  const dedupedTodayEntries = useMemo(
    () => dedupeByMember(todayEntries, members),
    [todayEntries, members]
  )

  // Fullscreen API
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }
  useEffect(() => {
    function onFsChange() { setIsFullscreen(!!document.fullscreenElement) }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  // Keyboard: left/right to switch views, F for fullscreen, Esc handled by browser.
  // Manual nav cancels any pending brand transition and uses the quick 400ms
  // crossfade — the brand moment is reserved for auto-rotation.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') {
        setPendingViewIdx(null)
        setViewIdx(i => (i - 1 + VIEWS.length) % VIEWS.length)
      }
      if (e.key === 'ArrowRight') {
        setPendingViewIdx(null)
        setViewIdx(i => (i + 1) % VIEWS.length)
      }
      if (e.key === 'f' || e.key === 'F') toggleFullscreen()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [VIEWS]) // eslint-disable-line react-hooks/exhaustive-deps

  const currentView = VIEWS[viewIdx] ?? VIEWS[0]
  const incomingView = pendingViewIdx !== null ? (VIEWS[pendingViewIdx] ?? VIEWS[0]) : null
  // In combined mode the headerOrg's name is misleading (just one of
  // several workspaces); the synthetic «Alle CalWin»-label reads truer
  // and matches the workspace pill in the rest of the app.
  const orgName = isCombined ? (combinedName ?? '') : (org?.name ?? '')

  function renderView(view: ViewKey) {
    switch (view) {
      case 'A':
        return (
          <TodayView
            members={members}
            weekDays={weekDays}
            entries={entries}
            todayEntries={todayEntries}
            orgName={orgName}
            time={time}
          />
        )
      case 'B':
        return (
          <MonthView
            members={members}
            weekDays={weekDays}
            entries={entries}
            orgName={orgName}
            time={time}
          />
        )
      case 'C':
        return (
          <OfficeMapView
            offices={offices}
            orgName={orgName}
            time={time}
          />
        )
      case 'D':
        return (
          <CustomerMapView
            members={members}
            entries={entries}
            todayEntries={dedupedTodayEntries}
            customers={customers}
            orgName={orgName}
            time={time}
          />
        )
      case 'E':
        return (
          <WheelView
            orgIds={orgIds}
            logoOrgId={headerOrgId}
            orgName={orgName}
            time={time}
          />
        )
      case 'F':
        // Velkomst-slide. Returnerer null hvis vinduet akkurat er passert
        // (mellom render og tilstand-cleanup) — VIEWS-arrayen vil oppdateres
        // og BrandTransition spiller crossfade ut til neste view.
        return activeWelcomes.length > 0 ? (
          <WelcomeView visits={activeWelcomes} orgName={orgName} />
        ) : null
    }
  }

  const dwellMs = Math.max(1, currentDwellSec * 1000)
  const elapsed = time.getTime() - viewStartedAt
  const rotationPct = Math.max(0, Math.min(1, elapsed / dwellMs))

  return (
    <div
      ref={containerRef}
      className="relative h-screen w-screen overflow-hidden flex flex-col"
      style={{ backgroundColor: '#050507', color: 'white' }}
    >
      {/* Ambient aurora backdrop. The phase prop shifts the base tone with
          time of day — cool morning, neutral midday, golden evening,
          espresso night. Cross-fades for ~4s so the change is felt, not
          seen. */}
      <AuroraBackground entries={todayEntries} phase={getDayPhase(time)} />

      {/* Main content. Two render paths:
          - pendingViewIdx set: BrandTransition owns the screen for ~3.2s.
            It renders both outgoing and incoming views internally and the
            hero mark flies to signaturePos. onComplete commits the index.
          - pendingViewIdx null (idle, manual nav, or ?brand=off): existing
            AnimatePresence handles the lighter 400ms crossfade.

          Held at opacity 0 until the initial fetch resolves so the TV
          doesn't flash empty rosters before data arrives. */}
      <motion.div
        className="relative flex-1 overflow-hidden"
        animate={{ opacity: dataReady ? 1 : 0 }}
        transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
      >
        {pendingViewIdx !== null && incomingView !== null ? (
          <BrandTransition
            key={`brand-${viewIdx}-to-${pendingViewIdx}`}
            outgoingView={renderView(currentView)}
            incomingView={renderView(incomingView)}
            signaturePosition={signaturePos}
            onComplete={() => {
              setViewIdx(pendingViewIdx)
              setPendingViewIdx(null)
            }}
          />
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={currentView}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.01 }}
              transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
              className="absolute inset-0"
            >
              {renderView(currentView)}
            </motion.div>
          </AnimatePresence>
        )}
      </motion.div>

      {/* Quiet load-error pill — only appears if the initial snapshot failed.
          Aurora + clock keep running so the TV never goes dark. */}
      {loadError && (
        <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 z-50">
          <div
            className="px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.18em]"
            style={{
              background: 'rgba(20,22,28,0.72)',
              backdropFilter: 'blur(18px)',
              WebkitBackdropFilter: 'blur(18px)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.78)',
              fontFamily: 'var(--font-body)',
            }}
          >
            {loadError}
          </div>
        </div>
      )}

      {/* ── Floating control bar (iOS-style segmented glass pill) ── */}
      <div className="relative flex items-center justify-between px-6 pt-3 pb-2 gap-4">
        {/* Left: back link — skjules i fullskjerm så TV-en er ren. */}
        {isFullscreen ? (
          <span aria-hidden />
        ) : (
          <a
            href="/"
            className="text-[12px] transition-colors hover:opacity-80 tabular-nums uppercase tracking-[0.22em] font-semibold"
            style={{ color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-body)' }}
          >
            {t.dashboard.back}
          </a>
        )}

        {/* Centre: segmented view switcher */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.2 }}
          className="relative flex items-center gap-1 rounded-full p-1"
          style={{
            background: 'rgba(20,22,28,0.72)',
            backdropFilter: 'blur(22px) saturate(180%)',
            WebkitBackdropFilter: 'blur(22px) saturate(180%)',
            border: '1px solid rgba(255,255,255,0.09)',
            boxShadow:
              'inset 0 1px 0 rgba(255,255,255,0.08), 0 18px 40px -18px rgba(0,0,0,0.6)',
          }}
        >
          {VIEWS.map((v, i) => {
            const active = i === viewIdx
            return (
              <button
                key={v}
                onClick={() => setViewIdx(i)}
                className="relative px-4 py-1.5 text-[12px] font-semibold tracking-[0.18em] uppercase transition-colors"
                style={{
                  color: active ? '#ffffff' : 'rgba(255,255,255,0.55)',
                  fontFamily: 'var(--font-body)',
                  minWidth: 82,
                  zIndex: 1,
                }}
                aria-label={`${t.dashboard.viewAriaPrefix} ${VIEW_LABELS[v]}`}
                aria-pressed={active}
              >
                {active && (
                  <motion.span
                    layoutId="view-pill"
                    className="absolute inset-0 rounded-full -z-10"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    style={{
                      background:
                        'linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.06) 100%)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      boxShadow:
                        'inset 0 1px 0 rgba(255,255,255,0.24), 0 8px 18px -8px color-mix(in oklab, var(--accent-color) 55%, transparent)',
                    }}
                  />
                )}
                <span
                  className="relative"
                  style={
                    active
                      ? {
                          // Nordlys in toppen på det hvite — aurora tint fades
                          // down into white body, mirroring the KUNDEPORTEFØLJE
                          // hero-number language (inverted direction).
                          background: 'var(--gradient-nordlys-pill)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          backgroundClip: 'text',
                        }
                      : undefined
                  }
                >
                  {VIEW_LABELS[v]}
                </span>
              </button>
            )
          })}
        </motion.div>

        {/* Right: hint + fullscreen — hint skjules i fullskjerm. */}
        <div className="flex items-center gap-4">
          {!isFullscreen && (
            <p
              className="hidden md:block text-[11px] tracking-[0.14em] uppercase"
              style={{ color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-body)' }}
            >
              {t.dashboard.hint}
            </p>
          )}
          <button
            onClick={toggleFullscreen}
            className="flex items-center justify-center w-9 h-9 rounded-full transition-all hover:bg-white/5"
            aria-label={t.dashboard.fullscreen}
            style={{
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(20,22,28,0.55)',
              backdropFilter: 'blur(18px)',
              WebkitBackdropFilter: 'blur(18px)',
            }}
          >
            {isFullscreen ? (
              <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.65)' }}>
                <path d="M7 3H3v4M13 3h4v4M7 17H3v-4M13 17h4v-4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.65)' }}>
                <path d="M3 7V3h4M17 7V3h-4M3 13v4h4M17 13v4h-4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Rotasjons-progressbar under kontroll-baren. Tidligere var det også
          en speilet linje på toppen, men den ble fjernet — én linje er nok
          for å bevise at auto-rotasjonen lever, uten å ramme dashbordet. */}
      <RotationHairline pct={rotationPct} />

      {/* Global topp-bar — org-navn (venstre) + tidssoneklokker (høyre).
          Begge står på samme baseline (top-4), uavhengig av aktiv visning.
          Skjules på TodayView (View A): der eier Fraunces wordmark + 84px
          hero-klokken toppen — vi vil ikke ha to org-navn eller to klokker
          å lese på den hero-orienterte flaten. Skjules også under
          BrandTransition så brand-broa er helt ren. */}
      {currentView !== 'A' && (
        <>
          <div className="pointer-events-none absolute top-4 left-6 z-50">
            <span
              className="transition-opacity duration-500"
              style={{
                opacity: pendingViewIdx === null ? 1 : 0,
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                fontWeight: 500,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: 'var(--mist)',
              }}
            >
              {orgName}
            </span>
          </div>
          <div className="pointer-events-none absolute top-4 right-6 z-50">
            <TimezoneStrip visible={pendingViewIdx === null} />
          </div>
        </>
      )}

      <OffiviewSignature
        ref={signatureRef}
        visible={pendingViewIdx === null}
        controlBarSafeArea
      />
    </div>
  )
}

/**
 * Thin Nordlys gradient line that fills with each view's dwell. Speiler
 * KUNDEPORTEFØLJE-rail-en (customer-map-view.tsx) med samme to-lags-
 * oppskrift — myk halo + crisp filament — slik at all progress-grafikk i
 * produktet snakker samme visuelle språk. Glødens *form* (blur-radii) er
 * identisk; *intensiteten* (alpha) er halvert siden denne rail-en sitter
 * rett under kontrollbaren og ikke skal konkurrere med innholdet bak.
 * Wrapperen er bevisst IKKE clipped — gløden skal blø utenfor selve
 * rail-en for at to-lags-effekten skal lese.
 */
function RotationHairline({ pct }: { pct: number }) {
  const fillWidth = `${pct * 100}%`
  return (
    <div className="relative h-[2px] w-full">
      <div
        className="absolute inset-0 rounded-full"
        style={{ background: 'rgba(255,255,255,0.04)' }}
      />
      {/* Blurred halo — samme atmosfæriske bloom som KUNDEPORTEFØLJE,
          men halv opacity. */}
      <div
        aria-hidden
        className="absolute left-0 top-0 h-full rounded-full pointer-events-none transition-[width] duration-[950ms] ease-linear"
        style={{
          width: fillWidth,
          background:
            'linear-gradient(90deg, #00F5A0 0%, #00D9F5 50%, #7C3AED 100%)',
          filter: 'blur(7px) saturate(140%)',
          opacity: 0.475,
          transform: 'scaleY(4)',
          transformOrigin: 'center',
        }}
      />
      {/* Crisp filament — samme fem-stegs box-shadow som
          KUNDEPORTEFØLJE, men hver alpha halvert. */}
      <div
        className="absolute left-0 top-0 h-full rounded-full transition-[width] duration-[950ms] ease-linear"
        style={{
          width: fillWidth,
          background:
            'linear-gradient(90deg, #00F5A0 0%, #00D9F5 50%, #7C3AED 100%)',
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
          boxShadow:
            '0 0 4px 1px rgba(255,255,255,0.45), 0 0 10px 2px rgba(0,245,160,0.5), 0 0 24px 4px rgba(0,217,245,0.475), 0 0 48px 6px rgba(0,217,245,0.35), 0 0 80px 10px rgba(124,58,237,0.275)',
        }}
      />
    </div>
  )
}
