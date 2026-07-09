'use client'

import { motion } from 'framer-motion'
import { BreathingDot } from '@/components/breathing-dot'
import { useStatusColors } from '@/lib/status-colors/context'
import type { Member, Entry, EntryStatus, Office } from '@/lib/supabase/types'
import { getDayLabel, getISOWeek, isToday } from '@/lib/dates'
import { spring } from '@/lib/motion'
import { useT } from '@/lib/i18n/context'
import type { Dictionary } from '@/lib/i18n/types'
import { dedupeEntriesByMemberDate } from '@/lib/entries/dedupe'
import { HeroBigNumber } from './hero-big-number'
import { TeamBoard } from './team-board'

interface TodayViewProps {
  members: Member[]
  weekDays: Date[]
  entries: Entry[]
  todayEntries: Entry[]
  time: Date
  offices?: Office[]
  /** Posisjon i den aktive rotasjonen (0-indeksert). Brukes til den
   *  diskrete prikk-indikatoren nederst i Nå-visningen så TV-seeren
   *  ser «du er på 1 av 6». */
  viewIdx?: number
  /** Antall visninger i den aktive rotasjonen. Når <= 1 skjules
   *  prikk-indikatoren — én visning trenger ikke posisjonsmarkør. */
  viewCount?: number
}

const WEEK_STATUS_GROUPS: Array<{ key: string; statuses: EntryStatus[]; representative: EntryStatus }> = [
  { key: 'office',   statuses: ['office'],                  representative: 'office' },
  { key: 'remote',   statuses: ['remote'],                  representative: 'remote' },
  { key: 'customer', statuses: ['customer', 'event', 'travel'],      representative: 'customer' },
  { key: 'away',     statuses: ['vacation', 'absent', 'off'], representative: 'vacation' },
]

function pad(n: number) { return String(n).padStart(2, '0') }

function greetingFor(h: number, g: Dictionary['dashboard']['greetings']): string {
  if (h < 5)  return g.night
  if (h < 10) return g.morning
  if (h < 12) return g.forenoon
  if (h < 17) return g.afternoon
  if (h < 22) return g.evening
  return g.night
}

