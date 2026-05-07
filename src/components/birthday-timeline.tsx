'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTeamMembers, type DerivedBirthday } from '@/hooks/use-team-members'
import { useT } from '@/lib/i18n/context'
import { formatDateT } from './year-wheel-shared'
import { createClient } from '@/lib/supabase/client'
import type { Dictionary } from '@/lib/i18n/types'
import type { WorkspaceSummary } from '@/lib/supabase/types'
import { WorkspaceBadge } from '@/components/workspace-switcher'

// Brand pair drives the timeline. Both stops + the avatar ring read from
// CSS tokens, so per-org `(brand_primary, brand_accent)` overrides flow
// through automatically. CalWin defaults: Light Blue → Blue Violet.
const BRAND_BAR_GRADIENT = 'linear-gradient(90deg, var(--ember) 0%, var(--ink) 100%)'
const BRAND_RING = 'var(--ink)'
const BRAND_HERO_ACCENT = 'var(--accent-color)'

// Brand pair drives the timeline. Both stops + the avatar ring read from
// CSS tokens, so per-org `(brand_primary, brand_accent)` overrides flow
// through automatically. CalWin defaults: Light Blue → Blue Violet.
const BRAND_BAR_GRADIENT = 'linear-gradient(90deg, var(--ember) 0%, var(--ink) 100%)'
const BRAND_RING = 'var(--ink)'
const BRAND_HERO_ACCENT = 'var(--accent-color)'

const NAME_COL = 240
const ROW_H = 76

type Ranked = DerivedBirthday & {
  birthDate: Date
  currentAge: number
  exactAge: number
}

export function BirthdayTimeline({
  orgId,
  orgIds,
  workspaces,
  combinedView,
}: {
  orgId: string
  orgIds?: string[]
  workspaces?: WorkspaceSummary[]
  combinedView?: boolean
}) {
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

  const effectiveOrgIds = orgIds ?? [orgId]
  const { birthdays, loading } = useTeamMembers(effectiveOrgIds)

  // Workspace lookup keyed by org_id — used for the badge rendered after
  // each member's name in combined view (mirrors team-grid behaviour).
  const workspaceByOrgId = useMemo(() => {
    const map = new Map<string, WorkspaceSummary>()
    workspaces?.forEach((w) => map.set(w.org_id, w))
    return map
  }, [workspaces])

  const showBadges = !!combinedView && (workspaces?.length ?? 0) > 1

  const ranked: Ranked[] = useMemo(() => {
    const out: Ranked[] = []
    for (const b of birthdays) {
      const ymd = b.member.birth_date
      if (!ymd) continue
      const birthDate = parseYmd(ymd)
      if (!birthDate) continue
      const exactAge = monthsSince(birthDate, today) / 12
      const currentAge = Math.floor(exactAge)
      out.push({ ...b, birthDate, currentAge, exactAge })
    }
    out.sort((a, b) =>
      b.exactAge - a.exactAge ||
      a.member.display_name.localeCompare(b.member.display_name)
    )
    return out
  }, [birthdays, today])

  const stats = useMemo(() => {
    if (ranked.length === 0) {
      return { max: 1, oldest: null as Ranked | null, youngestAge: 0, avgAge: 0, ticks: [] as number[] }
    }
    let exactMax = 1
    let totalAge = 0
    let minAge = Number.POSITIVE_INFINITY
    for (const r of ranked) {
      totalAge += r.exactAge
      if (r.exactAge > exactMax) exactMax = r.exactAge
      if (r.exactAge < minAge) minAge = r.exactAge
    }
    const max = niceCeilAge(exactMax)
    return {
      max,
      oldest: ranked[0],
      youngestAge: Math.floor(minAge),
      avgAge: totalAge / ranked.length,
      ticks: niceTicksAge(max),
    }
  }, [ranked])

  if (loading) return null

  if (ranked.length === 0) {
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
          {t.wheel.birthdays.emptyTimeline}
        </p>
      </div>
    )
  }

  const heroAccent = BRAND_HERO_ACCENT

  return (
    <div className="relative w-full max-w-[1180px] mx-auto">
      <Aurora accent={heroAccent} />

      <Hero
        oldest={stats.oldest!}
        youngestAge={stats.youngestAge}
        avgAge={stats.avgAge}
        memberCount={ranked.length}
        orgName={orgName}
        accent={heroAccent}
        t={t}
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
          {ranked.map((entry, idx) => (
            <AgeRow
              key={entry.member.id}
              entry={entry}
              idx={idx}
              max={stats.max}
              ticks={stats.ticks}
              t={t}
              reduce={!!reduce}
              workspace={showBadges ? workspaceByOrgId.get(entry.member.org_id) ?? null : null}
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
          background: 'radial-gradient(60% 60% at 50% 50%, color-mix(in oklab, var(--ink) 16%, transparent), transparent 70%)',
          filter: 'blur(70px)',
        }}
      />
    </div>
  )
}

