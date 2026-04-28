'use client'

import { motion, useReducedMotion } from 'framer-motion'
import type { Entry, EntryStatus } from '@/lib/supabase/types'
import { useStatusColors } from '@/lib/status-colors/context'
import { useDocumentVisibility } from '@/hooks/use-document-visibility'
import type { DayPhase } from '@/lib/dates'

interface AuroraBackgroundProps {
  entries: Entry[]
  /** Time-of-day phase. Drives base-gradient warmth and how loud the
   *  drifting lights breathe. Default 'day' so callers without a clock
   *  still render correctly. */
  phase?: DayPhase
}

/**
 * Per-phase tonal recipe. Kept inline so the gradients are co-located with
 * the layer they're applied to and easy to tweak by eye.
 *
 * `base` is the deep backdrop ellipse. `light` scales each colored orbit's
 * opacity. `breath` scales the central accent orb. None of the values dim
 * the screen below readability — the screen never goes "off".
 */
const PHASE_TONES: Record<DayPhase, {
  base: string
  light: number
  breath: { min: number; max: number; scale: number }
  vignette: number
}> = {
  morning: {
    // Cool first-coffee blue — like dawn through a window.
    base: 'radial-gradient(ellipse at 50% -10%, #11141C 0%, #08090F 55%, #04050A 100%)',
    light: 0.95,
    breath: { min: 0.10, max: 0.20, scale: 1.06 },
    vignette: 0.45,
  },
  day: {
    // Default tone — the original recipe.
    base: 'radial-gradient(ellipse at 50% -10%, #121216 0%, #09090B 55%, #050507 100%)',
    light: 1.00,
    breath: { min: 0.12, max: 0.22, scale: 1.08 },
    vignette: 0.45,
  },
  evening: {
    // Warm bronze undertone — the room itself takes on golden-hour cast.
    base: 'radial-gradient(ellipse at 50% -10%, #1A1310 0%, #0D0807 55%, #07040A 100%)',
    light: 0.92,
    breath: { min: 0.10, max: 0.18, scale: 1.05 },
    vignette: 0.50,
  },
  night: {
    // Espresso. Lights still drift, but quietly — no one's watching.
    base: 'radial-gradient(ellipse at 50% -10%, #0B0907 0%, #050402 55%, #020100 100%)',
    light: 0.70,
    breath: { min: 0.06, max: 0.10, scale: 1.03 },
    vignette: 0.60,
  },
}

// Four anchored "lights", one per status family. Intensity scales with how
// many people fall into that family today. Each drifts on its own orbit so the
// whole canvas feels alive without ever becoming distracting.
const LIGHTS: Array<{
  key: string
  status: EntryStatus
  statuses: EntryStatus[]
  origin: { x: number; y: number }
  orbit: { x: number; y: number }
  duration: number
  delay: number
}> = [
  {
    key: 'office',
    status: 'office',
    statuses: ['office'],
    origin: { x: 15, y: 25 },
    orbit: { x: 6, y: 4 },
    duration: 38,
    delay: 0,
  },
  {
    key: 'remote',
    status: 'remote',
    statuses: ['remote'],
    origin: { x: 42, y: 70 },
    orbit: { x: 5, y: 6 },
    duration: 46,
    delay: 4,
  },
  {
    key: 'customer',
    status: 'customer',
    statuses: ['customer', 'event', 'travel'],
    origin: { x: 72, y: 22 },
    orbit: { x: 7, y: 5 },
    duration: 42,
    delay: 2,
  },
  {
    key: 'away',
    status: 'vacation',
    statuses: ['vacation', 'sick', 'off'],
    origin: { x: 88, y: 78 },
    orbit: { x: 5, y: 5 },
    duration: 52,
    delay: 6,
  },
]

