'use client'

import { motion } from 'framer-motion'
import { spring } from '@/lib/motion'

interface MapPinProps {
  /** Pin centre in viewBox coords — caller translates the <g>. */
  radius: number
  /** Primary pin hue — drives dot, halo, and aurora. */
  color: string
  /** Optional cooler companion hue for the drifting aurora. Falls back to a
   *  white-tinted version of `color`. */
  auroraCompanion?: string
  /** Stable index so staggered entry + orbit phases don't sync across pins. */
  index: number
}

/**
 * The "premium" map pin — a glass dot with a slow ambient pulse and a drifting
 * aurora-like glow behind it. Two ellipses filled with radial gradients orbit
 * at different tempos to evoke the same "nordlys" dance seen in
 * AuroraBackground, scaled to pin size.
 *
 * We deliberately avoid CSS `mix-blend-mode: screen` inside SVG here — it
 * renders unpredictably across browsers (Safari often drops it entirely),
 * which is why the first version of this component produced invisible
 * aurora in some environments. Radial-gradient fills give the soft,
 * light-emitting feel natively without any blend trickery.
 */
export function MapPin({ radius, color, auroraCompanion, index }: MapPinProps) {
  const companion = auroraCompanion ?? '#FFFFFF'
  const rA = radius + 22
  const rB = radius + 30
  // Gradient ids must be unique across the whole document, otherwise a later
  // <defs> will shadow an earlier one (they're resolved by name at paint time).
  const idA = `mp-aurora-a-${index}`
  const idB = `mp-aurora-b-${index}`

  return (
    <g>
      <defs>
        <radialGradient id={idA}>
          <stop offset="0%" stopColor={color} stopOpacity="0.95" />
          <stop offset="45%" stopColor={color} stopOpacity="0.45" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={idB}>
          <stop offset="0%" stopColor={companion} stopOpacity="0.8" />
          <stop offset="50%" stopColor={companion} stopOpacity="0.25" />
          <stop offset="100%" stopColor={companion} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Aurora layer A — primary hue, slow horizontal drift */}
      <motion.ellipse
        rx={rA}
        ry={rA * 0.72}
        fill={`url(#${idA})`}
        initial={{ cx: 0, cy: 0, opacity: 0 }}
        animate={{
          cx: [-6, 6, -6],
          cy: [-3, 3, -3],
          opacity: [0.75, 1, 0.75],
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

      {/* Aurora layer B — companion hue, counter-rotating drift */}
      <motion.ellipse
        rx={rB * 0.88}
        ry={rB}
        fill={`url(#${idB})`}
        initial={{ cx: 0, cy: 0, opacity: 0 }}
        animate={{
          cx: [4, -4, 4],
          cy: [2, -2, 2],
          opacity: [0.55, 0.9, 0.55],
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
          opacity: [0.45, 0, 0.45],
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
