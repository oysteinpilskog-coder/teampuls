'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { MONTH_LONG_NB, getMonthForWeek, getISOWeekForMonth, getTodayWeekAndYear } from '@/lib/dates'
import { spring } from '@/lib/motion'

interface MonthPickerProps {
  week: number
  year: number
  onChange: (next: { week: number; year: number }) => void
}

export function MonthPicker({ week, year, onChange }: MonthPickerProps) {
  const { month: currentMonth, year: currentCalYear } = getMonthForWeek(week, year)
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(currentCalYear)

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
        if (next) setViewYear(currentCalYear)
      }}
    >
      <PopoverTrigger
        className="flex items-baseline gap-1.5 px-3 h-9 rounded-xl text-[13px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] transition-transform hover:-translate-y-px active:scale-[0.97]"
        style={{
          background: 'color-mix(in oklab, var(--bg-elevated) 60%, transparent)',
          backdropFilter: 'blur(14px) saturate(180%)',
          WebkitBackdropFilter: 'blur(14px) saturate(180%)',
          border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-body)',
          letterSpacing: '-0.005em',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
        aria-label="Velg måned"
      >
        <span style={{ textTransform: 'capitalize' }}>{MONTH_LONG_NB[currentMonth]}</span>
        <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>{currentCalYear}</span>
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={6} className="w-72 p-3">
        {/* Year stepper */}
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

        {/* Month grid */}
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 12 }, (_, i) => i).map((monthIdx) => {
            const isSelected = viewYear === currentCalYear && monthIdx === currentMonth
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
                    ? 'linear-gradient(135deg, var(--accent-color), hsl(235, 85%, 55%))'
                    : isThisMonth
                      ? 'color-mix(in oklab, var(--accent-color) 12%, transparent)'
                      : 'transparent',
                  boxShadow: isSelected
                    ? '0 4px 12px rgba(0, 102, 255, 0.28)'
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

        {/* Today shortcut */}
        <motion.button
          onClick={() => {
            onChange({ week: today.week, year: today.year })
            setOpen(false)
          }}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.97 }}
          transition={spring.snappy}
          className="mt-3 w-full h-8 rounded-lg text-[12px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
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
