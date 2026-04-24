'use client'

import { motion } from 'framer-motion'
import { useId } from 'react'
import { spring } from '@/lib/motion'
import { complement } from '@/lib/color'

interface MapPinProps {
  /** Pin centre in viewBox coords — caller translates the <g>. */
  radius: number
  /** Primary pin hue — drives dot. The outer aurora glow is auto-derived
   *  as the 180° colour-wheel complement so the two hues always read as
   *  two distinct lights (classic aurora: green ↔ magenta, violet ↔ lime).
   *  Override via `auroraCompanion` if the automatic choice clashes with
   *  other accents on the canvas. */
  color: string
  /** Explicit companion hue override. Pass only when the automatic
   *  complement is wrong for the surrounding palette. */
  auroraCompanion?: string
  /** Stable index so orbit phases don't sync across pins. */
  index: number
}

/**
 * The "premium" map pin — a glass dot with a bold aurora glow.
 *
 * Earlier iterations placed a small pin-coloured halo ON TOP of a wider
 * companion-coloured halo, intending the outer rim to read as the
 * companion. But the primary halo's blur feathered the pin colour over
 * most of the visible glow region, leaving only a faint companion tint
 * at the very edge — users reported the aurora looked "just green".
 *
 * This version inverts the stack: a massive companion halo (7× pin
 * radius) is painted *on top of* a tight pin-coloured core. The outer
 * 70 % of the glow is unambiguously the companion hue, and the pin-
 * coloured core still shows through inside the companion's tighter
 * bright centre.
 *
 * Uses explicit SVG <filter> elements with feGaussianBlur (not CSS
 * `filter: blur()`) so the blur's filter region isn't clipped at the
 * element bounding box.
 */
export function MapPin({ radius, color, auroraCompanion, index }: MapPinProps) {
  const companion = auroraCompanion ?? complement(color)
  // useId() mints a document-unique id so filter defs don't collide when
  // office + customer views share the same DOM during rotation.
  const uid = useId().replace(/:/g, '')
  const filterOuter = `mp-f-outer-${uid}`
  const filterInner = `mp-f-inner-${uid}`

  return (
    <g>
      <defs>
        <filter id={filterOuter} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="11" />
        </filter>
        <filter id={filterInner} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* Primary warm core — tight, pin-coloured, below the companion so
       *  a hint of the pin colour shows through the companion's centre. */}
      <motion.circle
        r={radius * 1.2}
        fill={color}
        filter={`url(#${filterInner})`}
        initial={{ cx: 0, cy: 0, opacity: 0 }}
        animate={{
          cx: [-3, 3, -3],
          cy: [-2, 2, -2],
          opacity: [0.5, 0.75, 0.5],
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

      {/* Aurora — companion halo painted ON TOP of the core. Kept tight
       *  (~radius × 2.4 with blur ~11) so the glow hugs the heartbeat ring
       *  instead of washing over the surrounding cities. */}
      <motion.circle
        r={radius * 2.4}
        fill={companion}
        filter={`url(#${filterOuter})`}
        initial={{ cx: 0, cy: 0, opacity: 0 }}
        animate={{
          cx: [3, -3, 3],
          cy: [2, -2, 2],
          opacity: [0.7, 0.92, 0.7],
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
        stroke="rgba(255,255,255,0.7)"
        strokeWidth={0.9}
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
        opacity={0.48}
      />
    </g>
  )
}
