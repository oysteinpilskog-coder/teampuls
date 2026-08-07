'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useEntries } from '@/hooks/use-entries'
import { useDocumentVisibility } from '@/hooks/use-document-visibility'
import { BreathingDot } from '@/components/breathing-dot'
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
const GlobeView = dynamic(
  () => import('@/components/dashboard-views/globe-view').then(m => ({ default: m.GlobeView })),
  { ssr: false }
)
const WelcomeView = dynamic(
  () => import('@/components/dashboard-views/welcome-view').then(m => ({ default: m.WelcomeView })),
  { ssr: false }
)
const FiguresView = dynamic(
  () => import('@/components/dashboard-views/figures-view').then(m => ({ default: m.FiguresView })),
  { ssr: false }
)
import { AuroraBackground } from '@/components/dashboard-views/aurora-background'
import { OffiviewSignature } from '@/components/brand/offiview-signature'
import { CalwinMark } from '@/components/brand/calwin-mark'
import { HeroMark, useViewTransition, BRAND_TIMINGS, type ViewTransitionMode } from '@/components/brand/brand-transition'
import { TimezoneStrip } from '@/components/dashboard/timezone-strip'
import { applyQuietHours, resolveViewDuration, welcomeDwellSec } from '@/lib/dashboard-defaults'
import { trackBrandImpression } from '@/lib/analytics'
import { getDayPhase, getWeekDays, getTodayWeekAndYear, toDateString } from '@/lib/dates'
import type { Entry, Member, Office, Organization, Customer, DashboardViewKey, PresenceAssumption } from '@/lib/supabase/types'
import { inferStatus } from '@/lib/presence'
import { getHolidayFromMap, memberCountryCode, type HolidayMap } from '@/lib/holidays'
import { spring } from '@/lib/motion'
import { useT } from '@/lib/i18n/context'
import { seedWeatherCache, type WeatherSnapshot } from '@/lib/weather/use-weather'
import { useTodaysVisits, filterActiveWelcomes } from '@/hooks/use-todays-visits'

type OrgRow = Pick<Organization, 'name' | 'timezone' | 'dashboard_rotation_views' | 'dashboard_view_durations' | 'default_presence_assumption' | 'logo_url' | 'birthdays_enabled'>

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
  /** When true, applies the CalWin BrandBook skin to the entire rotating
   *  dashboard — Blue Violet canvas, Silver Gray text, Light Blue accent.
   *  Read from the `tp_dashboard_mode` cookie in the dashboard server page.
   *  The full view rotation (Today, Month, Offices, Customers, Wheel,
   *  Welcome, Globe) keeps its structure; only surface tokens swap. */
  brandMode?: boolean
  /** Server-precomputed holiday map. Lets the dashboard render holiday
   *  treatment (skip 'office'-assumption, mark off-day) without bundling
   *  `date-holidays` + moment on the client (~1.6 MB). */
  holidays?: HolidayMap
}

