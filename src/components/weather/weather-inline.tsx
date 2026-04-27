'use client'

import { useWeather } from '@/lib/weather/use-weather'
import { wmoToIcon } from '@/lib/weather/wmo-to-icon'
import { formatTemp } from '@/lib/weather/format-temp'

export type WeatherInlineSize = 'sm' | 'md' | 'lg'

interface WeatherInlineProps {
  lat: number | null | undefined
  lng: number | null | undefined
  /** sm: 14px / md: 22px / lg: 40px ikonboks. Default sm. */
  size?: WeatherInlineSize
  /** Vis kort beskrivelse («lett regn») under tallet. Kun på md/lg. */
  showLabel?: boolean
  /** Tilleggsklasse på ytre wrapper. */
  className?: string
}

const SIZES: Record<WeatherInlineSize, { icon: number; tempPx: number; labelPx: number; gapPx: number }> = {
  sm: { icon: 14, tempPx: 13, labelPx: 12, gapPx: 6 },
  md: { icon: 22, tempPx: 18, labelPx: 14, gapPx: 8 },
  lg: { icon: 40, tempPx: 36, labelPx: 16, gapPx: 12 },
}

/**
 * WeatherInline — én linje, ikon + tall (+ valgfri label). Brukes i
 * kontor-kart-footer, kunde-kart-sidepanel, og av velkomstmodus
 * når den lander.
 *
 * Designregler (fra Dashboard atmosfære TODO v2):
 *  - Ikon FØR tall, alltid horisontalt
 *  - Stroke 1.8px (avvik fra lucide default 2)
 *  - Tabular figures på temperaturen
 *  - Ember kun når været er varmt (tempC ≥ 18) — ellers Ink/Paper
 *  - Hele grader, ekte minustegn (formatTemp håndterer dette)
 *  - Label kun på md/lg + showLabel=true
 *  - Hvis vær mangler: render `null` (skjules stille på TV)
 */
export function WeatherInline({
  lat, lng,
  size = 'sm',
  showLabel = false,
  className,
}: WeatherInlineProps) {
  const snap = useWeather(lat, lng)
  if (!snap) return null

  const { icon: Icon, label, warm } = wmoToIcon(snap.code, snap.tempC)
  const dims = SIZES[size]
  const colorClass = warm ? 'text-ember' : 'text-ink dark:text-paper'
  const wantLabel = showLabel && size !== 'sm'

  return (
    <span
      className={`inline-flex items-center ${className ?? ''}`}
      style={{ gap: dims.gapPx }}
      aria-label={`${label}, ${formatTemp(snap.tempC)}`}
    >
      <Icon
        size={dims.icon}
        strokeWidth={1.8}
        className={colorClass}
        aria-hidden
      />
      <span
        className={colorClass}
        style={{
          fontFamily: 'var(--font-manrope)',
          fontWeight: 500,
          fontSize: dims.tempPx,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.01em',
        }}
      >
        {formatTemp(snap.tempC)}
      </span>
      {wantLabel && (
        <span
          className="text-mist"
          style={{
            fontFamily: 'var(--font-fraunces), Georgia, serif',
            fontStyle: 'italic',
            fontWeight: 300,
            fontSize: dims.labelPx,
            fontVariationSettings: '"opsz" 32, "SOFT" 80',
            letterSpacing: '-0.005em',
            marginLeft: 4,
          }}
        >
          · {label.toLowerCase()}
        </span>
      )}
    </span>
  )
}
