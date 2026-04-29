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

// Bounding box for the foreignObject. Smal nok til å hugge pinnen tett
// horisontalt (kontorpinnen skal alltid kjennes som «over/under navnet»),
// men bred nok til at lange sammensatte navn («Newcastle upon Tyne»,
// «Stockholm-Bromma») ikke klippes. Stablet layout — by-navn øverst, vær
// som dempet caption rett under — gir definitivt null kollisjon mellom
// navn og vær-chip.
const FO_WIDTH = 200
const FO_HEIGHT = 40

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
 * Composite city + vær label drawn as a `<foreignObject>` over the SVG
 * map. By-navn på første linje (primær), vær-ikon + grader stablet rett
 * under som dempet metadata-caption. Stable-layoutet sikrer at navn og
 * vær aldri kan kollidere visuelt, og lar boksen være smal nok til at
 * pinnen alltid kjennes som «over» navnet.
 *
 * Side-aware alignment:
 *   right pin → label flows from labelX outward (align-items: flex-start)
 *   left pin  → label flows toward labelX (align-items: flex-end)
 *   top/bot   → label centred on labelX (align-items: center)
 *
 * Implementation notes:
 *  - We use a *plain* `<foreignObject>` (not `motion.foreignObject`) and
 *    animate via a child `motion.div`. framer-motion's typed SVG variant
 *    fights the SVG `y` attribute when given a numeric `y` motion value,
 *    which silently kills the entire label render in some browsers.
 *  - Vertikal sentrering: y = labelY - FO_HEIGHT * 0.5. Boksens midte
 *    ligger på ankeret. Må holdes i sync med `verticalAnchor: 0.5` i
 *    `placeLabels`-kallet i office-map-view.tsx.
 */
export function OfficeMapLabel({
  city, lat, lng, side, labelX, labelY, index,
}: OfficeMapLabelProps) {
  const snap = useWeather(lat, lng)
  const desc = snap ? wmoToIcon(snap.code, snap.tempC) : null
  const Icon = desc?.icon
  const warm = desc?.warm ?? false

  const x =
    side === 'left'  ? labelX - FO_WIDTH :
    side === 'right' ? labelX :
    labelX - FO_WIDTH / 2
  const y = labelY - FO_HEIGHT * 0.5

  const align: 'flex-start' | 'flex-end' | 'center' =
    side === 'left'  ? 'flex-end' :
    side === 'right' ? 'flex-start' :
    'center'

  // Cold gets a paper-dim so the temperature recedes against the
  // primary city name; warm gets Ember-glow at full intensity — the
  // only accent allowed to bloom out of the labels.
  const weatherColor = warm ? '#FBBF24' : 'rgba(245, 239, 228, 0.82)'
  const iconShadow = warm ? `0 0 8px ${weatherColor}55` : 'none'

  return (
    <foreignObject
      x={x}
      y={y}
      width={FO_WIDTH}
      height={FO_HEIGHT}
    >
      <motion.div
        initial={{ opacity: 0, transform: 'translateY(6px)' }}
        animate={{ opacity: 1, transform: 'translateY(0px)' }}
        transition={{ ...spring.gentle, delay: 0.55 + index * 0.08 }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: align,
          justifyContent: 'center',
          gap: 3,
          width: '100%',
          height: '100%',
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
              gap: 4,
              color: weatherColor,
              fontFamily: 'var(--font-manrope), system-ui, sans-serif',
              fontWeight: 500,
              fontSize: 12,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.005em',
              textShadow: META_HALO,
              opacity: warm ? 1 : 0.95,
            }}
          >
            <Icon
              size={13}
              strokeWidth={1.8}
              aria-hidden
              style={{
                filter: warm ? `drop-shadow(${iconShadow})` : undefined,
                flexShrink: 0,
                display: 'block',
              }}
            />
            <span>{formatTemp(snap.tempC)}</span>
          </span>
        )}
      </motion.div>
    </foreignObject>
  )
}
