'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { addDays, addWeeks, startOfISOWeek, getISOWeek, getISOWeekYear } from 'date-fns'
import { useTheme } from 'next-themes'
import { createClient } from '@/lib/supabase/client'
import { StatusIcon } from '@/components/icons/status-icons'
import { MemberAvatar } from '@/components/member-avatar'
import { CellEditor } from '@/components/cell-editor'
import {
  toDateString,
  isToday,
  MONTH_LONG_NB,
  formatDateLabelLong,
} from '@/lib/dates'
import type { Entry, EntryStatus } from '@/lib/supabase/types'
import { spring } from '@/lib/motion'
import { no } from '@/lib/i18n/no'

const STATUS_GRADIENT: Record<EntryStatus, { light: [string, string]; dark: [string, string]; shadow: string }> = {
  office:   { light: ['#2682FF', '#0047C2'], dark: ['#0A3C8C', '#072C69'], shadow: '0, 102, 255' },
  remote:   { light: ['#1EBE75', '#0E7A41'], dark: ['#0E6E3C', '#08522B'], shadow: '22, 163, 98' },
  customer: { light: ['#FF8A35', '#C45200'], dark: ['#A04000', '#6F2C00'], shadow: '255, 122, 26' },
  travel:   { light: ['#9E55F0', '#5A21B0'], dark: ['#4C1C98', '#341266'], shadow: '139, 63, 230' },
  vacation: { light: ['#E8A600', '#8F5C00'], dark: ['#8A5E00', '#5F4100'], shadow: '212, 144, 0' },
  sick:     { light: ['#ED5561', '#B4182B'], dark: ['#8C1120', '#5F0A15'], shadow: '230, 57, 70' },
  off:      { light: ['#8C867F', '#5B5450'], dark: ['#3E3A37', '#282522'], shadow: '120, 113, 108' },
}

const HORIZON_WEEKS = 12

interface MyPlanProps {
  orgId: string
  memberId: string
  memberName: string
  avatarUrl: string | null
}

interface WeekBlock {
  weekNumber: number
  year: number
  start: Date
  days: Date[]
  monthLabel: string
  isCurrentWeek: boolean
}

function buildHorizon(): WeekBlock[] {
  const today = new Date()
  const currentMonday = startOfISOWeek(today)
  const todayWeek = getISOWeek(today)
  const todayYear = getISOWeekYear(today)

  return Array.from({ length: HORIZON_WEEKS }, (_, i) => {
    const start = addWeeks(currentMonday, i)
    const days = Array.from({ length: 5 }, (_, d) => addDays(start, d))
    const weekNumber = getISOWeek(start)
    const year = getISOWeekYear(start)
    // Pick the month of the middle of the week for the label
    const midWeek = days[2]
    const monthLabel = `${MONTH_LONG_NB[midWeek.getMonth()]} ${midWeek.getFullYear()}`
    return {
      weekNumber,
      year,
      start,
      days,
      monthLabel,
      isCurrentWeek: weekNumber === todayWeek && year === todayYear,
    }
  })
}

interface SelectedCell {
  date: string
  dateLabel: string
  status: EntryStatus | null
  location: string | null
  note: string | null
}

