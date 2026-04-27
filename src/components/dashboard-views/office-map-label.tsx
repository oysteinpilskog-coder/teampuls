'use client'

import { motion } from 'framer-motion'
import { spring } from '@/lib/motion'
import type { LabelSide } from '@/lib/map-labels'
import { useWeather } from '@/lib/weather/use-weather'
import { wmoToIcon } from '@/lib/weather/wmo-to-icon'
import { formatTemp } from '@/lib/weather/format-temp'

interface OfficeMapLabelProps {
  city: string
  lat: number
  lng: number
  /** Anchor side from `placeLabels`. Drives horizontal alignment. */
  side: LabelSide
  /** Anchor (x,y) in SVG coords — same as the old `<text x y>`. */
  labelX: number
  labelY: number
  /** Stagger index for the entrance animation. */
  index: number
}

// Bounding box for the foreignObject. Generous so long compound names
// (Newcastle upon Tyne) still fit without horizontal clipping. The
// content itself is flex-aligned to the correct side, so unused space
// at either end is invisible.
const FO_WIDTH = 320
const FO_HEIGHT = 32

// Halo: emulates the SVG `paint-order: stroke fill` we used on the old
// <text> so the label remains legible over both ocean and landmass at
// any pin density. Eight-direction shadow + a soft blur gives the same
// "embossed in dark glass" feel without dropping into SVG primitives.
const NAME_HALO =
  '-1px -1px 0 rgba(2,4,10,0.85), 1px -1px 0 rgba(2,4,10,0.85), ' +
  '-1px 1px 0 rgba(2,4,10,0.85), 1px 1px 0 rgba(2,4,10,0.85), ' +
  '0 0 6px rgba(2,4,10,0.6)'

const META_HALO =
  '-1px -1px 0 rgba(2,4,10,0.7), 1px -1px 0 rgba(2,4,10,0.7), ' +
  '-1px 1px 0 rgba(2,4,10,0.7), 1px 1px 0 rgba(2,4,10,0.7)'

/**
 * Composite city + vær label, drawn as a `<foreignObject>` over the
 * SVG map so we can mix Sora display type with the existing
 * lucide-react WeatherInline icons. The label is treated as one
 * cohesive unit — name primary, weather as recessive metadata
 * separated by a hairline middle-dot.
 *
 * Side-aware alignment matches the SVG `text-anchor` semantics:
 *   right pin → label flows from labelX outward (justify-start)
 *   left pin  → label flows toward labelX (justify-end)
 *   top/bot   → label centred on labelX (justify-center)
 */
export function OfficeMapLabel({
  city, lat, lng, side, labelX, labelY, index,
}: OfficeMapLabelProps) {
  const snap = useWeather(lat, lng)
  const desc = snap ? wmoToIcon(snap.code, snap.tempC) : null
  const Icon = desc?.icon
  const warm = desc?.warm ?? false

  // Vertical centring of the foreignObject around the original baseline.
  // The old <text> sat at `labelY` as its alphabetic baseline; the box
  // is centred ~9px above and below to keep the visual middle aligned
  // with the previous design.
  const x =
    side === 'left'  ? labelX - FO_WIDTH :
    side === 'right' ? labelX :
    labelX - FO_WIDTH / 2
  const y = labelY - FO_HEIGHT * 0.62

  const justify: 'flex-start' | 'flex-end' | 'center' =
    side === 'left'  ? 'flex-end' :
    side === 'right' ? 'flex-start' :
    'center'

  // Cold gets a paper-dim so the temperature recedes against the
  // primary city name; warm gets Ember at full intensity — the only
  // accent allowed to bloom out of the labels.
  const weatherColor = warm ? '#FBBF24' : 'rgba(245, 239, 228, 0.78)'
  // Cooler glow for warm Ember; transparent halo for cold so it
  // disappears into the map ink instead of competing with the name.
  const iconShadow = warm
    ? `0 0 8px ${weatherColor}55`
    : 'none'

  return (
    <motion.foreignObject
      x={x}
      y={y}
      width={FO_WIDTH}
      height={FO_HEIGHT}
      initial={{ opacity: 0, y: y + 6 }}
      animate={{ opacity: 1, y }}
      transition={{ ...spring.gentle, delay: 0.55 + index * 0.08 }}
      style={{ overflow: 'visible' }}
    >
      <div
        // xmlns is required for foreignObject children in some renderers
        // (Safari historically) — keeps the HTML tree well-formed.
        // @ts-expect-error: xmlns is not part of div's type but is valid SVG-HTML interop
        xmlns="http://www.w3.org/1999/xhtml"
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          width: '100%',
          height: '100%',
          justifyContent: justify,
          fontFamily: 'var(--font-sora), "Iowan Old Style", Georgia, serif',
          letterSpacing: '0.3px',
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}
      >
        <span
          style={{
            fontSize: 17,
            fontWeight: 600,
            color: 'white',
            textShadow: NAME_HALO,
          }}
        >
          {city}
        </span>

        {snap && Icon && (
          <span
            aria-label={`${desc?.label}, ${formatTemp(snap.tempC)}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              color: weatherColor,
              fontFamily: 'var(--font-manrope), system-ui, sans-serif',
              fontWeight: 500,
              fontSize: 13,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.005em',
              textShadow: META_HALO,
              opacity: warm ? 1 : 0.92,
            }}
          >
            <span
              aria-hidden
              style={{
                color: 'rgba(245, 239, 228, 0.32)',
                fontWeight: 400,
                marginRight: 1,
                textShadow: META_HALO,
              }}
            >
              ·
            </span>
            <Icon
              size={13}
              strokeWidth={1.8}
              aria-hidden
              style={{
                filter: warm ? `drop-shadow(${iconShadow})` : undefined,
                flexShrink: 0,
              }}
            />
            <span>{formatTemp(snap.tempC)}</span>
          </span>
        )}
      </div>
    </motion.foreignObject>
  )
}
