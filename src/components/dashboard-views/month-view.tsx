'use client'

import { useMemo, useId } from 'react'
import { motion } from 'framer-motion'
import { StatusIcon } from '@/components/icons/status-icons'
import { useStatusColors } from '@/lib/status-colors/context'
import { MemberAvatar } from '@/components/member-avatar'
import type { Member, Entry, EntryStatus } from '@/lib/supabase/types'
import { getDayLabel, getISOWeek, isToday } from '@/lib/dates'
import { spring } from '@/lib/motion'
import { useT } from '@/lib/i18n/context'
import { dedupeEntriesByMemberDate } from '@/lib/entries/dedupe'

interface MonthViewProps {
  members: Member[]
  weekDays: Date[]
  /** Current week's entries — real rows merged with presence-assumed
   *  syntheses (one row per member × weekday). Same merged shape som
   *  Oversikt-matrisa, slik at donut, «Fordeling denne uken», dagstrip og
   *  «Borte denne uken» rapporterer eksakt det matrisa viser. */
  entries: Entry[]
  orgName: string
  time: Date
}

function pad(n: number) { return String(n).padStart(2, '0') }

const STATUS_ORDER: EntryStatus[] = ['office', 'remote', 'customer', 'event', 'travel', 'vacation', 'sick', 'off']

