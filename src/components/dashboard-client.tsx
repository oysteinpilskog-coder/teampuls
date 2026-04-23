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
import { AuroraBackground } from '@/components/dashboard-views/aurora-background'
import { getWeekDays, getTodayWeekAndYear, toDateString } from '@/lib/dates'
import type { Entry, Member, Office, Organization, Customer } from '@/lib/supabase/types'
import { spring } from '@/lib/motion'

interface DashboardClientProps {
  orgId: string
}

type ViewKey = 'A' | 'B' | 'C' | 'D'
const VIEWS: ViewKey[] = ['A', 'B', 'C', 'D']
const VIEW_LABELS: Record<ViewKey, string> = {
  A: 'Nå',
  B: 'Uken',
  C: 'Kontorer',
  D: 'Kunder',
}

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
  const searchParams = useSearchParams()
  const intervalSec = Number(searchParams.get('interval') ?? 15)

  const [time, setTime] = useState(new Date())
  const [viewIdx, setViewIdx] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [members, setMembers] = useState<Member[]>([])
  const [offices, setOffices] = useState<Office[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [org, setOrg] = useState<Pick<Organization, 'name' | 'timezone'> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { week, year } = getTodayWeekAndYear()
  const weekDays = getWeekDays(week, year)
  const dateStrings = weekDays.map(toDateString)

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Auto-rotate views
  useEffect(() => {
    const id = setInterval(() => {
      setViewIdx(i => (i + 1) % VIEWS.length)
    }, intervalSec * 1000)
    return () => clearInterval(id)
  }, [intervalSec])

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
        .select('name, timezone')
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
    setOrg(orgData ?? { name: 'Offiview', timezone: 'Europe/Oslo' })
    setMembers(membersData ?? [])
    setOffices(officesData ?? [])
    setCustomers(customersData ?? [])
  }, [orgId])

  useEffect(() => { fetchData() }, [fetchData])

  // Realtime entries for the current week (includes today)
  const { entries } = useEntries(orgId, dateStrings)

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

  // Keyboard: left/right to switch views, F for fullscreen, Esc handled by browser
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft')  setViewIdx(i => (i - 1 + VIEWS.length) % VIEWS.length)
      if (e.key === 'ArrowRight') setViewIdx(i => (i + 1) % VIEWS.length)
      if (e.key === 'f' || e.key === 'F') toggleFullscreen()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const currentView = VIEWS[viewIdx]
  const orgName = org?.name ?? 'CalWin'

  return (
    <div
      ref={containerRef}
      className="relative h-screen w-screen overflow-hidden flex flex-col"
      style={{ backgroundColor: '#050507', color: 'white' }}
    >
      {/* Ambient aurora backdrop */}
      <AuroraBackground entries={todayEntries} />

      {/* Main content with view transition */}
      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.01 }}
            transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
            className="absolute inset-0"
          >
            {currentView === 'A' && (
              <TodayView
                members={members}
                weekDays={weekDays}
                entries={entries}
                todayEntries={todayEntries}
                orgName={orgName}
                time={time}
              />
            )}
            {currentView === 'B' && (
              <MonthView
                members={members}
                weekDays={weekDays}
                entries={entries}
                orgName={orgName}
                time={time}
              />
            )}
            {currentView === 'C' && (
              <OfficeMapView
                members={members}
                offices={offices}
                todayEntries={dedupedTodayEntries}
                orgName={orgName}
                time={time}
              />
            )}
            {currentView === 'D' && (
              <CustomerMapView
                members={members}
                entries={entries}
                todayEntries={dedupedTodayEntries}
                customers={customers}
                orgName={orgName}
                time={time}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Floating control bar (iOS-style segmented glass pill) ── */}
      <div className="relative flex items-center justify-between px-6 pt-2 pb-4 gap-4">
        {/* Left: back link */}
        <a
          href="/"
          className="text-[12px] transition-colors hover:opacity-80 tabular-nums uppercase tracking-[0.22em] font-semibold"
          style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body)' }}
        >
          ← Tilbake
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
                aria-label={`Visning ${VIEW_LABELS[v]}`}
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
                <span className="relative">{VIEW_LABELS[v]}</span>
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
            ← → bytt · F fullskjerm
          </p>
          <button
            onClick={toggleFullscreen}
            className="flex items-center justify-center w-9 h-9 rounded-full transition-all hover:bg-white/5"
            aria-label="Fullskjerm"
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

      {/* Blink animation for clock colon */}
      <style>{`
        @keyframes blink { 0%, 100% { opacity: 0.4 } 50% { opacity: 0.15 } }
      `}</style>
    </div>
  )
}
