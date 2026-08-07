'use client'

import { memo, useMemo, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Building2, Globe2, Languages, MapPin, Star, Users } from 'lucide-react'
import { BreathingDot } from '@/components/breathing-dot'
import { AnimatedCount } from './animated-count'
import { useStatusColors } from '@/lib/status-colors/context'
import { spring } from '@/lib/motion'
import { getISOWeek } from '@/lib/dates'
import { useLocale, useT } from '@/lib/i18n/context'
import { LOCALE_META, type Dictionary } from '@/lib/i18n/types'
import {
  computeOrgFigures,
  countryName,
  flagEmoji,
  type CountryCount,
  type OrgFigures,
} from '@/lib/org-figures'
import type { Customer, Member, Office } from '@/lib/supabase/types'

interface FiguresViewProps {
  members: Member[]
  offices: Office[]
  customers: Customer[]
  orgName: string
  time: Date
}

/** How many country rows each breakdown card shows before folding the
 *  remainder into a single «+N andre»-row. Six keeps every bar readable
 *  from across a reception floor. */
const MAX_COUNTRY_ROWS = 6

/**
 * «Nøkkeltall» — the one slide that answers "how big are we, and where?"
 * without a single map or matrix. Everything here is derived in-memory
 * from the three registries the dashboard already holds (members,
 * offices, customers), so it costs no extra round-trip and re-derives
 * itself on every realtime update.
 *
 * Structure follows the Apple Weather rule the rest of the dashboard
 * uses: one hero number owns the top-left (the company's combined years
 * of service — the number no one has ever seen totalled up), a tight
 * stat grid carries the countable facts, and two ranked country
 * breakdowns own the right rail.
 */
