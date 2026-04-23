import type { Dictionary } from '@/lib/i18n/types'

/**
 * TodayGreeting — refined single-line opening for the overview.
 *
 * A whisper, not a shout: italic Ember weekday + Fraunces date on the left,
 * live team metrics on the right. Shares baseline so eye reads it as one beat.
 * Designed to leave the matrix as the page's true centre of gravity.
 */
export interface TodayGreetingProps {
  today: Date
  week: number
  memberCount: number
  registeredToday: number
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
  const hasSignal = memberCount > 0

  return (
    <section
      className="mx-auto max-w-3xl px-1 pt-3 pb-0"
      aria-label={dict.today.title}
    >
      <div className="flex items-baseline justify-between gap-6 flex-wrap">
        <h1
          className="font-display"
          style={{
            fontFamily: 'var(--font-fraunces), "Iowan Old Style", Georgia, serif',
            fontWeight: 300,
            fontVariationSettings: '"opsz" 144, "SOFT" 80',
            fontSize: 'clamp(22px, 2.6vw, 32px)',
            lineHeight: 1.1,
            letterSpacing: '-0.015em',
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

        {hasSignal ? (
          <p
            className="lg-eyebrow tabular-nums"
            style={{
              color: 'var(--text-tertiary)',
              letterSpacing: '0.18em',
            }}
          >
            <span>
              {dict.matrix.weekLabel} {week}
            </span>
            <span aria-hidden style={{ margin: '0 10px', opacity: 0.5 }}>·</span>
            <span>
              {registeredToday}/{memberCount} {dict.today.people}
            </span>
            {distinctLocations > 0 ? (
              <>
                <span aria-hidden style={{ margin: '0 10px', opacity: 0.5 }}>·</span>
                <span>
                  {distinctLocations}{' '}
                  {distinctLocations === 1 ? dict.today.place : dict.today.places}
                </span>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </section>
  )
}