type ViewKey = DashboardViewKey
const ALL_VIEWS: ViewKey[] = ['A', 'B', 'C', 'D', 'E', 'G', 'H', 'I', 'J']
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
  brandMode = false,
  holidays,
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
    G: t.dashboard.views.globe,
    H: t.dashboard.views.customersUk,
    I: t.dashboard.views.customersNordic,
    J: t.dashboard.views.figures,
  }), [t])
  const searchParams = useSearchParams()
  // ?brand=off disables the 3.2s brand-transition moment for the entire
  // session (kundepresentasjoner der dashbordet skal være helt stille).
  // Manual keyboard navigation always uses the quick crossfade regardless.
  const brandOff = searchParams.get('brand') === 'off'

  // ?views=all | ?views=A,J,C — midlertidig overstyring av rotasjonen, kun
  // for denne fanen. Lar en admin se gjennom visninger FØR de skrus på for
  // resepsjons-TV-en, uten å skrive noe til organizations. Ugyldige nøkler
  // ignoreres; blir det ingenting igjen faller vi tilbake til org-oppsettet.
  const previewViews = useMemo<ViewKey[] | null>(() => {
    const raw = searchParams.get('views')
    if (!raw) return null
    if (raw === 'all') return ALL_VIEWS
    const wanted = new Set(raw.split(',').map(s => s.trim().toUpperCase()))
    const picked = ALL_VIEWS.filter(v => wanted.has(v))
    return picked.length > 0 ? picked : null
  }, [searchParams])

  // Freezes the rotation hairline's CSS animation while the tab is hidden so
  // a dozing TV doesn't keep a compositor layer churning.
  const visible = useDocumentVisibility()

  const reduce = !!useReducedMotion()

  const [time, setTime] = useState(new Date())
  const [viewIdx, setViewIdx] = useState(0)
  // pendingViewIdx is the index a transition is heading toward. Null = idle
  // (only the current view layer is rendered). When set, the dashboard host
  // renders a second, pre-mounted layer for the incoming view and runs the
  // transition timeline via useViewTransition.
  const [pendingViewIdx, setPendingViewIdx] = useState<number | null>(null)
  // Which timeline the in-flight transition uses: 'brand' = full monogram
  // choreography (auto-rotation), 'quick' = plain crossfade (manual nav,
  // ?brand=off). Only meaningful while pendingViewIdx !== null.
  const [transitionMode, setTransitionMode] = useState<ViewTransitionMode>('brand')
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

  // Dagens besøk — én realtime-kanal som mater både velkomst-slide F og
  // gjeste-chip i header. activeWelcomes er den filtrerte delmengden som
  // er innenfor [start_time − 60min, +15min] akkurat nå; todaysVisits er
  // hele dagen og brukes til chip-tellingen.
  const todaysVisits = useTodaysVisits(orgIds)
  const activeWelcomes = useMemo(
    () => filterActiveWelcomes(todaysVisits, time),
    [todaysVisits, time],
  )

  // Active carousel views come from the org setting. Preserve canonical
  // A..E order so the rotation sequence stays predictable, and fall back
  // to the full set if the setting is missing or empty (shouldn't happen,
  // but we never want a blank TV).
  //
  // Velkomst-view F injiseres dynamisk i toppen av rotasjonen kun når et
  // besøk er innenfor sitt vindu. Aldri lagret i admin-konfigurasjonen.
  //
  // ?views= overstyrer alt: da er dette en forhåndsvisning og skal vise
  // nøyaktig de visningene som ble bedt om — heller ikke Velkomst-F
  // injiseres, så gjennomgangen blir forutsigbar.
  const VIEWS = useMemo<ViewKey[]>(() => {
    if (previewViews) return previewViews
    const raw = org?.dashboard_rotation_views
    const baseList = (() => {
      if (!raw || raw.length === 0) return ALL_VIEWS
      const set = new Set(raw)
      const filtered = ALL_VIEWS.filter(v => set.has(v))
      return filtered.length > 0 ? filtered : ALL_VIEWS
    })()
    return activeWelcomes.length > 0 ? (['F', ...baseList] as ViewKey[]) : baseList
  }, [previewViews, org?.dashboard_rotation_views, activeWelcomes.length])
  // Mirror Oversikt: når org-en lener seg på en presence-antakelse skal
  // hero-tallet og strip-buckets på TV-en telle medlemmer uten registrering
  // på samme måte som «Akkurat nå» gjør på Oversikt-siden. 'none' betyr
  // ingen antakelse — kun ekte rader teller.
  const presenceAssumption: PresenceAssumption = org?.default_presence_assumption ?? 'none'

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

  // Resepsjons-TV-en står på i ukevis uten at noen rører den. Realtime holder
  // data ferskt (entries, members, customers, innstillinger), men en NY
  // app-versjon — en Vercel-deploy — plukkes først opp ved full sidelast.
  // Derfor reloader vi stille én gang i timen: ny kode tas i bruk, og en
  // skjerm som har døst i dagevis får en ren omstart som selv-healing.
  // Aldri midt i en velkomst, så vi ikke avbryter et hilse-øyeblikk; da
  // hopper vi over denne runden og prøver igjen neste time.
  // Heller aldri mens skjermen står i fullskjerm: en reload river ned
  // dokumentet, og Fullscreen API-en kan ikke gjenopprettes programmatisk
  // (krever brukerhandling), så TV-en ville falt ut av fullskjerm. Realtime
  // holder data ferskt uansett; ny kode plukkes opp neste time skjermen
  // tilfeldigvis ikke er i fullskjerm, eller når noen reloader manuelt.
  const welcomeActiveRef = useRef(false)
  useEffect(() => {
    welcomeActiveRef.current = activeWelcomes.length > 0
  }, [activeWelcomes.length])
  useEffect(() => {
    const id = setInterval(() => {
      if (welcomeActiveRef.current) return
      if (document.fullscreenElement) return
      window.location.reload()
    }, 60 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

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
    // Pause the rotation timer while a transition is mid-flight — the
    // useViewTransition onComplete advances the index itself.
    if (pendingViewIdx !== null) return
    setViewStartedAt(Date.now())
    const id = setTimeout(() => {
      const nextIdx = (viewIdx + 1) % VIEWS.length
      if (brandOff) {
        setTransitionMode('quick')
        setPendingViewIdx(nextIdx)
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
      setTransitionMode('brand')
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
          .select('name, timezone, dashboard_rotation_views, dashboard_view_durations, default_presence_assumption, logo_url, birthdays_enabled')
          .eq('id', headerOrgId)
          .maybeSingle(),
        supabase
          .from('members')
          .select('*')
          .in('org_id', orgIds)
          .eq('is_active', true)
          .eq('hidden_from_overview', false)
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
              if (!upserted.is_active || upserted.hidden_from_overview) return without
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

  // Realtime org settings — the Settings page writes rotation views and
  // per-view durations straight to the organizations row. Without this the
  // reception TV keeps the old cadence until someone reloads it. Subscribing
  // to the canonical headerOrg row means "Admin sets 50s on their PC →
  // reception updates live", matching the customers/members pattern above.
  // Only headerOrgId is watched: rotation/durations are read from that one
  // canonical org even in combined «Alle CalWin»-mode.
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`org-settings:${headerOrgId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'organizations',
          filter: `id=eq.${headerOrgId}`,
        },
        (payload) => {
          // An UPDATE payload carries the full new row, so the OrgRow subset
          // is always complete — replace rather than field-merge.
          const next = payload.new as Organization | null
          if (!next?.id) return
          setOrg({
            name: next.name,
            timezone: next.timezone,
            dashboard_rotation_views: next.dashboard_rotation_views,
            dashboard_view_durations: next.dashboard_view_durations,
            default_presence_assumption: next.default_presence_assumption ?? 'none',
            logo_url: next.logo_url,
            birthdays_enabled: next.birthdays_enabled,
          })
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [headerOrgId])

  // Realtime entries for the current week (includes today). useEntries
  // takes a string | string[]; combined-mode passes the full scope so the
  // matrix and «Akkurat nå»-widget stay live across every workspace.
  const { entries: rawEntries } = useEntries(orgIds, dateStrings)

  const entries = rawEntries

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

  // «Display»-utgaven brukes av Akkurat nå-flaten (HeroBigNumber + TeamBoard)
  // og må speile Oversikt sin «Akkurat nå»-stripe: ekte rader + antatte
  // rader for medlemmer uten registrering, basert på org-en sin
  // default_presence_assumption. Uten dette står hero-tallet på 0 selv om
  // Oversikt teller medlemmer via per_member/office-antakelser. Vi
  // syntetiserer en Entry-form per antatt medlem så konsumentene som bare
  // leser status + member_id ikke trenger å vite om antakelsen.
  // Office lookup — driver helligdags-suppress per medlem. Et medlem på
  // helligdag i sitt land får ikke en antatt «kontor»-rad på dashboardet;
  // kun ekte overstyrte registreringer vises da. Bygd her slik at både
  // dag- og uke-speilet bruker samme map uten å fan-out re-lookups.
  const officeById = useMemo(() => {
    const map = new Map<string, Office>()
    offices.forEach((o) => map.set(o.id, o))
    return map
  }, [offices])

  const displayTodayEntries = useMemo<Entry[]>(() => {
    const realByMember = new Map<string, Entry>()
    const memberIds = new Set(members.map(m => m.id))
    for (const e of todayEntries) {
      if (!memberIds.has(e.member_id)) continue
      const existing = realByMember.get(e.member_id)
      if (!existing || new Date(e.updated_at).getTime() > new Date(existing.updated_at).getTime()) {
        realByMember.set(e.member_id, e)
      }
    }
    const today = new Date()
    const nowIso = today.toISOString()
    const out: Entry[] = []
    for (const m of members) {
      const real = realByMember.get(m.id)
      if (real) {
        out.push(real)
        continue
      }
      const cc = memberCountryCode(m.home_office_id, officeById)
      const isHoliday = cc ? !!getHolidayFromMap(holidays, today, cc) : false
      const assumed = isHoliday
        ? null
        : inferStatus(
            { default_status: m.default_status },
            presenceAssumption,
          )
      if (!assumed) continue
      // Syntetisk ID med 'assumed:'-prefix kan ikke kollidere med Postgres-uuid-er,
      // så CustomerMapView sin id-match fortsatt avviser disse hvis de skulle gå
      // forbi (vi sender den ikke dit, men forsvar i dybden).
      out.push({
        id: `assumed:${m.id}:${todayStr}`,
        org_id: m.org_id,
        member_id: m.id,
        date: todayStr,
        status: assumed,
        location_label: null,
        note: null,
        source: 'manual',
        source_text: null,
        confidence: null,
        created_by: null,
        created_at: nowIso,
        updated_at: nowIso,
      })
    }
    return out
  }, [todayEntries, members, presenceAssumption, todayStr, officeById, holidays])

  // Same speilflate som displayTodayEntries, men for hele uken — en syntetisk
  // entry per (member × weekday) der ekte rad mangler, basert på org-en sin
  // presence-antakelse. Uken-vy-en sin donut, «Fordeling denne uken» og
  // «Borte denne uken» leser nå eksakt det Oversikt-matrisa viser, slik at
  // antatte rader (per_member-default eller office_default) teller med på
  // begge flater. Uten dette kunne en CalWin med default 'office' se full
  // matrise på Oversikt, men nesten tomme totaler på dashboardets «Uken».
  const displayWeekEntries = useMemo<Entry[]>(() => {
    const memberIds = new Set(members.map(m => m.id))
    // Index real entries by (member_id, date) — most-recently-updated wins
    // når flere rader peker på samme dag (legacy-data fra før UNIQUE-indexen).
    const realByKey = new Map<string, Entry>()
    for (const e of entries) {
      if (!memberIds.has(e.member_id)) continue
      const key = `${e.member_id}_${e.date}`
      const existing = realByKey.get(key)
      if (!existing || new Date(e.updated_at).getTime() > new Date(existing.updated_at).getTime()) {
        realByKey.set(key, e)
      }
    }
    const nowIso = new Date().toISOString()
    const out: Entry[] = []
    for (const m of members) {
      const assumed = inferStatus(
        { default_status: m.default_status },
        presenceAssumption,
      )
      const cc = memberCountryCode(m.home_office_id, officeById)
      const holidaySet = new Set<string>()
      if (cc && assumed) {
        weekDays.forEach((d, i) => {
          if (getHolidayFromMap(holidays, d, cc)) holidaySet.add(dateStrings[i])
        })
      }
      for (const dateStr of dateStrings) {
        const real = realByKey.get(`${m.id}_${dateStr}`)
        if (real) {
          out.push(real)
          continue
        }
        if (!assumed) continue
        if (holidaySet.has(dateStr)) continue
        out.push({
          id: `assumed:${m.id}:${dateStr}`,
          org_id: m.org_id,
          member_id: m.id,
          date: dateStr,
          status: assumed,
          location_label: null,
          note: null,
          source: 'manual',
          source_text: null,
          confidence: null,
          created_by: null,
          created_at: nowIso,
          updated_at: nowIso,
        })
      }
    }
    return out
  }, [entries, members, presenceAssumption, dateStrings, weekDays, officeById, holidays])

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
      // Manual nav uses the quick crossfade (no monogram). Base the step on
      // any in-flight target so rapid presses keep stepping predictably.
      if (e.key === 'ArrowLeft') {
        setTransitionMode('quick')
        setPendingViewIdx(p => (((p ?? viewIdx) - 1 + VIEWS.length) % VIEWS.length))
      }
      if (e.key === 'ArrowRight') {
        setTransitionMode('quick')
        setPendingViewIdx(p => (((p ?? viewIdx) + 1) % VIEWS.length))
      }
      if (e.key === 'f' || e.key === 'F') toggleFullscreen()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [VIEWS, viewIdx])

  const currentView = VIEWS[viewIdx] ?? VIEWS[0]
  const incomingView = pendingViewIdx !== null ? (VIEWS[pendingViewIdx] ?? VIEWS[0]) : null
  // True only while the monogram choreography is the active transition —
  // drives chrome hide (wordmark/clock/signature) and the hero mark. A
  // 'quick' crossfade (manual nav, ?brand=off) leaves the chrome in place.
  const brandActive = pendingViewIdx !== null && transitionMode === 'brand'
  // Stable id for the in-flight transition — bumps when the target changes,
  // which restarts the timeline. Null while idle.
  const runKey = pendingViewIdx !== null ? `${viewIdx}->${pendingViewIdx}` : null

  // One persistent host owns the view layers; this hook only drives WHICH
  // layer is visible + the hero-mark phase. The layers themselves (keyed by
  // view key) survive both the transition and the commit, so heavy view
  // bundles never unmount/remount mid-flight — that double-mount was the blink.
  const { outgoingVisible, incomingVisible, markPhase } = useViewTransition(
    runKey,
    transitionMode,
    reduce,
    () => {
      if (pendingViewIdx !== null) setViewIdx(pendingViewIdx)
      setPendingViewIdx(null)
    },
  )

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
            todayEntries={displayTodayEntries}
            time={time}
            offices={offices}
            viewIdx={safeIdx}
            viewCount={VIEWS.length}
          />
        )
      case 'B':
        return (
          <MonthView
            members={members}
            weekDays={weekDays}
            entries={displayWeekEntries}
            orgName={orgName}
            time={time}
            offices={offices}
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
      case 'H':
        return (
          <CustomerMapView
            members={members}
            entries={entries}
            todayEntries={dedupedTodayEntries}
            customers={customers}
            orgName={orgName}
            time={time}
            region="uk"
          />
        )
      case 'I':
        return (
          <CustomerMapView
            members={members}
            entries={entries}
            todayEntries={dedupedTodayEntries}
            customers={customers}
            orgName={orgName}
            time={time}
            region="nordic"
          />
        )
      case 'J':
        return (
          <FiguresView
            members={members}
            offices={offices}
            customers={customers}
            orgName={orgName}
            time={time}
            birthdaysEnabled={org?.birthdays_enabled !== false}
          />
        )
      case 'E':
        return (
          <WheelView
            orgIds={orgIds}
            logoOrgId={headerOrgId}
            initialLogoUrl={org?.logo_url ?? null}
            orgName={orgName}
            time={time}
          />
        )
      case 'G':
        return (
          <GlobeView
            offices={offices}
            members={members}
            todayEntries={displayTodayEntries}
            orgName={orgName}
            time={time}
          />
        )
      case 'F':
        // Velkomst-slide. Returnerer null hvis vinduet akkurat er passert
        // (mellom render og tilstand-cleanup) — VIEWS-arrayen vil oppdateres
        // og BrandTransition spiller crossfade ut til neste view.
        return activeWelcomes.length > 0 ? (
          <WelcomeView visits={activeWelcomes} />
        ) : null
    }
  }

  const dwellMs = Math.max(1, currentDwellSec * 1000)

  return (
    <div
      ref={containerRef}
      className={
        'relative h-screen w-screen overflow-hidden flex flex-col' +
        (brandMode ? ' tp-dashboard-brand' : '')
      }
      data-brand-mode={brandMode ? 'calwin' : undefined}
      style={
        brandMode
          ? ({
              backgroundColor: '#1F1C52',
              color: '#EAEAE6',
              // Overstyrer accent-tokens i hele subtreet — alle barn som leser
              // var(--accent-color) (Nordlys-klokke, BreathingDot, fokusringer,
              // glow-skygger osv.) plukker opp CalWin Light Blue automatisk.
              ['--accent-color' as string]: '#66C4EF',
              ['--accent-glow' as string]: 'rgba(102, 196, 239, 0.34)',
              ['--lg-accent' as string]: '#66C4EF',
              ['--lg-accent-soft' as string]: 'rgba(102, 196, 239, 0.18)',
              ['--lg-accent-glow' as string]: 'rgba(102, 196, 239, 0.4)',
              ['--gradient-nordlys-clock' as string]:
                'linear-gradient(120deg, #66C4EF 0%, #4A4595 55%, #322E7A 100%)',
            } as React.CSSProperties)
          : { backgroundColor: '#050507', color: 'white' }
      }
    >
      {/* Ambient aurora backdrop. The phase prop shifts the base tone with
          time of day — cool morning, neutral midday, golden evening,
          espresso night. Cross-fades for ~4s so the change is felt, not
          seen. Skipped in CalWin brand mode — the Blue Violet canvas owns
          the atmosphere there, and aurora's warm bases would clash. */}
      {!brandMode && (
        <AuroraBackground entries={todayEntries} phase={getDayPhase(time)} />
      )}
      {brandMode && (
        // Light Blue radial bloom in the corners to echo the brand pattern
        // from the BrandBook §28 — subtle, never competes with content.
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 92% 6%, rgba(102,196,239,0.18), transparent 38%), radial-gradient(circle at 6% 94%, rgba(102,196,239,0.10), transparent 42%)',
          }}
        />
      )}

      {/* Main content — a single PERSISTENT host. The current view is always
          rendered (keyed by its view key); during a transition a second,
          incoming layer is mounted alongside it. Because both layers are keyed
          by view key, the incoming layer's instance survives the commit (it
          simply becomes the current layer) and the outgoing instance is never
          re-mounted at the start — no heavy view (Leaflet/globe/wheel) ever
          unmounts mid-flight, which is what produced the blink.

          The hero-mark choreography (brand mode) plays as an overlay on top;
          useViewTransition only flips which layer is visible.

          Held at opacity 0 until the initial fetch resolves so the TV doesn't
          flash empty rosters before data arrives. */}
      <motion.div
        className="relative flex-1 overflow-hidden"
        animate={{ opacity: dataReady ? 1 : 0 }}
        transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
      >
        {/* Current / outgoing layer. Survives the whole lifecycle. */}
        <motion.div
          key={currentView}
          className="absolute inset-0"
          initial={false}
          animate={
            outgoingVisible
              ? { opacity: 1, y: 0 }
              : { opacity: 0, y: brandActive ? -8 : 0 }
          }
          transition={{
            duration:
              (brandActive
                ? BRAND_TIMINGS.outgoing
                : reduce
                  ? BRAND_TIMINGS.reducedCrossfade
                  : BRAND_TIMINGS.quickCrossfade) / 1000,
            ease: [0.4, 0, 0.2, 1],
          }}
        >
          {renderView(currentView)}
        </motion.div>

        {/* Incoming layer — pre-mounted (hidden) from the first frame of the
            transition so its bundle warms up during the calm hero-mark phase,
            then fades in. After commit this same instance becomes the current
            layer above (same key) without a re-mount. */}
        {incomingView !== null && incomingView !== currentView && (
          <motion.div
            key={incomingView}
            className="absolute inset-0"
            initial={{ opacity: 0, y: brandActive && !reduce ? 8 : 0 }}
            animate={
              incomingVisible
                ? { opacity: 1, y: 0 }
                : { opacity: 0, y: brandActive && !reduce ? 8 : 0 }
            }
            transition={{
              duration:
                (brandActive
                  ? BRAND_TIMINGS.incoming
                  : reduce
                    ? BRAND_TIMINGS.reducedCrossfade
                    : BRAND_TIMINGS.quickCrossfade) / 1000,
              ease: 'easeOut',
            }}
            style={{ pointerEvents: incomingVisible ? 'auto' : 'none' }}
          >
            {renderView(incomingView)}
          </motion.div>
        )}

        {/* Brand monogram — circle draws, meridian scales, then it flies to
            the signature corner. Only mounted while the phase is live. */}
        {markPhase !== 'hidden' && markPhase !== 'gone' && (
          <HeroMark phase={markPhase} signaturePosition={signaturePos} />
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
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-[12px] transition-colors hover:opacity-80 tabular-nums uppercase tracking-[0.22em] font-semibold"
              style={{ color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-body)' }}
            >
              {t.dashboard.back}
            </Link>
            {/* Gjør det umulig å forveksle en ?views=-fane med den ekte
                rotasjonen — ingen skal tro de ser resepsjons-TV-en. */}
            {previewViews && (
              <span
                className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-[0.2em] uppercase"
                style={{
                  background: 'rgba(212,160,23,0.14)',
                  border: '1px solid rgba(212,160,23,0.4)',
                  color: '#E8C36A',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {t.dashboard.previewBadge}
              </span>
            )}
          </div>
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
            // Reflect the in-flight target so the pill glides the moment a
            // transition is armed, not 400ms later when it commits.
            const active = i === (pendingViewIdx ?? viewIdx)
            return (
              <button
                key={v}
                onClick={() => {
                  if (i === viewIdx) return
                  setTransitionMode('quick')
                  setPendingViewIdx(i)
                }}
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
      <RotationHairline
        startedAt={viewStartedAt}
        durationMs={dwellMs}
        paused={!visible}
      />

      {/* Global topp-bar — org-navn (venstre) + tidssoneklokker (høyre).
          Wordmarken er samme Fraunces italic på tvers av alle visninger,
          rendret én gang her i shellen så font og posisjon ikke hopper når
          dashbordet roterer. A og F har sine interne wordmarks fjernet til
          fordel for denne. Klokken til høyre lever videre på F (resepsjonen
          vil gjerne se tida) men skjules på A der hero-klokken eier flata.
          Alt skjules under BrandTransition så brand-broa er helt ren. */}
      {orgName && (
        <div className="pointer-events-none absolute top-5 left-10 z-50">
          {brandMode ? (
            <div
              className="flex items-center gap-3 transition-opacity duration-500"
              style={{ opacity: brandActive ? 0 : 1 }}
            >
              <CalwinMark size={42} title="CalWin" />
              <span
                className="leading-none"
                style={{
                  fontFamily: 'var(--font-manrope), Inter, system-ui, sans-serif',
                  fontWeight: 600,
                  fontSize: 24,
                  letterSpacing: '-0.01em',
                  color: '#EAEAE6',
                }}
              >
                {orgName}
              </span>
            </div>
          ) : (
            <p
              className="leading-none transition-opacity duration-500"
              style={{
                opacity: brandActive ? 0 : 1,
                fontFamily: 'var(--font-fraunces), "Iowan Old Style", Georgia, serif',
                fontWeight: 300,
                fontStyle: 'italic',
                fontVariationSettings: '"opsz" 32, "SOFT" 80',
                fontSize: 30,
                letterSpacing: '-0.025em',
                color: 'var(--paper)',
              }}
            >
              {orgName}
            </p>
          )}
        </div>
      )}
      {currentView !== 'A' && (
        <div className="pointer-events-none absolute top-4 right-6 z-50">
          <TimezoneStrip visible={!brandActive} />
        </div>
      )}

      {/* Gjeste-chip: stille pille som forteller resepsjonen og forbi-passerende
          at det venter besøk i dag — uten å avsløre hvem. Lever kun på View A
          (Dagens puls), der «i dag» hører hjemme; B/C/D/E ville bare repetert
          samme info fire ganger til. Velkomst-slide F eier selve hilse-
          øyeblikket når besøkende faktisk kommer. */}
      <GuestChip
        count={todaysVisits.length}
        visible={!brandActive && currentView === 'A'}
      />

      <OffiviewSignature
        ref={signatureRef}
        visible={
          !brandActive &&
          currentView !== 'A' &&
          currentView !== 'B'
        }
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
 *
 * Fyllet drives av én ren CSS-keyframe (scaleX 0→1 over nøyaktig
 * `durationMs`) i stedet for en bredde-transition matet av sekund-klokka.
 * Det gir tre ting:
 *  - Jevn glid: compositor-only transform i 60fps, ingen layout/repaint av
 *    blur+box-shadow per frame, og ingen avhengighet av at hele dashbordet
 *    re-rendrer hvert sekund.
 *  - Umiddelbar reset: `key={startedAt}` remonter linja ved hvert view-
 *    skifte, så animasjonen starter på scaleX(0) i stedet for å gli bakover.
 *  - Hold på fullt: `forwards` låser scaleX(1) gjennom brand-overgangen til
 *    neste view tar over.
 * `paused` fryser animasjonen når fanen er skjult (TV i dvale).
 */
function RotationHairline({
  startedAt,
  durationMs,
  paused,
}: {
  startedAt: number
  durationMs: number
  paused: boolean
}) {
  const anim = `rotation-hairline-fill ${durationMs}ms linear forwards`
  const playState = paused ? 'paused' : 'running'
  return (
    <div className="relative h-[2px] w-full">
      <style>{`
        @keyframes rotation-hairline-fill {
          from { transform: scaleX(0) scaleY(var(--hairline-sy, 1)); }
          to   { transform: scaleX(1) scaleY(var(--hairline-sy, 1)); }
        }
      `}</style>
      <div
        className="absolute inset-0 rounded-full"
        style={{ background: 'rgba(255,255,255,0.04)' }}
      />
      {/* Blurred halo — samme atmosfæriske bloom som KUNDEPORTEFØLJE,
          men halv opacity. scaleY-en lever i CSS-variabelen så keyframen
          kan eie hele transform-en uten å miste bloom-høyden. */}
      <div
        key={`halo-${startedAt}`}
        aria-hidden
        className="absolute left-0 top-0 h-full w-full rounded-full pointer-events-none"
        style={{
          background:
            'var(--gradient-nordlys-rail)',
          filter: 'blur(7px) saturate(140%)',
          opacity: 0.475,
          transform: 'scaleX(0) scaleY(4)',
          transformOrigin: 'left center',
          willChange: 'transform',
          animation: anim,
          animationPlayState: playState,
          ['--hairline-sy' as string]: '4',
        }}
      />
      {/* Crisp filament — samme fem-stegs box-shadow som
          KUNDEPORTEFØLJE, men hver alpha halvert. */}
      <div
        key={`filament-${startedAt}`}
        className="absolute left-0 top-0 h-full w-full rounded-full"
        style={{
          background:
            'var(--gradient-nordlys-rail)',
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
          transform: 'scaleX(0)',
          transformOrigin: 'left center',
          willChange: 'transform',
          animation: anim,
          animationPlayState: playState,
          // Femstegs glow — bruker Nordlys-tokens slik at per-org brand
          // restainer hele bloom-kjeden, ikke bare gradient-fyllet.
          boxShadow:
            '0 0 4px 1px rgba(255,255,255,0.45), 0 0 10px 2px color-mix(in oklab, var(--nordlys-a) 50%, transparent), 0 0 24px 4px color-mix(in oklab, var(--nordlys-b) 47%, transparent), 0 0 48px 6px color-mix(in oklab, var(--nordlys-b) 35%, transparent), 0 0 80px 10px color-mix(in oklab, var(--nordlys-c) 28%, transparent)',
        }}
      />
    </div>
  )
}

/**
 * «X gjester i dag»-chip som flyter sentrert øverst på dashbordet. Liten
 * pulsene-prikk + count-tekst — aldri navn. Tomt count = chip skjult.
 *
 * Er en stille kunngjøringsvektor: passerer noen TV-en og ser «3 GJESTER
 * I DAG», løftes forventningen uten at noen besøkende blottlegges før sitt
 * eget velkomstvindu inntreffer (det er da Velkomst-slide F sin jobb).
 */
function GuestChip({ count, visible }: { count: number; visible: boolean }) {
  const t = useT()
  if (count <= 0) return null
  const label =
    count === 1
      ? t.dashboard.guestChip.singular
      : t.dashboard.guestChip.plural.replace('{count}', String(count))

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : -6 }}
      transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 z-50"
    >
      <div
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-[0.22em] uppercase"
        style={{
          background: 'rgba(20,22,28,0.55)',
          backdropFilter: 'blur(18px) saturate(180%)',
          WebkitBackdropFilter: 'blur(18px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.09)',
          color: 'rgba(255,255,255,0.78)',
          fontFamily: 'var(--font-body)',
        }}
      >
        <BreathingDot color="var(--accent-color)" />
        <span className="tabular-nums">{label}</span>
      </div>
    </motion.div>
  )
}