function FiguresViewImpl({ members, offices, customers, orgName, time }: FiguresViewProps) {
  const t = useT()
  const locale = useLocale()
  const STATUS_COLORS = useStatusColors()
  const weekNum = getISOWeek(time)
  const f = t.dashboard.figures

  // `time` ticks once per second on the dashboard. Tenure only moves on a
  // scale of years, so we key the memo to the day — otherwise every
  // AnimatedCount on this slide would restart its count-up each second.
  const dayKey = time.toISOString().slice(0, 10)
  const figures: OrgFigures = useMemo(
    () => computeOrgFigures(members, offices, customers, time),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see dayKey note
    [members, offices, customers, dayKey],
  )

  const intlLocale = LOCALE_META[locale].intl
  const nameFor = (code: string) => countryName(code, intlLocale, f.unknownCountry)

  const customerColor = STATUS_COLORS.customer.icon
  const officeColor = STATUS_COLORS.office.icon

  return (
    <div className="relative h-full flex flex-col px-10 pt-20 pb-[50px] gap-5">
      {/* ── Header — org name and clock belong to the global top bar; this
          slide only owns its title and the week badge. */}
      <div className="flex-shrink-0">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.05 }}
        >
          <p
            className="text-[30px] font-semibold tracking-tight leading-none"
            style={{
              fontFamily: 'var(--font-fraunces)',
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.7) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {f.title}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-[0.16em] uppercase"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.14)',
                color: 'rgba(255,255,255,0.72)',
                fontFamily: 'var(--font-body)',
              }}
            >
              <BreathingDot color="var(--accent-color)" />
              {orgName ? `${orgName} · ` : ''}
              {t.matrix.weekLabel} {weekNum}
            </span>
          </div>
        </motion.div>
      </div>

      {/* ── Main — hero + stat grid on the left, country rails on the right.
          The right column reserves 64px at the bottom so the last bar never
          slides under the fixed Offiview signature. */}
      <div className="flex-1 grid grid-cols-[1.05fr_0.95fr] gap-5 min-h-0">
        <div className="flex flex-col gap-5 min-h-0">
          <TenureHero figures={figures} labels={f} />

          <div className="flex-1 grid grid-cols-3 grid-rows-2 gap-4 min-h-0">
            <StatCard
              delay={0.30}
              value={figures.customers.total}
              label={f.customersTotal}
              hint={f.customersHint
                .replace('{countries}', String(figures.customers.countries))}
              accent={customerColor}
              icon={<Globe2 className="w-3.5 h-3.5" strokeWidth={2} />}
            />
            {/* De to avdelingskortene deler porteføljen i to og summerer
                alltid til totalen: England-kortet er hele de britiske øyer
                (GB + IE — Skottland og Irland hører hjemme her), Nordic er
                komplementet. Nordic får ikke flagg fordi det spenner over
                flere land; England beholder 🇬🇧 som anker. */}
            <StatCard
              delay={0.35}
              value={figures.customers.nordic}
              label={f.customersNordic}
              hint={shareHint(figures.customers.nordic, figures.customers.total, f.ofPortfolio)}
              accent={customerColor}
              icon={<MapPin className="w-3.5 h-3.5" strokeWidth={2} />}
            />
            <StatCard
              delay={0.40}
              value={figures.customers.uk}
              label={f.customersUk}
              hint={shareHint(figures.customers.uk, figures.customers.total, f.ofPortfolio)}
              accent={customerColor}
              flag="GB"
            />
            <StatCard
              delay={0.45}
              value={figures.team.norway}
              label={f.teamNorway}
              hint={f.ofTeam.replace('{total}', String(figures.team.total))}
              accent={officeColor}
              flag="NO"
            />
            <StatCard
              delay={0.50}
              value={figures.team.nordic}
              label={f.teamNordic}
              hint={f.teamUkSplit.replace('{uk}', String(figures.team.uk))}
              accent={officeColor}
              icon={<Users className="w-3.5 h-3.5" strokeWidth={2} />}
            />
            <StatCard
              delay={0.55}
              value={figures.countryFootprint}
              label={f.countries}
              hint={f.countriesHint
                .replace('{offices}', String(figures.offices.total))
                .replace('{timezones}', String(figures.offices.timezones))}
              accent="var(--accent-color)"
              icon={<Building2 className="w-3.5 h-3.5" strokeWidth={2} />}
            />
          </div>
        </div>

        <div className="flex flex-col gap-5 min-h-0 pb-[64px]">
          <CountryBreakdown
            title={f.customerBase}
            rows={figures.customers.byCountry}
            total={figures.customers.total}
            color={customerColor}
            delay={0.34}
            nameFor={nameFor}
            othersLabel={f.otherCountries}
          />
          <CountryBreakdown
            title={f.teamByCountry}
            rows={figures.team.byCountry}
            total={figures.team.total}
            color={officeColor}
            delay={0.44}
            nameFor={nameFor}
            othersLabel={f.otherCountries}
            footer={
              figures.team.languages > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <Languages className="w-3 h-3" strokeWidth={2} />
                  {f.languages.replace('{n}', String(figures.team.languages))}
                </span>
              ) : null
            }
          />
        </div>
      </div>
    </div>
  )
}

/** «12 av 48 (25 %)»-style caption. Empty string when there is no base. */
function shareHint(value: number, total: number, template: string): string {
  if (total <= 0) return ''
  return template.replace('{pct}', String(Math.round((value / total) * 100)))
}

/**
 * The slide's hero: every year of service in the company, added together.
 * A single Fraunces number set at display scale — same treatment as the
 * «Akkurat nå»-hero — with average tenure and the longest-serving
 * colleague demoted to context beside it.
 */
