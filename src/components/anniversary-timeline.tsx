'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTeamMembers, type DerivedAnniversary } from '@/hooks/use-team-members'
import { useT } from '@/lib/i18n/context'
import { formatDateT } from './year-wheel-shared'
import { MONTH_HSL } from '@/lib/wheel-geometry'
import { createClient } from '@/lib/supabase/client'
import type { Dictionary } from '@/lib/i18n/types'

const NAME_COL = 240
const ROW_H = 76

export function AnniversaryTimeline({ orgId }: { orgId: string }) {
  const t = useT()
  const reduce = useReducedMotion()

  const [today, setToday] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setToday(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const [orgName, setOrgName] = useState<string>('')
  useEffect(() => {
    const supabase = createClient()
    supabase.from('organizations').select('name').eq('id', orgId).maybeSingle()
      .then(({ data }) => setOrgName(data?.name ?? ''))
  }, [orgId])

  const { tenureRanked, loading } = useTeamMembers(orgId)

  const stats = useMemo(() => {
    if (tenureRanked.length === 0) {
      return { max: 1, longest: null, totalMonths: 0, avgYears: 0, ticks: [] as number[] }
    }
    let exactMax = 1
    let totalMonths = 0
    for (const r of tenureRanked) {
      const m = monthsSince(r.startDate, today)
      totalMonths += m
      const exact = m / 12
      if (exact > exactMax) exactMax = exact
    }
    const max = niceCeil(exactMax)
    return {
      max,
      longest: tenureRanked[0],
      totalMonths,
      avgYears: (totalMonths / 12) / tenureRanked.length,
      ticks: niceTicks(max),
    }
  }, [tenureRanked, today])

  if (loading) return null

  if (tenureRanked.length === 0) {
    return (
      <div className="w-full max-w-[1180px] mx-auto py-20 text-center">
        <p
          className="text-[24px] italic"
          style={{
            fontFamily: 'var(--font-fraunces), Georgia, serif',
            fontVariationSettings: '"opsz" 36, "SOFT" 80',
            color: 'var(--text-secondary)',
          }}
        >
          {t.wheel.anniversaries.emptyTimeline}
        </p>
      </div>
    )
  }

  const longestHueIdx = stats.longest!.startDate.getMonth()
  const heroAccent = MONTH_HSL[longestHueIdx][1]

  return (
    <div className="relative w-full max-w-[1180px] mx-auto">
      <Aurora accent={heroAccent} />

      <Hero
        longest={stats.longest!}
        totalMonths={stats.totalMonths}
        avgYears={stats.avgYears}
        memberCount={tenureRanked.length}
        orgName={orgName}
        accent={heroAccent}
        t={t}
        today={today}
      />

      <div
        className="relative rounded-[28px] px-3 sm:px-6 pt-3 pb-4 mt-6"
        style={{
          background: 'color-mix(in oklab, var(--bg-elevated) 64%, transparent)',
          backdropFilter: 'blur(18px) saturate(180%)',
          WebkitBackdropFilter: 'blur(18px) saturate(180%)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-md, 0 14px 40px -12px rgba(0,0,0,0.18))',
        }}
      >
        <YearAxis ticks={stats.ticks} max={stats.max} t={t} />

        <ul className="flex flex-col">
          {tenureRanked.map((entry, idx) => (
            <TenureRow
              key={entry.member.id}
              entry={entry}
              idx={idx}
              max={stats.max}
              ticks={stats.ticks}
              today={today}
              t={t}
              reduce={!!reduce}
            />
          ))}
        </ul>
      </div>
    </div>
  )
}

// ─── Aurora ───────────────────────────────────────────────────────

function Aurora({ accent }: { accent: string }) {
  return (
    <div className="absolute inset-0 -z-10 pointer-events-none overflow-hidden rounded-[40px]" aria-hidden>
      <div
        className="absolute"
        style={{
          left: '-12%', top: '-30%', width: '60%', height: '120%',
          background: `radial-gradient(60% 60% at 50% 50%, color-mix(in oklab, ${accent} 28%, transparent), transparent 70%)`,
          filter: 'blur(70px)',
        }}
      />
      <div
        className="absolute"
        style={{
          right: '-15%', top: '-10%', width: '55%', height: '110%',
          background: 'radial-gradient(60% 60% at 50% 50%, hsla(220, 80%, 60%, 0.14), transparent 70%)',
          filter: 'blur(70px)',
        }}
      />
    </div>
  )
}

// ─── Hero ─────────────────────────────────────────────────────────

function Hero({
  longest, totalMonths, avgYears, memberCount, orgName, accent, t, today,
}: {
  longest: DerivedAnniversary
  totalMonths: number
  avgYears: number
  memberCount: number
  orgName: string
  accent: string
  t: Dictionary
  today: Date
}) {
  const initials = longest.member.initials ?? longest.member.display_name.slice(0, 2).toUpperCase()
  const longestYears = longest.completedYears
  const yearWord = stripYearWord(t.wheel.anniversaries.yearsLabel)
  const monthWord = t.wheel.anniversaries.monthsAbbr
  const totalYearsInt = Math.floor(totalMonths / 12)
  const totalMonthsRem = Math.round(totalMonths % 12)
  const combinedLabel = orgName
    ? t.wheel.anniversaries.combinedAt.replace('{org}', orgName)
    : t.wheel.anniversaries.combinedLabel
  const subhead = t.wheel.anniversaries.combinedSubhead
    .replace('{count}', String(memberCount))
    .replace('{avg}', formatDecimal(avgYears, 1))
  const _ = today // silence unused; reserved for future live updates

  return (
    <header className="relative px-2 pt-2 pb-2">
      <span
        className="block text-[11px] font-semibold uppercase mb-4"
        style={{ fontFamily: 'var(--font-body)', color: 'var(--text-tertiary)', letterSpacing: '0.32em' }}
      >
        {t.wheel.anniversaries.tenureHeader}
      </span>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-8 gap-x-10 items-end">
        <HeroNumber
          eyebrow={combinedLabel}
          value={totalYearsInt}
          suffix={yearWord}
          extra={totalMonthsRem > 0 ? { value: totalMonthsRem, suffix: monthWord } : undefined}
          accent={accent}
          delay={0}
        >
          <span
            className="text-[13px]"
            style={{
              fontFamily: 'var(--font-fraunces), Georgia, serif',
              fontStyle: 'italic',
              fontVariationSettings: '"opsz" 18, "SOFT" 60',
              fontWeight: 450,
              color: 'var(--text-secondary)',
              letterSpacing: '-0.005em',
            }}
          >
            {subhead}
          </span>
        </HeroNumber>

        <HeroNumber
          eyebrow={t.wheel.anniversaries.longestLabel}
          value={longestYears}
          suffix={yearWord}
          accent={accent}
          delay={0.08}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {longest.member.avatar_url ? (
              <img
                src={longest.member.avatar_url}
                alt=""
                className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                style={{ boxShadow: `0 0 0 2px ${accent}, 0 3px 10px rgba(0,0,0,0.10)` }}
              />
            ) : (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
                style={{
                  background: 'var(--bg-subtle)',
                  color: 'var(--text-primary)',
                  boxShadow: `0 0 0 2px ${accent}, 0 3px 10px rgba(0,0,0,0.10)`,
                  fontFamily: 'var(--font-body)',
                }}
              >
                {initials.slice(0, 2)}
              </div>
            )}
            <span
              className="text-[15px] truncate"
              style={{
                fontFamily: 'var(--font-fraunces), Georgia, serif',
                fontStyle: 'italic',
                fontVariationSettings: '"opsz" 20, "SOFT" 60',
                fontWeight: 450,
                color: 'var(--text-primary)',
                letterSpacing: '-0.01em',
              }}
            >
              {longest.member.full_name ?? longest.member.display_name}
            </span>
          </div>
        </HeroNumber>
      </div>
    </header>
  )
}

function HeroNumber({
  eyebrow, value, suffix, extra, accent, delay, children,
}: {
  eyebrow: string
  value: number
  suffix: string
  extra?: { value: number; suffix: string }
  accent: string
  delay: number
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <span
        className="text-[10.5px] font-semibold uppercase"
        style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)', letterSpacing: '0.24em' }}
      >
        {eyebrow}
      </span>
      <motion.span
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay, ease: [0.22, 0.9, 0.33, 1] }}
        className="leading-none flex items-baseline gap-2 flex-wrap"
        style={{
          fontFamily: 'var(--font-fraunces), Georgia, serif',
          fontStyle: 'italic',
          fontVariationSettings: '"opsz" 96, "SOFT" 80',
          fontSize: 'clamp(64px, 10.5vw, 116px)',
          fontWeight: 350,
          letterSpacing: '-0.045em',
        }}
      >
        <span
          className="tabular-nums"
          style={{
            backgroundImage: `linear-gradient(135deg, var(--text-primary) 0%, ${accent} 100%)`,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
          }}
        >
          {value}
        </span>
        <span
          style={{
            fontSize: 'clamp(20px, 2.6vw, 30px)',
            color: 'var(--text-tertiary)',
            fontWeight: 400,
            letterSpacing: '-0.01em',
          }}
        >
          {suffix}
        </span>
        {extra && (
          <>
            <span
              aria-hidden
              style={{
                fontSize: 'clamp(18px, 2.2vw, 26px)',
                color: 'var(--text-tertiary)',
                fontWeight: 400,
                opacity: 0.6,
                margin: '0 0.05em',
              }}
            >
              ·
            </span>
            <span
              className="tabular-nums"
              style={{
                fontSize: 'clamp(28px, 4vw, 44px)',
                color: 'var(--text-secondary)',
                fontWeight: 400,
                letterSpacing: '-0.02em',
              }}
            >
              {extra.value}
            </span>
            <span
              style={{
                fontSize: 'clamp(16px, 2vw, 22px)',
                color: 'var(--text-tertiary)',
                fontWeight: 400,
                letterSpacing: '-0.01em',
              }}
            >
              {extra.suffix}
            </span>
          </>
        )}
      </motion.span>
      <div className="mt-1">{children}</div>
    </div>
  )
}

