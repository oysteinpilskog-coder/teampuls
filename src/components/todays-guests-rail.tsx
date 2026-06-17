'use client'

import { motion } from 'framer-motion'
import { useTodaysVisits } from '@/hooks/use-todays-visits'
import { useT } from '@/lib/i18n/context'
import { spring } from '@/lib/motion'
import type { Visit } from '@/lib/supabase/types'

interface TodaysGuestsRailProps {
  orgIds: string[]
  /** SSR-prefetched seed for instant first paint, before realtime takes over. */
  initial?: Visit[]
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  const initials = parts.map(p => p[0]?.toUpperCase() ?? '').join('')
  return initials || '?'
}

function trimSeconds(time: string): string {
  return time.length >= 5 ? time.slice(0, 5) : time
}

/**
 * «Dagens gjester»-rail på forsiden.
 *
 * Vises kun når det faktisk er forventede besøk i dag — tom dag = ingen
 * rail i det hele tatt, så forsiden forblir ren. Funksjonen oppdages
 * gjennom AI-feltets placeholder-eksempler og gjeste-chip på TV-en, ikke
 * gjennom et permanent tomt kort på forsiden.
 *
 * Skiller seg fra TV-ens Velkomst-slide F:
 * - Viser HELE dagen, ikke bare 60-min-vinduet
 * - Designet for forside-konteksten (lyst/mørkt tema), ikke Espresso-låst
 * - Kompakt rail-format, ikke hero-slide
 *
 * Deler `useTodaysVisits`-kanalen med dashboardet, så samme realtime-data
 * gjenbrukes uten dobbel-subscription per klient.
 */
export function TodaysGuestsRail({ orgIds, initial }: TodaysGuestsRailProps) {
  const t = useT()
  const visits = useTodaysVisits(orgIds, { initial })

  if (visits.length === 0) return null

  return (
    <section
      aria-label={t.guests.todaysTitle}
      className="rounded-2xl px-5 py-4"
      style={{
        background: 'color-mix(in oklab, var(--bg-elevated) 78%, transparent)',
        border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3
          className="text-[11px] font-semibold tracking-[0.28em] uppercase leading-none"
          style={{
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-body)',
          }}
        >
          {t.guests.todaysTitle}
        </h3>
        <span
          className="tabular-nums text-[11px] font-semibold leading-none"
          style={{
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-body)',
          }}
          aria-hidden
        >
          {visits.length}
        </span>
      </div>

      <div className="flex flex-wrap gap-2.5">
        {visits.map((v, i) => (
          <GuestCard key={v.id} visit={v} delay={0.05 + i * 0.04} t={t} />
        ))}
      </div>
    </section>
  )
}

function GuestCard({
  visit,
  delay,
  t,
}: {
  visit: Visit
  delay: number
  t: ReturnType<typeof useT>
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring.gentle, delay }}
      className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 min-w-[220px] flex-1"
      style={{
        background: 'color-mix(in oklab, var(--bg-subtle) 60%, transparent)',
        border: '1px solid color-mix(in oklab, var(--border-subtle) 55%, transparent)',
      }}
    >
      {/* Initial-medaljon — accent-tinted, samme språk som teammedaljonene
          i TeamGrid for konsistens. */}
      <div
        className="flex items-center justify-center rounded-full text-[12px] font-semibold shrink-0"
        style={{
          width: 38,
          height: 38,
          background: 'color-mix(in oklab, var(--accent-color) 18%, transparent)',
          border: '1px solid color-mix(in oklab, var(--accent-color) 35%, transparent)',
          color: 'color-mix(in oklab, var(--accent-color) 60%, var(--text-primary))',
          fontFamily: 'var(--font-fraunces)',
          letterSpacing: '0.04em',
        }}
        aria-hidden
      >
        {getInitials(visit.visitor_name)}
      </div>

      <div className="flex flex-col min-w-0 flex-1">
        <span
          className="text-[14px] font-medium leading-tight truncate"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
        >
          {visit.visitor_name}
        </span>
        <span
          className="text-[12px] leading-tight mt-0.5 truncate"
          style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
        >
          <span className="tabular-nums">
            {visit.start_time
              ? t.guests.at.replace('{time}', trimSeconds(visit.start_time))
              : t.guests.allDay}
          </span>
          {visit.visitor_company && (
            <>
              <span
                aria-hidden
                style={{ margin: '0 0.5em', color: 'var(--text-tertiary)' }}
              >
                ·
              </span>
              <span>{visit.visitor_company}</span>
            </>
          )}
        </span>
      </div>
    </motion.div>
  )
}