// Same grouping as Oversikt's «Akkurat nå»-strip and TodayView's week-strip,
// so the four colored segments on the bottom day-cells read identically to
// what the team sees on the matrix.
const DAY_STATUS_GROUPS: Array<{ key: string; statuses: EntryStatus[]; representative: EntryStatus }> = [
  { key: 'office',   statuses: ['office'],                          representative: 'office'   },
  { key: 'remote',   statuses: ['remote'],                          representative: 'remote'   },
  { key: 'customer', statuses: ['customer', 'event', 'travel'],     representative: 'customer' },
  { key: 'away',     statuses: ['vacation', 'sick', 'off'],         representative: 'vacation' },
]

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
    sick: t.status.sick,
    off: t.status.off,
  }
  const weekNum = getISOWeek(time)
  const year    = time.getFullYear()

  // Stable id for SVG <defs> so the gradient never collides if the view ever
  // mounts twice (carousel preload, brand-transition, …). useId() avoids the
  // hydration-mismatch trap that hard-coded ids would have.
  const gradientId = useId().replace(/:/g, '_') + '_week_hero'

  // Dedup: one Entry per (member_id, date) — keeps tallies aligned with
  // TodayView's HeroBigNumber so «Fordeling denne uken» summerer 100% og
  // donut-arcer leser eksakt det resepsjonen ser på «Akkurat nå».
  const weekDeduped = useMemo(
    () => dedupeEntriesByMemberDate(entries, members),
    [entries, members],
  )

  const entryMap = useMemo(() => {
    const m = new Map<string, Entry>()
    weekDeduped.forEach(e => m.set(`${e.member_id}_${e.date}`, e))
    return m
  }, [weekDeduped])

  // Members away at any point this week
  const onVacation = members.filter(m =>
    weekDays.some(d => {
      const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      const entry = entryMap.get(`${m.id}_${dateStr}`)
      return entry && (entry.status === 'vacation' || entry.status === 'off' || entry.status === 'sick')
    })
  )

  // Tallies for full week — bygd på deduped entries så én ekstra rad
  // per medlem-dag ikke inflaterer donut/Fordeling.
  const weekTotals = STATUS_ORDER.map(s => ({
    status: s,
    count: weekDeduped.filter(e => e.status === s).length,
  }))
  const weekTotal = weekDeduped.length
  const topStatuses = weekTotals.filter(w => w.count > 0).sort((a, b) => b.count - a.count)

  // Donut arithmetic. The week-number is rendered as SVG <text> inside the
  // same canvas so it can never be clipped by CSS line-box quirks (the old
  // background-clip:text trick lopped the bottom of 8/3/9 even with
  // lineHeight bumps). dominantBaseline='central' centers around y=0.
  const DONUT_R = 200
  const STROKE_W = 30
  const CIRC = 2 * Math.PI * DONUT_R
  let runningPct = 0

  return (
    <div className="relative h-full flex flex-col px-10 pt-20 pb-6 gap-6">
      {/* ── Header — eyebrow + Fraunces title. Org-navn og klokke eies av
            global topp-bar. */}
      <div className="flex-shrink-0">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.05 }}
          className="flex flex-col gap-1.5"
        >
          <span
            className="text-[11px] font-semibold tracking-[0.28em] uppercase"
            style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body)' }}
          >
            Uke {weekNum} · {year}
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
        </motion.div>
      </div>

      {/* ── Hero row: donut (left) + status breakdown (right) ───────── */}
      <div className="flex-1 grid grid-cols-12 gap-8 min-h-0">
        {/* Donut card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.18 }}
          className="col-span-7 relative rounded-3xl flex items-center justify-center"
          style={{
            background:
              'linear-gradient(155deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.012) 100%)',
            border: '1px solid rgba(255,255,255,0.07)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
          }}
        >
          {/* Single quiet halo behind the donut — replaces the four orbital
              rings that were competing with the hero. */}
          <div
            aria-hidden
            className="absolute rounded-full pointer-events-none"
            style={{
              width: 560,
              height: 560,
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background:
                'radial-gradient(circle, rgba(0,217,245,0.08) 0%, rgba(0,245,160,0.04) 35%, transparent 70%)',
              filter: 'blur(20px)',
            }}
          />

          {/* Donut SVG. Both the rings and the hero text live inside the same
              viewBox so a) no z-index gymnastics, b) the text is glyph-perfect
              centered, c) nothing can clip the digits. */}
          <svg
            width={560}
            height={560}
            viewBox="-280 -280 560 560"
            className="relative"
            aria-label={`Uke ${weekNum} ${year}`}
          >
            <defs>
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%"  stopColor="#00F5A0" />
                <stop offset="55%" stopColor="#00D9F5" />
                <stop offset="100%" stopColor="#7C3AED" />
              </linearGradient>
            </defs>

            {/* Base track */}
            <circle
              r={DONUT_R}
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth={STROKE_W}
            />

            {/* Stacked status arcs */}
            {weekTotal > 0 && weekTotals.map(({ status, count }) => {
              if (count === 0) return null
              const pct = count / weekTotal
              const dash = CIRC * pct
              const gap = CIRC - dash
              const offset = -runningPct * CIRC
              runningPct += pct
              return (
                <motion.circle
                  key={status}
                  r={DONUT_R}
                  fill="none"
                  stroke={STATUS_COLORS[status].icon}
                  strokeWidth={STROKE_W}
                  strokeLinecap="butt"
                  strokeDasharray={`${dash} ${gap}`}
                  initial={{ strokeDashoffset: 0, opacity: 0 }}
                  animate={{ strokeDashoffset: offset, opacity: 1 }}
                  transition={{
                    strokeDashoffset: { duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.4 },
                    opacity: { duration: 0.6, delay: 0.4 },
                  }}
                  transform="rotate(-90)"
                  style={{
                    filter: `drop-shadow(0 0 14px ${STATUS_COLORS[status].icon}55)`,
                  }}
                />
              )
            })}

            {/* «Uke»-eyebrow */}
            <text
              x={0}
              y={-78}
              textAnchor="middle"
              fill="rgba(255,255,255,0.4)"
              fontFamily="var(--font-body)"
              fontWeight={600}
              fontSize={14}
              letterSpacing={3}
              style={{ textTransform: 'uppercase' }}
            >
              UKE
            </text>

            {/* Hero week number — Fraunces, Nordlys gradient. Inside SVG so
                no CSS line-box can clip 8/3/9 descenders ever again. */}
            <motion.text
              x={0}
              y={0}
              textAnchor="middle"
              dominantBaseline="central"
              fill={`url(#${gradientId})`}
              fontFamily='var(--font-fraunces), "Iowan Old Style", Georgia, serif'
              fontWeight={300}
              fontSize={216}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...spring.gentle, delay: 0.5 }}
              style={{
                fontVariationSettings: '"opsz" 144, "SOFT" 80',
                letterSpacing: '-0.045em',
                filter: 'drop-shadow(0 0 28px rgba(0,245,160,0.22))',
              }}
            >
              {weekNum}
            </motion.text>

            {/* Year */}
            <text
              x={0}
              y={94}
              textAnchor="middle"
              fill="rgba(255,255,255,0.45)"
              fontFamily="var(--font-body)"
              fontWeight={500}
              fontSize={22}
            >
              {year}
            </text>
          </svg>
        </motion.div>

        {/* Right column — Akkurat nå-style status breakdown, mirrors how the
            distribution reads on Oversikt's TodayPulse. Below: «Borte denne
            uken» avatar chips. */}
        <div className="col-span-5 flex flex-col gap-5 min-h-0">
          {/* Fordeling card */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...spring.gentle, delay: 0.25 }}
            className="rounded-2xl p-5 flex flex-col gap-3"
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
                Fordeling denne uken
              </h3>
              {weekTotal > 0 && (
                <span
                  className="tabular-nums text-[11px] font-semibold"
                  style={{ color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-fraunces)' }}
                >
                  {weekTotal} reg.
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
              <div className="flex flex-col gap-1.5">
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
                      delay={0.35 + i * 0.06}
                    />
                  )
                })}
              </div>
            )}
          </motion.div>

          {/* Borte denne uken */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...spring.gentle, delay: 0.32 }}
            className="flex-1 rounded-2xl p-5 flex flex-col gap-3 min-h-0 overflow-hidden"
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
                Borte denne uken
              </h3>
              {onVacation.length > 0 && (
                <span
                  className="tabular-nums text-[11px] font-semibold"
                  style={{ color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-fraunces)' }}
                >
                  {onVacation.length}
                </span>
              )}
            </div>
            {onVacation.length === 0 ? (
              <p
                className="text-[14px]"
                style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-body)' }}
              >
                Alle er på jobb.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 content-start">
                {onVacation.map((m, i) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...spring.gentle, delay: 0.45 + i * 0.03 }}
                    className="flex items-center gap-1.5 pl-0.5 pr-2.5 py-0.5 rounded-full"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <MemberAvatar
                      name={m.full_name || m.display_name}
                      initials={m.initials}
                      avatarUrl={m.avatar_url}
                      size="sm"
                    />
                    <span
                      className="text-[12px] font-medium truncate"
                      style={{
                        color: 'rgba(255,255,255,0.78)',
                        fontFamily: 'var(--font-body)',
                        maxWidth: 160,
                      }}
                    >
                      {m.full_name || m.display_name}
                    </span>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* ── Bottom 7-day strip ─ daily distribution. Same visual language as
            TodayView's week strip so navigating Nå → Uken stays coherent. */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring.gentle, delay: 0.5 }}
        className="relative rounded-2xl px-5 py-3 flex gap-3 flex-shrink-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        {weekDays.map((date, di) => {
          const { weekday, day } = getDayLabel(date)
          const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
          const dayEntries = weekDeduped.filter(e => e.date === dateStr)
          const today = isToday(date)

          const counts = DAY_STATUS_GROUPS.map(g => ({
            group: g,
            count: dayEntries.filter(e => g.statuses.includes(e.status)).length,
          }))
          const registered = dayEntries.length
          const regPct = members.length > 0 ? Math.round((registered / members.length) * 100) : 0

          return (
            <motion.div
              key={date.toISOString()}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring.gentle, delay: 0.6 + di * 0.04 }}
              className="relative flex-1 flex flex-col items-center gap-1 rounded-xl py-2 px-2"
              style={{
                background: today
                  ? 'linear-gradient(180deg, color-mix(in oklab, var(--accent-color) 20%, transparent) 0%, color-mix(in oklab, var(--accent-color) 0%, transparent) 100%)'
                  : 'transparent',
                border: today
                  ? '1px solid color-mix(in oklab, var(--accent-color) 50%, transparent)'
                  : '1px solid transparent',
                boxShadow: today
                  ? '0 0 32px -8px color-mix(in oklab, var(--accent-color) 65%, transparent), inset 0 1px 0 color-mix(in oklab, var(--accent-color) 30%, transparent)'
                  : 'none',
              }}
            >
              <span
                className="text-[11px] font-semibold uppercase tracking-[0.18em]"
                style={{
                  color: today ? 'color-mix(in oklab, var(--accent-color) 60%, white)' : 'rgba(255,255,255,0.35)',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {weekday}
              </span>
              <span
                className="tabular-nums text-[20px] font-semibold leading-none"
                style={{
                  fontFamily: 'var(--font-fraunces)',
                  color: today ? '#ffffff' : 'rgba(255,255,255,0.55)',
                  // Padding-bottom på Fraunces-glyfen sikrer at descenderne på
                  // 8/3/9 aldri klippes av line-box-en — en bug som tidligere
                  // beit på den store week-hero, og som vi her forebygger
                  // proaktivt på alle dag-tallene også.
                  paddingBottom: 2,
                }}
              >
                {day}
              </span>

              <div
                className="flex w-full h-[6px] rounded-full overflow-hidden mt-0.5"
                style={{ background: 'rgba(255,255,255,0.05)' }}
              >
                {counts.map(({ group, count }) =>
                  count > 0 ? (
                    <div
                      key={group.key}
                      style={{
                        flex: count,
                        background: STATUS_COLORS[group.representative].icon,
                        boxShadow: `0 0 8px ${STATUS_COLORS[group.representative].icon}55`,
                      }}
                    />
                  ) : null
                )}
              </div>

              <div className="flex items-baseline gap-1">
                <span
                  className="tabular-nums text-[13px] font-semibold"
                  style={{
                    color: today ? '#ffffff' : 'rgba(255,255,255,0.6)',
                    fontFamily: 'var(--font-fraunces)',
                  }}
                >
                  {registered}
                </span>
                <span
                  className="text-[10px]"
                  style={{
                    color: today ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.28)',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  / {members.length} · {regPct}%
                </span>
              </div>
            </motion.div>
          )
        })}
      </motion.div>
    </div>
  )
}

