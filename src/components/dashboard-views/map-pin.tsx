'use client'

import { motion } from 'framer-motion'
import { useId } from 'react'
import { spring } from '@/lib/motion'

interface MapPinProps {
  /** Pin centre in viewBox coords — caller translates the <g>. */
  radius: number
  /** Primary pin hue — drives dot and primary aurora layer. */
  color: string
  /** Companion hue for the second aurora layer. Pick something that contrasts
   *  the primary — cool blue for a warm pin, warm pink for a cool pin — so
   *  the two ellipses read as *two* lights, not one. */
  auroraCompanion?: string
  /** Stable index so orbit phases don't sync across pins. */
  index: number
}

/**
 * The "premium" map pin — a glass dot with two drifting aurora ellipses
 * behind it. The aurora uses radial-gradient fills (not blend modes) so it
 * renders predictably across browsers; every stop carries its own
 * stop-opacity, which Safari respects even when it drops `mix-blend-mode`.
 *
 * Gradient ids come from React's `useId()`. Collisions with other MapPins
 * (or between the office and customer views rotating through the same DOM)
 * used to make gradients silently disappear — useId guarantees uniqueness.
 */
export function MapPin({ radius, color, auroraCompanion, index }: MapPinProps) {
  const companion = auroraCompanion ?? '#FFFFFF'
  const uid = useId()
  const idA = `mp-a${uid.replace(/:/g, '')}`
  const idB = `mp-b${uid.replace(/:/g, '')}`

  // Aurora ellipses are ~3–4× the pin radius so the glow reads as a halo of
  // light around a bright core, not a second dot.
  const rA = radius * 3.2 + 6
  const rB = radius * 4.0 + 8

  return (
    <g>
      <defs>
        <radialGradient id={idA}>
          <stop offset="0%"   stopColor={color}     stopOpacity="1" />
          <stop offset="35%"  stopColor={color}     stopOpacity="0.6" />
          <stop offset="70%"  stopColor={color}     stopOpacity="0.18" />
          <stop offset="100%" stopColor={color}     stopOpacity="0" />
        </radialGradient>
        <radialGradient id={idB}>
          <stop offset="0%"   stopColor={companion} stopOpacity="0.95" />
          <stop offset="40%"  stopColor={companion} stopOpacity="0.42" />
          <stop offset="75%"  stopColor={companion} stopOpacity="0.1" />
          <stop offset="100%" stopColor={companion} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Aurora layer A — primary hue, slow drift, wide reach */}
      <motion.ellipse
        rx={rA}
        ry={rA * 0.72}
        fill={`url(#${idA})`}
        initial={{ cx: 0, cy: 0, opacity: 0 }}
        animate={{
          cx: [-8, 8, -8],
          cy: [-4, 4, -4],
          opacity: [0.85, 1, 0.85],
          rx: [rA, rA + 8, rA],
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
          rx: {
            duration: 8 + (index % 3) * 1.2,
            delay: (index % 4) * 0.4,
            repeat: Infinity,
            ease: 'easeInOut',
          },
        }}
      />

      {/* Aurora layer B — companion hue, counter-drift, taller */}
      <motion.ellipse
        rx={rB * 0.85}
        ry={rB}
        fill={`url(#${idB})`}
        initial={{ cx: 0, cy: 0, opacity: 0 }}
        animate={{
          cx: [5, -5, 5],
          cy: [3, -3, 3],
          opacity: [0.7, 0.95, 0.7],
          ry: [rB, rB + 6, rB],
        }}
        transition={{
          cx: {
            duration: 11 + (index % 3) * 1.7,
            delay: (index % 5) * 0.5 + 1.5,
            repeat: Infinity,
            ease: 'easeInOut',
          },
          cy: {
            duration: 9 + (index % 4) * 1.4,
            delay: (index % 5) * 0.6 + 0.8,
            repeat: Infinity,
            ease: 'easeInOut',
          },
          opacity: {
            duration: 6 + (index % 4) * 1.1,
            delay: (index % 5) * 0.4 + 1.2,
            repeat: Infinity,
            ease: 'easeInOut',
          },
          ry: {
            duration: 10 + (index % 3) * 1.6,
            delay: (index % 4) * 0.5 + 0.6,
            repeat: Infinity,
            ease: 'easeInOut',
          },
        }}
      />

      {/* Crisp expanding ring — the "heartbeat" */}
      <motion.circle
        r={radius + 4}
        fill="none"
        stroke={color}
        strokeWidth={1.2}
        animate={{
          r: [radius + 4, radius + 26, radius + 4],
          opacity: [0.5, 0, 0.5],
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
        style={{
          filter: `drop-shadow(0 0 14px ${color}) drop-shadow(0 2px 4px rgba(0,0,0,0.4))`,
        }}
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
