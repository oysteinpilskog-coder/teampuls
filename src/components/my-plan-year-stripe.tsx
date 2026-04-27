'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { addDays, getISOWeek, getISOWeekYear } from 'date-fns'
import { getWeekStart, getLastISOWeek, toDateString } from '@/lib/dates'
import { useStatusColors } from '@/lib/status-colors/context'
import { useT } from '@/lib/i18n/context'
import { spring } from '@/lib/motion'
import { getHolidayForDate, type CountryCode } from '@/lib/holidays'
import type { Entry, EntryStatus } from '@/lib/supabase/types'

interface MyPlanYearStripeProps {
  year: number
  entries: Entry[]
  /** Country to probe for public holidays on each week — e.g. 'NO' marks
   *  weeks containing Norwegian public holidays with a red top-stripe. */
  country?: CountryCode
  onWeekClick: (week: number) => void
}

/**
 * Compact 52/53-week ribbon showing the dominant status of each week for the
 * signed-in user. Clicking a pill smooth-scrolls the corresponding week row
 * into view in the list below. The current week is marked with an accent ring.
 */
export function MyPlanYearStripe({ year, entries, country, onWeekClick }: MyPlanYearStripeProps) {
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

  // Build week metadata once — labels for tooltip, month boundaries for divider hints,
  // and any public holidays that fall on the Mon–Fri working days.
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

      const holidayNames: string[] = []
      if (country) {
        for (let d = 0; d < 5; d++) {
          const hit = getHolidayForDate(addDays(start, d), country)
          if (hit && !holidayNames.includes(hit.name)) holidayNames.push(hit.name)
        }
      }

      return { weekNumber, monthIdx, monthLabel, dateRange, isCurrent, holidayNames }
    })
  }, [lastWeek, year, todayWeek, todayYear, t, country])

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
          const hasHoliday = wk.holidayNames.length > 0
          const holidaySuffix = hasHoliday ? ` · ${wk.holidayNames.join(', ')}` : ''

          return (
            <button
              key={wk.weekNumber}
              role="listitem"
              type="button"
              onClick={() => onWeekClick(wk.weekNumber)}
              title={`${t.matrix.weekLabel} ${wk.weekNumber} · ${wk.dateRange}${holidaySuffix}`}
              aria-label={`${t.matrix.weekLabel} ${wk.weekNumber} ${wk.dateRange}${status ? ` · ${t.status[status]}` : ''}${holidaySuffix}`}
              className="group relative flex-1 min-w-0 rounded-[5px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lg-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
              style={{
                height: 28,
                marginLeft: isMonthStart && wk.weekNumber !== 1 ? 4 : undefined,
              }}
            >
              <motion.div
                whileHover={{ y: -2 }}
                transition={spring.snappy}
                className="absolute inset-0 rounded-[5px] transition-colors duration-150 overflow-hidden"
                style={{
                  background: palette
                    ? `linear-gradient(180deg, ${palette.icon} 0%, ${palette.gradient.dark[1]} 100%)`
                    : hasHoliday
                      ? 'linear-gradient(180deg, rgba(244, 63, 94, 0.16) 0%, rgba(244, 63, 94, 0.04) 100%)'
                      : 'transparent',
                  border: palette
                    ? `1px solid ${palette.icon}55`
                    : hasHoliday
                      ? '1px solid rgba(244, 63, 94, 0.45)'
                      : '1px dashed var(--lg-divider)',
                  boxShadow: wk.isCurrent
                    ? '0 0 0 2px var(--lg-accent), 0 0 14px var(--lg-accent-glow)'
                    : hasHoliday
                      ? '0 0 10px -2px rgba(244, 63, 94, 0.55)'
                      : palette
                        ? `0 0 8px -2px ${palette.icon}66`
                        : 'none',
                }}
              >
                {/* Holiday cap — red bookmark stripe along the top edge so a
                    helligdag-uke reads at a glance even when the pill is
                    already coloured by the week's dominant work status. */}
                {hasHoliday && (
                  <span
                    aria-hidden
                    className="absolute inset-x-0 top-0"
                    style={{
                      height: 3,
                      background: '#F43F5E',
                      boxShadow: '0 0 8px rgba(244, 63, 94, 0.75)',
                    }}
                  />
                )}
              </motion.div>
              {/* Hover label — shows week number above the pill */}
              <span
                aria-hidden
                className="lg-mono pointer-events-none absolute left-1/2 -translate-x-1/2 -top-5 text-[9.5px] uppercase opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                style={{
                  color: hasHoliday ? '#F43F5E' : 'var(--lg-text-2)',
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
