'use client'

import { memo, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Award, Building2, Cake, Globe2, Languages, MapPin, Star, Users } from 'lucide-react'
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
 * without a single map or matrix. Everything is derived in-memory from the
 * three registries the dashboard already holds (members, offices,
 * customers), so it costs no extra round-trip and re-derives itself on
 * every realtime update.
 *
 * Layout is three horizontal bands, so the left and right halves start on
 * the same line instead of the hero pushing one column down:
 *
 *   ┌ tenure hero ─────────────────────────┬ celebrations ┐
 *   ├ six stat cards (3 × 2) ──────────────┼ two ranked country lists ┤
 *
 * Every card fills itself: a header row pinned to the top, the number
 * owning the middle, and a share bar + caption pinned to the bottom. An
 * earlier version let the number float in the middle of a 340px card with
 * nothing above or below it, which read as unfinished.
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
  const { customers: c, team, offices: off } = figures

  return (
    <div className="relative h-full flex flex-col px-10 pt-20 pb-[50px] gap-5">
      {/* ── Header — org name and clock belong to the global top bar. */}
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

      {/* ── Band 1: tenure hero left, celebrations right ─────────────── */}
      <TenureBand figures={figures} labels={f} locale={intlLocale} />

      {/* ── Band 2: stat grid left, ranked country lists right ───────── */}
      <div className="flex-1 grid grid-cols-[1.04fr_0.96fr] gap-5 min-h-0">
        <div className="grid grid-cols-3 grid-rows-2 gap-4 min-h-0">
          <StatCard
            delay={0.30}
            value={c.total}
            label={f.customersTotal}
            caption={f.customersHint.replace('{countries}', String(c.countries))}
            accent={customerColor}
            icon={<Globe2 className="w-4 h-4" strokeWidth={2} />}
          />
          {/* De to avdelingskortene deler porteføljen i to og summerer alltid
              til totalen: England-kortet er hele de britiske øyer (GB + IE —
              Skottland og Irland hører hjemme her), Nordic er komplementet. */}
          <StatCard
            delay={0.35}
            value={c.nordic}
            label={f.customersNordic}
            caption={shareCaption(c.nordic, c.total, f.ofPortfolio)}
            share={share(c.nordic, c.total)}
            accent={customerColor}
            icon={<MapPin className="w-4 h-4" strokeWidth={2} />}
          />
          <StatCard
            delay={0.40}
            value={c.uk}
            label={f.customersUk}
            caption={shareCaption(c.uk, c.total, f.ofPortfolio)}
            share={share(c.uk, c.total)}
            accent={customerColor}
            code="GB"
          />
          {/* Teamet deles på nøyaktig samme UK/Nordic-akse som kundene, så
              de to radene leses som to par. */}
          <StatCard
            delay={0.45}
            value={team.nordic}
            label={f.teamNordic}
            caption={f.ofTeam.replace('{total}', String(team.total))}
            share={share(team.nordic, team.total)}
            accent={officeColor}
            icon={<Users className="w-4 h-4" strokeWidth={2} />}
          />
          <StatCard
            delay={0.50}
            value={team.uk}
            label={f.teamUk}
            caption={f.ofTeam.replace('{total}', String(team.total))}
            share={share(team.uk, team.total)}
            accent={officeColor}
            code="GB"
          />
          {/* «Land: 8» sa ingenting om HVILKE åtte. Kode-brikkene under
              tallet svarer på det direkte. */}
          <StatCard
            delay={0.55}
            value={figures.countryFootprint.length}
            label={f.countries}
            accent="var(--accent-color)"
            icon={<Building2 className="w-4 h-4" strokeWidth={2} />}
            footer={
              <div className="flex flex-wrap gap-1">
                {figures.countryFootprint.map(code => (
                  <CodeChip key={code} code={code} color="var(--accent-color)" />
                ))}
              </div>
            }
          />
        </div>

        {/* Begge listene viser HVERT land — ingen «+N andre»-samlepost. De
            to kortene deler høyden proporsjonalt med antall rader, og radene
            fordeles jevnt innenfor hvert kort, så rad-rytmen blir den samme
            i begge to. Det er den symmetrien øyet leter etter. */}
        <div className="flex flex-col gap-5 min-h-0 pb-[64px]">
          <CountryBreakdown
            title={f.customerBase}
            rows={c.byCountry}
            total={c.total}
            color={customerColor}
            delay={0.34}
            nameFor={nameFor}
          />
          <CountryBreakdown
            title={f.teamByCountry}
            rows={team.byCountry}
            total={team.total}
            color={officeColor}
            delay={0.44}
            nameFor={nameFor}
            footer={
              <span className="inline-flex items-center gap-1.5">
                <Languages className="w-3 h-3" strokeWidth={2} />
                {f.countriesHint
                  .replace('{offices}', String(off.total))
                  .replace('{timezones}', String(off.timezones))}
                {team.languages > 0 &&
                  ` · ${f.languages.replace('{n}', String(team.languages))}`}
              </span>
            }
          />
        </div>
      </div>
    </div>
  )
}

