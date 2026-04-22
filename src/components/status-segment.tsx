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

// Premium luminous palette — saturated gradients with glow hues for Apple-calibre finish.
// Each: [top, bottom] vertical gradient + glow tint for colored halos.
export const STATUS_GRADIENT: Record<
  EntryStatus,
  { light: [string, string]; dark: [string, string]; glow: string }
> = {
  // Electric blue — kontor
  office:   { light: ['#4AB0FF', '#0057E0'], dark: ['#2E86FF', '#0D4BC7'], glow: '#3A9CFF' },
  // Vibrant green — hjemmekontor
  remote:   { light: ['#6CE889', '#14A544'], dark: ['#37C568', '#0F8E38'], glow: '#3EE57F' },
  // Sunset orange — hos kunde
  customer: { light: ['#FFB94A', '#E06A00'], dark: ['#FF9A1F', '#A35400'], glow: '#FFA630' },
  // Royal indigo — reise
  travel:   { light: ['#8E8CFF', '#3E38D8'], dark: ['#6E6AF0', '#2E29A5'], glow: '#6B68F0' },
  // Liquid gold — ferie
  vacation: { light: ['#FFD46B', '#C48200'], dark: ['#E0A31E', '#7A4600'], glow: '#FFC23E' },
  // Ruby red — syk
  sick:     { light: ['#FF7467', '#D01C12'], dark: ['#E3342A', '#8A1610'], glow: '#FF4D42' },
  // Cool graphite — fri
  off:      { light: ['#B8B8BD', '#74747A'], dark: ['#7A7B80', '#4A4B50'], glow: '#9EA0A6' },
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
  const glow = palette?.glow ?? ''

  // Richer multi-stop gradient — top highlight tint → body → deeper foot.
  const gradient = palette
    ? `linear-gradient(170deg, ${g0} 0%, ${g0} 18%, ${g1} 82%, ${g1} 100%)`
    : undefined

  return (
    <motion.div
      className="relative h-[36px] rounded-[9px] overflow-hidden"
      style={{
        gridColumn: `span ${span}`,
        backgroundColor: status ? g1 : 'transparent',
        backgroundImage: status ? gradient : undefined,
        // Premium edge + colored outer glow matching status hue — the "wow".
        boxShadow: status
          ? isDark
            ? `inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.30), 0 6px 18px -4px ${glow}66, 0 0 22px -2px ${glow}33`
            : `inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -1px 0 rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.08), 0 6px 20px -6px ${glow}80, 0 0 24px -4px ${glow}44`
          : undefined,
        opacity: muted ? 0.28 : 1,
        cursor: status && onDayMouseDown ? 'grab' : undefined,
      }}
      whileHover={muted ? undefined : { y: -1 }}
      transition={spring.snappy}
    >
      {/* Glossy top highlight — thicker, brighter liquid-glass sheen */}
      {status && (
        <div
          aria-hidden
          className="absolute top-0 left-0 right-0 pointer-events-none z-[1]"
          style={{
            height: '60%',
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.38) 0%, rgba(255,255,255,0.12) 55%, transparent 100%)',
          }}
        />
      )}

      {/* Soft inner vignette — adds depth at the bottom */}
      {status && (
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 pointer-events-none z-[1]"
          style={{
            height: '35%',
            background:
              'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.10) 100%)',
          }}
        />
      )}

      {/* Specular edge sheen — brighter, longer */}
      {status && (
        <div
          aria-hidden
          className="absolute top-0 left-[6%] right-[6%] pointer-events-none z-[2]"
          style={{
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent)',
          }}
        />
      )}

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
                textShadow: '0 1px 2px rgba(0,0,0,0.30), 0 0 8px rgba(255,255,255,0.18)',
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
