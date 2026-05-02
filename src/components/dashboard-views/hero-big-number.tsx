'use client'

import { motion } from 'framer-motion'
import { Star } from 'lucide-react'
import { useStatusColors } from '@/lib/status-colors/context'
import type { Entry, Member, Office } from '@/lib/supabase/types'
import { spring } from '@/lib/motion'
import { useT } from '@/lib/i18n/context'
import { AnimatedCount } from './animated-count'

interface HeroBigNumberProps {
  members: Member[]
  todayEntries: Entry[] // deduped: one entry per member
  offices?: Office[]
}

/**
 * The «Akkurat nå»-view's hero. One Fraunces-set number, lap-read large,
 * with everything else demoted to context. The Apple Weather rule:
 * the most important number gets the room.
 *
 * Hero = how many people are physically in the office today. The other
 * groups (home, customer, away) become small chips underneath, and the
 * registered % sits as a quiet ring in the corner.
 */
export function HeroBigNumber({ members, todayEntries, offices }: HeroBigNumberProps) {
  const t = useT()
  const STATUS_COLORS = useStatusColors()

  const office = todayEntries.filter(e => e.status === 'office').length
  const remote = todayEntries.filter(e => e.status === 'remote').length
  const customer = todayEntries.filter(e =>
    ['customer', 'event', 'travel'].includes(e.status)
  ).length
  const away = todayEntries.filter(e =>
    ['vacation', 'sick', 'off'].includes(e.status)
  ).length

  const total = members.length
  const registered = todayEntries.length
  const pct = total > 0 ? Math.round((registered / total) * 100) : 0

  // HQ-counter: hvor mange av "på kontoret"-folka er på selve hovedkontoret.
  // Antagelse: status='office' + member.home_office_id=hq.id ⇒ på HQ. Det
  // dekker det vanlige tilfellet uten at vi trenger eksplisitt office_id på
  // entries. Hvis ingen org har markert HQ er hq null og linja skjules.
  const hq = offices?.find(o => o.is_hq) ?? null
  const memberById = new Map(members.map(m => [m.id, m]))
  const atHq = hq
    ? todayEntries.filter(
        e => e.status === 'office' && memberById.get(e.member_id)?.home_office_id === hq.id,
      ).length
    : 0
  const hqMembersTotal = hq
    ? members.filter(m => m.home_office_id === hq.id).length
    : 0

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring.gentle, delay: 0.15 }}
      className="relative flex items-end justify-between gap-8 px-2 py-3 flex-shrink-0"
      aria-label={t.pulse.title}
    >
      {/* Left — the hero pair: number + label/breakdown column */}
      <div className="flex items-baseline gap-6 min-w-0">
        <AnimatedCount
          value={office}
          delay={0.25}
          duration={1.1}
          className="tabular-nums leading-none"
          style={{
            fontSize: 'clamp(132px, 17vw, 224px)',
            fontWeight: 300,
            fontFamily:
              'var(--font-fraunces), "Iowan Old Style", Georgia, serif',
            fontVariationSettings: '"opsz" 144, "SOFT" 80',
            letterSpacing: '-0.045em',
            background:
              'linear-gradient(180deg, #ffffff 0%, rgba(245,239,228,0.78) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            filter: 'drop-shadow(0 4px 28px rgba(245,239,228,0.10))',
          }}
        />

        <div className="flex flex-col gap-2.5 pb-4 min-w-0">
          <span
            className="text-[13px] font-semibold tracking-[0.28em] uppercase"
            style={{
              color: 'rgba(255,255,255,0.55)',
              fontFamily: 'var(--font-body)',
            }}
          >
            {t.pulse.atOffice}
          </span>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {remote > 0 && (
              <BreakdownChip
                label={t.pulse.atHomeShort}
                count={remote}
                color={STATUS_COLORS.remote.icon}
              />
            )}
            {customer > 0 && (
              <BreakdownChip
                label={t.pulse.atCustomer}
                count={customer}
                color={STATUS_COLORS.customer.icon}
              />
            )}
            {away > 0 && (
              <BreakdownChip
                label={t.pulse.away}
                count={away}
                color={STATUS_COLORS.vacation.icon}
              />
            )}
            {remote === 0 && customer === 0 && away === 0 && (
              <span
                className="text-[13px]"
                style={{
                  color: 'rgba(255,255,255,0.4)',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {t.pulse.noRegistrationsBoard}
              </span>
            )}
          </div>

          {/* HQ-line — viser hvor mange av "på kontoret"-folka som er på
              hovedkontoret. Stille gull-pil, samme rad som breakdown men
              egen linje så den ikke konkurrerer med hjemme/kunde/borte
              (som er alternativer, ikke subset). Vises så lenge et
              kontor er flagget som HQ — selv om 0 medlemmer er knyttet
              til det enda (resepsjonisten skal se HQ-status på TV-en
              uansett om home_office_id er satt for alle ennå). */}
          {hq && (
            <motion.div
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...spring.gentle, delay: 0.55 }}
              className="inline-flex items-baseline gap-1.5 text-[13px]"
              style={{
                color: 'rgba(255,255,255,0.78)',
                fontFamily: 'var(--font-body)',
              }}
            >
              <Star
                className="w-3 h-3 self-center shrink-0"
                strokeWidth={2}
                fill="currentColor"
                style={{
                  color: '#d4a017',
                  filter: 'drop-shadow(0 0 6px rgba(212,160,23,0.55))',
                }}
              />
              <span
                className="tabular-nums font-semibold"
                style={{
                  fontFamily: 'var(--font-fraunces)',
                  color: 'rgba(255,255,255,0.92)',
                }}
              >
                {atHq}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.55)' }}>
                {hqMembersTotal > 0
                  ? t.pulse.atHqOf
                      .replace('{total}', String(hqMembersTotal))
                      .replace('{office}', hq.name)
                  : `på ${hq.name}`}
              </span>
            </motion.div>
          )}
        </div>
      </div>

      {/* Right — secondary stat. Registered % gets a tiny activity ring so
          there's still one piece of geometry on this surface, but it's
          quiet and sits in the corner like a status light. */}
      {total > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.45 }}
          className="flex items-center gap-3 flex-shrink-0 pb-4"
        >
          <RegisteredRing pct={pct} />
          <div className="flex flex-col">
            <span
              className="tabular-nums text-[15px] font-semibold leading-none"
              style={{
                color: 'rgba(255,255,255,0.85)',
                fontFamily: 'var(--font-fraunces)',
              }}
            >
              {registered}
              <span
                style={{
                  color: 'rgba(255,255,255,0.4)',
                  fontWeight: 500,
                }}
              >
                {' / '}
                {total}
              </span>
            </span>
            <span
              className="text-[10px] font-semibold tracking-[0.22em] uppercase mt-1"
              style={{
                color: 'rgba(255,255,255,0.4)',
                fontFamily: 'var(--font-body)',
              }}
            >
              {t.pulse.registered}
            </span>
          </div>
        </motion.div>
      )}
    </motion.section>
  )
}

