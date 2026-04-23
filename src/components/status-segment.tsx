'use client'

import { motion } from 'framer-motion'
import { StatusIcon } from '@/components/icons/status-icons'
import type { EntryStatus } from '@/lib/supabase/types'
import { spring } from '@/lib/motion'
import { useT } from '@/lib/i18n/context'
import { useStatusColors } from '@/lib/status-colors/context'

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
  /** When true, the bar is inferred from the org/member default rather than a
   *  real entry. Rendered at 40% opacity with a dashed rim so the viewer can
   *  still tell registered data from an assumption. */
  assumed?: boolean
  /** Fired on mousedown inside a left/right resize handle. When set, the bar exposes
   * 8-px hit zones on each edge that take priority over the per-day buttons. */
  onSegmentResizeStart?: (edge: 'left' | 'right') => void
}

// Status color palettes live in `@/lib/status-colors/context` — `useStatusColors()`.
// The static `STATUS_GRADIENT` has been replaced by org-customizable, hex-derived palettes.

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
  assumed,
  onSegmentResizeStart,
}: StatusSegmentProps) {
  const palettes = useStatusColors()
  const t = useT()

  const span = days.length
  const todayIdx = days.findIndex((d) => d.isToday)
  const singleDay = span === 1
  const singleDayIsToday = singleDay && todayIdx === 0

  const label = location || note

  const palette = status ? palettes[status] : null
  const tone = palette?.icon ?? ''        // primary category color
  const tint = palette?.textDark ?? '#fff' // lighter pastel — used for text/icon
  const glow = palette?.glow ?? tone

  // Assumed bars: diminished fill + a dashed rim, so the viewer can tell
  // "inferred" from "registered" at a glance without a second label.
  const fillOpacity = assumed ? 0.4 : 1

  return (
    <motion.div
      className="relative h-[32px] rounded-[8px] overflow-hidden"
      style={{
        gridColumn: `span ${span}`,
        // Cron-style glass tile: translucent category wash over the surface,
        // NOT a solid painted fill. Tone comes from the rim + soft glow.
        background: status
          ? assumed
            ? `linear-gradient(180deg, ${tone}11 0%, ${tone}08 100%)`
            : `linear-gradient(180deg, ${tone}22 0%, ${tone}14 100%)`
          : 'transparent',
        boxShadow: status && !assumed
          ? `inset 3px 0 0 ${tone},
             inset 0 0 0 1px ${tone}30,
             0 0 14px -4px ${glow}66`
          : undefined,
        // Dashed 1.5px rim for assumed — no inner solid rim, no outer glow.
        border: status && assumed ? `1.5px dashed ${tone}66` : undefined,
        opacity: muted ? 0.28 : fillOpacity,
        cursor: status && onDayMouseDown ? 'grab' : undefined,
      }}
      whileHover={muted ? undefined : { y: -1 }}
      transition={spring.snappy}
    >
      {/* Very quiet top sheen — 30% height, barely visible. Keeps the tile from looking flat. */}
      {status && (
        <div
          aria-hidden
          className="absolute top-0 left-0 right-0 pointer-events-none z-[2]"
          style={{
            height: '35%',
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 100%)',
          }}
        />
      )}

      {/* Content — icon + label, tight spacing for slim bar.
          Text is tinted to the category (lighter pastel) instead of fighting
          white-on-saturated-color. Reads clean against the translucent tile. */}
      {status && (
        <div className="absolute inset-0 flex items-center gap-1.5 px-2.5 pointer-events-none z-10">
          <StatusIcon status={status} size={11} color={tint} />
          {label && (
            <span
              className="text-[11px] leading-none truncate"
              style={{
                color: tint,
                fontWeight: 500,
                letterSpacing: '-0.005em',
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
                  ? `${t.status[status]}${label ? `, ${label}` : ''} — ${d.dateLabel}`
                  : `${t.matrix.noStatus} — ${d.dateLabel}`
              }
              className={`segment-day flex-1 relative focus:outline-none focus-visible:z-10 ${isHi ? 'is-highlighted' : ''}`}
            />
          )
        })}
      </div>

      {/* Today dot for multi-day segment — violet accent, matches nav "nå" dot */}
      {!singleDay && todayIdx !== -1 && (
        <motion.div
          className="absolute pointer-events-none rounded-full z-30"
          style={{
            top: '4px',
            left: `${((todayIdx + 0.5) / span) * 100}%`,
            transform: 'translateX(-50%)',
            width: 5,
            height: 5,
            backgroundColor: 'var(--lg-accent)',
            boxShadow:
              '0 0 0 2px rgba(139, 92, 246, 0.22), 0 0 6px var(--lg-accent-glow)',
          }}
          animate={{ scale: [1, 1.22, 1] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* Single-day today accent — violet ring on filled bars. */}
      {singleDayIsToday && status && (
        <motion.div
          aria-hidden
          className="absolute inset-0 rounded-[7px] pointer-events-none z-30"
          style={{
            boxShadow:
              'inset 0 0 0 1.5px rgba(139, 92, 246, 0.55), 0 0 10px var(--lg-accent-glow)',
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
          background-color: ${tone ? `${tone}22` : 'rgba(255, 255, 255, 0.08)'};
        }
        .resize-handle-left:hover {
          box-shadow: inset 2px 0 0 ${tone || 'rgba(255, 255, 255, 0.6)'};
        }
        .resize-handle-right:hover {
          box-shadow: inset -2px 0 0 ${tone || 'rgba(255, 255, 255, 0.6)'};
        }
        .segment-day {
          transition: background-color 160ms ease;
        }
        .segment-day:hover {
          background-color: ${status
            ? `${tone}18`
            : 'rgba(255,255,255,0.04)'};
        }
        .segment-day:focus-visible {
          box-shadow: inset 0 0 0 2px var(--lg-accent);
          border-radius: 6px;
        }
        .segment-day.is-highlighted {
          background-color: rgba(139, 92, 246, 0.18);
          box-shadow: inset 0 0 0 2px var(--lg-accent);
          border-radius: 6px;
        }
        .segment-day.is-highlighted:hover {
          background-color: rgba(139, 92, 246, 0.26);
        }
      `}</style>
    </motion.div>
  )
}
