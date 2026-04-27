'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { addDays, getISOWeek, getISOWeekYear } from 'date-fns'
import { getWeekStart, getLastISOWeek, toDateString } from '@/lib/dates'
import { useStatusColors } from '@/lib/status-colors/context'
import { useT } from '@/lib/i18n/context'
import { spring } from '@/lib/motion'
import type { Entry, EntryStatus } from '@/lib/supabase/types'

interface MyPlanYearStripeProps {
  year: number
  entries: Entry[]
  onWeekClick: (week: number) => void
}

/**
 * Compact 52/53-week ribbon showing the dominant status of each week for the
 * signed-in user. Clicking a pill smooth-scrolls the corresponding week row
 * into view in the list below. The current week is marked with an accent ring.
 */
export function MyPlanYearStripe({ year, entries, onWeekClick }: MyPlanYearStripeProps) {
  const t = useT()
  const palettes = useStatusColors()
  const lastWeek = useMemo(() => getLastISOWeek(year), [year])

  const today = useMemo(() => new Date(), [])
  const todayWeek = getISOWeek(today)
  const todayYear = getISOWeekYear(today)

  // Group entries by ISO week, then pick a dominant status per week.
  const weekStatuses = useMemo(() => {
    const counts = new Map<number, Map<EntryStatus, number>>()
    for (const e of entries) {
      const d = new Date(e.date)
      const wk = getISOWeek(d)
      const wkYear = getISOWeekYear(d)
      if (wkYear !== year) continue
      let bucket = counts.get(wk)
      if (!bucket) {
        bucket = new Map()
        counts.set(wk, bucket)
      }
      bucket.set(e.status, (bucket.get(e.status) ?? 0) + 1)
    }
    const out = new Map<number, EntryStatus>()
    counts.forEach((bucket, wk) => {
      let best: EntryStatus | null = null
      let bestCount = 0
      bucket.forEach((count, status) => {
        if (count > bestCount) {
          best = status
          bestCount = count
        }
      })
      if (best) out.set(wk, best)
    })
    return out
  }, [entries, year])

  // Build week metadata once — labels for tooltip, month boundaries for divider hints.
  const weeks = useMemo(() => {
    return Array.from({ length: lastWeek }, (_, i) => {
      const weekNumber = i + 1
      const start = getWeekStart(weekNumber, year)
      const mid = addDays(start, 2)
      const end = addDays(start, 4)
      const isCurrent = weekNumber === todayWeek && year === todayYear
      const monthIdx = mid.getMonth()
      const monthLabel = t.dates.monthsShort[monthIdx]
      const startDay = start.getDate()
      const endDay = end.getDate()
      const startMonth = t.dates.monthsShort[start.getMonth()]
      const endMonth = t.dates.monthsShort[end.getMonth()]
      const dateRange = startMonth === endMonth
        ? `${startDay}.–${endDay}. ${endMonth}`
        : `${startDay}. ${startMonth}–${endDay}. ${endMonth}`
      return { weekNumber, monthIdx, monthLabel, dateRange, isCurrent }
    })
  }, [lastWeek, year, todayWeek, todayYear, t])

  return (
    <div className="w-full">
      <div
        role="list"
        aria-label={`Årsstripe ${year}`}
        className="flex items-stretch gap-[3px] w-full"
      >
        {weeks.map((wk) => {
          const status = weekStatuses.get(wk.weekNumber) ?? null
          const palette = status ? palettes[status] : null
          const isMonthStart = wk.weekNumber === 1 || weeks[wk.weekNumber - 2]?.monthIdx !== wk.monthIdx

          return (
            <button
              key={wk.weekNumber}
              role="listitem"
              type="button"
              onClick={() => onWeekClick(wk.weekNumber)}
              title={`${t.matrix.weekLabel} ${wk.weekNumber} · ${wk.dateRange}`}
              aria-label={`${t.matrix.weekLabel} ${wk.weekNumber} ${wk.dateRange}${status ? ` · ${t.status[status]}` : ''}`}
              className="group relative flex-1 min-w-0 rounded-[5px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lg-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
              style={{
                height: 28,
                marginLeft: isMonthStart && wk.weekNumber !== 1 ? 4 : undefined,
              }}
            >
              <motion.div
                whileHover={{ y: -2 }}
                transition={spring.snappy}
                className="absolute inset-0 rounded-[5px] transition-colors duration-150"
                style={{
                  background: palette
                    ? `linear-gradient(180deg, ${palette.icon} 0%, ${palette.gradient.dark[1]} 100%)`
                    : 'transparent',
                  border: palette
                    ? `1px solid ${palette.icon}55`
                    : '1px dashed var(--lg-divider)',
                  boxShadow: wk.isCurrent
                    ? '0 0 0 2px var(--lg-accent), 0 0 14px var(--lg-accent-glow)'
                    : palette
                      ? `0 0 8px -2px ${palette.icon}66`
                      : 'none',
                }}
              />
              {/* Hover label — shows week number above the pill */}
              <span
                aria-hidden
                className="lg-mono pointer-events-none absolute left-1/2 -translate-x-1/2 -top-5 text-[9.5px] uppercase opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                style={{
                  color: 'var(--lg-text-2)',
                  letterSpacing: '0.18em',
                  whiteSpace: 'nowrap',
                }}
              >
                {wk.weekNumber}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
