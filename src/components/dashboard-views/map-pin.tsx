'use client'

import { motion } from 'framer-motion'
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
 * The "premium" map pin — a glass dot with a multi-layer aurora glow.
 *
 * Earlier iterations tried SVG `<radialGradient>` fills and `mix-blend-mode:
 * screen`. Both had cross-browser rendering quirks that sometimes left the
 * aurora completely invisible. This version goes back to basics: solid
 * colored circles with CSS `filter: blur()` (the same technique the global
 * AuroraBackground uses), animated in position and opacity to drift like
 * northern lights. `filter: blur()` on SVG elements is universally supported
 * and composes predictably with framer-motion transforms.
 */
export function MapPin({ radius, color, auroraCompanion, index }: MapPinProps) {
  const companion = auroraCompanion ?? '#FFFFFF'

  // Layer sizes chosen so the aurora reads as a halo even when neighbouring
  // pins are ~80 px apart on the dashboard map.
  const rOuter = radius * 3.8
  const rInner = radius * 2.6
  const rCore  = radius + 6

  return (
    <g>
      {/* Outer soft blob — companion hue, widest reach, slow drift */}
      <motion.circle
        r={rOuter}
        fill={companion}
        initial={{ cx: 0, cy: 0, opacity: 0 }}
        animate={{
          cx: [7, -7, 7],
          cy: [4, -4, 4],
          opacity: [0.26, 0.42, 0.26],
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
        style={{ filter: 'blur(14px)' }}
      />

      {/* Middle blob — primary hue, counter-drift */}
      <motion.circle
        r={rInner}
        fill={color}
        initial={{ cx: 0, cy: 0, opacity: 0 }}
        animate={{
          cx: [-5, 5, -5],
          cy: [-3, 3, -3],
          opacity: [0.48, 0.72, 0.48],
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
        style={{ filter: 'blur(11px)' }}
      />

      {/* Tight corona — hugs the dot, breathes gently */}
      <motion.circle
        r={rCore}
        fill={color}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0.55, 0.75, 0.55] }}
        transition={{
          duration: 3.4 + (index % 3) * 0.5,
          delay: (index % 5) * 0.3,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        style={{ filter: 'blur(5px)' }}
      />

      {/* Crisp expanding ring — the "heartbeat" */}
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
