'use client'

import { motion } from 'framer-motion'
import { useId } from 'react'

interface GhostPinProps {
  /** Base dot radius. The aurora breath scales against this. */
  radius?: number
  /** Primary hue — inherits from STATUS_COLORS.customer so the whole map reads
   *  as one palette. */
  color: string
  /** Stable index so breath cycles desynchronise across pins. */
  index: number
}

/**
 * A quieter sibling of MapPin for customers that are *registered* but have
 * no visits on the current board. The visual goal: present on the map —
 * "this is our footprint" — without competing with the live heartbeat pins
 * that show where the team actually is this week.
 *
 * Construction:
 *   • A single soft colour-breath (low-amplitude opacity pulse, no heartbeat)
 *   • A tiny crystal dot with a hairline stroke
 *   • No label — at 12+ customers the map would become a word cloud.
 *     Unvisited names are listed in the side panel instead.
 */
export function GhostPin({ radius = 3.2, color, index }: GhostPinProps) {
  const uid = useId().replace(/:/g, '')
  const filterId = `gp-blur-${uid}`

  // Desync — co-primes with MapPin durations so ghost + active pins never
  // line up into a single collective pulse.
  const breathDur = 5.6 + (index % 5) * 0.9
  const breathDelay = (index % 7) * 0.45

  return (
    <g>
      <defs>
        <filter id={filterId} x="-150%" y="-150%" width="400%" height="400%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>

      {/* Breathing aura — low opacity colour wash */}
      <motion.circle
        r={radius * 3.2}
        fill={color}
        filter={`url(#${filterId})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0.12, 0.28, 0.12] }}
        transition={{
          duration: breathDur,
          delay: breathDelay,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Hairline outer ring — barely-there structure so the eye sees
       *  "a point" rather than a fuzzy blob. */}
      <circle
        r={radius + 2.4}
        fill="none"
        stroke={color}
        strokeWidth={0.6}
        opacity={0.35}
      />

      {/* Crystal dot */}
      <motion.circle
        r={radius}
        fill={color}
        stroke="rgba(255,255,255,0.55)"
        strokeWidth={0.5}
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 0.82, scale: 1 }}
        transition={{
          duration: 0.6,
          delay: 0.3 + (index % 10) * 0.04,
          ease: [0.4, 0, 0.2, 1],
        }}
      />

      {/* Subtle glass highlight */}
      <circle
        r={radius * 0.45}
        cx={-radius * 0.2}
        cy={-radius * 0.25}
        fill="white"
        opacity={0.45}
      />
    </g>
  )
}