// ─── Year axis ────────────────────────────────────────────────────

function YearAxis({ ticks, max, t }: { ticks: number[]; max: number; t: Dictionary }) {
  return (
    <div
      className="flex items-end gap-3 sm:gap-5 pb-3 mb-1 border-b"
      style={{ minHeight: 32, borderColor: 'var(--border-subtle)' }}
    >
      <div style={{ width: NAME_COL, flexShrink: 0 }} />
      <div className="flex-1 min-w-0 relative h-7">
        {ticks.map((v) => {
          const pct = (v / max) * 100
          const atEdge = pct < 2 || pct > 98
          return (
            <div
              key={v}
              className="absolute bottom-0 flex flex-col items-center"
              style={{ left: `${pct}%`, transform: atEdge && pct < 2 ? 'translateX(0%)' : 'translateX(-50%)' }}
            >
              <span
                className="text-[10px] tabular-nums mb-1"
                style={{
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-body)',
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                }}
              >
                {v}
              </span>
              <div className="w-px h-1.5" style={{ background: 'var(--border-subtle)' }} />
            </div>
          )
        })}
        <div
          className="absolute bottom-0 flex flex-col items-end"
          style={{ right: 0 }}
        >
          <span
            className="text-[10px] uppercase font-semibold"
            style={{
              color: 'var(--ember, #B45309)',
              fontFamily: 'var(--font-body)',
              letterSpacing: '0.22em',
            }}
          >
            {t.wheel.anniversaries.sections.today}
          </span>
          <div className="w-px h-1.5" style={{ background: 'var(--ember, #B45309)' }} />
        </div>
      </div>
    </div>
  )
}