export function MyPlan({ orgId, memberId, memberName, avatarUrl }: MyPlanProps) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = mounted && resolvedTheme === 'dark'

  const weeks = useMemo(buildHorizon, [])
  const rangeStart = toDateString(weeks[0].start)
  const rangeEnd = toDateString(addDays(weeks[weeks.length - 1].start, 4))

  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null)

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('entries')
        .select('*')
        .eq('org_id', orgId)
        .eq('member_id', memberId)
        .gte('date', rangeStart)
        .lte('date', rangeEnd)
        .order('date')
      setEntries(data ?? [])
      setLoading(false)
    }
    load()

    const channel = supabase
      .channel(`my-plan:${memberId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'entries',
          filter: `member_id=eq.${memberId}`,
        },
        () => load()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [orgId, memberId, rangeStart, rangeEnd])

  const entryByDate = useMemo(() => {
    const map = new Map<string, Entry>()
    entries.forEach((e) => map.set(e.date, e))
    return map
  }, [entries])

  const totalEntries = entries.length

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <MemberAvatar name={memberName} avatarUrl={avatarUrl} size="md" />
        <div>
          <h1
            className="text-[32px] font-bold leading-none"
            style={{
              fontFamily: 'var(--font-sora)',
              letterSpacing: '-0.03em',
              color: 'var(--text-primary)',
            }}
          >
            Min plan
          </h1>
          <p
            className="text-[13px] mt-1.5"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
          >
            {loading
              ? 'Laster…'
              : totalEntries === 0
                ? `Ingen oppføringer de neste ${HORIZON_WEEKS} ukene`
                : `${totalEntries} ${totalEntries === 1 ? 'oppføring' : 'oppføringer'} de neste ${HORIZON_WEEKS} ukene`}
          </p>
        </div>
      </div>

      {/* Weeks */}
      <div className="space-y-3">
        {weeks.map((wk, wkIdx) => {
          const weekEntries = wk.days
            .map((d) => entryByDate.get(toDateString(d)))
            .filter(Boolean) as Entry[]
          const hasEntries = weekEntries.length > 0

          return (
            <motion.div
              key={`${wk.year}-${wk.weekNumber}`}
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ ...spring.gentle, delay: wkIdx * 0.025 }}
              className="relative rounded-3xl overflow-hidden"
              style={{
                background: 'color-mix(in oklab, var(--bg-elevated) 78%, transparent)',
                backdropFilter: 'blur(22px) saturate(180%)',
                WebkitBackdropFilter: 'blur(22px) saturate(180%)',
                border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
                boxShadow: '0 12px 32px -16px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.03)',
                opacity: !hasEntries && !wk.isCurrentWeek ? 0.58 : 1,
              }}
            >
              <div
                className="grid items-stretch gap-2 px-4 py-3"
                style={{ gridTemplateColumns: '128px repeat(5, 1fr)' }}
              >
                {/* Week label column */}
                <div className="flex flex-col justify-center pr-2">
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className="text-[10px] font-bold uppercase tracking-[0.18em]"
                      style={{
                        color: wk.isCurrentWeek ? 'var(--accent-color)' : 'var(--text-tertiary)',
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      {no.matrix.weekLabel}
                    </span>
                    <span
                      className="text-[22px] font-bold tabular-nums leading-none"
                      style={{
                        fontFamily: 'var(--font-sora)',
                        letterSpacing: '-0.03em',
                        color: 'var(--text-primary)',
                        background: wk.isCurrentWeek
                          ? 'linear-gradient(135deg, var(--accent-color), hsl(260, 80%, 60%))'
                          : undefined,
                        WebkitBackgroundClip: wk.isCurrentWeek ? 'text' : undefined,
                        WebkitTextFillColor: wk.isCurrentWeek ? 'transparent' : undefined,
                        backgroundClip: wk.isCurrentWeek ? 'text' : undefined,
                      }}
                    >
                      {wk.weekNumber}
                    </span>
                  </div>
                  <div
                    className="text-[11px] font-medium mt-0.5 capitalize"
                    style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
                  >
                    {wk.monthLabel}
                  </div>
                </div>

                {/* Day cells */}
                {wk.days.map((day) => {
                  const dateStr = toDateString(day)
                  const entry = entryByDate.get(dateStr) ?? null
                  const status = entry?.status ?? null
                  const today = isToday(day)
                  const palette = status ? STATUS_GRADIENT[status] : null
                  const [g0, g1] = palette ? (isDark ? palette.dark : palette.light) : ['', '']
                  const shadowRgb = palette?.shadow
                  const gradient = palette ? `linear-gradient(135deg, ${g0} 0%, ${g1} 100%)` : undefined
                  const coloredShadow = shadowRgb
                    ? isDark
                      ? `0 8px 20px -8px rgba(${shadowRgb},0.5), 0 0 0 1px rgba(${shadowRgb},0.3) inset, 0 1px 0 rgba(255,255,255,0.08) inset`
                      : `0 8px 20px -6px rgba(${shadowRgb},0.5), 0 2px 4px -1px rgba(${shadowRgb},0.22), 0 1px 0 rgba(255,255,255,0.3) inset`
                    : undefined
                  const label = entry?.location_label || entry?.note || null

                  return (
                    <motion.button
                      key={dateStr}
                      onClick={() =>
                        setSelectedCell({
                          date: dateStr,
                          dateLabel: formatDateLabelLong(day),
                          status,
                          location: entry?.location_label ?? null,
                          note: entry?.note ?? null,
                        })
                      }
                      whileHover={{ y: -2, scale: 1.015 }}
                      transition={spring.snappy}
                      className="relative rounded-2xl h-[68px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] overflow-hidden text-left"
                      style={{
                        background: status
                          ? gradient
                          : isDark
                            ? 'rgba(255,255,255,0.025)'
                            : 'rgba(255,255,255,0.4)',
                        backgroundImage: status === null
                          ? `repeating-linear-gradient(135deg, transparent, transparent 8px, ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.035)'} 8px, ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.035)'} 9px)`
                          : undefined,
                        boxShadow: status
                          ? coloredShadow
                          : 'inset 0 0 0 1px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.4)',
                        border: today
                          ? '2px solid var(--accent-color)'
                          : undefined,
                      }}
                    >
                      {/* Day label */}
                      <div
                        className="absolute top-2 left-3 text-[10px] font-bold uppercase tracking-[0.14em]"
                        style={{
                          color: status ? 'rgba(255,255,255,0.85)' : today ? 'var(--accent-color)' : 'var(--text-tertiary)',
                          fontFamily: 'var(--font-body)',
                          textShadow: status ? '0 1px 2px rgba(0,0,0,0.25)' : undefined,
                        }}
                      >
                        {['Man', 'Tir', 'Ons', 'Tor', 'Fre'][day.getDay() === 0 ? 6 : day.getDay() - 1]}{' '}
                        {day.getDate()}.
                      </div>

                      {/* Content: icon + label */}
                      {status ? (
                        <div className="absolute inset-0 flex items-center gap-2.5 px-3 pt-4">
                          <div
                            className="flex items-center justify-center rounded-lg shrink-0"
                            style={{
                              width: 30,
                              height: 30,
                              background: 'rgba(255,255,255,0.25)',
                              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.4), 0 2px 6px rgba(0,0,0,0.12)',
                            }}
                          >
                            <StatusIcon status={status} size={16} color="#ffffff" />
                          </div>
                          {label && (
                            <span
                              className="text-[12px] font-semibold leading-tight truncate"
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
                      ) : null}
                    </motion.button>
                  )
                })}
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Cell editor */}
      <CellEditor
        open={selectedCell !== null}
        onClose={() => setSelectedCell(null)}
        orgId={orgId}
        memberId={memberId}
        memberName={memberName}
        date={selectedCell?.date ?? ''}
        dateLabel={selectedCell?.dateLabel ?? ''}
        initialStatus={selectedCell?.status ?? null}
        initialLocation={selectedCell?.location ?? null}
        initialNote={selectedCell?.note ?? null}
      />
    </div>
  )
}
