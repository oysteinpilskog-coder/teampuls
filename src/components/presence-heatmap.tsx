'use client'

import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { useTheme } from 'next-themes'
import { createClient } from '@/lib/supabase/client'
import { MemberAvatar } from '@/components/member-avatar'
import { useStatusColors } from '@/lib/status-colors/context'
import { StatusIcon } from '@/components/icons/status-icons'
import {
  getISOWeek,
  getISOWeekYear,
  getLastISOWeek,
  getWeekDays,
  toDateString,
  isToday,
  getDayLabel,
  formatDateLabelLong,
} from '@/lib/dates'
import { no } from '@/lib/i18n/no'
import { spring } from '@/lib/motion'
import type { Entry, EntryStatus, Member } from '@/lib/supabase/types'

interface PresenceHeatmapProps {
  orgId: string
  /** Number of weeks (Mon-Fri) to show, ending with the current week. Default 6 = 30 weekdays. */
  weeks?: number
}

export function PresenceHeatmap({ orgId, weeks = 6 }: PresenceHeatmapProps) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = mounted && resolvedTheme === 'dark'
  const palettes = useStatusColors()

  const [members, setMembers] = useState<Member[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)

  // Build the list of weekdays to show: last N weeks (Mon-Fri), oldest first.
  const { allDays, weekBoundaries } = useMemo(() => {
    const today = new Date()
    const curW = getISOWeek(today)
    const curY = getISOWeekYear(today)
    const pairs: Array<{ week: number; year: number }> = []
    for (let i = weeks - 1; i >= 0; i--) {
      let w = curW - i
      let y = curY
      while (w < 1) {
        y -= 1
        w += getLastISOWeek(y)
      }
      pairs.push({ week: w, year: y })
    }
    const boundaries = pairs.map((p) => p.week)
    const days = pairs.flatMap(({ week, year }) => getWeekDays(week, year))
    return { allDays: days, weekBoundaries: boundaries }
  }, [weeks])

  const dateStrings = useMemo(() => allDays.map(toDateString), [allDays])

  // Fetch once on mount (plus react to orgId/range changes). Also listen for
  // the "entries-changed" broadcast so the heatmap updates alongside the grid
  // when the AI field or drag-drop mutates the DB.
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const [{ data: ms }, { data: es }] = await Promise.all([
        supabase
          .from('members')
          .select('*')
          .eq('org_id', orgId)
          .eq('is_active', true)
          .order('display_name'),
        supabase
          .from('entries')
          .select('*')
          .eq('org_id', orgId)
          .gte('date', dateStrings[0])
          .lte('date', dateStrings[dateStrings.length - 1]),
      ])
      if (cancelled) return
      setMembers(ms ?? [])
      setEntries(es ?? [])
      setLoading(false)
    }
    load()
    const handler = () => load()
    window.addEventListener('teampulse:entries-changed', handler)
    return () => {
      cancelled = true
      window.removeEventListener('teampulse:entries-changed', handler)
    }
  }, [orgId, dateStrings])

  // Lookup: member_id + date → Entry
  const entryMap = useMemo(() => {
    const m = new Map<string, Entry>()
    entries.forEach((e) => m.set(`${e.member_id}_${e.date}`, e))
    return m
  }, [entries])

  // Only show members that have at least one entry in the visible period.
  const visibleMembers = useMemo(() => {
    const withEntries = new Set(entries.map((e) => e.member_id))
    return members.filter((m) => withEntries.has(m.id))
  }, [members, entries])

  // Aggregate totals across the whole period — appears as chips in the header.
  const totals = useMemo(() => {
    const counts: Partial<Record<EntryStatus, number>> = {}
    for (const e of entries) counts[e.status] = (counts[e.status] ?? 0) + 1
    return counts
  }, [entries])

  if (!loading && visibleMembers.length === 0) return null

  return (
    <section className="relative">
      <Header weeks={weeks} totals={totals} palettes={palettes} />

      <div
        className="relative rounded-3xl overflow-hidden"
        style={{
          background:
            'linear-gradient(180deg, color-mix(in oklab, var(--bg-elevated) 92%, transparent) 0%, color-mix(in oklab, var(--bg-elevated) 82%, transparent) 100%)',
          backdropFilter: 'blur(24px) saturate(160%)',
          WebkitBackdropFilter: 'blur(24px) saturate(160%)',
          border: '1px solid color-mix(in oklab, var(--border-subtle) 70%, transparent)',
          boxShadow:
            '0 24px 48px -24px rgba(15,23,42,0.18), 0 10px 24px -16px rgba(15,23,42,0.10), 0 1px 2px rgba(15,23,42,0.04), inset 0 1px 0 rgba(255,255,255,0.45)',
        }}
      >
        {/* Day header */}
        <div
          className="grid gap-[3px] px-5 py-3 text-[9px] font-bold uppercase tracking-[0.14em]"
          style={{
            gridTemplateColumns: `160px repeat(${allDays.length}, minmax(0, 1fr))`,
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-body)',
            borderBottom: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
          }}
        >
          <div className="flex items-end gap-2">
            <span>{weeks} {weeks === 1 ? 'uke' : 'uker'}</span>
          </div>
          {allDays.map((d, i) => {
            const isWeekStart = i % 5 === 0
            return (
              <div
                key={d.toISOString()}
                className="text-center relative"
                style={{
                  borderLeft: isWeekStart && i > 0
                    ? '1px solid color-mix(in oklab, var(--border-subtle) 80%, transparent)'
                    : undefined,
                  paddingLeft: isWeekStart && i > 0 ? 2 : undefined,
                }}
              >
                {isWeekStart && (
                  <span
                    className="absolute -top-0.5 left-1 text-[8px] font-semibold"
                    style={{ color: 'var(--text-tertiary)', letterSpacing: '0.08em' }}
                  >
                    U{weekBoundaries[Math.floor(i / 5)]}
                  </span>
                )}
                <span style={{ opacity: isToday(d) ? 1 : 0.5 }}>
                  {getDayLabel(d).weekday.charAt(0)}
                </span>
              </div>
            )
          })}
        </div>

        {/* Rows */}
        <div className="px-5 py-3 space-y-1.5" style={{ userSelect: 'none' }}>
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <SkeletonHeatRow key={i} days={allDays.length} index={i} />
              ))
            : visibleMembers.map((member, rowIdx) => (
                <motion.div
                  key={member.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring.gentle, delay: Math.min(rowIdx, 12) * 0.025 }}
                  className="grid gap-[3px] items-center"
                  style={{
                    gridTemplateColumns: `160px repeat(${allDays.length}, minmax(0, 1fr))`,
                  }}
                >
                  <div className="flex items-center gap-2 pr-2 min-w-0">
                    <MemberAvatar
                      name={member.display_name}
                      avatarUrl={member.avatar_url}
                      initials={member.initials ?? null}
                      size="xs"
                    />
                    <span
                      className="text-[12px] font-semibold truncate"
                      style={{ color: 'var(--text-primary)', letterSpacing: '-0.005em' }}
                    >
                      {member.display_name.split(' ')[0]}
                    </span>
                  </div>

                  {allDays.map((d, i) => {
                    const key = `${member.id}_${toDateString(d)}`
                    const entry = entryMap.get(key)
                    const isWeekStart = i % 5 === 0
                    return (
                      <HeatCell
                        key={key}
                        date={d}
                        entry={entry}
                        isDark={isDark}
                        palettes={palettes}
                        memberName={member.display_name}
                        separator={isWeekStart && i > 0}
                      />
                    )
                  })}
                </motion.div>
              ))}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function Header({
  weeks,
  totals,
  palettes,
}: {
  weeks: number
  totals: Partial<Record<EntryStatus, number>>
  palettes: ReturnType<typeof useStatusColors>
}) {
  const STATUS_ORDER: EntryStatus[] = ['office', 'remote', 'customer', 'travel', 'vacation', 'sick', 'off']
  return (
    <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
      <div>
        <div
          className="text-[10px] font-bold uppercase tracking-[0.25em] mb-1.5"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
        >
          Historikk · {weeks} uker
        </div>
        <h2
          className="font-bold leading-none"
          style={{
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sora)',
            fontSize: 'clamp(24px, 3vw, 34px)',
            letterSpacing: '-0.035em',
          }}
        >
          Tilstedeværelse
        </h2>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_ORDER.map((s) => {
          const count = totals[s] ?? 0
          if (count === 0) return null
          const pal = palettes[s]
          return (
            <span
              key={s}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-semibold"
              style={{
                background: `color-mix(in oklab, ${pal.icon} 12%, transparent)`,
                color: 'var(--text-primary)',
                border: `1px solid color-mix(in oklab, ${pal.icon} 22%, transparent)`,
                fontFamily: 'var(--font-body)',
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: pal.icon }}
              />
              <span className="tabular-nums">{count}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{no.status[s].toLowerCase()}</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function HeatCell({
  date,
  entry,
  isDark,
  palettes,
  memberName,
  separator,
}: {
  date: Date
  entry: Entry | undefined
  isDark: boolean
  palettes: ReturnType<typeof useStatusColors>
  memberName: string
  separator: boolean
}) {
  const today = isToday(date)
  const pal = entry ? palettes[entry.status] : null
  const [g0, g1] = pal ? (isDark ? pal.gradient.dark : pal.gradient.light) : ['', '']

  // Empty cell: subtle checker look (no entry registered).
  const empty = !entry
  const title = entry
    ? `${memberName} · ${formatDateLabelLong(date)} · ${no.status[entry.status]}${entry.location_label ? ` · ${entry.location_label}` : ''}`
    : `${memberName} · ${formatDateLabelLong(date)} · Ingen oppføring`

  return (
    <div
      className="relative"
      style={{
        borderLeft: separator
          ? '1px solid color-mix(in oklab, var(--border-subtle) 80%, transparent)'
          : undefined,
        paddingLeft: separator ? 2 : undefined,
      }}
    >
      <div
        title={title}
        aria-label={title}
        className="h-6 rounded-[5px] relative"
        style={{
          background: empty
            ? 'color-mix(in oklab, var(--bg-subtle) 75%, transparent)'
            : `linear-gradient(180deg, ${g0} 0%, ${g1} 100%)`,
          boxShadow: empty
            ? 'inset 0 0 0 1px color-mix(in oklab, var(--border-subtle) 60%, transparent)'
            : `inset 0 1px 0 rgba(255,255,255,0.30), 0 1px 2px color-mix(in oklab, ${pal?.glow ?? g1} 30%, transparent)`,
          transition: 'transform 160ms ease, box-shadow 180ms ease',
          cursor: entry ? 'pointer' : 'default',
        }}
      >
        {/* Today accent ring */}
        {today && (
          <span
            aria-hidden
            className="absolute inset-0 rounded-[5px] pointer-events-none"
            style={{
              boxShadow:
                'inset 0 0 0 1.5px color-mix(in oklab, var(--accent-color) 70%, transparent)',
            }}
          />
        )}

        {/* Hover lift — icon fades in */}
        {entry && (
          <div
            className="heat-cell-icon absolute inset-0 flex items-center justify-center opacity-0 transition-opacity"
            style={{ transition: 'opacity 140ms' }}
          >
            <StatusIcon status={entry.status} size={10} color="#ffffff" />
          </div>
        )}
      </div>
      <style jsx>{`
        div:hover .heat-cell-icon { opacity: 1; }
        div:hover .heat-cell-inner { transform: translateY(-1px); }
      `}</style>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function SkeletonHeatRow({ days, index }: { days: number; index: number }) {
  return (
    <div
      className="grid gap-[3px] items-center"
      style={{ gridTemplateColumns: `160px repeat(${days}, minmax(0, 1fr))` }}
    >
      <div className="flex items-center gap-2 pr-2">
        <span
          className="shrink-0 tp-shimmer"
          style={{ width: 20, height: 20, borderRadius: '9999px', animationDelay: `${index * 80}ms` }}
        />
        <span
          className="tp-shimmer"
          style={{ height: 8, width: '55%', borderRadius: 3, animationDelay: `${index * 80}ms` }}
        />
      </div>
      {Array.from({ length: days }).map((_, i) => (
        <span
          key={i}
          className="tp-shimmer"
          style={{
            height: 24,
            borderRadius: 5,
            animationDelay: `${index * 80 + i * 20}ms`,
            opacity: 0.35 + (i % 5 === 0 ? 0.25 : 0),
          }}
        />
      ))}
    </div>
  )
}