export function TodayView({ members, weekDays, entries, todayEntries, time, offices, viewIdx, viewCount }: TodayViewProps) {
  const STATUS_COLORS = useStatusColors()
  const t = useT()
  const hours   = pad(time.getHours())
  const minutes = pad(time.getMinutes())
  const weekNum = getISOWeek(time)

  const monthLong = t.dates.monthsLong[time.getMonth()]
  const weekdayLong = t.dates.weekdaysLong[time.getDay()]
  const greeting = greetingFor(time.getHours(), t.dashboard.greetings)

  // Deduplicate: one entry per member, per day. Fixes the "12/5 · 240%" bug.
  const dedupedTodayEntries = dedupeEntriesByMemberDate(todayEntries, members)
  const todayMap = new Map(dedupedTodayEntries.map(e => [e.member_id, e]))

  // Per-day maps for the week strip — same dedup logic per date
  function getDedupedDayEntries(date: Date): Entry[] {
    const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    const dayRows = entries.filter(e => e.date === dateStr)
    return dedupeEntriesByMemberDate(dayRows, members)
  }

  return (
    <div className="relative h-full flex flex-col px-10 pt-5 pb-3 gap-3">
      {/* ── Header band ──────────────────────────────────────────── */}
      {/* Org-wordmarken eies av dashboard-shellen (DashboardClient) så den
          bevarer font og posisjon på tvers av alle visninger. Header-en her
          starter rett på LIVE-pille + greeting; pt-12 reserverer plassen
          shellens wordmark dekker så LIVE-pillen ikke krasjer i den. */}
      <div className="flex items-start justify-between pt-12">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.05 }}
        >
          {/* ── View identity: "NÅ" + subtitle ─────────────────────────
              Eksplisitt navn på visningen så folk som ser TV-en for
              første gang umiddelbart skjønner *hva* de ser på, før
              hjernen rekker å rangere alle tallene. Sora caps på navnet,
              Fraunces italic på underlinjen — samme språkpar som
              wordmark/clock-aksen, så det føles som ett system.
              Subtilen ligger i samme dempede paper-tone som klokka-
              underlinjen. */}
          <div className="flex items-baseline gap-3 leading-none">
            <span
              className="text-[15px] font-semibold uppercase tracking-[0.32em]"
              style={{
                fontFamily: 'var(--font-display), var(--font-body)',
                color: 'rgba(255,255,255,0.85)',
              }}
            >
              {t.dashboard.views.now}
            </span>
            <span
              aria-hidden
              className="inline-block w-1 h-1 rounded-full"
              style={{
                background: 'color-mix(in oklab, var(--accent-color) 70%, white)',
                boxShadow: '0 0 6px color-mix(in oklab, var(--accent-color) 70%, transparent)',
              }}
            />
            <span
              className="text-[14px]"
              style={{
                fontFamily: 'var(--font-fraunces), "Iowan Old Style", Georgia, serif',
                fontStyle: 'italic',
                fontWeight: 300,
                fontVariationSettings: '"opsz" 24, "SOFT" 80',
                color: 'rgba(245,239,228,0.6)',
                letterSpacing: '-0.01em',
              }}
            >
              {t.dashboard.nowSubtitle}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-2">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-[0.16em] uppercase whitespace-nowrap flex-shrink-0"
              style={{
                background: 'color-mix(in oklab, var(--accent-color) 16%, transparent)',
                border: '1px solid color-mix(in oklab, var(--accent-color) 35%, transparent)',
                color: 'color-mix(in oklab, var(--accent-color) 60%, white)',
                fontFamily: 'var(--font-body)',
              }}
            >
              <BreathingDot color="var(--accent-color)" />
              {t.dashboard.live} · {t.matrix.weekLabel} {weekNum}
            </span>
            <span
              className="text-[12px]"
              style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body)' }}
            >
              {greeting}
            </span>
          </div>
          {/* ── Status legend: fader inn første ~0.6s, holder ~3s, fader
              ut igjen. Forklarer fargekoden for breakdown-prikkene
              (kontor / hjemme / kunde / borte) uten å eie skjermen.
              Når den er borte, eier hero-tallet flata — som før. */}
          <StatusLegend STATUS_COLORS={STATUS_COLORS} t={t} />
        </motion.div>

        {/* Clock */}
        <motion.div
          className="text-right"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.12 }}
        >
          {/* THE CLOCK — Nordlys signature moment.
              Once per flate: this is the one place on the TV dashboard where
              Nordlys appears. Everything else stays on Paper/Ember.
              Fraunces 300 with opsz 144 + SOFT 80 gives the digits soft
              terminals — warm and precise. Green→cyan→violet gradient
              bakes the signature into the glyphs themselves. */}
          <div
            className="tabular-nums leading-none"
            style={{
              fontSize: 84,
              fontWeight: 300,
              fontFamily: 'var(--font-fraunces), "Iowan Old Style", Georgia, serif',
              fontVariationSettings: '"opsz" 144, "SOFT" 80',
              letterSpacing: '-0.04em',
              backgroundImage: 'var(--gradient-nordlys-clock)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: 'drop-shadow(0 0 28px color-mix(in oklab, var(--nordlys-a) 22%, transparent))',
            }}
          >
            {hours}
            <span
              aria-hidden
              style={{
                opacity: 0.5,
                animation: 'clockBlink 1.2s ease-in-out infinite',
                WebkitTextFillColor: 'rgba(245,239,228,0.75)',
                backgroundImage: 'none',
                margin: '0 0.12em',
              }}
            >
              :
            </span>
            {minutes}
          </div>
          {/* Date subline — Fraunces italic, weekday in Ember-glow */}
          <div
            className="flex items-baseline justify-end gap-3 mt-1"
            style={{
              color: 'rgba(245,239,228,0.6)',
              fontFamily: 'var(--font-fraunces), "Iowan Old Style", Georgia, serif',
              fontStyle: 'italic',
              fontWeight: 300,
              fontVariationSettings: '"opsz" 24, "SOFT" 80',
            }}
          >
            <span style={{ fontSize: 17, letterSpacing: '-0.015em' }}>
              <span style={{ color: 'var(--ember-glow)' }}>
                {weekdayLong.toLowerCase()}
              </span>
              <span>{' · '}{time.getDate()}. {monthLong}</span>
            </span>
          </div>
        </motion.div>
      </div>

      {/* ── Hero number — Apple Weather-style. One Fraunces tall, lap-read
            from across reception. The screen has a single hero instead of
            four competing widgets. */}
      <HeroBigNumber members={members} todayEntries={dedupedTodayEntries} offices={offices} />

      {/* ── Team board ───────────────────────────────────────────── */}
      <TeamBoard members={members} todayMap={todayMap} />

      {/* ── Week strip ────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring.gentle, delay: 0.65 }}
        className="relative rounded-2xl px-5 py-2.5 flex gap-3 overflow-hidden flex-shrink-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        {weekDays.map(date => {
          const { weekday, day } = getDayLabel(date)
          const dayEntries = getDedupedDayEntries(date)
          const today = isToday(date)

          const counts = WEEK_STATUS_GROUPS.map(g => ({
            group: g,
            count: dayEntries.filter(e => g.statuses.includes(e.status)).length,
          }))
          const registered = dayEntries.length
          const regPct = members.length > 0 ? Math.round((registered / members.length) * 100) : 0

          return (
            <div
              key={date.toISOString()}
              className="relative flex-1 flex flex-col items-center gap-1 rounded-xl py-1.5 px-2"
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
                className="tabular-nums text-[18px] font-semibold leading-none"
                style={{
                  fontFamily: 'var(--font-fraunces)',
                  color: today ? '#ffffff' : 'rgba(255,255,255,0.5)',
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

              <div className="flex items-center gap-1">
                <span
                  className="tabular-nums text-[12px] font-semibold"
                  style={{
                    color: today ? '#ffffff' : 'rgba(255,255,255,0.55)',
                    fontFamily: 'var(--font-fraunces)',
                  }}
                >
                  {registered}
                </span>
                <span
                  className="text-[10px]"
                  style={{
                    color: today ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.25)',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  / {members.length} · {regPct}%
                </span>
              </div>
            </div>
          )
        })}
      </motion.div>

      {/* ── Rotasjons-prikker ──────────────────────────────────────
          Diskret «du er på X av Y»-indikator nederst i Nå-visningen.
          Den tynne Nordlys-progresjonen rett under kontroll-baren
          beviser at rotasjonen *lever*; disse prikkene gir
          *posisjonen*. Vises kun når det er mer enn én visning i
          rotasjonen — én visning trenger ingen indikator. */}
      {viewCount !== undefined && viewIdx !== undefined && viewCount > 1 && (
        <RotationDots idx={viewIdx} count={viewCount} />
      )}

    </div>
  )
}

