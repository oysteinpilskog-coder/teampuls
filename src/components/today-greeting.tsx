import type { Dictionary } from '@/lib/i18n/types'

/**
 * TodayGreeting — the quiet opening beat on the main overview.
 *
 * Renders today's date as a Fraunces italic display line, with an Ember-italic
 * weekday (signature "italic Ember-word" pattern). Below it, a Manrope eyebrow
 * summarises the week + team spread.
 *
 * Server component — takes primitive props and a dict. No interactivity; it
 * renders once per request and reads crisp.
 */
export interface TodayGreetingProps {
  today: Date
  week: number
  memberCount: number
  /** Number of members with any entry for today (excludes off/sick/vacation if desired). */
  registeredToday: number
  /** Distinct non-empty location_label count for today's active entries. */
  distinctLocations: number
  dict: Dictionary
}

export function TodayGreeting({
  today,
  week,
  memberCount,
  registeredToday,
  distinctLocations,
  dict,
}: TodayGreetingProps) {
  const weekday = dict.dates.weekdaysLong[today.getDay()]
  const day = today.getDate()
  const month = dict.dates.monthsLong[today.getMonth()]

  // Build the state line. Stays a single sentence with Fraunces italic numerals
  // where it adds rhythm; keeps the rest in Manrope mono so numbers read clean.
  const hasSignal = memberCount > 0

  return (
    <section
      className="mx-auto max-w-3xl px-1 pt-6 pb-2"
      aria-label={dict.today.title}
    >
      {/* Eyebrow — Manrope mono small-caps */}
      <div
        className="lg-eyebrow mb-3"
        style={{
          color: 'var(--mist, var(--text-tertiary))',
        }}
      >
        <span aria-hidden style={{ marginRight: 10, opacity: 0.6 }}>—</span>
        {dict.today.title}
      </div>

      {/* Greeting line — Fraunces display with italic Ember weekday */}
      <h1
        className="font-display"
        style={{
          fontFamily: 'var(--font-fraunces), "Iowan Old Style", Georgia, serif',
          fontWeight: 300,
          fontVariationSettings: '"opsz" 144, "SOFT" 80',
          fontSize: 'clamp(44px, 6.2vw, 76px)',
          lineHeight: 0.96,
          letterSpacing: '-0.035em',
          color: 'var(--text-primary)',
          marginBottom: 14,
        }}
      >
        <em
          style={{
            fontStyle: 'italic',
            fontVariationSettings: '"opsz" 144, "SOFT" 100',
            color: 'var(--ember)',
            fontWeight: 300,
          }}
        >
          {weekday}
        </em>
        <span style={{ color: 'var(--text-primary)' }}>.</span>
        {' '}
        <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          {day}.{' '}
          <span style={{ color: 'var(--text-primary)' }}>{month}</span>
        </span>
      </h1>

      {/* State line — Manrope eyebrow with numerals */}
      {hasSignal ? (
        <p
          className="lg-eyebrow"
          style={{
            color: 'var(--text-tertiary)',
            letterSpacing: '0.16em',
          }}
        >
          <span>
            {dict.matrix.weekLabel} {week}
          </span>
          <span aria-hidden style={{ margin: '0 10px', opacity: 0.5 }}>·</span>
          <span className="tabular-nums">
            {registeredToday}/{memberCount} {dict.today.people}
          </span>
          {distinctLocations > 0 ? (
            <>
              <span aria-hidden style={{ margin: '0 10px', opacity: 0.5 }}>·</span>
              <span className="tabular-nums">
                {distinctLocations}{' '}
                {distinctLocations === 1 ? dict.today.place : dict.today.places}
              </span>
            </>
          ) : null}
        </p>
      ) : null}
    </section>
  )
}
