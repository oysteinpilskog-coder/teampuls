'use client'

import { motion } from 'framer-motion'
import { useId } from 'react'
import { spring } from '@/lib/motion'

interface MapPinProps {
  /** Pin centre in viewBox coords — caller translates the <g>. */
  radius: number
  /** Primary pin hue — drives dot. */
  color: string
  /** Companion hue that paints the *outer* glow. The companion is the
   *  hero colour: it sits on top of a tight pin-coloured core so the
   *  whole halo reads as the contrast hue, not as a blurred copy of
   *  the pin. Pick something visibly distinct — magenta for green
   *  pins, teal for violet pins. */
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
  const companion = auroraCompanion ?? '#FFFFFF'
  // useId() mints a document-unique id so filter defs don't collide when
  // office + customer views share the same DOM during rotation.
  const uid = useId().replace(/:/g, '')
  const filterOuter = `mp-f-outer-${uid}`
  const filterInner = `mp-f-inner-${uid}`

  return (
    <g>
      <defs>
        <filter id={filterOuter} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="24" />
        </filter>
        <filter id={filterInner} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      {/* Primary warm core — tight, pin-coloured, below the companion so
       *  a hint of the pin colour shows through the companion's centre. */}
      <motion.circle
        r={radius * 1.4}
        fill={color}
        filter={`url(#${filterInner})`}
        initial={{ cx: 0, cy: 0, opacity: 0 }}
        animate={{
          cx: [-4, 4, -4],
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

      {/* Aurora — massive companion halo painted ON TOP of the core so
       *  the contrast hue dominates the visible glow. */}
      <motion.circle
        r={radius * 7}
        fill={companion}
        filter={`url(#${filterOuter})`}
        initial={{ cx: 0, cy: 0, opacity: 0 }}
        animate={{
          cx: [8, -8, 8],
          cy: [5, -5, 5],
          opacity: [0.8, 1, 0.8],
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
