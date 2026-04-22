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

// iOS system palette — refined, tighter gradients for Outlook-calibre flow.
// Each: [top, bottom] for a subtle vertical gradient with a glass highlight overlay.
const STATUS_GRADIENT: Record<EntryStatus, { light: [string, string]; dark: [string, string] }> = {
  // SF Blue — kontor
  office:   { light: ['#3A9CFF', '#0A66D9'], dark: ['#1E6FD1', '#0C4AA3'] },
  // SF Green — hjemmekontor
  remote:   { light: ['#5DD67E', '#1E9E44'], dark: ['#2AA550', '#15762F'] },
  // SF Orange — hos kunde
  customer: { light: ['#FFB238', '#CC7400'], dark: ['#C97900', '#844C00'] },
  // SF Indigo — reise
  travel:   { light: ['#7977E0', '#3936B5'], dark: ['#5754C6', '#2F2D89'] },
  // Amber — ferie
  vacation: { light: ['#F5BD4C', '#A25500'], dark: ['#B87206', '#5E3302'] },
  // SF Red — syk
  sick:     { light: ['#FF6157', '#C11A11'], dark: ['#C71E15', '#78100B'] },
  // SF Gray — fri
  off:      { light: ['#ABABB0', '#6C6C71'], dark: ['#6A6B6F', '#45454A'] },
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

  const gradient = palette
    ? `linear-gradient(180deg, ${g0} 0%, ${g1} 100%)`
    : undefined

  return (
    <motion.div
      className="relative h-[36px] rounded-[8px] overflow-hidden"
      style={{
        gridColumn: `span ${span}`,
        backgroundColor: status ? g1 : 'transparent',
        backgroundImage: status ? gradient : undefined,
        // Flat Outlook-style edge: a hairline rim + the subtle iOS top-highlight / bottom-depth
        // on colored bars only. Empty days are fully transparent — no ring, no hatching.
        boxShadow: status
          ? isDark
            ? 'inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(0,0,0,0.28), 0 1px 2px rgba(0,0,0,0.22)'
            : 'inset 0 1px 0 rgba(255,255,255,0.34), inset 0 -1px 0 rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.07)'
          : undefined,
      }}
      whileHover={{ y: -0.5 }}
      transition={spring.snappy}
    >
      {/* iOS glossy top highlight — glass surface catching light */}
      {status && (
        <div
          aria-hidden
          className="absolute top-0 left-0 right-0 pointer-events-none z-[1]"
          style={{
            height: '55%',
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.06) 60%, transparent 100%)',
          }}
        />
      )}

      {/* Specular edge sheen */}
      {status && (
        <div
          aria-hidden
          className="absolute top-0 left-[10%] right-[10%] pointer-events-none z-[2]"
          style={{
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)',
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
                textShadow: '0 1px 1.5px rgba(0,0,0,0.22)',
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
            top: '4px',
            left: `${((todayIdx + 0.5) / span) * 100}%`,
            transform: 'translateX(-50%)',
            width: 5,
            height: 5,
            backgroundColor: status ? '#ffffff' : 'var(--accent-color)',
            boxShadow: status
              ? '0 0 0 1.5px rgba(255,255,255,0.3), 0 0 6px rgba(255,255,255,0.5)'
              : '0 0 0 2px rgba(0,102,255,0.2), 0 0 6px rgba(0,102,255,0.5)',
          }}
          animate={{ scale: [1, 1.22, 1] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* Single-day today accent — subtle ring on accent color only */}
      {singleDayIsToday && (
        <motion.div
          aria-hidden
          className="absolute inset-0 rounded-[8px] pointer-events-none z-30"
          style={{
            boxShadow: status
              ? 'inset 0 0 0 1.5px rgba(255,255,255,0.55)'
              : 'inset 0 0 0 1.5px var(--accent-color)',
          }}
          animate={{ opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      <style jsx>{`
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
