'use client'

import { useWeather } from '@/lib/weather/use-weather'
import { wmoToIcon } from '@/lib/weather/wmo-to-icon'
import { formatTemp } from '@/lib/weather/format-temp'

export type WeatherInlineSize = 'sm' | 'md' | 'lg'

interface WeatherInlineProps {
  lat: number | null | undefined
  lng: number | null | undefined
  /** sm: 13px / md: 22px / lg: 40px ikonboks. Default sm. */
  size?: WeatherInlineSize
  /** Vis kort beskrivelse («lett regn») under tallet. Kun på md/lg. */
  showLabel?: boolean
  /** Tilleggsklasse på ytre wrapper. */
  className?: string
}

const SIZES: Record<WeatherInlineSize, { icon: number; tempPx: number; labelPx: number; gapPx: number }> = {
  // sm matcher office-map-label (icon 13, tempPx 12) så vær-glyf og
  // grader ser identisk store ut på tvers av dashboard-flatene — kunde-
  // scroller og kontor-kart leses som samme språk på TV.
  sm: { icon: 13, tempPx: 12, labelPx: 12, gapPx: 4 },
  md: { icon: 22, tempPx: 18, labelPx: 14, gapPx: 8 },
  lg: { icon: 40, tempPx: 36, labelPx: 16, gapPx: 12 },
}

// Identiske farge-tokens som office-map-label bruker — varm trer frem
// som ekte gul (Ember-glow) i stedet for mørk amber, og kald hviler i
// papirets nedtonede lys. Holder vær-uttrykket i én stemme på dashboard.
const WARM_COLOR = '#FBBF24'
const COLD_COLOR = 'rgba(245, 239, 228, 0.82)'

/**
 * WeatherInline — én linje, ikon + tall (+ valgfri label). Brukes i
 * kontor-kart-footer, kunde-kart-sidepanel, og av velkomstmodus
 * når den lander.
 *
 * Designregler (fra Dashboard atmosfære TODO v2):
 *  - Ikon FØR tall, alltid horisontalt
 *  - Stroke 1.8px (avvik fra lucide default 2)
 *  - Tabular figures på temperaturen
 *  - Varmt vær (tempC ≥ 18) tegnes i Ember-glow-gult (#FBBF24) med en
 *    soft glow på ikonet — speiler office-map-label så hele dashboard-et
 *    snakker samme vær-språk. Kald faller tilbake til paper-tonet hvit.
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
  const color = warm ? WARM_COLOR : COLD_COLOR
  const wantLabel = showLabel && size !== 'sm'

  return (
    <span
      className={`inline-flex items-center ${className ?? ''}`}
      style={{ gap: dims.gapPx, color }}
      aria-label={`${label}, ${formatTemp(snap.tempC)}`}
    >
      <Icon
        size={dims.icon}
        strokeWidth={1.8}
        aria-hidden
        style={{
          flexShrink: 0,
          display: 'block',
          filter: warm ? `drop-shadow(0 0 8px ${WARM_COLOR}55)` : undefined,
        }}
      />
      <span
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
