'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  addDays, addMonths, differenceInDays, endOfISOWeek, endOfMonth,
  isSameDay, parseISO, startOfISOWeek, startOfMonth, getISOWeek,
} from 'date-fns'
import { toDateString } from '@/lib/dates'
import { spring } from '@/lib/motion'
import { useT } from '@/lib/i18n/context'
import { TypeableDateInput } from '@/components/typeable-date-input'

interface DatePickerProps {
  value: string
  onChange: (date: string) => void
  placeholder?: string
  accentColor?: string
}

export function DatePicker({
  value,
  onChange,
  placeholder,
  accentColor = 'var(--accent-color)',
}: DatePickerProps) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const selected = value ? parseISO(value) : null
  const [anchorMonth, setAnchorMonth] = useState<Date>(() =>
    startOfMonth(selected ?? new Date())
  )

  // Keep the visible month in sync when value changes externally (e.g. opening
  // the modal in edit mode, or typing a date that lands in another month).
  useEffect(() => {
    if (selected) setAnchorMonth(startOfMonth(selected))
  }, [value])

  // Close on outside click and Escape.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function selectDay(d: Date) {
    onChange(toDateString(d))
    setOpen(false)
  }

  function clear() {
    onChange('')
    setOpen(false)
  }

  function pickToday() {
    const today = new Date()
    setAnchorMonth(startOfMonth(today))
    onChange(toDateString(today))
    setOpen(false)
  }

  return (
    <div ref={wrapperRef} className="relative">
      <TypeableDateInput
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        accentColor={accentColor}
        onFocus={() => setOpen(true)}
      />

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={spring.snappy}
            // Keep focus on the typeable input when interacting with the
            // popover (clicks here would otherwise pull focus and trigger
            // the input's blur formatting before the day-click registers).
            onMouseDown={e => e.preventDefault()}
            className="absolute left-0 right-0 z-30 mt-2 rounded-2xl p-3"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
              transformOrigin: 'top center',
            }}
          >
            <MonthNav
              month={anchorMonth}
              onPrev={() => setAnchorMonth(addMonths(anchorMonth, -1))}
              onNext={() => setAnchorMonth(addMonths(anchorMonth, 1))}
              monthLabel={`${t.dates.monthsLongCap[anchorMonth.getMonth()]} ${anchorMonth.getFullYear()}`}
              prevLabel={t.dateRangePicker.prevMonth}
              nextLabel={t.dateRangePicker.nextMonth}
            />
            <MonthGrid
              month={anchorMonth}
              selected={selected}
              accentColor={accentColor}
              onSelect={selectDay}
              weekdaysShort={t.dates.weekdaysShort}
            />
            <div className="flex items-center justify-between gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <button
                type="button"
                onClick={clear}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
                style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
              >
                {t.datePicker.clear}
              </button>
              <button
                type="button"
                onClick={pickToday}
                className="px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors"
                style={{
                  color: accentColor,
                  backgroundColor: `color-mix(in oklab, ${accentColor} 12%, transparent)`,
                  fontFamily: 'var(--font-body)',
                }}
              >
                {t.datePicker.today}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

interface MonthNavProps {
  month: Date
  onPrev: () => void
  onNext: () => void
  monthLabel: string
  prevLabel: string
  nextLabel: string
}

function MonthNav({ onPrev, onNext, monthLabel, prevLabel, nextLabel }: MonthNavProps) {
  return (
    <div className="flex items-center justify-between mb-2 px-1">
      <motion.button
        type="button"
        onClick={onPrev}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        transition={spring.snappy}
        className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
        style={{ color: 'var(--text-secondary)' }}
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-subtle)')}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
        aria-label={prevLabel}
      >
        <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
      </motion.button>

      <div
        className="text-[13px] font-semibold"
        style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-fraunces)' }}
      >
        {monthLabel}
      </div>

      <motion.button
        type="button"
        onClick={onNext}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        transition={spring.snappy}
        className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
        style={{ color: 'var(--text-secondary)' }}
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-subtle)')}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
        aria-label={nextLabel}
      >
        <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
      </motion.button>
    </div>
  )
}

interface MonthGridProps {
  month: Date
  selected: Date | null
  accentColor: string
  onSelect: (d: Date) => void
  weekdaysShort: readonly string[]
}

function MonthGrid({ month, selected, accentColor, onSelect, weekdaysShort }: MonthGridProps) {
  // Sunday-first → Mon-first, trimmed to two letters.
  const weekHeader = [
    weekdaysShort[1], weekdaysShort[2], weekdaysShort[3], weekdaysShort[4],
    weekdaysShort[5], weekdaysShort[6], weekdaysShort[0],
  ].map(s => s.slice(0, 2))

  const firstCell = startOfISOWeek(startOfMonth(month))
  const lastCell = endOfISOWeek(endOfMonth(month))
  const totalCells = differenceInDays(lastCell, firstCell) + 1
  const weekCount = Math.ceil(totalCells / 7)

  const today = new Date()

  const weeks: Date[][] = []
  for (let w = 0; w < weekCount; w++) {
    weeks.push(Array.from({ length: 7 }, (_, d) => addDays(firstCell, w * 7 + d)))
  }

  return (
    <div>
      <div className="grid grid-cols-[20px_repeat(7,minmax(0,1fr))] mb-1">
        <div />
        {weekHeader.map((d, i) => (
          <div
            key={i}
            className="text-center text-[10px] font-semibold uppercase tracking-wider py-1"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {d}
          </div>
        ))}
      </div>

      <div className="flex flex-col">
        {weeks.map((row, wi) => (
          <div key={wi} className="grid grid-cols-[20px_repeat(7,minmax(0,1fr))]">
            <div
              className="flex items-center justify-center text-[10px] font-medium tabular-nums"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {getISOWeek(row[0])}
            </div>
            {row.map((d, di) => {
              const inMonth = d.getMonth() === month.getMonth()
              const isSelected = !!selected && isSameDay(d, selected)
              const isToday = isSameDay(d, today)

              return (
                <button
                  key={di}
                  type="button"
                  onClick={() => onSelect(d)}
                  className="relative h-8 flex items-center justify-center text-[13px] font-medium tabular-nums focus:outline-none transition-colors"
                  style={{
                    fontFamily: 'var(--font-body)',
                    color: isSelected
                      ? '#fff'
                      : inMonth
                        ? 'var(--text-primary)'
                        : 'var(--text-tertiary)',
                    opacity: inMonth ? 1 : 0.4,
                    cursor: 'pointer',
                  }}
                >
                  {isSelected && (
                    <span
                      aria-hidden
                      className="absolute top-1 bottom-1 left-1/2 -translate-x-1/2 aspect-square rounded-full"
                      style={{
                        background: `linear-gradient(135deg, ${accentColor}, color-mix(in oklab, ${accentColor} 70%, black))`,
                        boxShadow: `0 2px 8px color-mix(in oklab, ${accentColor} 45%, transparent)`,
                      }}
                    />
                  )}
                  {isToday && !isSelected && (
                    <span
                      aria-hidden
                      className="absolute top-1 bottom-1 left-1/2 -translate-x-1/2 aspect-square rounded-full"
                      style={{ border: `1.5px solid ${accentColor}` }}
                    />
                  )}
                  <span className="relative z-10">{d.getDate()}</span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
