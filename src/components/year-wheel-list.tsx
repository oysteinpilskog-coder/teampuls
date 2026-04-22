'use client'

import { motion } from 'framer-motion'
import { CATEGORY_COLORS } from '@/components/event-editor'
import type { OrgEvent } from '@/lib/supabase/types'
import {
  MONTH_FULL,
  CATEGORY_LABELS,
  formatDateRangeNO,
  weekdayAbbr,
} from './year-wheel-shared'

interface ListViewProps {
  year: number
  today: Date
  events: OrgEvent[]
  onSelect: (ev: OrgEvent) => void
}

export function ListView({ year, today, events, onSelect }: ListViewProps) {
  const todayYmd = today.toISOString().slice(0, 10)

  // Group by month of start_date. Sorted events by start.
  const sorted = [...events].sort((a, b) => a.start_date.localeCompare(b.start_date))
  const byMonth = new Map<number, OrgEvent[]>()
  for (const ev of sorted) {
    const m = new Date(ev.start_date + 'T12:00:00').getMonth()
    if (!byMonth.has(m)) byMonth.set(m, [])
    byMonth.get(m)!.push(ev)
  }
  const months = Array.from(byMonth.keys()).sort((a, b) => a - b)
  const currentMonth = today.getMonth()

  if (months.length === 0) {
    return (
      <div className="w-full max-w-[680px] mx-auto py-16 flex flex-col items-center gap-3 text-center">
        <p className="text-[15px]" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
          Ingen hendelser registrert for {year} ennå.
        </p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-[760px] mx-auto flex flex-col gap-10">
      {months.map((m, mi) => (
        <motion.section
          key={m}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: mi * 0.05 }}
          className="flex flex-col"
        >
          <header className="flex items-baseline gap-3 mb-4 sticky top-2 z-10">
            <h2
              className="lg-serif capitalize"
              style={{
                color: 'var(--lg-text-1)',
                fontSize: 36,
              }}
            >
              {MONTH_FULL[m]}
            </h2>
            <span
              className="lg-mono"
              style={{ color: 'var(--lg-text-3)', fontSize: 16 }}
            >
              {year}
            </span>
            {m === currentMonth && (
              <span
                className="lg-mono ml-auto px-2 py-0.5 rounded-full text-[9.5px] font-medium uppercase"
                style={{
                  backgroundColor: 'rgba(139, 92, 246, 0.12)',
                  color: 'var(--lg-accent)',
                  border: '1px solid rgba(139, 92, 246, 0.28)',
                  letterSpacing: '0.2em',
                }}
              >
                Nå
              </span>
            )}
          </header>

          <ul className="flex flex-col gap-2">
            {byMonth.get(m)!.map((ev, i) => (
              <EventRow
                key={ev.id}
                event={ev}
                isToday={ev.start_date <= todayYmd && ev.end_date >= todayYmd}
                onSelect={() => onSelect(ev)}
                delay={mi * 0.05 + i * 0.025}
              />
            ))}
          </ul>
        </motion.section>
      ))}
    </div>
  )
}

function EventRow({
  event,
  isToday,
  onSelect,
  delay,
}: {
  event: OrgEvent
  isToday: boolean
  onSelect: () => void
  delay: number
}) {
  const color = event.color ?? CATEGORY_COLORS[event.category]
  const start = new Date(event.start_date + 'T12:00:00')

  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay }}
      whileHover={{ x: 4 }}
      onClick={onSelect}
      className="flex items-stretch gap-4 px-4 py-3 rounded-xl cursor-pointer transition-[background,border-color] duration-200"
      style={{
        background: 'var(--lg-surface-1)',
        border: `1px solid ${isToday ? 'rgba(139, 92, 246, 0.28)' : 'var(--lg-divider)'}`,
        boxShadow: isToday
          ? 'inset 2px 0 0 var(--lg-accent), 0 0 18px -10px var(--lg-accent-glow)'
          : `inset 2px 0 0 ${color}`,
      }}
    >
      <div className="flex flex-col items-center justify-center w-12 flex-shrink-0">
        <span
          className="lg-mono text-[22px] leading-none"
          style={{
            color: isToday ? 'var(--lg-accent)' : 'var(--lg-text-1)',
            fontWeight: 500,
          }}
        >
          {start.getDate()}
        </span>
        <span
          className="lg-mono text-[10px] uppercase mt-1"
          style={{
            color: 'var(--lg-text-3)',
            fontWeight: 500,
            letterSpacing: '0.18em',
          }}
        >
          {weekdayAbbr(start)}
        </span>
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
        <div className="flex items-center gap-2">
          <span
            className="lg-mono inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase"
            style={{
              backgroundColor: `${color}1a`,
              color: color,
              letterSpacing: '0.14em',
              border: `1px solid ${color}33`,
            }}
          >
            <span className="w-1 h-1 rounded-full" style={{ backgroundColor: color }} />
            {CATEGORY_LABELS[event.category]}
          </span>
          <span
            className="lg-mono text-[11.5px]"
            style={{ color: 'var(--lg-text-3)' }}
          >
            {formatDateRangeNO(event.start_date, event.end_date)}
          </span>
        </div>
        <h3
          className="lg-serif truncate"
          style={{
            color: 'var(--lg-text-1)',
            fontSize: 18,
          }}
        >
          {event.title}
        </h3>
        {event.description && (
          <p
            className="text-[13px] line-clamp-1"
            style={{ color: 'var(--lg-text-2)', fontFamily: 'var(--font-body)' }}
          >
            {event.description}
          </p>
        )}
      </div>
    </motion.li>
  )
}