export function AuroraBackground({ entries, phase = 'day' }: AuroraBackgroundProps) {
  const total = entries.length || 1
  const STATUS_COLORS = useStatusColors()
  // Pause the orbit + breathing animations when the tab is hidden or the
  // user prefers reduced motion. The lights stay painted so the dashboard
  // never goes dark, but we stop spending GPU on a 90px blur every frame.
  const visible = useDocumentVisibility()
  const reduceMotion = useReducedMotion()
  const animate = visible && !reduceMotion
  const tone = PHASE_TONES[phase]

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* Deep base layer — never true black. Tone shifts with phase so the
          dashboard reads cool in the morning, warm at golden hour, and
          settles to espresso after hours. Cross-fades when phase changes
          so the change never snaps. */}
      <motion.div
        className="absolute inset-0"
        animate={{ background: tone.base }}
        transition={{ duration: 4.0, ease: 'easeInOut' }}
        style={{ background: tone.base }}
      />

      {/* Drifting colored lights */}
      {LIGHTS.map(light => {
        const count = entries.filter(e => light.statuses.includes(e.status)).length
        const share = count / total
        // Size + opacity respond to group weight, but never vanish entirely.
        // Phase scales the headline opacity so night is dim, day is full.
        const size = 780 + share * 520
        const opacity = (0.22 + share * 0.38) * tone.light
        const color = STATUS_COLORS[light.status].icon

        return (
          <motion.div
            key={light.key}
            className="absolute rounded-full"
            initial={{
              opacity: 0,
              left: `${light.origin.x}%`,
              top: `${light.origin.y}%`,
            }}
            animate={
              animate
                ? {
                    opacity,
                    left: [
                      `${light.origin.x}%`,
                      `${light.origin.x + light.orbit.x}%`,
                      `${light.origin.x - light.orbit.x}%`,
                      `${light.origin.x}%`,
                    ],
                    top: [
                      `${light.origin.y}%`,
                      `${light.origin.y - light.orbit.y}%`,
                      `${light.origin.y + light.orbit.y}%`,
                      `${light.origin.y}%`,
                    ],
                  }
                : { opacity, left: `${light.origin.x}%`, top: `${light.origin.y}%` }
            }
            transition={
              animate
                ? {
                    opacity: { duration: 1.6, delay: light.delay * 0.1, ease: 'easeOut' },
                    left: {
                      duration: light.duration,
                      delay: light.delay,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    },
                    top: {
                      duration: light.duration * 0.82,
                      delay: light.delay,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    },
                  }
                : { duration: 0.4, ease: 'easeOut' }
            }
            style={{
              width: size,
              height: size,
              marginLeft: -size / 2,
              marginTop: -size / 2,
              background: `radial-gradient(circle, ${color}cc 0%, ${color}55 30%, ${color}00 65%)`,
              // 90px blur on a fullscreen element is one of the most expensive
              // operations a GPU can do. Drop to 50px — visually nearly
              // identical because the gradient already has soft falloff —
              // and let `will-change` hint the compositor.
              filter: 'blur(50px)',
              willChange: animate ? 'left, top' : undefined,
              mixBlendMode: 'screen',
            }}
          />
        )
      })}

      {/* Breathing accent orb — keeps the composition alive even with zero data.
          Amplitude is phase-aware: full at midday, almost-still at night, so
          the after-hours TV feels like it's holding its breath. */}
      <motion.div
        className="absolute rounded-full"
        initial={{ opacity: 0 }}
        animate={
          animate
            ? {
                opacity: [tone.breath.min, tone.breath.max, tone.breath.min],
                scale: [1, tone.breath.scale, 1],
              }
            : { opacity: (tone.breath.min + tone.breath.max) / 2, scale: 1 }
        }
        transition={
          animate
            ? { duration: 9, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 0.4, ease: 'easeOut' }
        }
        style={{
          width: 520,
          height: 520,
          top: '50%',
          left: '50%',
          marginLeft: -260,
          marginTop: -260,
          background:
            'radial-gradient(circle, color-mix(in oklab, var(--accent-color) 38%, transparent) 0%, color-mix(in oklab, var(--accent-color) 8%, transparent) 40%, transparent 70%)',
          filter: 'blur(36px)',
          mixBlendMode: 'screen',
        }}
      />

      {/* Vignette — pulls focus to the center. Slightly stronger at night
          so the surrounding room reads even darker around the screen edge. */}
      <motion.div
        className="absolute inset-0"
        animate={{
          background: `radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(0,0,0,${tone.vignette}) 90%, rgba(0,0,0,${Math.min(tone.vignette + 0.3, 0.95)}) 100%)`,
        }}
        transition={{ duration: 4.0, ease: 'easeInOut' }}
      />

      {/* Film grain — subtle texture so gradients don't look CGI-clean */}
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.6 0'/></filter><rect width='240' height='240' filter='url(%23n)'/></svg>\")",
          mixBlendMode: 'overlay',
        }}
      />
    </div>
  )
}
