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
}

// Apple iOS system colors — cohesive, premium, purpose-designed for status surfaces.
// Each: [lighter start, deeper end] for a 135deg luminance gradient with white text on top.
const STATUS_GRADIENT: Record<EntryStatus, { light: [string, string]; dark: [string, string]; shadow: string }> = {
  // SF Blue — kontor
  office:   { light: ['#007AFF', '#003F8A'], dark: ['#0A4FB5', '#062D6B'], shadow: '0, 122, 255' },
  // SF Green — hjemmekontor
  remote:   { light: ['#34C759', '#14652A'], dark: ['#128033', '#0A4A1E'], shadow: '52, 199, 89' },
  // SF Orange — hos kunde
  customer: { light: ['#FF9500', '#A55800'], dark: ['#B06000', '#6F3B00'], shadow: '255, 149, 0' },
  // SF Indigo — reise
  travel:   { light: ['#5856D6', '#2E2C8A'], dark: ['#3D3B9C', '#1F1D5E'], shadow: '88, 86, 214' },
  // Tailwind amber-500 → amber-900 — ferie (deeper than SF Yellow for white-text contrast)
  vacation: { light: ['#F59E0B', '#78350F'], dark: ['#A15C06', '#4D2204'], shadow: '245, 158, 11' },
  // SF Red — syk
  sick:     { light: ['#FF3B30', '#96120A'], dark: ['#A41810', '#5D0A06'], shadow: '255, 59, 48' },
  // SF Gray — fri
  off:      { light: ['#8E8E93', '#4A4A4E'], dark: ['#4F4F53', '#2D2D30'], shadow: '142, 142, 147' },
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
  const shadowRgb = palette?.shadow

  // Vertical gradient (top bright, bottom deep) — classic iOS card shading.
  const gradient = palette
    ? `linear-gradient(180deg, ${g0} 0%, ${g1} 100%)`
    : undefined

  // Layered glossy shadow: colored drop + inner top highlight + inner bottom rim.
  const coloredShadow = shadowRgb
    ? isDark
      ? `0 14px 32px -10px rgba(${shadowRgb},0.6),
         0 4px 10px -2px rgba(${shadowRgb},0.4),
         inset 0 1px 0 rgba(255,255,255,0.12),
         inset 0 -1px 0 rgba(0,0,0,0.35),
         inset 0 0 0 1px rgba(${shadowRgb},0.3)`
      : `0 12px 28px -8px rgba(${shadowRgb},0.55),
         0 3px 8px -2px rgba(${shadowRgb},0.28),
         inset 0 1px 0 rgba(255,255,255,0.38),
         inset 0 -1px 0 rgba(0,0,0,0.2),
         inset 0 0 0 0.5px rgba(255,255,255,0.15)`
    : undefined

  return (
    <motion.div
      className="relative h-[84px] rounded-2xl overflow-hidden"
      style={{
        gridColumn: `span ${span}`,
        // Separate backgroundColor (solid fallback) + backgroundImage (gradient overlay)
        // — guarantees color shows even if gradient fails to render.
        backgroundColor: status
          ? g1 // darker end as solid fallback
          : isDark
            ? 'rgba(255,255,255,0.025)'
            : 'rgba(255,255,255,0.4)',
        backgroundImage: status
          ? gradient
          : `repeating-linear-gradient(135deg, transparent, transparent 8px, ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.035)'} 8px, ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.035)'} 9px)`,
        boxShadow: status
          ? coloredShadow
          : 'inset 0 0 0 1px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.4)',
        border: singleDayIsToday
          ? '2px solid var(--accent-color)'
          : undefined,
      }}
      whileHover={{ y: -3, scale: 1.015 }}
      transition={spring.snappy}
    >
      {/* Glossy top reflection — simulates glass surface catching light */}
      {status && (
        <div
          aria-hidden
          className="absolute top-0 left-0 right-0 pointer-events-none z-[1]"
          style={{
            height: '55%',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 45%, transparent 100%)',
            borderTopLeftRadius: 'inherit',
            borderTopRightRadius: 'inherit',
          }}
        />
      )}

      {/* Specular edge highlight at very top */}
      {status && (
        <div
          aria-hidden
          className="absolute top-0 left-[8%] right-[8%] pointer-events-none z-[2]"
          style={{
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.7), transparent)',
          }}
        />
      )}

      {/* Content — icon + label */}
      {status && (
        <div className="absolute inset-0 flex items-center gap-3 px-4 pointer-events-none z-10">
          <div
            className="flex items-center justify-center rounded-xl shrink-0"
            style={{
              width: 36,
              height: 36,
              background: 'rgba(255,255,255,0.25)',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.4), 0 2px 6px rgba(0,0,0,0.14)',
            }}
          >
            <StatusIcon status={status} size={18} color="#ffffff" />
          </div>
          {label && (
            <span
              className="text-[14px] font-semibold leading-tight truncate"
              style={{
                color: '#ffffff',
                letterSpacing: '-0.01em',
                textShadow: '0 1px 2px rgba(0,0,0,0.3)',
              }}
            >
              {label}
            </span>
          )}
        </div>
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
            top: '9px',
            left: `${((todayIdx + 0.5) / span) * 100}%`,
            transform: 'translateX(-50%)',
            width: 8,
            height: 8,
            backgroundColor: status ? '#ffffff' : 'var(--accent-color)',
            boxShadow: status
              ? '0 0 0 3px rgba(255,255,255,0.3), 0 0 12px rgba(255,255,255,0.55)'
              : '0 0 0 4px rgba(0,102,255,0.2), 0 0 10px rgba(0,102,255,0.55)',
          }}
          animate={{ scale: [1, 1.22, 1] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* Single-day today pulse */}
      {singleDayIsToday && (
        <motion.div
          aria-hidden
          className="absolute inset-0 rounded-2xl pointer-events-none z-30"
          style={{ boxShadow: '0 0 0 1.5px var(--accent-color), 0 0 24px -4px rgba(0,102,255,0.35)' }}
          animate={{ opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      <style jsx>{`
        .segment-day {
          transition: background-color 180ms ease;
        }
        .segment-day:hover {
          background-color: ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.15)'};
        }
        .segment-day:focus-visible {
          box-shadow: inset 0 0 0 2px var(--accent-color);
          border-radius: 10px;
        }
        .segment-day.is-highlighted {
          background-color: color-mix(in oklab, var(--accent-color) 32%, transparent);
          box-shadow: inset 0 0 0 2px var(--accent-color);
          border-radius: 10px;
        }
        .segment-day.is-highlighted:hover {
          background-color: color-mix(in oklab, var(--accent-color) 40%, transparent);
        }
      `}</style>
    </motion.div>
  )
}