// ─── Hero ─────────────────────────────────────────────────────────

function Hero({
  oldest, youngestAge, avgAge, memberCount, orgName, accent, t,
}: {
  oldest: Ranked
  youngestAge: number
  avgAge: number
  memberCount: number
  orgName: string
  accent: string
  t: Dictionary
}) {
  const initials = oldest.member.initials ?? oldest.member.display_name.slice(0, 2).toUpperCase()
  const yearWord = stripYearWord(t.wheel.anniversaries.yearsLabel)
  const oldestLabel = orgName
    ? t.wheel.birthdays.oldestAt.replace('{org}', orgName)
    : t.wheel.birthdays.oldestLabel

  return (
    <header className="relative px-2 pt-2 pb-2 grid grid-cols-1 lg:grid-cols-[1fr,auto] gap-y-6 gap-x-10 items-end">
      <div className="flex flex-col">
        <span
          className="text-[11px] font-semibold uppercase mb-3"
          style={{ fontFamily: 'var(--font-body)', color: 'var(--text-tertiary)', letterSpacing: '0.32em' }}
        >
          {t.wheel.birthdays.ageHeader}
        </span>

        <div className="flex items-end gap-5 sm:gap-6 flex-wrap">
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 0.9, 0.33, 1] }}
            className="leading-none"
            style={{
              fontFamily: 'var(--font-fraunces), Georgia, serif',
              fontStyle: 'italic',
              fontVariationSettings: '"opsz" 96, "SOFT" 80',
              fontSize: 'clamp(72px, 12vw, 132px)',
              fontWeight: 350,
              letterSpacing: '-0.045em',
              backgroundImage: `linear-gradient(135deg, var(--text-primary) 0%, ${accent} 100%)`,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              color: 'transparent',
            }}
          >
            {oldest.currentAge}
          </motion.span>

          <div className="flex flex-col gap-2 pb-3 min-w-0">
            <span
              className="text-[10.5px] font-semibold uppercase"
              style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)', letterSpacing: '0.22em' }}
            >
              {oldestLabel}
            </span>
            <div className="flex items-center gap-2.5 min-w-0">
              {oldest.member.avatar_url ? (
                <img
                  src={oldest.member.avatar_url}
                  alt=""
                  className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                  style={{ boxShadow: `0 0 0 2px ${accent}, 0 4px 12px rgba(0,0,0,0.10)` }}
                />
              ) : (
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-semibold flex-shrink-0"
                  style={{
                    background: 'var(--bg-subtle)',
                    color: 'var(--text-primary)',
                    boxShadow: `0 0 0 2px ${accent}, 0 4px 12px rgba(0,0,0,0.10)`,
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  {initials.slice(0, 2)}
                </div>
              )}
              <span
                className="text-[18px] truncate"
                style={{
                  fontFamily: 'var(--font-fraunces), Georgia, serif',
                  fontStyle: 'italic',
                  fontVariationSettings: '"opsz" 24, "SOFT" 60',
                  fontWeight: 450,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.01em',
                }}
              >
                {oldest.member.full_name ?? oldest.member.display_name}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-end gap-6 sm:gap-9 lg:pb-3 flex-wrap justify-start lg:justify-end">
        <Stat label={t.wheel.anniversaries.peopleLabel} value={String(memberCount)} />
        <Stat label={t.wheel.birthdays.youngestLabel} value={String(youngestAge)} suffix={yearWord} />
        <Stat label={t.wheel.anniversaries.averageLabel} value={formatDecimal(avgAge, 1)} suffix={yearWord} />
      </div>
    </header>
  )
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="flex flex-col items-start gap-1.5">
      <span
        className="text-[10px] font-semibold uppercase"
        style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)', letterSpacing: '0.24em' }}
      >
        {label}
      </span>
      <span
        className="leading-none flex items-baseline gap-1.5"
        style={{
          fontFamily: 'var(--font-fraunces), Georgia, serif',
          fontStyle: 'italic',
          fontVariationSettings: '"opsz" 48, "SOFT" 60',
          fontSize: 38,
          fontWeight: 400,
          color: 'var(--text-primary)',
          letterSpacing: '-0.025em',
        }}
      >
        <span className="tabular-nums">{value}</span>
        {suffix && (
          <span
            className="text-[14px]"
            style={{
              color: 'var(--text-tertiary)',
              fontStyle: 'italic',
              fontWeight: 400,
              letterSpacing: '0',
            }}
          >
            {suffix}
          </span>
        )}
      </span>
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

