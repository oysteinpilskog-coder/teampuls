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
import type { Entry, Member, Office, Organization } from '@/lib/supabase/types'
import { spring } from '@/lib/motion'

interface DashboardClientProps {
  orgId: string
}

type ViewKey = 'A' | 'B' | 'C' | 'D'
const VIEWS: ViewKey[] = ['A', 'B', 'C', 'D']

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
    const [{ data: orgData }, { data: membersData }, { data: officesData }] = await Promise.all([
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
    ])
    setOrg(orgData ?? { name: 'TeamPulse', timezone: 'Europe/Oslo' })
    setMembers(membersData ?? [])
    setOffices(officesData ?? [])
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
                orgName={orgName}
                time={time}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Bottom control bar ──────────────────────────────────── */}
      <div
        className="relative flex items-center justify-between px-8 py-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
      >
        {/* View indicators */}
        <div className="flex items-center gap-2">
          {VIEWS.map((v, i) => (
            <button
              key={v}
              onClick={() => setViewIdx(i)}
              className="transition-all duration-200"
              style={{
                width: i === viewIdx ? 24 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: i === viewIdx ? 'var(--accent-color)' : 'rgba(255,255,255,0.2)',
              }}
              aria-label={`Visning ${v}`}
            />
          ))}
        </div>

        {/* Center: auto-rotate countdown */}
        <p
          className="text-[12px]"
          style={{ color: 'rgba(255,255,255,0.2)', fontFamily: 'var(--font-body)' }}
        >
          ← → bytt visning · F fullskjerm
        </p>

        {/* Fullscreen + link back */}
        <div className="flex items-center gap-4">
          <a
            href="/"
            className="text-[12px] transition-colors hover:opacity-60"
            style={{ color: 'rgba(255,255,255,0.25)', fontFamily: 'var(--font-body)' }}
          >
            ← Tilbake
          </a>
          <button
            onClick={toggleFullscreen}
            className="transition-opacity hover:opacity-60"
            aria-label="Fullskjerm"
          >
            {isFullscreen ? (
              <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                <path d="M7 3H3v4M13 3h4v4M7 17H3v-4M13 17h4v-4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5" style={{ color: 'rgba(255,255,255,0.3)' }}>
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
