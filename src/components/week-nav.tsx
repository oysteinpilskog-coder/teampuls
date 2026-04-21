'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { no } from '@/lib/i18n/no'
import { spring } from '@/lib/motion'
import { MonthPicker } from '@/components/month-picker'

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
  return (
    <div className="flex items-center gap-4">
      {/* Prev / Next buttons, glass style */}
      <div
        className="flex items-center gap-1 rounded-xl p-1"
        style={{
          background: 'color-mix(in oklab, var(--bg-elevated) 60%, transparent)',
          backdropFilter: 'blur(14px) saturate(180%)',
          WebkitBackdropFilter: 'blur(14px) saturate(180%)',
          border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
      >
        <motion.button
          onClick={onPrev}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.94 }}
          transition={spring.snappy}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
          aria-label={no.matrix.prevWeek}
        >
          <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
        </motion.button>
        <motion.button
          onClick={onNext}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.94 }}
          transition={spring.snappy}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
          aria-label={no.matrix.nextWeek}
        >
          <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
        </motion.button>
      </div>

      {/* Week label — display-scale */}
      <motion.div
        key={`${week}-${year}`}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.gentle}
        className="flex items-baseline gap-2"
      >
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.2em]"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
        >
          {no.matrix.weekLabel}
        </span>
        <span
          className="text-[40px] font-bold tabular-nums leading-none"
          style={{
            fontFamily: 'var(--font-sora)',
            letterSpacing: '-0.035em',
            color: 'var(--text-primary)',
            background: isCurrentWeek
              ? 'linear-gradient(135deg, var(--accent-color), hsl(260, 80%, 60%))'
              : undefined,
            WebkitBackgroundClip: isCurrentWeek ? 'text' : undefined,
            WebkitTextFillColor: isCurrentWeek ? 'transparent' : undefined,
            backgroundClip: isCurrentWeek ? 'text' : undefined,
          }}
        >
          {week}
        </span>
        <span
          className="text-[14px] font-medium tabular-nums"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
        >
          {year}
        </span>
      </motion.div>

      {/* Month picker — jump to any month */}
      <MonthPicker week={week} year={year} onChange={onJumpTo} />

      {/* Today shortcut — accent pill */}
      {!isCurrentWeek && (
        <motion.button
          onClick={onToday}
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          transition={spring.snappy}
          className="ml-1 px-3.5 h-8 rounded-xl text-[12px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
          style={{
            color: '#fff',
            background: 'linear-gradient(135deg, var(--accent-color), hsl(235, 85%, 55%))',
            boxShadow: '0 4px 12px rgba(0, 102, 255, 0.28)',
            fontFamily: 'var(--font-body)',
          }}
        >
          {no.matrix.thisWeek}
        </motion.button>
      )}
    </div>
  )
}
