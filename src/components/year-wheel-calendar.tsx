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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: month * 0.035 }}
      whileHover={{ y: -2 }}
      className="relative rounded-2xl p-5 flex flex-col overflow-hidden"
      style={{
        background: isCurrentMonth
          ? 'color-mix(in oklab, var(--bg-elevated) 90%, transparent)'
          : 'color-mix(in oklab, var(--bg-elevated) 78%, transparent)',
        backdropFilter: 'blur(22px) saturate(180%)',
        WebkitBackdropFilter: 'blur(22px) saturate(180%)',
        border: `1px solid ${isCurrentMonth
          ? 'color-mix(in oklab, var(--accent-color) 40%, transparent)'
          : 'color-mix(in oklab, var(--border-subtle) 70%, transparent)'}`,
        boxShadow: isCurrentMonth
          ? '0 14px 32px -14px color-mix(in oklab, var(--accent-color) 40%, transparent), 0 4px 8px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.5)'
          : '0 8px 20px -12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.5)',
      }}
    >
      {/* Accent glow on current month */}
      {isCurrentMonth && (
        <div
          aria-hidden
          className="absolute pointer-events-none"
          style={{
            top: '-30%',
            left: '-20%',
            width: '80%',
            height: '60%',
            background: 'radial-gradient(circle, color-mix(in oklab, var(--accent-color) 28%, transparent), transparent 65%)',
            filter: 'blur(18px)',
          }}
        />
      )}

      <header className="relative flex items-baseline justify-between mb-4">
        <h3
          className="text-[17px] font-semibold"
          style={{
            color: isCurrentMonth ? 'var(--accent-color)' : 'var(--text-primary)',
            fontFamily: 'var(--font-sora)',
            letterSpacing: '-0.02em',
          }}
        >
          {MONTH_FULL[month]}
        </h3>
        {monthEventCount > 0 && (
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md tabular-nums"
            style={{
              color: 'var(--text-tertiary)',
              background: 'color-mix(in oklab, var(--bg-subtle) 80%, transparent)',
              fontFamily: 'var(--font-body)',
              letterSpacing: '0.04em',
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
            className="text-[10px] font-bold text-center uppercase py-1"
            style={{
              color: i >= 5 ? 'var(--text-tertiary)' : 'var(--text-secondary)',
              fontFamily: 'var(--font-body)',
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
      {/* Today disk — Apple Calendar style solid accent */}
      {isToday && (
        <motion.span
          aria-hidden
          layoutId={undefined}
          className="absolute top-0.5 rounded-full"
          style={{
            width: 26,
            height: 26,
            background: 'linear-gradient(135deg, var(--accent-color), color-mix(in oklab, var(--accent-color) 55%, #6B2ECB))',
            boxShadow: '0 4px 12px -2px color-mix(in oklab, var(--accent-color) 45%, transparent), inset 0 1px 0 rgba(255,255,255,0.3)',
          }}
        />
      )}
      <span
        className="relative text-[12.5px] tabular-nums leading-none z-10"
        style={{
          color: isToday
            ? '#ffffff'
            : isWeekend
              ? 'var(--text-tertiary)'
              : 'var(--text-primary)',
          fontFamily: 'var(--font-sora)',
          fontWeight: isToday ? 700 : 500,
          letterSpacing: '-0.01em',
          marginTop: isToday ? 3 : 0,
          textShadow: isToday ? '0 1px 2px rgba(0,0,0,0.2)' : undefined,
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
