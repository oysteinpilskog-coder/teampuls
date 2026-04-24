'use client'

import { useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
import {
  addDays, addMonths, differenceInDays, endOfISOWeek, endOfMonth,
  isAfter, isBefore, isSameDay, parseISO, startOfISOWeek, startOfMonth,
  getISOWeek,
} from 'date-fns'
import { toDateString } from '@/lib/dates'
import { spring } from '@/lib/motion'
import { useT } from '@/lib/i18n/context'
import type { Dictionary } from '@/lib/i18n/types'

type DragMode =
  | { kind: 'idle' }
  | { kind: 'creating'; anchor: Date }
  | { kind: 'resizeStart'; anchor: Date }  // anchor = opposite edge (end)
  | { kind: 'resizeEnd'; anchor: Date }    // anchor = opposite edge (start)
  | { kind: 'move'; offsetDays: number; length: number }

interface DateRangePickerProps {
  startDate: string      // 'YYYY-MM-DD'
  endDate: string        // 'YYYY-MM-DD'
  onChange: (start: string, end: string) => void
  accentColor?: string
}

export function DateRangePicker({
  startDate,
  endDate,
  onChange,
  accentColor = 'var(--accent-color)',
}: DateRangePickerProps) {
  const t = useT()
  // Monday-first weekday initials for the two-letter column header.
  // t.dates.weekdaysShort is Sunday-first; reorder to Mon…Sun and trim to 2 chars.
  const ws = t.dates.weekdaysShort
  const WEEKDAY_SHORT = [ws[1], ws[2], ws[3], ws[4], ws[5], ws[6], ws[0]].map(s => s.slice(0, 2))
  // Capitalized long month names (Januar, …).
  const MONTH_LONG = t.dates.monthsLongCap
  // Long weekday names (Sunday-first, as JS getDay()).
  const WEEKDAY_LONG = t.dates.weekdaysLong
  const start = startDate ? parseISO(startDate) : null
  const end = endDate ? parseISO(endDate) : null

  const [anchorMonth, setAnchorMonth] = useState<Date>(() =>
    startOfMonth(start ?? new Date())
  )
  const [drag, setDrag] = useState<DragMode>({ kind: 'idle' })
  // Click-chain: after the first click on a blank/completed range, we remember
  // that date so the *next* click extends instead of starting a new range.
  const [pendingAnchor, setPendingAnchor] = useState<Date | null>(null)
  const pointerDownDateRef = useRef<Date | null>(null)
  const pointerMovedRef = useRef(false)
  const gridRef = useRef<HTMLDivElement>(null)

  const months = [anchorMonth, addMonths(anchorMonth, 1)]

  function applyDragAt(date: Date, mode: DragMode) {
    if (mode.kind === 'creating' || mode.kind === 'resizeStart' || mode.kind === 'resizeEnd') {
      const s = isBefore(date, mode.anchor) ? date : mode.anchor
      const e = isBefore(date, mode.anchor) ? mode.anchor : date
      onChange(toDateString(s), toDateString(e))
      return
    }
    if (mode.kind === 'move') {
      const newStart = addDays(date, -mode.offsetDays)
      const newEnd = addDays(newStart, mode.length - 1)
      onChange(toDateString(newStart), toDateString(newEnd))
    }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>, date: Date) {
    e.preventDefault()
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch { /* noop */ }

    pointerDownDateRef.current = date
    pointerMovedRef.current = false

    // Existing multi-day range: preserve resize/move gestures on edges and interior.
    if (start && end && !isSameDay(start, end)) {
      const atStart = isSameDay(date, start)
      const atEnd = isSameDay(date, end)
      const inside = !isBefore(date, start) && !isAfter(date, end)

      if (atStart) {
        setDrag({ kind: 'resizeStart', anchor: end })
        setPendingAnchor(null)
        return
      }
      if (atEnd) {
        setDrag({ kind: 'resizeEnd', anchor: start })
        setPendingAnchor(null)
        return
      }
      if (inside) {
        setDrag({
          kind: 'move',
          offsetDays: differenceInDays(date, start),
          length: differenceInDays(end, start) + 1,
        })
        setPendingAnchor(null)
        return
      }
    }

    // Click-chain: second click extends from the remembered anchor.
    if (pendingAnchor) {
      const a = pendingAnchor
      const s = isBefore(date, a) ? date : a
      const ed = isBefore(date, a) ? a : date
      onChange(toDateString(s), toDateString(ed))
      setDrag({ kind: 'creating', anchor: a })
      setPendingAnchor(null)
      return
    }

    // First click: collapse to single day and remember anchor for the next click.
    onChange(toDateString(date), toDateString(date))
    setDrag({ kind: 'creating', anchor: date })
    setPendingAnchor(date)
  }

  function dateFromPoint(clientX: number, clientY: number): Date | null {
    const el = document.elementFromPoint(clientX, clientY)
    const cell = el?.closest<HTMLElement>('[data-date]')
    const ds = cell?.dataset.date
    return ds ? parseISO(ds) : null
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (drag.kind === 'idle') return
    const date = dateFromPoint(e.clientX, e.clientY)
    if (!date) return
    if (pointerDownDateRef.current && !isSameDay(date, pointerDownDateRef.current)) {
      pointerMovedRef.current = true
    }
    applyDragAt(date, drag)
  }

  function handlePointerUp() {
    if (drag.kind === 'idle') return
    // A real drag (pointer moved to a different cell) is an explicit gesture —
    // break the click chain so the next click starts fresh.
    if (pointerMovedRef.current) {
      setPendingAnchor(null)
    }
    setDrag({ kind: 'idle' })
    pointerDownDateRef.current = null
    pointerMovedRef.current = false
  }

  const rangeLabel = useMemo(() => {
    if (!start || !end) return t.dateRangePicker.pickDates
    const sameDay = isSameDay(start, end)
    const fmt = (d: Date) =>
      `${d.getDate()}. ${MONTH_LONG[d.getMonth()].slice(0, 3)}`
    const sameYear = start.getFullYear() === end.getFullYear()
    if (sameDay) {
      return `${WEEKDAY_LONG[start.getDay()]} ${fmt(start)} ${start.getFullYear()}`
    }
    const days = differenceInDays(end, start) + 1
    const endText = sameYear ? fmt(end) : `${fmt(end)} ${end.getFullYear()}`
    return `${fmt(start)} – ${endText} · ${days} dager`
  }, [start, end, t, MONTH_LONG, WEEKDAY_LONG])

  const isDragging = drag.kind !== 'idle'

  return (
    <div
      ref={gridRef}
      className="select-none"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={() => { /* keep drag alive; release handled by capture */ }}
      style={{ touchAction: 'none' }}
    >
      {/* Summary + nav */}
      <div className="flex items-center justify-between mb-3">
        <motion.button
          type="button"
          onClick={() => setAnchorMonth(addMonths(anchorMonth, -1))}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          transition={spring.snappy}
          className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
          style={{ color: 'var(--text-secondary)', backgroundColor: 'transparent' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-subtle)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          aria-label={t.dateRangePicker.prevMonth}
        >
          <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
        </motion.button>

        <div
          className="text-[13px] font-semibold tabular-nums"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
        >
          {rangeLabel}
        </div>

        <motion.button
          type="button"
          onClick={() => setAnchorMonth(addMonths(anchorMonth, 1))}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          transition={spring.snappy}
          className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
          style={{ color: 'var(--text-secondary)', backgroundColor: 'transparent' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-subtle)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          aria-label={t.dateRangePicker.nextMonth}
        >
          <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
        </motion.button>
      </div>

      {/* Two-month grid */}
      <div className="grid grid-cols-2 gap-5">
        {months.map((m, i) => (
          <MonthView
            key={i}
            month={m}
            start={start}
            end={end}
            isDragging={isDragging}
            dragKind={drag.kind}
            accentColor={accentColor}
            onPointerDown={handlePointerDown}
            t={t}
          />
        ))}
      </div>

      {/* Hint */}
      <p
        className="mt-3 text-[11px] text-center"
        style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
      >
        {t.dateRangePicker.helpText}
      </p>
    </div>
  )
}

interface MonthViewProps {
  month: Date
  start: Date | null
  end: Date | null
  isDragging: boolean
  dragKind: DragMode['kind']
  accentColor: string
  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>, date: Date) => void
  t: Dictionary
}

function MonthView({
  month, start, end, isDragging, dragKind, accentColor, onPointerDown, t,
}: MonthViewProps) {
  const ws = t.dates.weekdaysShort
  const WEEKDAY_SHORT = [ws[1], ws[2], ws[3], ws[4], ws[5], ws[6], ws[0]].map(s => s.slice(0, 2))
  const MONTH_LONG = t.dates.monthsLongCap
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
      {/* Month header */}
      <div
        className="text-center text-[12px] font-semibold uppercase tracking-widest mb-2"
        style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-sora)' }}
      >
        {MONTH_LONG[month.getMonth()]} {month.getFullYear()}
      </div>

      {/* Weekday row */}
      <div className="grid grid-cols-[24px_repeat(7,minmax(0,1fr))] mb-1">
        <div />
        {WEEKDAY_SHORT.map(d => (
          <div
            key={d}
            className="text-center text-[10px] font-semibold uppercase tracking-wider py-1"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Week rows */}
      <div className="flex flex-col">
        {weeks.map((row, wi) => (
          <div key={wi} className="grid grid-cols-[24px_repeat(7,minmax(0,1fr))]">
            <div
              className="flex items-center justify-center text-[10px] font-medium tabular-nums"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {getISOWeek(row[0])}
            </div>
            {row.map((d, di) => {
              const inMonth = d.getMonth() === month.getMonth()
              const inRange = !!start && !!end && !isBefore(d, start) && !isAfter(d, end)
              const isStart = !!start && isSameDay(d, start)
              const isEnd = !!end && isSameDay(d, end)
              const singleDay = isStart && isEnd
              const todayFlag = isSameDay(d, today)

              // Cursor hint based on role inside range
              let cursor: string = 'pointer'
              if (inRange && !isDragging) {
                if (isStart || isEnd) cursor = singleDay ? 'grab' : 'ew-resize'
                else cursor = 'grab'
              }
              if (isDragging) {
                cursor = dragKind === 'move' ? 'grabbing' :
                         dragKind === 'resizeStart' || dragKind === 'resizeEnd' ? 'ew-resize' :
                         'crosshair'
              }

              return (
                <button
                  key={di}
                  type="button"
                  data-date={toDateString(d)}
                  onPointerDown={e => onPointerDown(e, d)}
                  className="relative h-9 flex items-center justify-center text-[13px] font-medium tabular-nums focus:outline-none"
                  style={{
                    fontFamily: 'var(--font-body)',
                    color: !inMonth
                      ? 'var(--text-tertiary)'
                      : inRange
                        ? '#fff'
                        : 'var(--text-primary)',
                    opacity: inMonth ? 1 : 0.4,
                    cursor,
                    touchAction: 'none',
                  }}
                >
                  {/* Range bar — track */}
                  {inRange && !singleDay && (
                    <span
                      aria-hidden
                      className="absolute inset-y-1"
                      style={{
                        left: isStart ? '50%' : 0,
                        right: isEnd ? '50%' : 0,
                        backgroundColor: `color-mix(in oklab, ${accentColor} 22%, transparent)`,
                      }}
                    />
                  )}

                  {/* Endpoint chip */}
                  {(isStart || isEnd) && (
                    <span
                      aria-hidden
                      className="absolute top-1 bottom-1 left-1/2 -translate-x-1/2 aspect-square rounded-full"
                      style={{
                        background: `linear-gradient(135deg, ${accentColor}, color-mix(in oklab, ${accentColor} 70%, black))`,
                        boxShadow: `0 2px 8px color-mix(in oklab, ${accentColor} 45%, transparent)`,
                      }}
                    />
                  )}

                  {/* Today ring (only when not in range) */}
                  {todayFlag && !inRange && (
                    <span
                      aria-hidden
                      className="absolute top-1 bottom-1 left-1/2 -translate-x-1/2 aspect-square rounded-full"
                      style={{
                        border: `1.5px solid ${accentColor}`,
                      }}
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