/**
 * Akkurat nå-style row used in «Fordeling denne uken». Mirrors TodayPulse's
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
      className="relative rounded-xl overflow-hidden flex items-center gap-3 px-3 py-2.5"
      style={{
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: `inset 2px 0 0 ${tone}`,
      }}
    >
      {/* Icon pill — same affordance as TodayPulse */}
      <div
        className="flex items-center justify-center rounded-lg flex-shrink-0"
        style={{
          width: 28,
          height: 28,
          background: `color-mix(in oklab, ${tone} 18%, transparent)`,
          boxShadow: `0 0 0 1px color-mix(in oklab, ${tone} 32%, transparent)`,
        }}
      >
        <StatusIcon status={status} size={14} color={tone} />
      </div>

      {/* Label */}
      <span
        className="text-[14px] font-medium flex-1 truncate"
        style={{ color: labelColor, fontFamily: 'var(--font-body)' }}
      >
        {label}
      </span>

      {/* Mini pct bar — sits between label and count, fills to share */}
      <div
        className="h-[5px] rounded-full overflow-hidden flex-shrink-0"
        style={{ width: 84, background: 'rgba(255,255,255,0.05)' }}
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

      {/* Count — Fraunces, generous min-width so 100+ never reflows */}
      <span
        className="tabular-nums text-[20px] font-semibold leading-none flex-shrink-0 text-right"
        style={{
          color: 'rgba(255,255,255,0.92)',
          fontFamily: 'var(--font-fraunces)',
          // Generøs min-width sikrer at trekksifrede tall (100+) ikke
          // skubber bar-bredden — og bevisst paddingBottom på 2px så
          // descender-glyfer (8/3/9) aldri klippes av line-box-en.
          minWidth: 36,
          paddingBottom: 2,
        }}
      >
        {count}
      </span>
    </motion.div>
  )
}
