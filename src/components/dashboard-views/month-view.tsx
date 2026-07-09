'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { StatusIcon } from '@/components/icons/status-icons'
import { useStatusColors } from '@/lib/status-colors/context'

type StatusColors = ReturnType<typeof useStatusColors>
import { MemberAvatar } from '@/components/member-avatar'
import { CountryBadge } from '@/components/country-badge'
import type { Member, Entry, EntryStatus, Office } from '@/lib/supabase/types'
import { getISOWeek, isToday } from '@/lib/dates'
import { spring } from '@/lib/motion'
import { useT } from '@/lib/i18n/context'
import type { Dictionary } from '@/lib/i18n/types'
import { dedupeEntriesByMemberDate } from '@/lib/entries/dedupe'

interface MonthViewProps {
  members: Member[]
  weekDays: Date[]
  /** Current week's entries — real rows merged with presence-assumed
   *  syntheses (one row per member × weekday). Same merged shape som
   *  Oversikt-matrisa, slik at kortene rapporterer eksakt det matrisa viser. */
  entries: Entry[]
  orgName: string
  time: Date
  offices?: Office[]
}

function pad(n: number) { return String(n).padStart(2, '0') }
function toIso(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const STATUS_ORDER: EntryStatus[] = [
  'office', 'remote', 'customer', 'event', 'travel', 'vacation', 'absent', 'off',
]

type GroupKey = 'office' | 'remote' | 'customer' | 'away'

const DAY_STATUS_GROUPS: Array<{
  key: GroupKey
  statuses: EntryStatus[]
  representative: EntryStatus
}> = [
  { key: 'office',   statuses: ['office'],                          representative: 'office'   },
  { key: 'remote',   statuses: ['remote'],                          representative: 'remote'   },
  { key: 'customer', statuses: ['customer', 'event', 'travel'],     representative: 'customer' },
  { key: 'away',     statuses: ['vacation', 'absent', 'off'],       representative: 'vacation' },
]

type AwayReason = 'vacation' | 'absent' | 'off'

interface DayStat {
  date: Date
  dateStr: string
  total: number
  regPct: number
  groupCounts: Array<{ group: typeof DAY_STATUS_GROUPS[number]; count: number }>
  dominant: { group: typeof DAY_STATUS_GROUPS[number]; count: number }
  today: boolean
}

export function MonthView({ members, weekDays, entries, orgName: _orgName, time }: MonthViewProps) {
  const STATUS_COLORS = useStatusColors()
  const t = useT()
  const STATUS_LABELS: Record<EntryStatus, string> = {
    office: t.status.office,
    remote: t.pulse.atHomeShort,
    customer: t.status.customer,
    event: t.status.event,
    travel: t.status.travel,
    vacation: t.status.vacation,
    absent: t.status.absent,
    off: t.status.off,
  }
  const weekNum = getISOWeek(time)
  const year    = time.getFullYear()

  // Dedup: one Entry per (member_id, date) — keeps tallies aligned with
  // Oversikt-matrisa.
  const weekDeduped = useMemo(
    () => dedupeEntriesByMemberDate(entries, members),
    [entries, members],
  )

  const entryMap = useMemo(() => {
    const m = new Map<string, Entry>()
    weekDeduped.forEach(e => m.set(`${e.member_id}_${e.date}`, e))
    return m
  }, [weekDeduped])

  // Per-day stats — drives both the headline "ukens topp" og selve dag-rutene.
  const dayStats: DayStat[] = useMemo(() => {
    return weekDays.map(date => {
      const dateStr = toIso(date)
      const dayDeduped = weekDeduped.filter(e => e.date === dateStr)
      const groupCounts = DAY_STATUS_GROUPS.map(g => ({
        group: g,
        count: dayDeduped.filter(e => g.statuses.includes(e.status)).length,
      }))
      const total = dayDeduped.length
      const dominant = groupCounts.reduce(
        (a, b) => (b.count > a.count ? b : a),
        groupCounts[0],
      )
      const regPct = members.length > 0 ? Math.round((total / members.length) * 100) : 0
      return { date, dateStr, total, regPct, groupCounts, dominant, today: isToday(date) }
    })
  }, [weekDays, weekDeduped, members.length])

  const peak = useMemo(() => {
    const candidates = dayStats.filter(d => d.total > 0)
    if (candidates.length === 0) return null
    return candidates.reduce((a, b) => (b.total > a.total ? b : a), candidates[0])
  }, [dayStats])

  // Members away at any point this week, with their primary "borte"-grunn.
  // Prioritet: vacation > absent > off så «Anna har ferie hele uka» ikke blir
  // overskrevet av en ekstra «fraværende fredag»-rad.
  const awayList = useMemo(() => {
    const list: Array<{ member: Member; reason: AwayReason }> = []
    for (const m of members) {
      let reason: AwayReason | null = null
      for (const d of weekDays) {
        const dateStr = toIso(d)
        const e = entryMap.get(`${m.id}_${dateStr}`)
        if (!e) continue
        if (e.status === 'vacation') {
          reason = 'vacation'
          break
        }
        if (e.status === 'absent') reason = reason ?? 'absent'
        else if (e.status === 'off') reason = reason ?? 'off'
      }
      if (reason) list.push({ member: m, reason })
    }
    return list
  }, [members, weekDays, entryMap])

  // Tallies for full week — bygd på deduped entries så én ekstra rad
  // per medlem-dag ikke inflaterer aggregert «I sum».
  const weekTotals = STATUS_ORDER.map(s => ({
    status: s,
    count: weekDeduped.filter(e => e.status === s).length,
  }))
  const weekTotal = weekDeduped.length
  const topStatuses = weekTotals.filter(w => w.count > 0).sort((a, b) => b.count - a.count)

  const peakWeekdayLong = peak
    ? t.dates.weekdaysLong[peak.date.getDay()].toLowerCase()
    : ''

  // Tailwind kan ikke generere grid-cols-N dynamisk uten safelist, så vi
  // setter rad-templaten med inline style i stedet.
  const horizonGridStyle: React.CSSProperties = {
    gridTemplateColumns: `repeat(${weekDays.length}, minmax(0, 1fr))`,
  }

  return (
    <div className="relative h-full flex flex-col px-10 pt-20 pb-6 gap-5">
      {/* ── HEADER — eyebrow + Fraunces-tittel + storyline.
            Storyline gir resepsjonen ETT lesbart fakta før øyet faller ned i
            dag-rutene. Tom uke ⇒ tilgivende fallback. */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring.gentle, delay: 0.05 }}
        className="flex-shrink-0 flex flex-col gap-1"
      >
        <span
          className="text-[11px] font-semibold tracking-[0.28em] uppercase"
          style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body)' }}
        >
          {t.matrix.weekLabel} {weekNum} · {year}
        </span>
        <p
          className="text-[34px] font-light tracking-tight leading-none"
          style={{
            fontFamily: 'var(--font-fraunces), "Iowan Old Style", Georgia, serif',
            fontStyle: 'italic',
            fontVariationSettings: '"opsz" 32, "SOFT" 80',
            letterSpacing: '-0.025em',
            color: 'var(--paper)',
          }}
        >
          {t.dashboard.month.title}
        </p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.18 }}
          className="text-[15px] mt-1"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          {peak ? (
            <>
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                {t.dashboard.month.storyMost}
              </span>{' '}
              <span
                style={{
                  color: 'color-mix(in oklab, var(--accent-color) 55%, white)',
                  fontWeight: 600,
                }}
              >
                {peakWeekdayLong}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.3)' }}>{' · '}</span>
              <span
                className="tabular-nums"
                style={{
                  color: 'rgba(255,255,255,0.92)',
                  fontWeight: 600,
                  fontFamily: 'var(--font-fraunces)',
                }}
              >
                {peak.total}
              </span>{' '}
              <span style={{ color: 'rgba(255,255,255,0.55)' }}>
                {t.dashboard.month.storyIn}
              </span>
            </>
          ) : (
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>
              {t.dashboard.month.storyEmpty}
            </span>
          )}
        </motion.p>
      </motion.div>

      {/* ── HORIZON — 5 dag-kort, hero av visningen. Hver rute er sin egen
            «Apple Weather-kolonne»: vertikal stack-bar der høyden er andelen
            av teamet som er registrert, og fargesegmentene er fordelingen
            mellom Kontor/Hjemme/Hos kunde/Borte. Onsdag (peak) får en gull-
            stjerne, dagens dato får aurora-glød — så øyet finner takeaway-en
            før det leser et eneste tall. */}
      <div
        className="flex-1 grid gap-3 min-h-0"
        style={horizonGridStyle}
      >
        {dayStats.map((stat, i) => (
          <DayHorizonCard
            key={stat.dateStr}
            stat={stat}
            isPeak={!!peak && stat.dateStr === peak.dateStr}
            membersTotal={members.length}
            statusColors={STATUS_COLORS}
            weekdayShort={t.dates.weekdaysShort[stat.date.getDay()].toUpperCase()}
            todayLabel={t.dashboard.month.todayChip}
            t={t}
            delay={0.18 + i * 0.05}
          />
        ))}
      </div>

      {/* ── LEGEND — fargenøkkel for søylene over. Fire chips, sentrert.
            Uten denne forblir den fargete bunnstrip-en en gåte: orange =
            borte? hjemme? — nå er det aldri tvil. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.55 }}
        className="flex-shrink-0 flex items-center justify-center gap-6 flex-wrap"
      >
        {DAY_STATUS_GROUPS.map(g => {
          const label =
            g.key === 'office'   ? STATUS_LABELS.office
          : g.key === 'remote'   ? STATUS_LABELS.remote
          : g.key === 'customer' ? t.pulse.out
          :                        t.pulse.away
          return (
            <LegendChip
              key={g.key}
              color={STATUS_COLORS[g.representative].icon}
              label={label}
            />
          )
        })}
      </motion.div>

      {/* ── BOTTOM — «I sum» + «Borte» side-by-side. Drar status-totaler og
            borte-listen ned i en kompakt rad så hero-en (dag-rutene) får
            beholde luft. Borte-chips bærer et lite Ferie/Fraværende/Fri-
            merke, så resepsjonen ser hvilken kategori uten å klikke. */}
      <div className="flex-shrink-0 grid grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.6 }}
          className="rounded-2xl p-4 flex flex-col gap-2.5"
          style={{
            background:
              'linear-gradient(155deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div className="flex items-baseline justify-between">
            <h3
              className="text-[11px] font-semibold uppercase tracking-[0.22em]"
              style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body)' }}
            >
              {t.dashboard.month.inSum}
            </h3>
            {weekTotal > 0 && (
              <span
                className="tabular-nums text-[12px] font-semibold"
                style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-fraunces)' }}
              >
                {weekTotal} {t.dashboard.month.registrations}
              </span>
            )}
          </div>
          {topStatuses.length === 0 ? (
            <p
              className="text-[14px]"
              style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-body)' }}
            >
              {t.dashboard.noMonthEntries}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {topStatuses.map(({ status, count }, i) => {
                const pct = (count / weekTotal) * 100
                const c = STATUS_COLORS[status]
                return (
                  <PulseRow
                    key={status}
                    status={status}
                    label={STATUS_LABELS[status]}
                    count={count}
                    pct={pct}
                    tone={c.icon}
                    labelColor={c.textDark}
                    delay={0.7 + i * 0.04}
                  />
                )
              })}
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.66 }}
          className="rounded-2xl p-4 flex flex-col gap-2.5 overflow-hidden"
          style={{
            background:
              'linear-gradient(155deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div className="flex items-baseline justify-between gap-2">
            <h3
              className="text-[11px] font-semibold uppercase tracking-[0.22em]"
              style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body)' }}
            >
              {t.dashboard.month.awayThisWeek}
            </h3>
            {awayList.length > 0 && (
              <span
                className="tabular-nums text-[12px] font-semibold"
                style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-fraunces)' }}
              >
                {awayList.length}
              </span>
            )}
          </div>
          {awayList.length === 0 ? (
            <p
              className="text-[14px]"
              style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-body)' }}
            >
              {t.dashboard.month.awayEmpty}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5 content-start">
              {awayList.map(({ member, reason }, i) => {
                const reasonColor = STATUS_COLORS[reason].icon
                return (
                  <motion.div
                    key={member.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...spring.gentle, delay: 0.75 + i * 0.03 }}
                    className="flex items-center gap-1.5 pl-0.5 pr-1.5 py-0.5 rounded-full"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <MemberAvatar
                      name={member.full_name || member.display_name}
                      initials={member.initials}
                      avatarUrl={member.avatar_url}
                      size="sm"
                    />
                    <span
                      className="text-[12px] font-medium truncate"
                      style={{
                        color: 'rgba(255,255,255,0.85)',
                        fontFamily: 'var(--font-body)',
                        maxWidth: 120,
                      }}
                    >
                      {member.full_name || member.display_name}
                    </span>
                    <CountryBadge countryCode={member.location_code ?? null} />
                    <span
                      className="text-[9.5px] font-semibold uppercase tracking-[0.14em] px-1.5 py-[1px] rounded-full"
                      style={{
                        background: `color-mix(in oklab, ${reasonColor} 18%, transparent)`,
                        color: `color-mix(in oklab, ${reasonColor} 55%, white)`,
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      {STATUS_LABELS[reason]}
                    </span>
                  </motion.div>
                )
              })}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}

/* ───────────────────────────── Day card ─────────────────────────────── */

interface DayHorizonCardProps {
  stat: DayStat
  isPeak: boolean
  membersTotal: number
  statusColors: StatusColors
  weekdayShort: string
  todayLabel: string
  t: Dictionary
  delay: number
}

function DayHorizonCard({
  stat, isPeak, membersTotal, statusColors,
  weekdayShort, todayLabel, t, delay,
}: DayHorizonCardProps) {
  const { date, total, regPct, groupCounts, dominant, today } = stat
  const dominantColor = statusColors[dominant.group.representative].icon
  const fillPct = membersTotal > 0 ? Math.min(1, total / membersTotal) : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring.gentle, delay }}
      className="relative rounded-3xl flex flex-col p-4 gap-3 min-h-0 overflow-hidden"
      style={{
        background: today
          ? 'linear-gradient(180deg, color-mix(in oklab, var(--accent-color) 14%, transparent) 0%, color-mix(in oklab, var(--accent-color) 0%, transparent) 55%, rgba(255,255,255,0.012) 100%)'
          : 'linear-gradient(155deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.012) 100%)',
        border: today
          ? '1px solid color-mix(in oklab, var(--accent-color) 50%, transparent)'
          : '1px solid rgba(255,255,255,0.07)',
        boxShadow: today
          ? '0 0 48px -14px color-mix(in oklab, var(--accent-color) 70%, transparent), inset 0 1px 0 color-mix(in oklab, var(--accent-color) 30%, transparent)'
          : 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      {/* Top row — weekday + date number. PeakStar sitter helt til høyre,
          TODAY-chip absolutt-posisjonert over weekday slik at weekday alltid
          står på samme x-koordinat på tvers av kortene (ingen vekslende
          venstrekant når 1 av 5 har en chip). */}
      <div className="flex items-baseline justify-between relative">
        <span
          className="text-[12px] font-semibold uppercase tracking-[0.24em]"
          style={{
            color: today
              ? 'color-mix(in oklab, var(--accent-color) 60%, white)'
              : 'rgba(255,255,255,0.45)',
            fontFamily: 'var(--font-body)',
          }}
        >
          {weekdayShort}
        </span>
        <span
          className="tabular-nums text-[20px] font-semibold leading-none"
          style={{
            fontFamily: 'var(--font-fraunces)',
            color: today ? '#ffffff' : 'rgba(255,255,255,0.6)',
            paddingBottom: 2,
          }}
        >
          {date.getDate()}
        </span>
      </div>

      {today && (
        <span
          className="absolute top-3 left-1/2 -translate-x-1/2 text-[9px] font-semibold uppercase tracking-[0.22em] px-2 py-[2px] rounded-full"
          style={{
            background: 'color-mix(in oklab, var(--accent-color) 22%, transparent)',
            border: '1px solid color-mix(in oklab, var(--accent-color) 45%, transparent)',
            color: 'color-mix(in oklab, var(--accent-color) 60%, white)',
            fontFamily: 'var(--font-body)',
          }}
        >
          {todayLabel}
        </span>
      )}

      {isPeak && total > 0 && (
        <span
          aria-hidden
          className="absolute top-3 right-3 text-[10px] leading-none"
          style={{
            color: '#d4a017',
            filter: 'drop-shadow(0 0 6px rgba(212,160,23,0.7))',
          }}
        >
          ★
        </span>
      )}

      {/* Vertical stack-bar — Apple Weather kolonne. Høyden = registrert /
          totalt; segmenter inni = fordeling. Renderes med flex-col-reverse
          så stack-en bygger fra bunn (stable for både 1 og 4 segmenter). */}
      <div className="flex-1 flex items-end justify-center min-h-0 py-1">
        <div
          className="rounded-2xl overflow-hidden relative"
          style={{
            width: 56,
            height: '100%',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
          }}
        >
          {fillPct > 0 && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: `${fillPct * 100}%` }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: delay + 0.15 }}
              className="absolute inset-x-0 bottom-0 flex flex-col-reverse overflow-hidden"
            >
              {groupCounts.map(({ group, count }) =>
                count > 0 ? (
                  <div
                    key={group.key}
                    style={{
                      flex: count,
                      background: statusColors[group.representative].icon,
                      boxShadow: `inset 0 0 12px color-mix(in oklab, ${statusColors[group.representative].icon} 60%, transparent)`,
                    }}
                  />
                ) : null,
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* Big total — Fraunces large, lap-read fra resepsjonen. «av N · X%»
          sitter under, mut, så hierarki «13 → av 15» leser i ett øyekast. */}
      <div className="flex flex-col items-center gap-0.5">
        <span
          className="tabular-nums leading-none"
          style={{
            fontSize: 48,
            fontWeight: 300,
            fontFamily: 'var(--font-fraunces), "Iowan Old Style", Georgia, serif',
            fontVariationSettings: '"opsz" 96, "SOFT" 80',
            letterSpacing: '-0.035em',
            color: today ? '#ffffff' : 'rgba(255,255,255,0.92)',
            paddingBottom: 2,
            // Liten ekstra glød på dagens dato — gjør at øyet aldri lurer på
            // hva «her er vi nå» betyr.
            filter: today
              ? 'drop-shadow(0 0 16px color-mix(in oklab, var(--accent-color) 55%, transparent))'
              : 'none',
          }}
        >
          {total}
        </span>
        <span
          className="text-[11px]"
          style={{ color: 'rgba(255,255,255,0.42)', fontFamily: 'var(--font-body)' }}
        >
          {t.dashboard.month.dayOf
            .replace('{total}', String(membersTotal))
            .replace('{pct}', String(regPct))}
        </span>
      </div>

      {/* Dominant pattern — én linje som forteller dagens karakter. Stille
          dot + label, samme språk som «I sum» under. Skjules om dagen er
          tom (ingenting å være «mest av»). */}
      {total > 0 && (
        <div className="flex items-center justify-center gap-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full inline-block"
            style={{ background: dominantColor, boxShadow: `0 0 6px ${dominantColor}aa` }}
          />
          <span
            className="text-[11px]"
            style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-body)' }}
          >
            {dominantSubtitle(dominant.group.key, t)}
          </span>
        </div>
      )}
    </motion.div>
  )
}

