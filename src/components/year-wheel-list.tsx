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
              className="text-[30px] font-semibold"
              style={{
                color: m === currentMonth ? 'var(--text-primary)' : 'var(--text-primary)',
                fontFamily: 'var(--font-sora)',
                letterSpacing: '-0.025em',
              }}
            >
              {MONTH_FULL[m]}
            </h2>
            <span
              className="text-[18px] font-medium tabular-nums"
              style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-sora)', letterSpacing: '-0.02em' }}
            >
              {year}
            </span>
            {m === currentMonth && (
              <span
                className="ml-auto px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  backgroundColor: 'color-mix(in oklab, var(--accent-color) 20%, transparent)',
                  color: 'var(--accent-color)',
                  fontFamily: 'var(--font-body)',
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
      className="flex items-stretch gap-4 px-4 py-3 rounded-2xl cursor-pointer transition-colors"
      style={{
        background: 'color-mix(in oklab, var(--bg-elevated) 70%, transparent)',
        backdropFilter: 'blur(16px) saturate(160%)',
        WebkitBackdropFilter: 'blur(16px) saturate(160%)',
        border: `1px solid ${isToday ? 'color-mix(in oklab, var(--accent-color) 40%, transparent)' : 'var(--border-subtle)'}`,
        boxShadow: isToday ? '0 0 0 1px color-mix(in oklab, var(--accent-color) 25%, transparent), var(--shadow-sm)' : 'var(--shadow-sm)',
      }}
    >
      <div className="flex flex-col items-center justify-center w-12 flex-shrink-0">
        <span
          className="text-[22px] font-semibold tabular-nums leading-none"
          style={{
            color: isToday ? 'var(--accent-color)' : 'var(--text-primary)',
            fontFamily: 'var(--font-sora)',
            letterSpacing: '-0.02em',
          }}
        >
          {start.getDate()}
        </span>
        <span
          className="text-[10px] uppercase tracking-wider mt-1"
          style={{
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
            letterSpacing: '0.12em',
          }}
        >
          {weekdayAbbr(start)}
        </span>
      </div>

      <div
        className="w-[3px] rounded-full flex-shrink-0"
        style={{
          background: `linear-gradient(180deg, ${color}ee, ${color}66)`,
        }}
      />

      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase"
            style={{
              backgroundColor: `${color}1f`,
              color: color,
              letterSpacing: '0.08em',
              fontFamily: 'var(--font-body)',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
            {CATEGORY_LABELS[event.category]}
          </span>
          <span
            className="text-[12px] tabular-nums"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
          >
            {formatDateRangeNO(event.start_date, event.end_date)}
          </span>
        </div>
        <h3
          className="text-[16px] font-medium truncate"
          style={{
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sora)',
            letterSpacing: '-0.01em',
          }}
        >
          {event.title}
        </h3>
        {event.description && (
          <p
            className="text-[13px] line-clamp-1"
            style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
          >
            {event.description}
          </p>
        )}
      </div>
    </motion.li>
  )
}

