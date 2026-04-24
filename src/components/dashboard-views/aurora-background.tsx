'use client'

import { motion } from 'framer-motion'
import type { Entry, EntryStatus } from '@/lib/supabase/types'
import { useStatusColors } from '@/lib/status-colors/context'

interface AuroraBackgroundProps {
  entries: Entry[]
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

export function AuroraBackground({ entries }: AuroraBackgroundProps) {
  const total = entries.length || 1
  const STATUS_COLORS = useStatusColors()

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* Deep base layer — never true black, slight cool undertone */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% -10%, #121216 0%, #09090B 55%, #050507 100%)',
        }}
      />

      {/* Drifting colored lights */}
      {LIGHTS.map(light => {
        const count = entries.filter(e => light.statuses.includes(e.status)).length
        const share = count / total
        // Size + opacity respond to group weight, but never vanish entirely.
        const size = 780 + share * 520
        const opacity = 0.22 + share * 0.38
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
            animate={{
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
            }}
            transition={{
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
            }}
            style={{
              width: size,
              height: size,
              marginLeft: -size / 2,
              marginTop: -size / 2,
              background: `radial-gradient(circle, ${color}cc 0%, ${color}55 30%, ${color}00 65%)`,
              filter: 'blur(90px)',
              mixBlendMode: 'screen',
            }}
          />
        )
      })}

      {/* Breathing accent orb — keeps the composition alive even with zero data */}
      <motion.div
        className="absolute rounded-full"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0.12, 0.22, 0.12], scale: [1, 1.08, 1] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          width: 520,
          height: 520,
          top: '50%',
          left: '50%',
          marginLeft: -260,
          marginTop: -260,
          background:
            'radial-gradient(circle, color-mix(in oklab, var(--accent-color) 38%, transparent) 0%, color-mix(in oklab, var(--accent-color) 8%, transparent) 40%, transparent 70%)',
          filter: 'blur(60px)',
          mixBlendMode: 'screen',
        }}
      />

      {/* Vignette — pulls focus to the center */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(0,0,0,0.45) 90%, rgba(0,0,0,0.75) 100%)',
        }}
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
