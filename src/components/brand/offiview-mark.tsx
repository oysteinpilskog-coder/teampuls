import * as React from 'react'

/**
 * Offiview mark — circle + horizon at 62%.
 *
 * One idea, four variants:
 *  - ink      → Paper surface, Ink stroke (default, light)
 *  - paper    → Espresso / Ember surface, Paper stroke (dark / campaign)
 *  - ember    → Paper surface, Ember-to-glow gradient horizon (accent)
 *  - nordlys  → Espresso surface, Nordlys gradient horizon (signature — ONE per flate)
 *
 * Geometry matches the brand HTML:
 *  - Ring: stroke-width proportional, horizon at y = 62% (not 50%)
 *  - Horizon spans 15% → 85% of width
 *
 * Stroke is scaled to the rendered size. Accessible name provided via `title`.
 */
export type OffiviewMarkVariant = 'ink' | 'paper' | 'ember' | 'nordlys'

export interface OffiviewMarkProps {
  /** Pixel size of the rendered mark (square). */
  size?: number
  /** Visual variant. Default `ink`. */
  variant?: OffiviewMarkVariant
  /** Override stroke width in SVG units (viewBox is 100×100). Default 5. */
  strokeWidth?: number
  /** Accessible label. If omitted, the mark is aria-hidden. */
  title?: string
  className?: string
}

export function OffiviewMark({
  size = 28,
  variant = 'ink',
  strokeWidth = 5,
  title,
  className,
}: OffiviewMarkProps) {
  // ink & paper are mono variants — they follow `currentColor` so the caller
  // can flip light/dark via text color. Only the signature variants (ember,
  // nordlys) hard-bake their own palette.
  const ringStroke = variant === 'nordlys' ? '#F5EFE4' : 'currentColor'

  // Horizon geometry — x from 15 to 85 at y = 62 (of 100-unit viewBox)
  const hx1 = 15
  const hx2 = 85
  const hy = 62

  const uid = React.useId()
  const gradientId = `offiview-horizon-${uid}`

  const horizonStroke = (() => {
    switch (variant) {
      case 'ember':
        return `url(#${gradientId})`
      case 'nordlys':
        return `url(#${gradientId})`
      case 'paper':
      case 'ink':
      default:
        return 'currentColor'
    }
  })()

  const horizonFilter =
    variant === 'nordlys' ? `url(#${gradientId}-glow)` : undefined

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={className}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        {variant === 'ember' ? (
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#B45309" />
            <stop offset="60%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#FBBF24" />
          </linearGradient>
        ) : null}
        {variant === 'nordlys' ? (
          <>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#00F5A0" />
              <stop offset="55%" stopColor="#00D9F5" />
              <stop offset="100%" stopColor="#7C3AED" />
            </linearGradient>
            <filter
              id={`${gradientId}-glow`}
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
            >
              <feGaussianBlur stdDeviation="1.4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </>
        ) : null}
      </defs>

      {/* Ring */}
      <circle
        cx="50"
        cy="50"
        r={50 - strokeWidth / 2}
        fill="none"
        stroke={ringStroke}
        strokeWidth={strokeWidth}
      />

      {/* Horizon */}
      <line
        x1={hx1}
        y1={hy}
        x2={hx2}
        y2={hy}
        stroke={horizonStroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        filter={horizonFilter}
      />
    </svg>
  )
}