function AgeRow({
  entry, idx, max, ticks, t, reduce, workspace,
}: {
  entry: Ranked
  idx: number
  max: number
  ticks: number[]
  t: Dictionary
  reduce: boolean
  workspace: WorkspaceSummary | null
}) {
  const widthPct = Math.min(100, Math.max(2.5, (entry.exactAge / max) * 100))
  const initials = entry.member.initials ?? entry.member.display_name.slice(0, 2).toUpperCase()
  const isUpcoming = entry.daysUntil <= 30
  const isToday = entry.daysUntil === 0

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
              style={{ boxShadow: `0 0 0 2px ${BRAND_RING}, 0 4px 12px rgba(0,0,0,0.08)` }}
            />
          ) : (
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-[13px] font-semibold"
              style={{
                background: 'var(--bg-subtle)',
                color: 'var(--text-primary)',
                boxShadow: `0 0 0 2px ${BRAND_RING}, 0 4px 12px rgba(0,0,0,0.08)`,
                fontFamily: 'var(--font-body)',
              }}
            >
              {initials.slice(0, 2)}
            </div>
          )}
          {isToday && (
            <span
              className="absolute -top-1 -right-1 w-[18px] h-[18px] rounded-full flex items-center justify-center text-[11px] leading-none"
              style={{
                background: 'linear-gradient(135deg, #FFD56B, #B98700)',
                boxShadow: '0 0 0 2px var(--bg-elevated), 0 0 12px rgba(245,200,97,0.6)',
              }}
              aria-label={t.wheel.birthdays.daysUntil.zero}
            >
              🎂
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 flex flex-col">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="text-[14.5px] font-medium truncate leading-tight"
              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
            >
              {entry.member.full_name ?? entry.member.display_name}
            </span>
            {workspace && (
              <span className="flex-shrink-0">
                <WorkspaceBadge workspace={workspace} size="sm" />
              </span>
            )}
          </div>
          <span
            className="text-[10.5px] font-medium mt-0.5"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)', letterSpacing: '0.02em' }}
          >
            {t.wheel.birthdays.bornOn.replace('{date}', formatDateT(entry.birthDate, t))}
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
            background: BRAND_BAR_GRADIENT,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.28), 0 6px 20px -6px color-mix(in oklab, var(--ink) 40%, transparent)',
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
            {t.wheel.anniversaries.yearsLabel.replace('{years}', String(entry.currentAge))}
          </span>
        </motion.div>

        {isUpcoming && !isToday && (
          <motion.span
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              delay: idx * 0.045 + 1.05,
              type: 'spring',
              stiffness: 240,
              damping: 16,
            }}
            className="absolute top-1/2 text-[11px] leading-none pointer-events-none select-none whitespace-nowrap font-semibold"
            style={{
              left: `min(calc(${widthPct}% + 10px), calc(100% - 60px))`,
              transform: 'translateY(-50%)',
              color: 'var(--ink)',
              fontFamily: 'var(--font-body)',
              letterSpacing: '0.04em',
            }}
            aria-hidden
          >
            {formatRelative(entry.daysUntil, t)}
          </motion.span>
        )}
      </div>
    </motion.li>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────

function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.slice(0, 10))
  if (!m) return null
  const y = Number(m[1]); const mo = Number(m[2]) - 1; const d = Number(m[3])
  return new Date(y, mo, d, 12, 0, 0)
}

function monthsSince(from: Date, to: Date): number {
  const yd = to.getFullYear() - from.getFullYear()
  const md = to.getMonth() - from.getMonth()
  const dd = to.getDate() - from.getDate()
  return yd * 12 + md + (dd < 0 ? -1 : 0)
}

function niceCeilAge(v: number): number {
  if (v <= 10) return 10
  if (v <= 20) return 20
  if (v <= 30) return 30
  if (v <= 40) return 40
  if (v <= 50) return 50
  if (v <= 60) return 60
  if (v <= 70) return 70
  if (v <= 80) return 80
  if (v <= 90) return 90
  return Math.ceil(v / 10) * 10
}

function niceTicksAge(max: number): number[] {
  const ticks: number[] = [0]
  const step = max <= 30 ? 5 : 10
  for (let i = step; i <= max; i += step) ticks.push(i)
  return ticks
}

function stripYearWord(template: string): string {
  return template.replace('{years}', '').trim()
}

function formatDecimal(n: number, digits: number): string {
  return n.toFixed(digits).replace('.', ',')
}

function formatRelative(days: number, t: Dictionary): string {
  if (days === 0) return t.wheel.birthdays.daysUntil.zero
  if (days === 1) return t.wheel.birthdays.daysUntil.one
  return t.wheel.birthdays.daysUntil.other.replace('{n}', String(days))
}
