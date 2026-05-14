'use client'

import * as React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { CalwinMark } from '@/components/brand/calwin-mark'
import { useEntries } from '@/hooks/use-entries'
import { dedupeEntriesByMemberDate } from '@/lib/entries/dedupe'
import { getISOWeek, formatDateLabelLong, toDateString } from '@/lib/dates'
import { useT } from '@/lib/i18n/context'
import { spring } from '@/lib/motion'
import type { Member, Customer, Office, Organization } from '@/lib/supabase/types'

interface CalwinBrandDashboardProps {
  orgIds: string[]
  initialOrg: Pick<Organization, 'name' | 'timezone'> | null
  initialMembers: Member[]
  initialOffices: Office[]
  initialCustomers: Customer[]
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

/**
 * CalwinBrandDashboard — a fullscreen, BrandBook-strict dashboard variant.
 *
 * Lives at /dashboard-brand. The standard /dashboard view is left alone;
 * this is its own opt-in route with the CalWin corporate look:
 *   - Blue Violet canvas (#1F1C52)
 *   - Silver Gray foreground
 *   - Light Blue accent + bars under section headings
 *   - The CalwinMark dotted-circle prominent top-left
 *
 * Data shape mirrors what /dashboard already fetches server-side, so the
 * route can prefetch the same payload — no extra round-trips.
 */
export function CalwinBrandDashboard({
  orgIds,
  initialOrg,
  initialMembers,
  initialOffices,
  initialCustomers,
}: CalwinBrandDashboardProps) {
  const t = useT()
  const [time, setTime] = useState(() => new Date())
  const [dateLabel, setDateLabel] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  // Date label is locale-aware → resolved client-side after mount to avoid
  // server/client mismatch on the long form ("mandag 4. mai").
  useEffect(() => {
    setDateLabel(formatDateLabelLong(new Date(), t))
  }, [t])

  // Tick once per minute — the brand view shows hours:minutes, not seconds,
  // so a 1 s tick is wasteful and would re-render the whole tree needlessly.
  useEffect(() => {
    const id = window.setInterval(() => setTime(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const todayKey = toDateString(time)
  const dateStrings = useMemo(() => [todayKey], [todayKey])
  const { entries: todayEntries } = useEntries(orgIds, dateStrings)
  const dedupedToday = useMemo(
    () => dedupeEntriesByMemberDate(todayEntries, initialMembers),
    [todayEntries, initialMembers],
  )

  const totals = useMemo(() => {
    const map = new Map(dedupedToday.map(e => [e.member_id, e]))
    let office = 0
    let remote = 0
    let customer = 0
    let away = 0
    for (const m of initialMembers) {
      const status = map.get(m.id)?.status
      if (status === 'office') office++
      else if (status === 'remote') remote++
      else if (status === 'customer' || status === 'event' || status === 'travel') customer++
      else if (status === 'vacation' || status === 'absent' || status === 'off') away++
    }
    return { office, remote, customer, away, total: initialMembers.length }
  }, [dedupedToday, initialMembers])

  const orgName = initialOrg?.name ?? 'CalWin'
  const officeCount = initialOffices.length
  const customerCount = initialCustomers.length
  const weekNum = getISOWeek(time)
  const hh = pad(time.getHours())
  const mm = pad(time.getMinutes())

  return (
    <div
      ref={containerRef}
      className="relative h-screen w-screen overflow-hidden flex flex-col"
      style={{
        backgroundColor: '#1F1C52',
        color: '#EAEAE6',
        fontFamily: 'var(--font-manrope), Inter, system-ui, sans-serif',
      }}
    >
      {/* Subtle brand-pattern corner — dotted circle echo from BrandBook §28.
          Two large blurred radial dots in Light Blue at low alpha, drifting
          at the corners. Adds depth without competing with the foreground. */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 95% 6%, rgba(102,196,239,0.18), transparent 38%), radial-gradient(circle at 5% 92%, rgba(102,196,239,0.10), transparent 42%)',
        }}
      />

      {/* ── Top band ───────────────────────────────────────────────── */}
      <div className="relative flex items-start justify-between px-12 pt-10">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.05 }}
          className="flex items-center gap-5"
        >
          <CalwinMark size={72} title="CalWin" />
          <div className="flex flex-col">
            <span
              className="text-[28px] font-semibold tracking-[-0.01em] leading-none"
              style={{ color: '#EAEAE6' }}
            >
              {orgName}
            </span>
            <span
              className="text-[11px] uppercase tracking-[0.32em] mt-2"
              style={{ color: 'rgba(234,234,230,0.55)' }}
            >
              Solutions · {t.matrix.weekLabel} {weekNum}
            </span>
          </div>
        </motion.div>

        {/* Clock — Silver Gray digits with Light Blue colon. No gradient;
            the brand keeps it cool and corporate, not dramatic. */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.1 }}
          className="text-right tabular-nums leading-none"
          style={{
            fontSize: 88,
            fontWeight: 300,
            letterSpacing: '-0.03em',
            color: '#EAEAE6',
          }}
        >
          {hh}
          <span
            aria-hidden
            style={{
              color: '#66C4EF',
              opacity: 0.85,
              margin: '0 0.08em',
              animation: 'clockBlink 1.2s ease-in-out infinite',
            }}
          >
            :
          </span>
          {mm}
        </motion.div>
      </div>

      {/* ── Center hero ────────────────────────────────────────────── */}
      <div className="relative flex-1 flex flex-col items-start justify-center px-12 gap-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.2 }}
        >
          <span
            className="block text-[12px] uppercase tracking-[0.32em] mb-3"
            style={{ color: 'rgba(234,234,230,0.55)' }}
          >
            {t.dashboard.views.now}
          </span>
          <h1
            className="calwin-bar"
            style={{
              fontSize: 'clamp(56px, 7vw, 96px)',
              fontWeight: 600,
              letterSpacing: '-0.02em',
              lineHeight: 0.95,
              color: '#EAEAE6',
            }}
          >
            Tilstede i dag
          </h1>
        </motion.div>

        {/* Big number — total office count of the team. Light Blue numerator,
            Silver Gray denominator. The brandbook signature pair. */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.3 }}
          className="flex items-baseline gap-5"
        >
          <span
            className="tabular-nums"
            style={{
              fontSize: 'clamp(120px, 18vw, 220px)',
              fontWeight: 700,
              letterSpacing: '-0.05em',
              lineHeight: 0.85,
              color: '#66C4EF',
            }}
          >
            {totals.office + totals.remote + totals.customer}
          </span>
          <span
            className="tabular-nums"
            style={{
              fontSize: 'clamp(48px, 6vw, 80px)',
              fontWeight: 300,
              color: 'rgba(234,234,230,0.55)',
              letterSpacing: '-0.02em',
            }}
          >
            / {totals.total}
          </span>
        </motion.div>

