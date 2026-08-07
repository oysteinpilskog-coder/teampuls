'use client'

import { memo, useMemo, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Building2, Cake, Globe2, Languages, MapPin, Star, Users } from 'lucide-react'
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
  /** Org-wide kill switch for birthdays. False hides the «neste bursdag»-
   *  line entirely, regardless of individual opt-ins. */
  birthdaysEnabled?: boolean
}

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
function FiguresViewImpl({
  members,
  offices,
  customers,
  orgName,
  time,
  birthdaysEnabled = true,
}: FiguresViewProps) {
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
    () => computeOrgFigures(members, offices, customers, time, { birthdaysEnabled }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see dayKey note
    [members, offices, customers, dayKey, birthdaysEnabled],
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
          <TenureHero figures={figures} labels={f} locale={intlLocale} />

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
            {/* Teamet deles på nøyaktig samme UK/Nordic-akse som kundene,
                så de fire kortene over hverandre leses som to par. */}
            <StatCard
              delay={0.45}
              value={figures.team.uk}
              label={f.teamUk}
              hint={f.ofTeam.replace('{total}', String(figures.team.total))}
              accent={officeColor}
              flag="GB"
            />
            <StatCard
              delay={0.50}
              value={figures.team.nordic}
              label={f.teamNordic}
              hint={f.ofTeam.replace('{total}', String(figures.team.total))}
              accent={officeColor}
              icon={<Users className="w-3.5 h-3.5" strokeWidth={2} />}
            />
            {/* «Land: 8» sa ingenting om HVILKE åtte. Flaggraden under
                tallet svarer på det direkte; kontorer/tidssoner er flyttet
                ned i footeren på «Teamet per land». */}
            <StatCard
              delay={0.55}
              value={figures.countryFootprint.length}
              label={f.countries}
              accent="var(--accent-color)"
              icon={<Building2 className="w-3.5 h-3.5" strokeWidth={2} />}
              footer={<FlagRow codes={figures.countryFootprint} />}
            />
          </div>
        </div>

        {/* Begge listene viser HVERT land — ingen «+N andre»-samlepost.
            De to kortene deler høyden proporsjonalt med antall rader, så
            en portefølje over åtte land ikke klemmer teamlista (fire land)
            like hardt som seg selv. */}
        <div className="flex flex-col gap-5 min-h-0 pb-[64px]">
          <CountryBreakdown
            title={f.customerBase}
            rows={figures.customers.byCountry}
            total={figures.customers.total}
            color={customerColor}
            delay={0.34}
            nameFor={nameFor}
          />
          <CountryBreakdown
            title={f.teamByCountry}
            rows={figures.team.byCountry}
            total={figures.team.total}
            color={officeColor}
            delay={0.44}
            nameFor={nameFor}
            footer={
              <span className="inline-flex items-center gap-1.5">
                <Languages className="w-3 h-3" strokeWidth={2} />
                {f.countriesHint
                  .replace('{offices}', String(figures.offices.total))
                  .replace('{timezones}', String(figures.offices.timezones))}
                {figures.team.languages > 0 &&
                  ` · ${f.languages.replace('{n}', String(figures.team.languages))}`}
              </span>
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
 * «Akkurat nå»-hero — with average tenure, the longest-serving colleague
 * and the next birthday demoted to context beside it.
 */
function TenureHero({
  figures,
  labels,
  locale,
}: {
  figures: OrgFigures
  labels: Dictionary['dashboard']['figures']
  /** BCP-47 tag for formatting the birthday date (e.g. "nb-NO"). */
  locale: string
}) {
  const { tenure, team, nextBirthday } = figures
  const years = Math.round(tenure.totalYears)

  // Today / tomorrow read faster than a date on a screen glanced at from
  // across a room; anything further out gets an actual day + month.
  const whenLabel = (() => {
    if (!nextBirthday) return ''
    if (nextBirthday.daysUntil === 0) return labels.birthdayToday
    if (nextBirthday.daysUntil === 1) return labels.birthdayTomorrow
    // Year is irrelevant here — and deliberately not the birth year. We
    // borrow an arbitrary leap year so 29 February always formats.
    const d = new Date(2024, nextBirthday.month - 1, nextBirthday.day)
    try {
      return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(d)
    } catch {
      return `${nextBirthday.day}.${nextBirthday.month}`
    }
  })()

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

        {/* Neste bursdag — den andre feiringen som hører hjemme ved siden
            av ansienniteten. «I dag» og «I morgen» leses raskere enn en
            dato, så de to nærmeste dagene får ord i stedet for tall. */}
        {nextBirthday && (
          <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...spring.gentle, delay: 0.62 }}
            className="inline-flex items-baseline gap-1.5 text-[13px]"
            style={{ color: 'rgba(255,255,255,0.78)', fontFamily: 'var(--font-body)' }}
          >
            <Cake
              className="w-3 h-3 self-center shrink-0"
              strokeWidth={2}
              style={{ color: '#E8A0C0', filter: 'drop-shadow(0 0 6px rgba(232,160,192,0.5))' }}
            />
            <span style={{ color: 'rgba(255,255,255,0.55)' }}>
              {labels.nextBirthday
                .replace('{name}', nextBirthday.name)
                .replace('{when}', whenLabel)}
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
  footer,
}: {
  value: number
  label: string
  hint?: string
  accent: string
  delay: number
  icon?: ReactNode
  /** ISO alpha-2 rendered as a flag in the corner, instead of `icon`. */
  flag?: string
  /** Extra content under the number — used by the «Land»-card to spell out
   *  which countries the count refers to. */
  footer?: ReactNode
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

      {footer && <div className="relative mt-1.5">{footer}</div>}
    </motion.div>
  )
}

/**
 * The countries behind the «Land»-number, as flags. Wraps rather than
 * scrolls — a footprint big enough to overflow two lines would need its
 * own card anyway, and clipping is preferable to a scrollbar on a TV.
 */
function FlagRow({ codes }: { codes: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 leading-none">
      {codes.map(code => {
        const flag = flagEmoji(code)
        if (!flag) return null
        return (
          <span key={code} title={code} style={{ fontSize: 15 }}>
            {flag}
          </span>
        )
      })}
    </div>
  )
}

/**
 * Ranked country list with proportional bars. Every country gets its own
 * row — no «+N andre»-bucket, because the point of this card is to name
 * the countries behind the numbers.
 *
 * Bars are scaled against the biggest row rather than the total, so a
 * portfolio dominated by one country still shows readable movement in the
 * tail. The card's flex-grow follows its row count, so two lists of very
 * different length share the rail proportionally instead of 50/50.
 */
function CountryBreakdown({
  title,
  rows,
  total,
  color,
  delay,
  nameFor,
  footer,
}: {
  title: string
  rows: CountryCount[]
  total: number
  color: string
  delay: number
  nameFor: (code: string) => string
  footer?: ReactNode
}) {
  const max = rows[0]?.count ?? 1

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...spring.gentle, delay }}
      className="rounded-2xl p-5 flex flex-col gap-3 relative overflow-hidden min-h-0"
      style={{
        flexGrow: Math.max(rows.length, 1),
        flexBasis: 0,
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
        {rows.map((row, i) => (
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
