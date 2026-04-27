'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useEntries } from '@/hooks/use-entries'
import { TodayView } from '@/components/dashboard-views/today-view'
import { MonthView } from '@/components/dashboard-views/month-view'
import { OfficeMapView } from '@/components/dashboard-views/office-map-view'
import { CustomerMapView } from '@/components/dashboard-views/customer-map-view'
import { WheelView } from '@/components/dashboard-views/wheel-view'
import { AuroraBackground } from '@/components/dashboard-views/aurora-background'
import { OffiviewSignature } from '@/components/brand/offiview-signature'
import { BrandTransition } from '@/components/brand/brand-transition'
import { TimezoneStrip } from '@/components/dashboard/timezone-strip'
import { resolveViewDuration, DEFAULT_VIEW_DURATIONS } from '@/lib/dashboard-defaults'
import { trackBrandImpression } from '@/lib/analytics'
import { getWeekDays, getTodayWeekAndYear, toDateString } from '@/lib/dates'
import type { Entry, Member, Office, Organization, Customer, DashboardViewKey } from '@/lib/supabase/types'
import { spring } from '@/lib/motion'
import { useT } from '@/lib/i18n/context'

interface DashboardClientProps {
  orgId: string
}

type ViewKey = DashboardViewKey
const ALL_VIEWS: ViewKey[] = ['A', 'B', 'C', 'D', 'E']

function pad(n: number) { return String(n).padStart(2, '0') }

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