function share(value: number, total: number): number | undefined {
  return total > 0 ? value / total : undefined
}

/** «59 % av porteføljen». Empty when there is no base to divide by. */
function shareCaption(value: number, total: number, template: string): string {
  if (total <= 0) return ''
  return template.replace('{pct}', String(Math.round((value / total) * 100)))
}

/**
 * ISO country code as a small chip.
 *
 * Deliberately NOT a flag emoji: Windows ships no glyphs for regional
 * indicator sequences, so `🇬🇧` renders as the bare letters "GB" in a
 * mismatched fallback font — which is exactly what reception screens were
 * showing. A styled code chip looks intentional everywhere and stays
 * legible at TV distance.
 */
function CodeChip({ code, color }: { code: string; color: string }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-[5px] tabular-nums"
      style={{
        minWidth: 26,
        height: 18,
        padding: '0 5px',
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: '0.08em',
        fontFamily: 'var(--font-body)',
        color: `color-mix(in oklab, ${color} 30%, white)`,
        background: `color-mix(in oklab, ${color} 18%, transparent)`,
        border: `1px solid color-mix(in oklab, ${color} 32%, transparent)`,
      }}
    >
      {code}
    </span>
  )
}

/**
 * How long each celebration fact holds before the next fades in. Three
 * facts × 6 s = exactly one full round inside view J's 18 s dwell, so the
 * reception TV never cuts away mid-rotation.
 */
const CELEBRATION_CYCLE_MS = 6000

/**
 * Band 1. The company's combined years of service gets the display-scale
 * Fraunces treatment — the same hero language as «Akkurat nå» — and the two
 * celebration facts sit in their own card on the right so the band is
 * balanced instead of trailing off into empty space.
 */