        {/* Status cards — Silver Gray surface on Blue Violet, with a Light
            Blue calwin-bar above each label. */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.4 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full max-w-5xl"
        >
          <StatusCard label="På kontor"  count={totals.office}   />
          <StatusCard label="Hjemmefra"  count={totals.remote}   />
          <StatusCard label="Hos kunde"  count={totals.customer} />
          <StatusCard label="Borte"      count={totals.away}     />
        </motion.div>
      </div>

      {/* ── Bottom band ────────────────────────────────────────────── */}
      <div className="relative flex items-end justify-between px-12 pb-8">
        <div>
          <span
            className="block text-[11px] uppercase tracking-[0.32em] mb-1.5"
            style={{ color: 'rgba(234,234,230,0.45)' }}
          >
            I dag
          </span>
          <span
            className="text-[20px] font-medium"
            style={{ color: 'rgba(234,234,230,0.9)' }}
          >
            {dateLabel || ' '}
          </span>
        </div>
        <div className="text-right">
          <span
            className="block text-[11px] uppercase tracking-[0.32em] mb-1.5"
            style={{ color: 'rgba(234,234,230,0.45)' }}
          >
            Organisasjon
          </span>
          <span
            className="text-[14px]"
            style={{ color: 'rgba(234,234,230,0.78)' }}
          >
            {initialMembers.length} medlem · {officeCount} kontor · {customerCount} kunde
          </span>
        </div>
      </div>
    </div>
  )
}

function StatusCard({ label, count }: { label: string; count: number }) {
  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-3 calwin-bar"
      style={{
        backgroundColor: 'rgba(234,234,230,0.06)',
        border: '1px solid rgba(234,234,230,0.10)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <span
        className="text-[12px] uppercase tracking-[0.22em]"
        style={{ color: 'rgba(234,234,230,0.65)' }}
      >
        {label}
      </span>
      <span
        className="tabular-nums leading-none"
        style={{
          fontSize: 56,
          fontWeight: 600,
          letterSpacing: '-0.03em',
          color: '#EAEAE6',
        }}
      >
        {count}
      </span>
    </div>
  )
}
