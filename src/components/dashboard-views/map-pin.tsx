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
 * aurora-like glow behind it. Two blurred ellipses orbit at different tempos
 * to create the "nordlys" dance seen in AuroraBackground, scaled down to pin
 * size. Shared between OfficeMapView and CustomerMapView so they feel like
 * the same product.
 */
export function MapPin({ radius, color, auroraCompanion, index }: MapPinProps) {
  const companion = auroraCompanion ?? 'rgba(255,255,255,0.85)'
  const r0 = radius + 18
  const r1 = radius + 26

  return (
    <g>
      {/* Aurora layer A — primary hue, slow horizontal drift */}
      <motion.ellipse
        rx={r0}
        ry={r0 * 0.72}
        fill={color}
        opacity={0.55}
        initial={{ cx: 0, cy: 0 }}
        animate={{
          cx: [-4, 4, -4],
          cy: [-2, 2, -2],
          opacity: [0.42, 0.62, 0.42],
          rx: [r0, r0 + 6, r0],
        }}
        transition={{
          duration: 9 + (index % 4) * 1.4,
          delay: (index % 5) * 0.8,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        style={{
          filter: 'blur(16px)',
          mixBlendMode: 'screen',
        }}
      />

      {/* Aurora layer B — companion hue, counter-rotating drift */}
      <motion.ellipse
        rx={r1 * 0.85}
        ry={r1}
        fill={companion}
        opacity={0.28}
        initial={{ cx: 0, cy: 0 }}
        animate={{
          cx: [3, -3, 3],
          cy: [2, -2, 2],
          opacity: [0.18, 0.34, 0.18],
          ry: [r1, r1 + 5, r1],
        }}
        transition={{
          duration: 11 + (index % 3) * 1.7,
          delay: (index % 5) * 0.5 + 1.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        style={{
          filter: 'blur(20px)',
          mixBlendMode: 'screen',
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
        stroke="rgba(255,255,255,0.55)"
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
        style={{ filter: 'blur(1.2px)' }}
      />
    </g>
  )
}