function TenureBand({
  figures,
  labels,
  locale,
}: {
  figures: OrgFigures
  labels: Dictionary['dashboard']['figures']
  /** BCP-47 tag for formatting the birthday date (e.g. "nb-NO"). */
  locale: string
}) {
  const { tenure, team, nextBirthday, nextAnniversary } = figures
  const years = Math.round(tenure.totalYears)

  // Today / tomorrow read faster than a date on a screen glanced at from
  // across a room; anything further out gets an actual day + month.
  const whenLabel = (month: number, day: number, daysUntil: number) => {
    if (daysUntil === 0) return labels.birthdayToday
    if (daysUntil === 1) return labels.birthdayTomorrow
    // Year is irrelevant here — and deliberately not the birth/hire year.
    // We borrow an arbitrary leap year so 29 February always formats.
    const d = new Date(2024, month - 1, day)
    try {
      return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(d)
    } catch {
      return `${day}.${month}`
    }
  }

  // The three celebration facts share one line instead of stacking: the
  // card alternates between them so «Neste jubileum» gets the same billing
  // as the birthday without growing a third row nobody reads.
  const celebrations: { key: string; icon: ReactNode; text: string }[] = []
  if (tenure.longest) {
    celebrations.push({
      key: 'longest',
      icon: (
        <Star
          className="w-3.5 h-3.5 shrink-0"
          strokeWidth={2}
          fill="currentColor"
          style={{ color: '#d4a017', filter: 'drop-shadow(0 0 6px rgba(212,160,23,0.55))' }}
        />
      ),
      text: labels.tenureLongest
        .replace('{name}', tenure.longest.name)
        .replace('{years}', String(Math.floor(tenure.longest.years))),
    })
  }
  if (nextAnniversary) {
    celebrations.push({
      key: 'anniversary',
      icon: (
        <Award
          className="w-3.5 h-3.5 shrink-0"
          strokeWidth={2}
          style={{ color: '#8FD0C0', filter: 'drop-shadow(0 0 6px rgba(143,208,192,0.5))' }}
        />
      ),
      text: labels.nextAnniversary
        .replace('{name}', nextAnniversary.name)
        .replace('{years}', String(nextAnniversary.years))
        .replace(
          '{when}',
          whenLabel(nextAnniversary.month, nextAnniversary.day, nextAnniversary.daysUntil),
        ),
    })
  }
  if (nextBirthday) {
    celebrations.push({
      key: 'birthday',
      icon: (
        <Cake
          className="w-3.5 h-3.5 shrink-0"
          strokeWidth={2}
          style={{ color: '#E8A0C0', filter: 'drop-shadow(0 0 6px rgba(232,160,192,0.5))' }}
        />
      ),
      text: labels.nextBirthday
        .replace('{name}', nextBirthday.name)
        .replace(
          '{when}',
          whenLabel(nextBirthday.month, nextBirthday.day, nextBirthday.daysUntil),
        ),
    })
  }

  const count = celebrations.length
  const [celebrationIdx, setCelebrationIdx] = useState(0)

  useEffect(() => {
    if (count <= 1) return
    const id = setInterval(() => {
      setCelebrationIdx(i => (i + 1) % count)
    }, CELEBRATION_CYCLE_MS)
    return () => clearInterval(id)
  }, [count])

  // Modulo rather than a reset effect: if the set of facts shrinks (a
  // birthday passes, someone opts out) the index stays in range on its own.
  const celebration = count > 0 ? celebrations[celebrationIdx % count] : null

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring.gentle, delay: 0.15 }}
      className="flex-shrink-0 flex items-end justify-between gap-8"
      aria-label={labels.tenureTotal}
    >
      <div className="flex items-baseline gap-6 min-w-0">
        <AnimatedCount
          value={years}
          delay={0.25}
          duration={1.2}
          className="tabular-nums leading-none"
          style={{
            fontSize: 'clamp(84px, 8.5vw, 132px)',
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

        <div className="flex flex-col gap-2 pb-2 min-w-0">
          <span
            className="text-[13px] font-semibold tracking-[0.28em] uppercase"
            style={{ color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-body)' }}
          >
            {labels.tenureTotal}
          </span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            {tenure.counted > 0 && (
              <Fact value={tenure.avgYears.toFixed(1)} label={labels.tenureAverage} />
            )}
            <Fact value={String(team.total)} label={labels.tenureHeadcount} />
          </div>
        </div>
      </div>

      {/* Feiringene i eget kort — gir bandet en høyre kant og hindrer at
          hero-tallet henger alene på en ellers tom linje. Kortet viser ett
          faktum om gangen og veksler mellom dem; den ytre boksen eier
          inn-animasjonen, den indre `layout`-animasjonen breddeskiftet
          når en kortere eller lengre linje tar over. */}
      {celebration && (
        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...spring.gentle, delay: 0.5 }}
          className="flex-shrink-0"
        >
          <motion.div
            layout
            transition={spring.gentle}
            className="rounded-2xl px-5 py-3.5 flex items-center"
            style={{
              background:
                'linear-gradient(155deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.015) 100%)',
              border: '1px solid rgba(255,255,255,0.09)',
            }}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={celebration.key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
              >
                <CelebrationLine icon={celebration.icon} text={celebration.text} />
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </motion.section>
  )
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <span
      className="text-[14px]"
      style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-body)' }}
    >
      <span
        className="tabular-nums font-semibold"
        style={{ fontFamily: 'var(--font-fraunces)', color: 'rgba(255,255,255,0.92)' }}
      >
        {value}
      </span>{' '}
      {label}
    </span>
  )
}

function CelebrationLine({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <span
      className="inline-flex items-center gap-2 text-[13px] whitespace-nowrap"
      style={{ color: 'rgba(255,255,255,0.72)', fontFamily: 'var(--font-body)' }}
    >
      {icon}
      {text}
    </span>
  )
}

/**
 * One countable fact. Three pinned zones — header, number, footer — so the
 * card reads as filled at any height instead of leaving the number adrift
 * in the middle. The share bar doubles as the visual tie to the ranked
 * lists on the right.
 */
