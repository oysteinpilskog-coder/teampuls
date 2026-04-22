'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  MONTH_LONG_NB,
  getMonthForWeek,
  getISOWeekForMonth,
  getTodayWeekAndYear,
  getWeekDays,
  getDayLabel,
} from '@/lib/dates'
import { no } from '@/lib/i18n/no'
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
}

export function WeekNav({ week, year, isCurrentWeek, onPrev, onNext, onToday, onJumpTo }: WeekNavProps) {
  const { month: currentMonth, year: currentCalYear } = getMonthForWeek(week, year)
  const weekDays = getWeekDays(week, year)
  const first = getDayLabel(weekDays[0])
  const last = getDayLabel(weekDays[weekDays.length - 1])
  const haptic = useHaptic()
  const rangeLabel =
    first.month === last.month
      ? `${first.day}–${last.day} ${last.month}`
      : `${first.day} ${first.month} – ${last.day} ${last.month}`

  return (
    <div className="flex items-end justify-between gap-6 flex-wrap">
      {/* Title block — eyebrow, month headline, week range subline */}
      <motion.div
        key={`${week}-${year}`}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.gentle}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className="text-[10px] font-bold uppercase tracking-[0.25em]"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
          >
            {no.matrix.weekLabel} {week}
            <span className="mx-2 opacity-50">·</span>
            {rangeLabel}
          </span>
          {isCurrentWeek && (
            <motion.span
              layoutId="current-week-dot"
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full"
              style={{
                background: 'color-mix(in oklab, var(--accent-color) 14%, transparent)',
                color: 'var(--accent-color)',
                fontFamily: 'var(--font-body)',
              }}
            >
              <motion.span
                className="w-1 h-1 rounded-full"
                style={{ background: 'var(--accent-color)' }}
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              />
              <span className="text-[9px] font-bold uppercase tracking-[0.18em]">Nå</span>
            </motion.span>
          )}
        </div>
        <MonthPickerTrigger
          month={currentMonth}
          year={currentCalYear}
          week={week}
          onChange={onJumpTo}
        />
      </motion.div>

      {/* Right — nav cluster (glass pill containing prev, today, next) */}
      <div
        className="flex items-center gap-1 rounded-2xl p-1"
        style={{
          background: 'color-mix(in oklab, var(--bg-elevated) 72%, transparent)',
          backdropFilter: 'blur(18px) saturate(180%)',
          WebkitBackdropFilter: 'blur(18px) saturate(180%)',
          border: '1px solid color-mix(in oklab, var(--border-subtle) 55%, transparent)',
          boxShadow:
            '0 1px 2px rgba(15,23,42,0.04), 0 10px 24px -16px rgba(15,23,42,0.14), inset 0 1px 0 rgba(255,255,255,0.5)',
        }}
      >
        <motion.button
          onClick={() => { haptic('light'); onPrev() }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.94 }}
          transition={spring.snappy}
          className="flex items-center justify-center w-9 h-9 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
          aria-label={no.matrix.prevWeek}
        >
          <ChevronLeft className="w-4 h-4" strokeWidth={2} />
        </motion.button>

        <motion.button
          onClick={() => { haptic('medium'); onToday() }}
          disabled={isCurrentWeek}
          whileHover={isCurrentWeek ? undefined : { scale: 1.03 }}
          whileTap={isCurrentWeek ? undefined : { scale: 0.97 }}
          transition={spring.snappy}
          className="px-3 h-9 rounded-xl text-[12px] font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] disabled:cursor-default"
          style={{
            color: isCurrentWeek ? 'var(--text-tertiary)' : '#ffffff',
            background: isCurrentWeek
              ? 'transparent'
              : 'linear-gradient(135deg, var(--accent-color), color-mix(in oklab, var(--accent-color) 70%, black))',
            boxShadow: isCurrentWeek
              ? 'none'
              : '0 4px 12px color-mix(in oklab, var(--accent-color) 35%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)',
            fontFamily: 'var(--font-body)',
            letterSpacing: '-0.005em',
          }}
        >
          {no.matrix.thisWeek}
        </motion.button>

        <motion.button
          onClick={() => { haptic('light'); onNext() }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.94 }}
          transition={spring.snappy}
          className="flex items-center justify-center w-9 h-9 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
          aria-label={no.matrix.nextWeek}
        >
          <ChevronRight className="w-4 h-4" strokeWidth={2} />
        </motion.button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The month title *is* the picker trigger — click the headline to jump.

interface MonthPickerTriggerProps {
  month: number
  year: number
  week: number
  onChange: (next: { week: number; year: number }) => void
}

function MonthPickerTrigger({ month, year, week, onChange }: MonthPickerTriggerProps) {
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
        className="group inline-flex items-baseline gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] rounded-lg -mx-1 px-1"
        aria-label="Velg måned"
      >
        <span
          className="font-bold leading-[0.95]"
          style={{
            fontFamily: 'var(--font-sora)',
            fontSize: 'clamp(36px, 5vw, 52px)',
            letterSpacing: '-0.045em',
            color: 'var(--text-primary)',
            textTransform: 'capitalize',
          }}
        >
          {MONTH_LONG_NB[month]}
        </span>
        <span
          className="font-semibold tabular-nums leading-[0.95]"
          style={{
            fontFamily: 'var(--font-sora)',
            fontSize: 'clamp(28px, 3.6vw, 40px)',
            letterSpacing: '-0.035em',
            color: 'var(--text-tertiary)',
          }}
        >
          {year}
        </span>
        <motion.span
          aria-hidden
          className="inline-flex items-center justify-center w-5 h-5 rounded-full self-center ml-0.5 opacity-50 group-hover:opacity-100"
          style={{
            background: 'var(--bg-subtle)',
            color: 'var(--text-secondary)',
          }}
          animate={{ rotate: open ? 180 : 0 }}
          transition={spring.snappy}
        >
          <svg viewBox="0 0 12 12" width="10" height="10" fill="none">
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
            aria-label="Forrige år"
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
            aria-label="Neste år"
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
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                transition={spring.snappy}
                className="h-10 rounded-lg text-[13px] font-medium capitalize focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] transition-colors"
                style={{
                  fontFamily: 'var(--font-body)',
                  color: isSelected ? '#fff' : 'var(--text-primary)',
                  background: isSelected
                    ? 'linear-gradient(135deg, var(--accent-color), color-mix(in oklab, var(--accent-color) 70%, black))'
                    : isThisMonth
                      ? 'color-mix(in oklab, var(--accent-color) 12%, transparent)'
                      : 'transparent',
                  boxShadow: isSelected
                    ? '0 4px 12px color-mix(in oklab, var(--accent-color) 35%, transparent)'
                    : undefined,
                  border: isThisMonth && !isSelected
                    ? '1px solid color-mix(in oklab, var(--accent-color) 40%, transparent)'
                    : '1px solid transparent',
                }}
              >
                {MONTH_LONG_NB[monthIdx].slice(0, 3)}
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
          Hopp til i dag
        </motion.button>
      </PopoverContent>
    </Popover>
  )
}
