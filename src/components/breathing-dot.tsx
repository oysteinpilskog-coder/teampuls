'use client'

import { motion, useReducedMotion } from 'framer-motion'

interface BreathingDotProps {
  /** Solid colour of the dot. Pass a CSS variable like `var(--accent-color)`
   *  for theme-aware behaviour, a status hex from `useStatusColors()`, or
   *  any other CSS colour. */
  color: string
  /** Pixel size of the dot — diameter, not radius. Default 6 (matches the
   *  Tailwind `w-1.5 h-1.5` width that earlier inline copies all used). */
  size?: number
  /** Animation period in seconds. The full cycle (1 → 0.35 → 1 opacity,
   *  1 → 1.25 → 1 scale) plays once per period. Default 2.4s — matches
   *  the dashboard "live" pulse the design system established. */
  duration?: number
}

/**
 * Tiny pulsing dot — the "live" / "current" / "in-progress" indicator
 * that sits next to status pills, week-labels and dashboard headers.
 *
 * Earlier this exact `<motion.span>` was duplicated inline across at
 * least four files (dashboard-client, today-view, office-map-view,
 * customer-map-view). One component now owns the timing, the
 * reduced-motion contract, and the visual baseline so future tweaks
 * land everywhere at once.
 *
 * Behaviour:
 * - Default: opacity + scale loop on `easeInOut`, infinite, 2.4s.
 * - `prefers-reduced-motion: reduce`: no animation, dot rests solid.
 *   We don't fade-out the dot since "presence" is the signal.
 */
export function BreathingDot({
  color,
  size = 6,
  duration = 2.4,
}: BreathingDotProps) {
  const reduce = useReducedMotion()
  return (
    <motion.span
      aria-hidden
      className="rounded-full inline-block"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        flexShrink: 0,
      }}
      animate={reduce ? undefined : { opacity: [1, 0.35, 1], scale: [1, 1.25, 1] }}
      transition={reduce ? undefined : { duration, repeat: Infinity, ease: 'easeInOut' }}
    />
  )
}