function TenureHero({
  figures,
  labels,
}: {
  figures: OrgFigures
  labels: Dictionary['dashboard']['figures']
}) {
  const { tenure, team } = figures
  const years = Math.round(tenure.totalYears)

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring.gentle, delay: 0.15 }}
      className="flex items-end gap-6 flex-shrink-0 px-2"
      aria-label={labels.tenureTotal}
    >
      <AnimatedCount
        value={years}
        delay={0.25}
        duration={1.2}
        className="tabular-nums leading-none"
        style={{
          fontSize: 'clamp(88px, 10vw, 148px)',
          fontWeight: 300,
          fontFamily: 'var(--font-fraunces), "Iowan Old Style", Georgia, serif',
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

      <div className="flex flex-col gap-2 pb-3 min-w-0">
        <span
          className="text-[13px] font-semibold tracking-[0.28em] uppercase"
          style={{ color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-body)' }}
        >
          {labels.tenureTotal}
        </span>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          {tenure.counted > 0 && (
            <span
              className="text-[14px]"
              style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-body)' }}
            >
              <span
                className="tabular-nums font-semibold"
                style={{ fontFamily: 'var(--font-fraunces)', color: 'rgba(255,255,255,0.92)' }}
              >
                {tenure.avgYears.toFixed(1)}
              </span>{' '}
              {labels.tenureAverage}
            </span>
          )}
          <span
            className="text-[14px]"
            style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-body)' }}
          >
            <span
              className="tabular-nums font-semibold"
              style={{ fontFamily: 'var(--font-fraunces)', color: 'rgba(255,255,255,0.92)' }}
            >
              {team.total}
            </span>{' '}
            {labels.tenureHeadcount}
          </span>
        </div>

        {tenure.longest && (
          <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...spring.gentle, delay: 0.55 }}
            className="inline-flex items-baseline gap-1.5 text-[13px]"
            style={{ color: 'rgba(255,255,255,0.78)', fontFamily: 'var(--font-body)' }}
          >
            <Star
              className="w-3 h-3 self-center shrink-0"
              strokeWidth={2}
              fill="currentColor"
              style={{ color: '#d4a017', filter: 'drop-shadow(0 0 6px rgba(212,160,23,0.55))' }}
            />
            <span style={{ color: 'rgba(255,255,255,0.55)' }}>
              {labels.tenureLongest
                .replace('{name}', tenure.longest.name)
                .replace('{years}', String(Math.floor(tenure.longest.years)))}
            </span>
          </motion.div>
        )}
      </div>
    </motion.section>
  )
}

/**
 * One countable fact. Glass card with an ambient accent bloom in the
 * corner — the same surface vocabulary as the customer portfolio card, so
 * the six of them read as a set rather than six separate widgets.
 */
function StatCard({
  value,
  label,
  hint,
  accent,
  delay,
  icon,
  flag,
}: {
  value: number
  label: string
  hint?: string
  accent: string
  delay: number
  icon?: ReactNode
  /** ISO alpha-2 rendered as a flag in the corner, instead of `icon`. */
  flag?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring.gentle, delay }}
      className="rounded-2xl px-5 py-4 flex flex-col justify-between relative overflow-hidden min-h-0"
      style={{
        background:
          'linear-gradient(155deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 100%)',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.08), 0 20px 40px -20px rgba(0,0,0,0.5)',
      }}
    >
      <div
        aria-hidden
        className="absolute -top-14 -right-14 w-36 h-36 rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${accent}3d 0%, transparent 70%)`,
          filter: 'blur(18px)',
        }}
      />

      <div className="flex items-start justify-between relative gap-2">
        <span
          className="text-[10.5px] font-semibold uppercase tracking-[0.2em] leading-tight"
          style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-body)' }}
        >
          {label}
        </span>
        <span
          className="flex-shrink-0 leading-none"
          style={{ color: accent, opacity: flag ? 1 : 0.7, fontSize: flag ? 15 : undefined }}
        >
          {flag ? flagEmoji(flag) : icon}
        </span>
      </div>

      <div className="relative flex items-baseline gap-2 mt-2">
        <AnimatedCount
          value={value}
          delay={delay + 0.1}
          duration={1.0}
          className="tabular-nums leading-none"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontSize: 'clamp(38px, 3.6vw, 56px)',
            fontWeight: 700,
            letterSpacing: '-0.04em',
            background: `linear-gradient(180deg, #ffffff 0%, ${accent} 145%)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        />
      </div>

      {hint && (
        <span
          className="relative text-[11px] mt-1 truncate"
          style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body)' }}
        >
          {hint}
        </span>
      )}
    </motion.div>
  )
}

/**
 * Ranked country list with proportional bars. Bars are scaled against the
 * biggest row rather than the total, so a portfolio dominated by one
 * country still shows readable movement in the tail.
 */
function CountryBreakdown({
  title,
  rows,
  total,
  color,
  delay,
  nameFor,
  othersLabel,
  footer,
}: {
  title: string
  rows: CountryCount[]
  total: number
  color: string
  delay: number
  nameFor: (code: string) => string
  othersLabel: string
  footer?: ReactNode
}) {
  const head = rows.slice(0, MAX_COUNTRY_ROWS)
  const tail = rows.slice(MAX_COUNTRY_ROWS)
  const tailCount = tail.reduce((sum, r) => sum + r.count, 0)
  const max = rows[0]?.count ?? 1

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...spring.gentle, delay }}
      className="flex-1 rounded-2xl p-5 flex flex-col gap-3 relative overflow-hidden min-h-0"
      style={{
        background:
          'linear-gradient(155deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 100%)',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.08), 0 20px 40px -20px rgba(0,0,0,0.5)',
      }}
    >
      <div
        aria-hidden
        className="absolute -top-16 -right-16 w-40 h-40 rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${color}44 0%, transparent 70%)`,
          filter: 'blur(18px)',
        }}
      />

      <div className="flex items-baseline justify-between relative">
        <h3
          className="text-[11px] font-semibold uppercase tracking-[0.22em]"
          style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-body)' }}
        >
          {title}
        </h3>
        <span
          className="tabular-nums text-[13px] font-semibold"
          style={{ color: 'rgba(255,255,255,0.75)', fontFamily: 'var(--font-fraunces)' }}
        >
          {total}
        </span>
      </div>

      <div className="relative flex-1 flex flex-col justify-center gap-2.5 min-h-0">
        {head.map((row, i) => (
          <CountryRow
            key={row.code}
            label={nameFor(row.code)}
            flag={flagEmoji(row.code)}
            count={row.count}
            fraction={max > 0 ? row.count / max : 0}
            color={color}
            delay={delay + 0.12 + i * 0.05}
          />
        ))}
        {tail.length > 0 && (
          <CountryRow
            label={othersLabel.replace('{n}', String(tail.length))}
            flag={null}
            count={tailCount}
            fraction={max > 0 ? tailCount / max : 0}
            color={color}
            delay={delay + 0.12 + head.length * 0.05}
            muted
          />
        )}
      </div>

      {footer && (
        <div
          className="relative text-[11px] pt-1"
          style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body)' }}
        >
          {footer}
        </div>
      )}
    </motion.div>
  )
}