function StatCard({
  value,
  label,
  caption,
  accent,
  delay,
  icon,
  code,
  share: shareFraction,
  footer,
}: {
  value: number
  label: string
  caption?: string
  accent: string
  delay: number
  icon?: ReactNode
  /** ISO alpha-2 shown as a chip in the corner, instead of `icon`. */
  code?: string
  /** 0..1 — renders a proportional bar above the caption. */
  share?: number
  /** Replaces the bar + caption entirely (the «Land»-card's chip cloud). */
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

      {/* Top: label + marker */}
      <div className="flex items-start justify-between relative gap-2">
        <span
          className="text-[10.5px] font-semibold uppercase tracking-[0.2em] leading-tight"
          style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-body)' }}
        >
          {label}
        </span>
        <span className="flex-shrink-0 leading-none" style={{ color: accent, opacity: 0.75 }}>
          {code ? <CodeChip code={code} color={accent} /> : icon}
        </span>
      </div>

      {/* Middle: the number owns the room */}
      <div className="relative flex-1 flex items-center min-h-0">
        <AnimatedCount
          value={value}
          delay={delay + 0.1}
          duration={1.0}
          className="tabular-nums leading-none"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontSize: 'clamp(52px, 5vw, 92px)',
            fontWeight: 700,
            letterSpacing: '-0.045em',
            background: `linear-gradient(180deg, #ffffff 0%, ${accent} 155%)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        />
      </div>

      {/* Bottom: share bar + caption, or a custom footer */}
      <div className="relative flex flex-col gap-2">
        {footer ?? (
          <>
            {shareFraction !== undefined && (
              <div
                className="h-[5px] rounded-full overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.07)' }}
              >
                <motion.div
                  className="h-full rounded-full"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: Math.max(shareFraction, 0.02) }}
                  transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: delay + 0.35 }}
                  style={{
                    transformOrigin: 'left center',
                    background: `linear-gradient(90deg, color-mix(in oklab, ${accent} 55%, white) 0%, ${accent} 100%)`,
                    boxShadow: `0 0 10px ${accent}55`,
                  }}
                />
              </div>
            )}
            {caption && (
              <span
                className="text-[11px] truncate"
                style={{ color: 'rgba(255,255,255,0.42)', fontFamily: 'var(--font-body)' }}
              >
                {caption}
              </span>
            )}
          </>
        )}
      </div>
    </motion.div>
  )
}

/**
 * Ranked country list with proportional bars. Every country gets its own
 * row — no «+N andre»-bucket, because the point of this card is to name the
 * countries behind the numbers.
 *
 * Bars are scaled against the biggest row rather than the total, so a
 * portfolio dominated by one country still shows readable movement in the
 * tail. The card's flex-grow follows its row count and the rows spread
 * evenly inside it, so two lists of very different length end up with the
 * same row rhythm rather than one dense card next to one airy one.
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

      <div className="flex items-baseline justify-between relative flex-shrink-0">
        <h3
          className="text-[11px] font-semibold uppercase tracking-[0.22em]"
          style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-body)' }}
        >
          {title}
        </h3>
        <span
          className="tabular-nums text-[15px] font-semibold"
          style={{ color: 'rgba(255,255,255,0.75)', fontFamily: 'var(--font-fraunces)' }}
        >
          {total}
        </span>
      </div>

      <div className="relative flex-1 flex flex-col justify-around min-h-0 py-1">
        {rows.map((row, i) => (
          <CountryRow
            key={row.code}
            code={row.code}
            label={nameFor(row.code)}
            count={row.count}
            fraction={max > 0 ? row.count / max : 0}
            color={color}
            delay={delay + 0.12 + i * 0.05}
          />
        ))}
      </div>

      {footer && (
        <div
          className="relative text-[11px] flex-shrink-0"
          style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body)' }}
        >
          {footer}
        </div>
      )}
    </motion.div>
  )
}

function CountryRow({
  code,
  label,
  count,
  fraction,
  color,
  delay,
}: {
  code: string
  label: string
  count: number
  fraction: number
  color: string
  delay: number
}) {
  return (
    <div className="flex items-center gap-3">
      <CodeChip code={code} color={color} />
      <span
        className="w-[124px] flex-shrink-0 truncate text-[14px]"
        style={{
          color: 'rgba(255,255,255,0.88)',
          fontFamily: 'var(--font-body)',
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <div
        className="flex-1 h-[8px] rounded-full overflow-hidden min-w-0"
        style={{ background: 'rgba(255,255,255,0.07)' }}
      >
        <motion.div
          className="h-full rounded-full"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: Math.max(fraction, 0.02) }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay }}
          style={{
            transformOrigin: 'left center',
            background: `linear-gradient(90deg, color-mix(in oklab, ${color} 55%, white) 0%, ${color} 100%)`,
            boxShadow: `0 0 10px ${color}55`,
          }}
        />
      </div>
      <span
        className="w-8 flex-shrink-0 text-right tabular-nums text-[14px] font-semibold"
        style={{
          color: 'rgba(255,255,255,0.92)',
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
    prev.birthdaysEnabled === next.birthdaysEnabled &&
    prev.time.toDateString() === next.time.toDateString()
  )
}

export const FiguresView = memo(FiguresViewImpl, figuresPropsEqual)