/**
 * Liten fade-in/fade-ut legend som sitter rett under header-banden i
 * Nå-visningen. Forklarer hva fargeprikkene i breakdown-chipsene betyr
 * uten å permanent okkupere flate. Resepsjonisten ser dem akkurat lenge
 * nok til å lære koden, så forsvinner de ut igjen så hero-tallet får
 * eie skjermen. Sekvensen: 0.4s usynlig → 0.6s fade in → 3.0s synlig →
 * 1.0s fade ut. Total tid: ~5s.
 */
function StatusLegend({
  STATUS_COLORS,
  t,
}: {
  STATUS_COLORS: ReturnType<typeof useStatusColors>
  t: ReturnType<typeof useT>
}) {
  const items: Array<{ label: string; color: string }> = [
    { label: t.pulse.atOffice, color: STATUS_COLORS.office.icon },
    { label: t.pulse.atHomeShort, color: STATUS_COLORS.remote.icon },
    { label: t.pulse.out, color: STATUS_COLORS.customer.icon },
    { label: t.pulse.away, color: STATUS_COLORS.vacation.icon },
  ]
  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: [0, 1, 1, 0], y: [4, 0, 0, -2] }}
      transition={{
        duration: 5.0,
        times: [0, 0.12, 0.8, 1],
        delay: 0.4,
        ease: [0.4, 0, 0.2, 1],
      }}
      className="mt-2 flex items-center gap-3 flex-wrap"
    >
      {items.map(it => (
        <span
          key={it.label}
          className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em]"
          style={{
            color: 'rgba(255,255,255,0.5)',
            fontFamily: 'var(--font-body)',
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full inline-block"
            style={{ background: it.color, boxShadow: `0 0 6px ${it.color}aa` }}
          />
          {it.label.toLowerCase()}
        </span>
      ))}
    </motion.div>
  )
}

/**
 * Diskret «X av Y»-prikk-indikator nederst i Nå-visningen. Aktiv prikk
 * er litt større og lyser i accent-fargen; de andre er rolige hvite
 * prikker. Holder seg ute av veien for hero-tallet og uke-stripa, men
 * gjør rotasjonsstatus lesbar fra avstand uten å måtte se på
 * kontroll-baren.
 */
function RotationDots({ idx, count }: { idx: number; count: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.8 }}
      className="absolute left-1/2 -translate-x-1/2 bottom-2 flex items-center gap-1.5 pointer-events-none"
      aria-hidden
    >
      {Array.from({ length: count }).map((_, i) => {
        const active = i === idx
        return (
          <span
            key={i}
            className="rounded-full transition-all duration-500"
            style={{
              width: active ? 16 : 4,
              height: 4,
              background: active
                ? 'color-mix(in oklab, var(--accent-color) 70%, white)'
                : 'rgba(255,255,255,0.22)',
              boxShadow: active
                ? '0 0 10px color-mix(in oklab, var(--accent-color) 55%, transparent)'
                : 'none',
            }}
          />
        )
      })}
    </motion.div>
  )
}