function CountryRow({
  label,
  flag,
  count,
  fraction,
  color,
  delay,
  muted = false,
}: {
  label: string
  flag: string | null
  count: number
  fraction: number
  color: string
  delay: number
  muted?: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="w-5 flex-shrink-0 text-center leading-none"
        style={{ fontSize: 14, opacity: flag ? 1 : 0.35 }}
        aria-hidden
      >
        {flag ?? '·'}
      </span>
      <span
        className="w-[112px] flex-shrink-0 truncate text-[13px]"
        style={{
          color: muted ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.88)',
          fontFamily: 'var(--font-body)',
          fontWeight: muted ? 500 : 600,
        }}
      >
        {label}
      </span>
      <div
        className="flex-1 h-[7px] rounded-full overflow-hidden min-w-0"
        style={{ background: 'rgba(255,255,255,0.07)' }}
      >
        <motion.div
          className="h-full rounded-full"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: Math.max(fraction, 0.02) }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay }}
          style={{
            transformOrigin: 'left center',
            background: muted
              ? 'rgba(255,255,255,0.25)'
              : `linear-gradient(90deg, color-mix(in oklab, ${color} 55%, white) 0%, ${color} 100%)`,
            boxShadow: muted ? undefined : `0 0 10px ${color}55`,
          }}
        />
      </div>
      <span
        className="w-8 flex-shrink-0 text-right tabular-nums text-[13px] font-semibold"
        style={{
          color: muted ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.92)',
          fontFamily: 'var(--font-fraunces)',
        }}
      >
        {count}
      </span>
    </div>
  )
}

/**
 * Same memo contract as the other rotating views: the dashboard's clock
 * ticks every second, but this slide only changes when the registries
 * change or the calendar day rolls over.
 */
function figuresPropsEqual(prev: FiguresViewProps, next: FiguresViewProps): boolean {
  return (
    prev.members === next.members &&
    prev.offices === next.offices &&
    prev.customers === next.customers &&
    prev.orgName === next.orgName &&
    prev.time.toDateString() === next.time.toDateString()
  )
}

export const FiguresView = memo(FiguresViewImpl, figuresPropsEqual)
