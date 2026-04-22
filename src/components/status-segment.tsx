'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useTheme } from 'next-themes'
import { StatusIcon } from '@/components/icons/status-icons'
import type { EntryStatus } from '@/lib/supabase/types'
import { spring } from '@/lib/motion'
import { no } from '@/lib/i18n/no'

export interface SegmentDay {
  date: string
  dateLabel: string
  isToday: boolean
}

interface StatusSegmentProps {
  status: EntryStatus | null
  location: string | null
  note: string | null
  days: SegmentDay[]
  onSelectDay: (dayIndex: number) => void
  /** Optional — when provided, per-day buttons use mousedown-driven drag instead of click. */
  onDayMouseDown?: (dayIndex: number) => void
  onDayMouseEnter?: (dayIndex: number) => void
  /** Optional — length === days.length; true for days currently inside a drag selection. */
  dayHighlight?: boolean[]
  /** Dim the bar — used while the segment is being move-dragged elsewhere. */
  muted?: boolean
  /** Fired on mousedown inside a left/right resize handle. When set, the bar exposes
   * 8-px hit zones on each edge that take priority over the per-day buttons. */
  onSegmentResizeStart?: (edge: 'left' | 'right') => void
}

// Modern status palette — quiet, perceptually balanced tones.
// Single source of truth, shared with STATUS_COLORS in icons/status-icons.tsx.
// Each: [top, bottom] 2-stop gradient + `tint` (mid-tone used for icon/text accents).
export const STATUS_GRADIENT: Record<
  EntryStatus,
  { light: [string, string]; dark: [string, string]; tint: string }
> = {
  // Kontor — cobalt
  office:   { light: ['#3B82F6', '#2563EB'], dark: ['#3B82F6', '#1D4ED8'], tint: '#2563EB' },
  // Hjemmekontor — emerald
  remote:   { light: ['#10B981', '#059669'], dark: ['#10B981', '#047857'], tint: '#059669' },
  // Hos kunde — amber
  customer: { light: ['#F59E0B', '#D97706'], dark: ['#F59E0B', '#B45309'], tint: '#D97706' },
  // Reise — violet
  travel:   { light: ['#8B5CF6', '#7C3AED'], dark: ['#8B5CF6', '#6D28D9'], tint: '#7C3AED' },
  // Ferie — saffron
  vacation: { light: ['#EAB308', '#CA8A04'], dark: ['#EAB308', '#A16207'], tint: '#CA8A04' },
  // Syk — coral
  sick:     { light: ['#F43F5E', '#E11D48'], dark: ['#F43F5E', '#BE123C'], tint: '#E11D48' },
  // Fri — warm stone
  off:      { light: ['#A8A29E', '#78716C'], dark: ['#78716C', '#57534E'], tint: '#78716C' },
}