function dominantSubtitle(key: GroupKey, t: Dictionary): string {
  switch (key) {
    case 'office':   return t.dashboard.month.dominantOffice
    case 'remote':   return t.dashboard.month.dominantRemote
    case 'customer': return t.dashboard.month.dominantCustomer
    case 'away':     return t.dashboard.month.dominantAway
  }
}

/* ───────────────────────────── Legend chip ──────────────────────────── */

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="w-1.5 h-1.5 rounded-full inline-block"
        style={{ background: color, boxShadow: `0 0 6px ${color}aa` }}
      />
      <span
        className="text-[11px] font-semibold uppercase tracking-[0.18em]"
        style={{ color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-body)' }}
      >
        {label}
      </span>
    </span>
  )
}

/* ───────────────────────────── PulseRow ─────────────────────────────── */

/**
 * Akkurat nå-style row used in «I sum denne uken». Mirrors TodayPulse's
 * PulseRow on Oversikt so navigating Oversikt → Dashboard reads as the same
 * surface, not two designs of the same thing.
 */
function PulseRow({
  status,
  label,
  count,
  pct,
  tone,
  labelColor,
  delay,
}: {
  status: EntryStatus
  label: string
  count: number
  pct: number
  tone: string
  labelColor: string
  delay: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...spring.gentle, delay }}
      className="relative rounded-xl overflow-hidden flex items-center gap-2.5 px-2.5 py-2"
      style={{
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: `inset 2px 0 0 ${tone}`,
      }}
    >
      <div
        className="flex items-center justify-center rounded-lg flex-shrink-0"
        style={{
          width: 24,
          height: 24,
          background: `color-mix(in oklab, ${tone} 18%, transparent)`,
          boxShadow: `0 0 0 1px color-mix(in oklab, ${tone} 32%, transparent)`,
        }}
      >
        <StatusIcon status={status} size={12} color={tone} />
      </div>

      <span
        className="text-[13px] font-medium flex-1 truncate"
        style={{ color: labelColor, fontFamily: 'var(--font-body)' }}
      >
        {label}
      </span>

      <div
        className="h-[5px] rounded-full overflow-hidden flex-shrink-0"
        style={{ width: 56, background: 'rgba(255,255,255,0.05)' }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: delay + 0.05 }}
          className="h-full rounded-full"
          style={{
            background: `linear-gradient(90deg, ${tone} 0%, color-mix(in oklab, ${tone} 70%, white) 100%)`,
            boxShadow: `0 0 10px ${tone}88`,
          }}
        />
      </div>

      <span
        className="tabular-nums text-[18px] font-semibold leading-none flex-shrink-0 text-right"
        style={{
          color: 'rgba(255,255,255,0.92)',
          fontFamily: 'var(--font-fraunces)',
          minWidth: 28,
          paddingBottom: 2,
        }}
      >
        {count}
      </span>
    </motion.div>
  )
}