// ─── Row ──────────────────────────────────────────────────────────

function TenureRow({
  entry, idx, max, ticks, today, t, reduce,
}: {
  entry: DerivedAnniversary
  idx: number
  max: number
  ticks: number[]
  today: Date
  t: Dictionary
  reduce: boolean
}) {
  const monthIdx = entry.startDate.getMonth()
  const [colorLight, colorDark] = MONTH_HSL[monthIdx]
  const exact = entry.completedYears + monthsSince(entry.startDate, today) / 12
  const widthPct = Math.min(100, Math.max(2.5, (exact / max) * 100))
  const initials = entry.member.initials ?? entry.member.display_name.slice(0, 2).toUpperCase()

  return (
    <motion.li
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: idx * 0.04, ease: 'easeOut' }}
      className="group flex items-center gap-3 sm:gap-5 py-2 border-b last:border-b-0"
      style={{ minHeight: ROW_H, borderColor: 'var(--border-subtle)' }}
    >
      <div className="flex items-center gap-3 flex-shrink-0" style={{ width: NAME_COL }}>
        <div className="flex-shrink-0 relative">
          {entry.member.avatar_url ? (
            <img
              src={entry.member.avatar_url}
              alt=""
              className="w-11 h-11 rounded-full object-cover"
              style={{ boxShadow: `0 0 0 2px ${colorDark}, 0 4px 12px rgba(0,0,0,0.08)` }}
            />
          ) : (
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-[13px] font-semibold"
              style={{
                background: 'var(--bg-subtle)',
                color: 'var(--text-primary)',
                boxShadow: `0 0 0 2px ${colorDark}, 0 4px 12px rgba(0,0,0,0.08)`,
                fontFamily: 'var(--font-body)',
              }}
            >
              {initials.slice(0, 2)}
            </div>
          )}
          {entry.isMilestone && (
            <span
              className="absolute -top-1 -right-1 w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] leading-none"
              style={{
                background: 'linear-gradient(135deg, #FFD56B, #B98700)',
                color: 'white',
                boxShadow: '0 0 0 2px var(--bg-elevated), 0 0 12px rgba(245,200,97,0.6)',
              }}
              aria-label={t.wheel.anniversaries.milestone}
            >
              ★
            </span>
          )}
        </div>
        <div className="min-w-0 flex flex-col">
          <span
            className="text-[14.5px] font-medium truncate leading-tight"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
          >
            {entry.member.full_name ?? entry.member.display_name}
          </span>
          <span
            className="text-[10.5px] font-medium mt-0.5"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)', letterSpacing: '0.02em' }}
          >
            {t.wheel.anniversaries.startedOn.replace('{date}', formatDateT(entry.startDate, t))}
          </span>
        </div>
      </div>

      <div className="flex-1 min-w-0 relative h-11">
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          {ticks.filter(v => v > 0 && v < max).map((v) => {
            const pct = (v / max) * 100
            return (
              <div
                key={v}
                className="absolute top-1.5 bottom-1.5 w-px"
                style={{
                  left: `${pct}%`,
                  background: 'color-mix(in oklab, var(--border-subtle) 60%, transparent)',
                }}
              />
            )
          })}
        </div>

        <div
          className="absolute inset-y-1.5 left-0 right-0 rounded-2xl"
          style={{ background: 'color-mix(in oklab, var(--bg-subtle) 50%, transparent)' }}
        />

        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${widthPct}%` }}
          transition={{ duration: 1.0, delay: idx * 0.045 + 0.15, ease: [0.22, 0.9, 0.33, 1] }}
          className="absolute inset-y-1.5 left-0 rounded-2xl flex items-center justify-end pr-3 overflow-hidden"
          style={{
            background: `linear-gradient(90deg, ${colorLight} 0%, ${colorDark} 100%)`,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.28), 0 6px 20px -6px ${colorDark}66`,
          }}
        >
          {!reduce && (
            <motion.div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.32) 50%, transparent 70%)',
              }}
              animate={{ x: ['-50%', '180%'] }}
              transition={{
                duration: 2.6,
                delay: 1.2 + idx * 0.05,
                ease: 'easeInOut',
                repeat: Infinity,
                repeatDelay: 9,
              }}
            />
          )}

          <span
            className="relative text-[13px] tabular-nums whitespace-nowrap"
            style={{
              color: 'white',
              fontFamily: 'var(--font-fraunces), Georgia, serif',
              fontStyle: 'italic',
              fontVariationSettings: '"opsz" 24, "SOFT" 60',
              fontWeight: 500,
              letterSpacing: '-0.01em',
              textShadow: '0 1px 3px rgba(0,0,0,0.4)',
            }}
          >
            {entry.completedYears > 0
              ? t.wheel.anniversaries.yearsLabel.replace('{years}', String(entry.completedYears))
              : t.wheel.anniversaries.lessThanOneYear}
          </span>
        </motion.div>

        {entry.isMilestone && (
          <motion.span
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              delay: idx * 0.045 + 1.05,
              type: 'spring',
              stiffness: 240,
              damping: 16,
            }}
            className="absolute top-1/2 text-[16px] leading-none pointer-events-none select-none"
            style={{
              left: `min(calc(${widthPct}% + 8px), calc(100% - 14px))`,
              transform: 'translateY(-50%)',
              color: '#F5C861',
              filter: 'drop-shadow(0 0 8px rgba(245,200,97,0.75))',
            }}
            aria-hidden
          >
            ★
          </motion.span>
        )}
      </div>
    </motion.li>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────

