'use client'

import { motion } from 'framer-motion'
import { useId } from 'react'
import { spring } from '@/lib/motion'

interface MapPinProps {
  /** Pin centre in viewBox coords — caller translates the <g>. */
  radius: number
  /** Primary pin hue — drives dot and primary aurora layer. */
  color: string
  /** Companion hue for the second aurora layer. Pick something that
   *  contrasts the primary — cool blue for a warm pin, warm pink for a
   *  cool pin — so the two read as *two* lights. */
  auroraCompanion?: string
  /** Stable index so orbit phases don't sync across pins. */
  index: number
}

/**
 * The "premium" map pin — a glass dot with a soft aurora glow.
 *
 * Uses explicit SVG <filter> elements with feGaussianBlur, NOT CSS
 * `filter: blur()`. The CSS property is convenient but the browser
 * wraps it in a default filter region of ~(-10%, -10%, 120%, 120%),
 * which clips anything the blur spills past — on a small circle a
 * 16 px blur gets mostly cut off. An explicit <filter> with an
 * oversized region (300 %) lets the blur fall off naturally instead
 * of slamming into a bounding box, which is what produced the visible
 * bullseye rings in the prior "stacked opacity circles" attempt.
 *
 * Two blurred circles drift at different tempos to mimic the same
 * nordlys dance the dashboard's AuroraBackground uses.
 */
export function MapPin({ radius, color, auroraCompanion, index }: MapPinProps) {
  const companion = auroraCompanion ?? '#FFFFFF'
  // useId() generates a document-unique id so two MapPins never reference
  // the same <filter> definition (earlier versions collided between the
  // office and customer views rotating through the same DOM).
  const uid = useId().replace(/:/g, '')
  const filterA = `mp-blur-a-${uid}`
  const filterB = `mp-blur-b-${uid}`

  return (
    <g>
      <defs>
        <filter id={filterA} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="18" />
        </filter>
        <filter id={filterB} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="11" />
        </filter>
      </defs>

      {/* Companion halo — wide, dominant at the rim so the pin reads as
       *  *two* colors. Sized larger than the primary halo below so the
       *  outermost glow is clearly the contrast hue, not just a blurred
       *  copy of the pin. */}
      <motion.circle
        r={radius * 4}
        fill={companion}
        filter={`url(#${filterA})`}
        initial={{ cx: 0, cy: 0, opacity: 0 }}
        animate={{
          cx: [7, -7, 7],
          cy: [4, -4, 4],
          opacity: [0.7, 0.95, 0.7],
        }}
        transition={{
          cx: {
            duration: 11 + (index % 3) * 1.7,
            delay: (index % 5) * 0.5 + 1.2,
            repeat: Infinity,
            ease: 'easeInOut',
          },
          cy: {
            duration: 9 + (index % 4) * 1.4,
            delay: (index % 5) * 0.6 + 0.6,
            repeat: Infinity,
            ease: 'easeInOut',
          },
          opacity: {
            duration: 6 + (index % 4) * 1.1,
            delay: (index % 5) * 0.4 + 1.0,
            repeat: Infinity,
            ease: 'easeInOut',
          },
        }}
      />

      {/* Primary halo — kept tight so the outer rim belongs to the
       *  companion. A smaller pin-coloured core means the two hues
       *  read as a gradient from pin → companion outwards. */}
      <motion.circle
        r={radius * 1.6}
        fill={color}
        filter={`url(#${filterB})`}
        initial={{ cx: 0, cy: 0, opacity: 0 }}
        animate={{
          cx: [-5, 5, -5],
          cy: [-3, 3, -3],
          opacity: [0.55, 0.8, 0.55],
        }}
        transition={{
          cx: {
            duration: 9 + (index % 4) * 1.4,
            delay: (index % 5) * 0.8,
            repeat: Infinity,
            ease: 'easeInOut',
          },
          cy: {
            duration: 7 + (index % 3) * 1.2,
            delay: (index % 5) * 0.4,
            repeat: Infinity,
            ease: 'easeInOut',
          },
          opacity: {
            duration: 5 + (index % 3) * 1.3,
            delay: (index % 4) * 0.3,
            repeat: Infinity,
            ease: 'easeInOut',
          },
        }}
      />

      {/* Crisp expanding ring — heartbeat */}
      <motion.circle
        r={radius + 4}
        fill="none"
        stroke={color}
        strokeWidth={1.2}
        animate={{
          r: [radius + 4, radius + 26, radius + 4],
          opacity: [0.55, 0, 0.55],
        }}
        transition={{
          duration: 4.2,
          delay: (index % 5) * 0.6,
          repeat: Infinity,
          ease: 'easeOut',
        }}
      />

      {/* Dot base */}
      <motion.circle
        r={radius}
        fill={color}
        stroke="rgba(255,255,255,0.6)"
        strokeWidth={0.8}
        initial={{ r: 0, opacity: 0 }}
        animate={{ r: radius, opacity: 1 }}
        transition={{ ...spring.gentle, delay: 0.35 + index * 0.06 }}
      />

      {/* Glass highlight */}
      <circle
        r={radius * 0.55}
        cx={-radius * 0.22}
        cy={-radius * 0.28}
        fill="white"
        opacity={0.42}
      />
    </g>
  )
}
