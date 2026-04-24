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
 * Three prior attempts failed to produce a visible glow:
 *   1. `mix-blend-mode: screen` — Safari drops it.
 *   2. `<radialGradient>` fills — silent failure on id collisions and
 *      opacity animation quirks under framer-motion.
 *   3. CSS `filter: blur()` on SVG circles — the browser's default
 *      filter region clips the blur at ~10 % past the element bbox,
 *      so a 14 px blur on a 42-px radius disc comes out almost flat.
 *
 * This version avoids all three by faking the soft falloff with five
 * concentric circles at graduated opacity — plain <circle> elements,
 * no filter, no blend mode, no gradient. It renders identically in
 * every browser. Two nested <g> wrappers (companion and primary)
 * drift on opposite tempos so the composite shimmers like northern
 * lights rather than breathing as a single disc.
 */
export function MapPin({ radius, color, auroraCompanion, index }: MapPinProps) {
  const companion = auroraCompanion ?? '#FFFFFF'

  return (
    <g>
      {/* ─── Companion halo — wide, cool, slow drift ─── */}
      <motion.g
        initial={{ opacity: 0 }}
        animate={{
          opacity: [0.75, 1, 0.75],
          x: [6, -6, 6],
          y: [4, -4, 4],
        }}
        transition={{
          opacity: {
            duration: 6 + (index % 4) * 1.1,
            delay: (index % 5) * 0.4 + 1.0,
            repeat: Infinity,
            ease: 'easeInOut',
          },
          x: {
            duration: 11 + (index % 3) * 1.7,
            delay: (index % 5) * 0.5 + 1.2,
            repeat: Infinity,
            ease: 'easeInOut',
          },
          y: {
            duration: 9 + (index % 4) * 1.4,
            delay: (index % 5) * 0.6 + 0.6,
            repeat: Infinity,
            ease: 'easeInOut',
          },
        }}
      >
        <circle r={radius * 7.5} fill={companion} opacity={0.05} />
        <circle r={radius * 6.0} fill={companion} opacity={0.09} />
        <circle r={radius * 4.5} fill={companion} opacity={0.16} />
        <circle r={radius * 3.2} fill={companion} opacity={0.26} />
      </motion.g>

      {/* ─── Primary halo — tighter, hotter, counter-drift ─── */}
      <motion.g
        initial={{ opacity: 0 }}
        animate={{
          opacity: [0.8, 1, 0.8],
          x: [-5, 5, -5],
          y: [-3, 3, -3],
        }}
        transition={{
          opacity: {
            duration: 5 + (index % 3) * 1.3,
            delay: (index % 4) * 0.3,
            repeat: Infinity,
            ease: 'easeInOut',
          },
          x: {
            duration: 9 + (index % 4) * 1.4,
            delay: (index % 5) * 0.8,
            repeat: Infinity,
            ease: 'easeInOut',
          },
          y: {
            duration: 7 + (index % 3) * 1.2,
            delay: (index % 5) * 0.4,
            repeat: Infinity,
            ease: 'easeInOut',
          },
        }}
      >
        <circle r={radius * 5.0} fill={color} opacity={0.08} />
        <circle r={radius * 4.0} fill={color} opacity={0.15} />
        <circle r={radius * 3.0} fill={color} opacity={0.26} />
        <circle r={radius * 2.2} fill={color} opacity={0.42} />
        <circle r={radius * 1.6} fill={color} opacity={0.60} />
      </motion.g>

      {/* ─── Crisp expanding ring — heartbeat ─── */}
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

      {/* ─── Dot base ─── */}
      <motion.circle
        r={radius}
        fill={color}
        stroke="rgba(255,255,255,0.6)"
        strokeWidth={0.8}
        initial={{ r: 0, opacity: 0 }}
        animate={{ r: radius, opacity: 1 }}
        transition={{ ...spring.gentle, delay: 0.35 + index * 0.06 }}
      />

      {/* ─── Glass highlight ─── */}
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
