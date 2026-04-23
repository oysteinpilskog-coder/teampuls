'use client'

import { motion } from 'framer-motion'
import { CATEGORY_COLORS } from '@/components/event-editor'
import type { OrgEvent } from '@/lib/supabase/types'
import {
  MONTH_FULL,
  WEEKDAY_INITIALS,
  getWeekdayIdx,
} from './year-wheel-shared'

interface CalendarViewProps {
  year: number
  today: Date
  events: OrgEvent[]
  onSelect: (ev: OrgEvent) => void
}

export function CalendarView({ year, today, events, onSelect }: CalendarViewProps) {
  // Pre-bucket events by ymd string for fast lookup
  const byYmd = new Map<string, OrgEvent[]>()
  for (const ev of events) {
    const start = new Date(ev.start_date + 'T12:00:00')
    const end = new Date(ev.end_date + 'T12:00:00')
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (d.getFullYear() !== year) continue
      const key = d.toISOString().slice(0, 10)
      if (!byYmd.has(key)) byYmd.set(key, [])
      byYmd.get(key)!.push(ev)
    }
  }

  return (
    <div
      className="w-full max-w-[1180px] mx-auto grid gap-6"
      style={{
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      }}
    >
      {Array.from({ length: 12 }, (_, m) => (
        <MiniMonth
          key={m}
          year={year}
          month={m}
          today={today}
          byYmd={byYmd}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

function MiniMonth({
  year,
  month,
  today,
  byYmd,
  onSelect,
}: {
  year: number
  month: number
  today: Date
  byYmd: Map<string, OrgEvent[]>
  onSelect: (ev: OrgEvent) => void
}) {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstWd = getWeekdayIdx(new Date(year, month, 1))
  const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year
  const todayDate = isCurrentMonth ? today.getDate() : -1

  // Count events in month for header chip
  let monthEventCount = 0
  for (let d = 1; d <= daysInMonth; d++) {
    const ymd = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const list = byYmd.get(ymd)
    if (list) monthEventCount += list.length
  }

  const cells: Array<{ day: number | null; ymd?: string }> = []
  for (let i = 0; i < firstWd; i++) cells.push({ day: null })
  for (let d = 1; d <= daysInMonth; d++) {
    const ymd = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({ day: d, ymd })
  }
  while (cells.length % 7 !== 0) cells.push({ day: null })

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: month * 0.025, ease: [0.4, 0, 0.2, 1] }}
      className="relative rounded-2xl p-5 flex flex-col overflow-hidden"
      style={{
        background: isCurrentMonth ? 'rgba(22, 22, 27, 0.55)' : 'var(--lg-surface-1)',
        backdropFilter: isCurrentMonth ? 'blur(20px) saturate(180%)' : undefined,
        WebkitBackdropFilter: isCurrentMonth ? 'blur(20px) saturate(180%)' : undefined,
        border: `1px solid ${isCurrentMonth
          ? 'rgba(139, 92, 246, 0.28)'
          : 'var(--lg-divider)'}`,
        boxShadow: isCurrentMonth
          ? '0 0 0 3px rgba(139, 92, 246, 0.10), 0 0 24px -6px var(--lg-accent-glow)'
          : 'none',
      }}
    >
      <header className="relative flex items-baseline justify-between mb-4">
        <h3
          className="lg-serif capitalize"
          style={{
            color: isCurrentMonth ? 'var(--lg-accent)' : 'var(--lg-text-1)',
            fontSize: 22,
          }}
        >
          {MONTH_FULL[month]}
        </h3>
        {monthEventCount > 0 && (
          <span
            className="lg-mono text-[10px] px-1.5 py-0.5 rounded-md"
            style={{
              color: 'var(--lg-text-3)',
              background: 'var(--lg-surface-2)',
              border: '1px solid var(--lg-divider)',
            }}
          >
            {monthEventCount}
          </span>
        )}
      </header>

      {/* Weekday header */}
      <div className="relative grid grid-cols-7 gap-px mb-1.5">
        {WEEKDAY_INITIALS.map((wd, i) => (
          <div
            key={i}
            className="lg-mono text-[10px] font-medium text-center uppercase py-1"
            style={{
              color: i >= 5 ? 'var(--lg-text-3)' : 'var(--lg-text-2)',
              letterSpacing: '0.14em',
            }}
          >
            {wd}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="relative grid grid-cols-7 gap-px">
        {cells.map((c, idx) => {
          if (c.day === null) return <div key={idx} className="aspect-square" />

          const dayEvents = c.ymd ? byYmd.get(c.ymd) ?? [] : []
          const isToday = c.day === todayDate
          const weekendCol = idx % 7 >= 5

          return (
            <DayCell
              key={idx}
              day={c.day}
              isToday={isToday}
              isWeekend={weekendCol}
              events={dayEvents}
              onSelect={onSelect}
            />
          )
        })}
      </div>
    </motion.div>
  )
}

function DayCell({
  day,
  isToday,
  isWeekend,
  events,
  onSelect,
}: {
  day: number
  isToday: boolean
  isWeekend: boolean
  events: OrgEvent[]
  onSelect: (ev: OrgEvent) => void
}) {
  const primaryEvent = events[0]
  const onClick = primaryEvent ? () => onSelect(primaryEvent) : undefined

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!primaryEvent}
      className="relative aspect-square flex flex-col items-center justify-start pt-1.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] disabled:cursor-default"
      style={{ cursor: primaryEvent ? 'pointer' : 'default' }}
    >
      {/* Today disk — violet with soft ring */}
      {isToday && (
        <motion.span
          aria-hidden
          layoutId={undefined}
          className="absolute top-0.5 rounded-full"
          style={{
            width: 24,
            height: 24,
            background: 'var(--lg-accent)',
            boxShadow: '0 0 0 3px rgba(139, 92, 246, 0.18), 0 0 16px var(--lg-accent-glow)',
          }}
        />
      )}
      <span
        className="lg-mono relative text-[12px] leading-none z-10"
        style={{
          color: isToday
            ? '#ffffff'
            : isWeekend
              ? 'var(--lg-text-3)'
              : 'var(--lg-text-1)',
          fontWeight: isToday ? 500 : 400,
          marginTop: isToday ? 3 : 0,
        }}
      >
        {day}
      </span>

      {/* Event dots — up to 4 */}
      {events.length > 0 && (
        <div className="relative mt-auto mb-1 flex gap-1 items-center justify-center">
          {events.slice(0, 4).map((ev, i) => {
            const color = ev.color ?? CATEGORY_COLORS[ev.category]
            return (
              <span
                key={ev.id + '-' + i}
                className="block rounded-full"
                style={{
                  width: 5,
                  height: 5,
                  background: color,
                  boxShadow: `0 0 6px color-mix(in oklab, ${color} 70%, transparent)`,
                }}
              />
            )
          })}
          {events.length > 4 && (
            <span
              className="text-[8px] font-bold leading-none"
              style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
            >
              +{events.length - 4}
            </span>
          )}
        </div>
      )}
    </button>
  )
}
