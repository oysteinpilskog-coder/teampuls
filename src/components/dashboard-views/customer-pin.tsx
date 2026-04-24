'use client'

import { motion } from 'framer-motion'
import { useId } from 'react'

export type CustomerPinState = 'idle' | 'week' | 'today'

interface CustomerPinProps {
  /** Primary hue — inherits from STATUS_COLORS.customer. */
  color: string
  /** Optional override for the breathing aura halo ("Nordlys"). When
   *  omitted the halo tints with the same hue as the pin — i.e. the
   *  pre-override behaviour. */
  auroraCompanion?: string
  /** Stable index so animations desynchronise across pins. */
  index: number
  /** Visit state drives the subtle intensity tiers:
   *   - idle:  registered, no visits this week
   *   - week:  someone visited this week (but not today)
   *   - today: someone is out at the customer right now
   */
  state: CustomerPinState
}

/**
 * A single pin design for the customer map that quietly shifts between
 * three intensity tiers. Replaces the aurora+heartbeat MapPin — the user
 * asked for a lighter touch so the map reads as one calm constellation
 * instead of a wall of competing beacons.
 *
 * All three states share the same DNA (crystal dot, hairline ring, soft
 * breath) so the eye groups them as "customers". What changes is the
 * brightness and whether a subtle single-pulse ring appears.
 */
export function CustomerPin({ color, auroraCompanion, index, state }: CustomerPinProps) {
  const uid = useId().replace(/:/g, '')
  const filterId = `cp-blur-${uid}`
  const auraColor = auroraCompanion ?? color

  // Tier-specific tunables. Kept in a local const so the JSX stays legible.
  const visited = state !== 'idle'
  const radius = visited ? 4 : 3.2
  const auraRadius = visited ? radius * 3.6 : radius * 3.2
  const auraOpacityRange =
    state === 'today'
      ? [0.32, 0.6]
      : state === 'week'
        ? [0.22, 0.42]
        : [0.12, 0.28]
  const dotOpacity = state === 'today' ? 1 : state === 'week' ? 0.95 : 0.8
  const ringOpacity = state === 'today' ? 0.55 : state === 'week' ? 0.42 : 0.32

  // Breath desync — co-primes so rows of pins never strobe together.
  const breathDur = 5.6 + (index % 5) * 0.9
  const breathDelay = (index % 7) * 0.45

  // Visited pins get a gentle single-pulse ring — much softer than the
  // MapPin heartbeat. Duration stretches with state so "today" feels a
  // touch more alive than "week" without shouting.
  const pulseDur = state === 'today' ? 3.8 : 5.2

  return (
    <g>
      <defs>
        <filter id={filterId} x="-150%" y="-150%" width="400%" height="400%">
          <feGaussianBlur stdDeviation={visited ? 5.5 : 5} />
        </filter>
      </defs>

      {/* Breathing aura */}
      <motion.circle
        r={auraRadius}
        fill={auraColor}
        filter={`url(#${filterId})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: auraOpacityRange }}
        transition={{
          duration: breathDur,
          delay: breathDelay,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Visited: gentle single-pulse ring. Subtle — one soft wave, not a
       *  heartbeat. Only rendered for week/today so idle stays completely
       *  still. */}
      {visited && (
        <motion.circle
          r={radius + 3}
          fill="none"
          stroke={color}
          strokeWidth={0.9}
          animate={{
            r: [radius + 3, radius + 14, radius + 3],
            opacity: [ringOpacity, 0, ringOpacity],
          }}
          transition={{
            duration: pulseDur,
            delay: (index % 6) * 0.4,
            repeat: Infinity,
            ease: 'easeOut',
          }}
        />
      )}

      {/* Hairline outer ring — gives the pin a crisp perimeter. */}
      <circle
        r={radius + 2.2}
        fill="none"
        stroke={color}
        strokeWidth={0.6}
        opacity={visited ? 0.45 : 0.32}
      />

      {/* Crystal dot */}
      <motion.circle
        r={radius}
        fill={color}
        stroke="rgba(255,255,255,0.6)"
        strokeWidth={0.55}
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: dotOpacity, scale: 1 }}
        transition={{
          duration: 0.55,
          delay: 0.28 + (index % 10) * 0.04,
          ease: [0.4, 0, 0.2, 1],
        }}
      />

      {/* Glass highlight */}
      <circle
        r={radius * 0.45}
        cx={-radius * 0.2}
        cy={-radius * 0.28}
        fill="white"
        opacity={0.45}
      />
    </g>
  )
}