export function DashboardClient({ orgId }: DashboardClientProps) {
  const t = useT()
  // Moved inside the component so view labels track the active locale.
  const VIEW_LABELS: Record<ViewKey, string> = {
    A: t.dashboard.views.now,
    B: t.dashboard.views.week,
    C: t.dashboard.views.offices,
    D: t.dashboard.views.customers,
    E: t.dashboard.views.wheel,
  }
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
  const [members, setMembers] = useState<Member[]>([])
  const [offices, setOffices] = useState<Office[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [org, setOrg] = useState<Pick<Organization, 'name' | 'timezone' | 'dashboard_show_sick' | 'dashboard_rotation_views' | 'dashboard_view_durations'> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const signatureRef = useRef<HTMLDivElement>(null)

  // Active carousel views come from the org setting. Preserve canonical
  // A..E order so the rotation sequence stays predictable, and fall back
  // to the full set if the setting is missing or empty (shouldn't happen,
  // but we never want a blank TV).
  const enabledViews: ViewKey[] = (() => {
    const raw = org?.dashboard_rotation_views
    if (!raw || raw.length === 0) return ALL_VIEWS
    const set = new Set(raw)
    return ALL_VIEWS.filter(v => set.has(v))
  })()
  const VIEWS: ViewKey[] = enabledViews.length > 0 ? enabledViews : ALL_VIEWS
  const showSick = org?.dashboard_show_sick ?? true

  const { week, year } = getTodayWeekAndYear()
  const weekDays = getWeekDays(week, year)
  const dateStrings = weekDays.map(toDateString)

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Clamp the active index if the admin just removed the current view from
  // the carousel (or the settings payload arrives after first paint).
  useEffect(() => {
    if (viewIdx >= VIEWS.length) setViewIdx(0)
  }, [VIEWS.length, viewIdx])

  // Auto-rotate views with per-view durations from Settings. When the timer
  // fires we either jump straight to the next view (?brand=off, or during
  // an in-flight transition) or capture the signature position and arm
  // BrandTransition by setting pendingViewIdx.
  const safeIdx = viewIdx % VIEWS.length
  const currentDwellSec = resolveViewDuration(VIEWS[safeIdx], org?.dashboard_view_durations)
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
        org_id: orgId,
      })
      setPendingViewIdx(nextIdx)
    }, currentDwellSec * 1000)
    return () => clearTimeout(id)
  }, [viewIdx, VIEWS, currentDwellSec, brandOff, pendingViewIdx, orgId, safeIdx])

  // Fetch org + members + offices once
  const fetchData = useCallback(async () => {
    const supabase = createClient()
    const [
      { data: orgData },
      { data: membersData },
      { data: officesData },
      { data: customersData },
    ] = await Promise.all([
      supabase
        .from('organizations')
        .select('name, timezone, dashboard_show_sick, dashboard_rotation_views, dashboard_view_durations')
        .eq('id', orgId)
        .maybeSingle(),
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
        .from('customers')
        .select('*')
        .eq('org_id', orgId)
        .order('name'),
    ])
    setOrg(
      orgData ?? {
        name: 'Offiview',
        timezone: 'Europe/Oslo',
        dashboard_show_sick: true,
        dashboard_rotation_views: ALL_VIEWS,
        dashboard_view_durations: DEFAULT_VIEW_DURATIONS,
      }
    )
    setMembers(membersData ?? [])
    setOffices(officesData ?? [])
    setCustomers(customersData ?? [])
  }, [orgId])

  useEffect(() => { fetchData() }, [fetchData])

  // Realtime customers — the settings page writes directly to the DB, so
  // without this the customer map stays frozen until the next reload.
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`customers:org:${orgId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'customers',
          filter: `org_id=eq.${orgId}`,
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
    return () => { supabase.removeChannel(channel) }
  }, [orgId])

  // Realtime entries for the current week (includes today)
  const { entries: rawEntries } = useEntries(orgId, dateStrings)

  // Privacy: when the org has opted out of exposing sick leave on the public
  // dashboard, collapse sick → off so the display only reveals that someone
  // is away, not why. Keeps the count honest while hiding the health detail.
  const entries = showSick
    ? rawEntries
    : rawEntries.map(e => (e.status === 'sick' ? { ...e, status: 'off' as const } : e))

  // Today's entries only, deduped to one per member (most recently updated wins)
  const todayStr = toDateString(new Date())
  const todayEntries = entries.filter(e => e.date === todayStr)
  const dedupedTodayEntries = dedupeByMember(todayEntries, members)

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
  const orgName = org?.name ?? 'CalWin'

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
            orgId={orgId}
            orgName={orgName}
            time={time}
          />
        )
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative h-screen w-screen overflow-hidden flex flex-col"
      style={{ backgroundColor: '#050507', color: 'white' }}
    >
      {/* Ambient aurora backdrop */}
      <AuroraBackground entries={todayEntries} />

      {/* Main content. Two render paths:
          - pendingViewIdx set: BrandTransition owns the screen for ~3.2s.
            It renders both outgoing and incoming views internally and the
            hero mark flies to signaturePos. onComplete commits the index.
          - pendingViewIdx null (idle, manual nav, or ?brand=off): existing
            AnimatePresence handles the lighter 400ms crossfade. */}
      <div className="relative flex-1 overflow-hidden">
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
      </div>

      {/* ── Rotation progress hairlines (top + bottom of the control bar) ──
          Thin Nordlys lines that fill over each view's dwell. Rendered at
          half strength and mirrored on both edges so the combined weight
          matches the original single line and frames the control bar like
          the KUNDEPORTEFØLJE widget's Nordlys rail. */}
      {(() => {
        const key = VIEWS[viewIdx] ?? VIEWS[0] ?? 'A'
        const dwellMs = Math.max(1, resolveViewDuration(key, org?.dashboard_view_durations) * 1000)
        const elapsed = time.getTime() - viewStartedAt
        const pct = Math.max(0, Math.min(1, elapsed / dwellMs))
        const hairlineStyle = {
          width: `${pct * 100}%`,
          background:
            'linear-gradient(90deg, #00F5A0 0%, #00D9F5 50%, #7C3AED 100%)',
          backgroundSize: '100vw 100%',
          backgroundRepeat: 'no-repeat' as const,
          backgroundPosition: 'left center' as const,
          opacity: 0.55,
          boxShadow:
            '0 0 8px rgba(0, 217, 245, 0.28), 0 0 16px rgba(0, 245, 160, 0.14)',
        }
        return (
          <div className="relative h-[2px] w-full overflow-hidden">
            <div
              className="absolute inset-0"
              style={{ background: 'rgba(255,255,255,0.04)' }}
            />
            <div
              className="absolute left-0 top-0 h-full transition-[width] duration-[950ms] ease-linear"
              style={hairlineStyle}
            />
          </div>
        )
      })()}

      {/* ── Floating control bar (iOS-style segmented glass pill) ── */}
      <div className="relative flex items-center justify-between px-6 pt-2 pb-2 gap-4">
        {/* Left: back link */}
        <a
          href="/"
          className="text-[12px] transition-colors hover:opacity-80 tabular-nums uppercase tracking-[0.22em] font-semibold"
          style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body)' }}
        >
          {t.dashboard.back}
        </a>

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
                          background:
                            'linear-gradient(180deg, #00F5A0 -20%, #00D9F5 18%, #ffffff 55%, #ffffff 100%)',
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

        {/* Right: hint + fullscreen */}
        <div className="flex items-center gap-4">
          <p
            className="hidden md:block text-[11px] tracking-[0.14em] uppercase"
            style={{ color: 'rgba(255,255,255,0.32)', fontFamily: 'var(--font-body)' }}
          >
            {t.dashboard.hint}
          </p>
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

      {/* ── Rotation progress hairline (bottom edge, mirror of the top one) ── */}
      {(() => {
        const key = VIEWS[viewIdx] ?? VIEWS[0] ?? 'A'
        const dwellMs = Math.max(1, resolveViewDuration(key, org?.dashboard_view_durations) * 1000)
        const elapsed = time.getTime() - viewStartedAt
        const pct = Math.max(0, Math.min(1, elapsed / dwellMs))
        return (
          <div className="relative h-[2px] w-full overflow-hidden">
            <div
              className="absolute inset-0"
              style={{ background: 'rgba(255,255,255,0.04)' }}
            />
            <div
              className="absolute left-0 top-0 h-full transition-[width] duration-[950ms] ease-linear"
              style={{
                width: `${pct * 100}%`,
                background:
                  'linear-gradient(90deg, #00F5A0 0%, #00D9F5 50%, #7C3AED 100%)',
                backgroundSize: '100vw 100%',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'left center',
                opacity: 0.55,
                boxShadow:
                  '0 0 8px rgba(0, 217, 245, 0.28), 0 0 16px rgba(0, 245, 160, 0.14)',
              }}
            />
          </div>
        )
      })()}

      {/* Blink animation for clock colon */}
      <style>{`
        @keyframes blink { 0%, 100% { opacity: 0.4 } 50% { opacity: 0.15 } }
      `}</style>

      {/* Tidssoneklokker — alltid synlig, ikke en del av view-rotasjonen.
          Skjules under BrandTransition så brand-broa er ren. */}
      <div className="pointer-events-none absolute top-4 right-6 z-50">
        <TimezoneStrip visible={pendingViewIdx === null} />
      </div>

      <OffiviewSignature
        ref={signatureRef}
        visible={pendingViewIdx === null}
        controlBarSafeArea
      />
    </div>
  )
}