export function StatusSegment({
  status,
  location,
  note,
  days,
  onSelectDay,
  onDayMouseDown,
  onDayMouseEnter,
  dayHighlight,
  muted,
  onSegmentResizeStart,
}: StatusSegmentProps) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const isDark = mounted && resolvedTheme === 'dark'
  const span = days.length
  const todayIdx = days.findIndex((d) => d.isToday)
  const singleDay = span === 1
  const singleDayIsToday = singleDay && todayIdx === 0

  const label = location || note

  const palette = status ? STATUS_GRADIENT[status] : null
  const [g0, g1] = palette ? (isDark ? palette.dark : palette.light) : ['', '']

  // Subtle 2-stop vertical gradient — modern, Linear/Notion-style depth without heaviness.
  const gradient = palette
    ? `linear-gradient(180deg, ${g0} 0%, ${g1} 100%)`
    : undefined

  return (
    <motion.div
      className="relative h-[36px] rounded-[9px] overflow-hidden"
      style={{
        gridColumn: `span ${span}`,
        backgroundColor: status ? g1 : 'transparent',
        backgroundImage: status ? gradient : undefined,
        // One soft, neutral shadow — no colored halos, no glow.
        boxShadow: status
          ? isDark
            ? 'inset 0 1px 0 rgba(255,255,255,0.10), 0 1px 2px rgba(0,0,0,0.35), 0 2px 4px rgba(0,0,0,0.20)'
            : 'inset 0 1px 0 rgba(255,255,255,0.28), 0 1px 2px rgba(15,23,42,0.08), 0 2px 6px rgba(15,23,42,0.06)'
          : undefined,
        opacity: muted ? 0.28 : 1,
        cursor: status && onDayMouseDown ? 'grab' : undefined,
      }}
      whileHover={muted ? undefined : { y: -1 }}
      transition={spring.snappy}
    >
      {/* Content — icon + label, tight spacing for slim bar */}
      {status && (
        <div className="absolute inset-0 flex items-center gap-1.5 px-2 pointer-events-none z-10">
          <StatusIcon status={status} size={12} color="#ffffff" />
          {label && (
            <span
              className="text-[11.5px] font-semibold leading-none truncate"
              style={{
                color: '#ffffff',
                letterSpacing: '-0.005em',
                textShadow: '0 1px 2px rgba(0,0,0,0.18)',
              }}
            >
              {label}
            </span>
          )}
        </div>
      )}

      {/* Resize handles — left/right edges on colored bars, Outlook-style.
          Rendered at z-30 so they win mousedown over the per-day buttons (z-20). */}
      {status && onSegmentResizeStart && (
        <>
          <div
            aria-label="Dra for å endre startdato"
            className="resize-handle resize-handle-left absolute top-0 bottom-0 left-0 z-30"
            style={{ width: 10, cursor: 'ew-resize' }}
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onSegmentResizeStart('left')
            }}
          />
          <div
            aria-label="Dra for å endre sluttdato"
            className="resize-handle resize-handle-right absolute top-0 bottom-0 right-0 z-30"
            style={{ width: 10, cursor: 'ew-resize' }}
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onSegmentResizeStart('right')
            }}
          />
        </>
      )}

      {/* Per-day click targets */}
      <div className="absolute inset-0 flex z-20">
        {days.map((d, i) => {
          const isHi = dayHighlight?.[i] ?? false
          const dragMode = !!onDayMouseDown
          return (
            <button
              key={d.date}
              onClick={dragMode ? undefined : () => onSelectDay(i)}
              onMouseDown={
                dragMode
                  ? (e) => {
                      e.preventDefault()
                      onDayMouseDown!(i)
                    }
                  : undefined
              }
              onMouseEnter={onDayMouseEnter ? () => onDayMouseEnter(i) : undefined}
              aria-label={
                status
                  ? `${no.status[status]}${label ? `, ${label}` : ''} — ${d.dateLabel}`
                  : `${no.matrix.noStatus} — ${d.dateLabel}`
              }
              className={`segment-day flex-1 relative focus:outline-none focus-visible:z-10 ${isHi ? 'is-highlighted' : ''}`}
            />
          )
        })}
      </div>

      {/* Today dot for multi-day segment */}
      {!singleDay && todayIdx !== -1 && (
        <motion.div
          className="absolute pointer-events-none rounded-full z-30"
          style={{
            top: '4px',
            left: `${((todayIdx + 0.5) / span) * 100}%`,
            transform: 'translateX(-50%)',
            width: 5,
            height: 5,
            backgroundColor: status ? '#ffffff' : 'var(--accent-color)',
            boxShadow: status
              ? '0 0 0 1.5px rgba(255,255,255,0.3), 0 0 6px rgba(255,255,255,0.5)'
              : '0 0 0 2px color-mix(in oklab, var(--accent-color) 25%, transparent), 0 0 6px color-mix(in oklab, var(--accent-color) 55%, transparent)',
          }}
          animate={{ scale: [1, 1.22, 1] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* Single-day today accent — luminous ring */}
      {singleDayIsToday && (
        <motion.div
          aria-hidden
          className="absolute inset-0 rounded-[9px] pointer-events-none z-30"
          style={{
            boxShadow: status
              ? 'inset 0 0 0 1.5px rgba(255,255,255,0.75), inset 0 0 12px rgba(255,255,255,0.25)'
              : 'inset 0 0 0 1.5px var(--accent-color), inset 0 0 14px color-mix(in oklab, var(--accent-color) 30%, transparent)',
          }}
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      <style jsx>{`
        .resize-handle {
          transition: box-shadow 140ms ease, background-color 140ms ease;
        }
        .resize-handle:hover {
          background-color: rgba(255, 255, 255, 0.18);
        }
        .resize-handle-left:hover {
          box-shadow: inset 2px 0 0 rgba(255, 255, 255, 0.72);
        }
        .resize-handle-right:hover {
          box-shadow: inset -2px 0 0 rgba(255, 255, 255, 0.72);
        }
        .segment-day {
          transition: background-color 160ms ease;
        }
        .segment-day:hover {
          background-color: ${status
            ? 'rgba(255,255,255,0.10)'
            : isDark
              ? 'rgba(255,255,255,0.05)'
              : 'rgba(0,0,0,0.035)'};
        }
        .segment-day:focus-visible {
          box-shadow: inset 0 0 0 2px var(--accent-color);
          border-radius: 6px;
        }
        .segment-day.is-highlighted {
          background-color: color-mix(in oklab, var(--accent-color) 28%, transparent);
          box-shadow: inset 0 0 0 2px var(--accent-color);
          border-radius: 6px;
        }
        .segment-day.is-highlighted:hover {
          background-color: color-mix(in oklab, var(--accent-color) 36%, transparent);
        }
      `}</style>
    </motion.div>
  )
}
