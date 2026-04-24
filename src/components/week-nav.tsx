'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  getMonthForWeek,
  getISOWeekForMonth,
  getTodayWeekAndYear,
  getWeekDays,
  getDayLabel,
} from '@/lib/dates'
import { useT } from '@/lib/i18n/context'
import { spring } from '@/lib/motion'
import { useHaptic } from '@/hooks/use-haptic'

interface WeekNavProps {
  week: number
  year: number
  isCurrentWeek: boolean
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onJumpTo: (next: { week: number; year: number }) => void
  /** Live metrics shown only on the current week (hides on past/future weeks). */
  metrics?: {
    memberCount: number
    registeredToday: number
    distinctLocations: number
  } | null
}

/**
 * WeekNav — compact single-row strip that lives under the AI input.
 *
 * Left: eyebrow pill with week number, date range, live NÅ pulse, plus the
 * "5/8 på plass · 4 steder" metrics when viewing the current week.
 * Right: previous / "Denne uken" / next pill.
 *
 * The giant "April 2026" serif heading is intentionally absent — the matrix
 * below already renders the day numbers with month context in its header,
 * and duplicating it costs vertical real estate that the at-a-glance view
 * can't afford.
 */
export function WeekNav({
  week,
  year,
  isCurrentWeek,
  onPrev,
  onNext,
  onToday,
  onJumpTo,
  metrics,
}: WeekNavProps) {
  const t = useT()
  const { month: currentMonth, year: currentCalYear } = getMonthForWeek(week, year)
  const weekDays = getWeekDays(week, year)
  const first = getDayLabel(weekDays[0], t)
  const last = getDayLabel(weekDays[weekDays.length - 1], t)
  const haptic = useHaptic()
  const rangeLabel =
    first.month === last.month
      ? `${first.day}–${last.day} ${last.month}`
      : `${first.day} ${first.month} – ${last.day} ${last.month}`

  const showMetrics = !!metrics && isCurrentWeek && metrics.memberCount > 0

  // Today's weekday + date label — shown only when the user is on the
  // current week. Lives in the meta strip at the same visual weight as the
  // rest of the line (the old italic Fraunces hero was beautiful but ate
  // a whole row). Computed after mount so server and client agree even if
  // the clock ticks across midnight between SSR and hydration.
  const [todayLabel, setTodayLabel] = useState<string>('')
  useEffect(() => {
    const now = new Date()
    setTodayLabel(`${t.dates.weekdaysLong[now.getDay()]} ${now.getDate()}. ${t.dates.monthsLong[now.getMonth()]}`)
  }, [t])

  return (
    <motion.div
      key={`${week}-${year}`}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.gentle}
      className="flex items-center justify-between gap-4 flex-wrap"
    >
      {/* Left: single-line meta — today · week · range · NÅ · metrics · month picker */}
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        {isCurrentWeek && todayLabel && (
          <span
            className="lg-eyebrow tabular-nums whitespace-nowrap capitalize"
            style={{ color: 'var(--lg-text-1)' }}
            suppressHydrationWarning
          >
            {todayLabel}
            <span aria-hidden className="mx-2 opacity-40">·</span>
          </span>
        )}
        <span className="lg-eyebrow tabular-nums whitespace-nowrap">
          {t.matrix.weekLabel} {week}
          <span className="mx-2 opacity-50">·</span>
          {rangeLabel}
        </span>

        {isCurrentWeek && (
          <motion.span
            layoutId="current-week-dot"
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full"
            style={{
              background: 'rgba(139, 92, 246, 0.12)',
              color: 'var(--lg-accent)',
              border: '1px solid rgba(139, 92, 246, 0.28)',
              fontFamily: 'var(--font-body)',
            }}
          >
            <motion.span
              className="w-1 h-1 rounded-full"
              style={{ background: 'var(--lg-accent)', boxShadow: '0 0 6px var(--lg-accent-glow)' }}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            />
            <span className="lg-mono text-[9px] font-medium uppercase" style={{ letterSpacing: '0.2em' }}>Nå</span>
          </motion.span>
        )}

        {showMetrics && (
          <span
            className="lg-eyebrow tabular-nums whitespace-nowrap"
            style={{ color: 'var(--lg-text-2)' }}
          >
            <span aria-hidden className="mr-2 opacity-40">·</span>
            {metrics!.registeredToday}/{metrics!.memberCount} på plass
            {metrics!.distinctLocations > 0 && (
              <>
                <span aria-hidden className="mx-2 opacity-40">·</span>
                {metrics!.distinctLocations}{' '}
                {metrics!.distinctLocations === 1 ? t.today.place : t.today.places}
              </>
            )}
          </span>
        )}

        <MonthPickerTrigger
          month={currentMonth}
          year={currentCalYear}
          week={week}
          onChange={onJumpTo}
        />
      </div>

      {/* Right: glass pill with prev, today, next */}
      <div
        className="flex items-center gap-0.5 rounded-full p-1 shrink-0"
        style={{
          background: 'rgba(22, 22, 27, 0.5)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid var(--lg-divider)',
        }}
      >
        <button
          onClick={() => { haptic('light'); onPrev() }}
          className="flex items-center justify-center w-8 h-8 rounded-full transition-colors duration-150 focus:outline-none"
          style={{ color: 'var(--lg-text-2)' }}
          aria-label={t.matrix.prevWeek}
        >
          <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
        </button>

        <motion.button
          onClick={() => { haptic('medium'); onToday() }}
          disabled={isCurrentWeek}
          transition={spring.snappy}
          className="px-3 h-8 rounded-full text-[11.5px] font-medium transition-[box-shadow,background,color] duration-150 focus:outline-none disabled:cursor-default"
          style={{
            color: isCurrentWeek ? 'var(--lg-text-3)' : '#ffffff',
            background: isCurrentWeek ? 'transparent' : 'var(--lg-accent)',
            boxShadow: isCurrentWeek
              ? 'none'
              : '0 0 0 3px rgba(139, 92, 246, 0.18), 0 0 20px var(--lg-accent-glow)',
            fontFamily: 'var(--font-body)',
          }}
        >
          {t.matrix.thisWeek}
        </motion.button>

        <button
          onClick={() => { haptic('light'); onNext() }}
          className="flex items-center justify-center w-8 h-8 rounded-full transition-colors duration-150 focus:outline-none"
          style={{ color: 'var(--lg-text-2)' }}
          aria-label={t.matrix.nextWeek}
        >
          <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
        </button>
      </div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Compact month picker — a small chip instead of a giant serif heading.

interface MonthPickerTriggerProps {
  month: number
  year: number
  week: number
  onChange: (next: { week: number; year: number }) => void
}

function MonthPickerTrigger({ month, year, week, onChange }: MonthPickerTriggerProps) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(year)

  const today = getTodayWeekAndYear()
  const todayMonthInfo = getMonthForWeek(today.week, today.year)

  function selectMonth(monthIdx: number) {
    const next = getISOWeekForMonth(viewYear, monthIdx)
    onChange(next)
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next: boolean) => {
        setOpen(next)
        if (next) setViewYear(year)
      }}
    >
      <PopoverTrigger
        className="group inline-flex items-center gap-1.5 focus:outline-none rounded-full px-2.5 h-6 transition-colors duration-150 hover:bg-[var(--lg-surface-2)]"
        aria-label={t.matrix.selectMonth}
        style={{
          border: '1px solid var(--lg-divider)',
          background: 'transparent',
        }}
      >
        <span
          className="capitalize"
          style={{
            color: 'var(--lg-text-1)',
            fontFamily: 'var(--font-body)',
            fontSize: 11.5,
            fontWeight: 500,
            letterSpacing: '-0.005em',
          }}
        >
          {t.dates.monthsLong[month]}
        </span>
        <span
          className="lg-mono"
          style={{ color: 'var(--lg-text-3)', fontSize: 10.5 }}
        >
          {year}
        </span>
        <motion.span
          aria-hidden
          animate={{ rotate: open ? 180 : 0 }}
          transition={spring.snappy}
          style={{ color: 'var(--lg-text-3)' }}
        >
          <svg viewBox="0 0 12 12" width="9" height="9" fill="none">
            <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.span>
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={8} className="w-72 p-3">
        <div className="flex items-center justify-between mb-3">
          <motion.button
            onClick={() => setViewYear(viewYear - 1)}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            transition={spring.snappy}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
            aria-label={t.matrix.prevYear}
          >
            <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
          </motion.button>
          <span
            className="text-[15px] font-semibold tabular-nums"
            style={{ fontFamily: 'var(--font-sora)', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}
          >
            {viewYear}
          </span>
          <motion.button
            onClick={() => setViewYear(viewYear + 1)}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            transition={spring.snappy}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
            aria-label={t.matrix.nextYear}
          >
            <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
          </motion.button>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 12 }, (_, i) => i).map((monthIdx) => {
            const isSelected = viewYear === year && monthIdx === month
            const isThisMonth = viewYear === todayMonthInfo.year && monthIdx === todayMonthInfo.month
            return (
              <motion.button
                key={monthIdx}
                onClick={() => selectMonth(monthIdx)}
                whileTap={{ scale: 0.97 }}
                transition={spring.snappy}
                className="h-10 rounded-lg text-[13px] font-medium capitalize focus:outline-none transition-colors duration-150"
                style={{
                  fontFamily: 'var(--font-body)',
                  color: isSelected ? '#fff' : 'var(--lg-text-1)',
                  background: isSelected
                    ? 'var(--lg-accent)'
                    : isThisMonth
                      ? 'rgba(139, 92, 246, 0.1)'
                      : 'transparent',
                  boxShadow: isSelected
                    ? '0 0 0 3px rgba(139, 92, 246, 0.18), 0 0 20px var(--lg-accent-glow)'
                    : undefined,
                  border: isThisMonth && !isSelected
                    ? '1px solid rgba(139, 92, 246, 0.35)'
                    : '1px solid transparent',
                }}
              >
                {t.dates.monthsLong[monthIdx].slice(0, 3)}
              </motion.button>
            )
          })}
        </div>

        <motion.button
          onClick={() => {
            onChange({ week: today.week, year: today.year })
            setOpen(false)
          }}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.97 }}
          transition={spring.snappy}
          disabled={week === today.week && year === today.year}
          className="mt-3 w-full h-8 rounded-lg text-[12px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] disabled:opacity-50 disabled:cursor-default"
          style={{
            color: 'var(--text-secondary)',
            background: 'var(--bg-subtle)',
            fontFamily: 'var(--font-body)',
          }}
        >
          {t.hotkeys.k.today}
        </motion.button>
      </PopoverContent>
    </Popover>
  )
}