function BreakdownChip({
  label,
  count,
  color,
}: {
  label: string
  count: number
  color: string
}) {
  return (
    <span
      className="inline-flex items-baseline gap-1.5 text-[14px]"
      style={{
        color: 'rgba(255,255,255,0.78)',
        fontFamily: 'var(--font-body)',
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full inline-block self-center"
        style={{ background: color, boxShadow: `0 0 6px ${color}aa` }}
      />
      <span
        className="tabular-nums font-semibold"
        style={{
          fontFamily: 'var(--font-fraunces)',
          color: 'rgba(255,255,255,0.92)',
        }}
      >
        {count}
      </span>
      <span style={{ color: 'rgba(255,255,255,0.55)' }}>
        {label.toLowerCase()}
      </span>
    </span>
  )
}

function RegisteredRing({ pct }: { pct: number }) {
  const r = 22
  const c = 2 * Math.PI * r
  return (
    <div className="relative" style={{ width: 56, height: 56 }}>
      <svg
        width={56}
        height={56}
        viewBox="-28 -28 56 56"
        className="absolute inset-0"
      >
        <circle
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={4}
        />
        <motion.circle
          r={r}
          fill="none"
          stroke="url(#heroBigRingGradient)"
          strokeWidth={4}
          strokeLinecap="round"
          initial={{ strokeDasharray: `0 ${c}` }}
          animate={{ strokeDasharray: `${c * (pct / 100)} ${c}` }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
          transform="rotate(-90)"
          style={{
            filter:
              'drop-shadow(0 0 8px color-mix(in oklab, var(--accent-color) 55%, transparent))',
          }}
        />
        <defs>
          <linearGradient
            id="heroBigRingGradient"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop
              offset="0%"
              stopColor="color-mix(in oklab, var(--accent-color) 50%, white)"
            />
            <stop offset="100%" stopColor="var(--accent-color)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="tabular-nums leading-none"
          style={{
            fontSize: 14,
            fontWeight: 600,
            fontFamily: 'var(--font-fraunces)',
            color: 'rgba(255,255,255,0.85)',
            letterSpacing: '-0.02em',
          }}
        >
          {pct}
          <span style={{ fontSize: 9, opacity: 0.55, marginLeft: 1 }}>%</span>
        </span>
      </div>
    </div>
  )
}
