import type { Dictionary } from '@/lib/i18n/types'

/**
 * TodayGreeting — the single hero beat at the top of /oversikt.
 *
 * A whisper, not a shout: italic Ember weekday + Fraunces date. Metrics
 * have moved under the search input so the greeting can own its line.
 */
export interface TodayGreetingProps {
  today: Date
  dict: Dictionary
}

export function TodayGreeting({ today, dict }: TodayGreetingProps) {
  const weekday = dict.dates.weekdaysLong[today.getDay()]
  const day = today.getDate()
  const month = dict.dates.monthsLong[today.getMonth()]

  return (
    <section
      className="mx-auto max-w-3xl px-1 pt-2 pb-0 text-center"
      aria-label={dict.today.title}
    >
      <h1
        className="font-display"
        style={{
          fontFamily: 'var(--font-fraunces), "Iowan Old Style", Georgia, serif',
          fontWeight: 300,
          fontVariationSettings: '"opsz" 144, "SOFT" 80',
          fontSize: 'clamp(30px, 3.4vw, 44px)',
          lineHeight: 1.05,
          letterSpacing: '-0.02em',
          color: 'var(--text-secondary)',
        }}
      >
        <em
          style={{
            fontStyle: 'italic',
            fontVariationSettings: '"opsz" 144, "SOFT" 100',
            color: 'var(--ember)',
            fontWeight: 300,
            marginRight: '0.35em',
          }}
        >
          {weekday}
        </em>
        <span style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
          {day}.{' '}
          <span style={{ color: 'var(--text-secondary)' }}>{month}</span>
        </span>
      </h1>
    </section>
  )
}