function monthsSince(from: Date, to: Date): number {
  const yd = to.getFullYear() - from.getFullYear()
  const md = to.getMonth() - from.getMonth()
  const dd = to.getDate() - from.getDate()
  return yd * 12 + md + (dd < 0 ? -1 : 0)
}

function niceCeil(v: number): number {
  if (v <= 1) return 1
  if (v <= 2) return 2
  if (v <= 5) return 5
  if (v <= 10) return 10
  if (v <= 15) return 15
  if (v <= 20) return 20
  if (v <= 25) return 25
  if (v <= 30) return 30
  return Math.ceil(v / 5) * 5
}

function niceTicks(max: number): number[] {
  if (max <= 2) return [0, 1, 2]
  if (max <= 5) return [0, 1, 2, 3, 5]
  if (max <= 10) return [0, 2, 5, 10]
  if (max <= 15) return [0, 5, 10, 15]
  if (max <= 20) return [0, 5, 10, 15, 20]
  if (max <= 25) return [0, 5, 10, 15, 20, 25]
  if (max <= 30) return [0, 5, 10, 15, 20, 25, 30]
  const ticks: number[] = []
  for (let i = 0; i <= max; i += 5) ticks.push(i)
  return ticks
}

// "{years} år" → "år"; "{years} years" → "years"; "{years} m." → "m."
function stripYearWord(template: string): string {
  return template.replace('{years}', '').trim()
}

function formatDecimal(n: number, digits: number): string {
  return n.toFixed(digits).replace('.', ',')
}
