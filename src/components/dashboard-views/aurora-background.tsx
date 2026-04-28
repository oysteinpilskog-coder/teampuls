'use client'

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
 */
const PHASE_TONES: Record<DayPhase, {
  base: string
  light: number
  breath: { min: number; max: number; scale: number }
  vignette: number
}> = {
  morning: {
    base: 'radial-gradient(ellipse at 50% -10%, #11141C 0%, #08090F 55%, #04050A 100%)',
    light: 0.95,
    breath: { min: 0.10, max: 0.20, scale: 1.06 },
    vignette: 0.45,
  },
  day: {
    base: 'radial-gradient(ellipse at 50% -10%, #121216 0%, #09090B 55%, #050507 100%)',
    light: 1.00,
    breath: { min: 0.12, max: 0.22, scale: 1.08 },
    vignette: 0.45,
  },
  evening: {
    base: 'radial-gradient(ellipse at 50% -10%, #1A1310 0%, #0D0807 55%, #07040A 100%)',
    light: 0.92,
    breath: { min: 0.10, max: 0.18, scale: 1.05 },
    vignette: 0.50,
  },
  night: {
    base: 'radial-gradient(ellipse at 50% -10%, #0B0907 0%, #050402 55%, #020100 100%)',
    light: 0.70,
    breath: { min: 0.06, max: 0.10, scale: 1.03 },
    vignette: 0.60,
  },
}

// Four anchored "lights", one per status family. Intensity scales with how
// many people fall into that family today. Each drifts on its own orbit so
// the whole canvas feels alive without ever becoming distracting.
const LIGHTS: Array<{
  key: string
  status: EntryStatus
  statuses: EntryStatus[]
  origin: { x: number; y: number }
  orbit: { x: number; y: number }
  duration: number
  delay: number
}> = [
  { key: 'office',   status: 'office',   statuses: ['office'],                       origin: { x: 15, y: 25 }, orbit: { x: 6, y: 4 }, duration: 38, delay: 0 },
  { key: 'remote',   status: 'remote',   statuses: ['remote'],                       origin: { x: 42, y: 70 }, orbit: { x: 5, y: 6 }, duration: 46, delay: 4 },
  { key: 'customer', status: 'customer', statuses: ['customer', 'event', 'travel'],  origin: { x: 72, y: 22 }, orbit: { x: 7, y: 5 }, duration: 42, delay: 2 },
  { key: 'away',     status: 'vacation', statuses: ['vacation', 'sick', 'off'],      origin: { x: 88, y: 78 }, orbit: { x: 5, y: 5 }, duration: 52, delay: 6 },
]

/**
 * Aurora is the always-on backdrop on the TV dashboard. Every animation here
 * is pure CSS — keyframes + per-light CSS variables — so nothing ships
 * Framer Motion runtime cost for an effect that runs forever. The `paused`
 * data attribute toggles `animation-play-state` so a hidden tab or
 * `prefers-reduced-motion` user pays nothing.
 *
 * The X and Y orbits live on nested wrappers with different durations
 * (Y = 0.82 × X) — this Lissajous offset is what makes each light feel like
 * it drifts rather than ticks around a circle.
 */
export function AuroraBackground({ entries, phase = 'day' }: AuroraBackgroundProps) {
  const total = entries.length || 1
  const STATUS_COLORS = useStatusColors()
  const visible = useDocumentVisibility()
  const tone = PHASE_TONES[phase]
  const paused = !visible

  return (
    <div
      className="aurora-root pointer-events-none absolute inset-0 overflow-hidden"
      data-paused={paused ? '' : undefined}
      aria-hidden
    >
      <style>{`
        @keyframes aurora-orbit-x {
          0%, 100% { transform: translateX(0); }
          25%      { transform: translateX(var(--orbit-x)); }
          75%      { transform: translateX(calc(var(--orbit-x) * -1)); }
        }
        @keyframes aurora-orbit-y {
          0%, 100% { transform: translateY(0); }
          25%      { transform: translateY(calc(var(--orbit-y) * -1)); }
          75%      { transform: translateY(var(--orbit-y)); }
        }
        @keyframes aurora-light-fade-in {
          from { opacity: 0; }
          to   { opacity: var(--target-opacity); }
        }
        @keyframes aurora-breath {
          0%, 100% {
            opacity: var(--breath-min);
            transform: translate(-50%, -50%) scale(1);
          }
          50% {
            opacity: var(--breath-max);
            transform: translate(-50%, -50%) scale(var(--breath-scale));
          }
        }
        @keyframes aurora-breath-fade-in {
          from { opacity: 0; }
          to   { opacity: var(--breath-mid); }
        }

        .aurora-root .aurora-light-x {
          position: absolute;
          left: var(--origin-x);
          top: var(--origin-y);
          opacity: var(--target-opacity);
          will-change: transform, opacity;
          animation:
            aurora-light-fade-in 1.6s ease-out var(--fade-delay) both,
            aurora-orbit-x var(--dur-x) ease-in-out var(--orbit-delay) infinite;
        }
        .aurora-root .aurora-light-y {
          will-change: transform;
          animation: aurora-orbit-y var(--dur-y) ease-in-out var(--orbit-delay) infinite;
        }
        .aurora-root .aurora-breath {
          position: absolute;
          top: 50%;
          left: 50%;
          will-change: transform, opacity;
          animation:
            aurora-breath-fade-in 1.6s ease-out both,
            aurora-breath 9s ease-in-out infinite;
        }

        /* Pause everything when the tab is hidden — Page Visibility API
           hooked through useDocumentVisibility(). The compositor stops
           painting and the GPU goes idle. */
        .aurora-root[data-paused] .aurora-light-x,
        .aurora-root[data-paused] .aurora-light-y,
        .aurora-root[data-paused] .aurora-breath {
          animation-play-state: paused;
        }

        @media (prefers-reduced-motion: reduce) {
          .aurora-root .aurora-light-x,
          .aurora-root .aurora-light-y { animation: none; }
          .aurora-root .aurora-breath {
            animation: none;
            opacity: var(--breath-mid);
            transform: translate(-50%, -50%);
          }
        }
      `}</style>

      {/* Deep base layer — never true black. Phase change is a hard cut
          here (rare, ~once an hour), but the surrounding lights crossfade
          their opacity smoothly via the --target-opacity variable below. */}
      <div className="absolute inset-0" style={{ background: tone.base }} />

      {/* Drifting colored lights — one X-orbit wrapper, one Y-orbit child,
          and the actual blurred orb at the bottom. */}
      {LIGHTS.map(light => {
        const count = entries.filter(e => light.statuses.includes(e.status)).length
        const share = count / total
        const size = 780 + share * 520
        const opacity = (0.22 + share * 0.38) * tone.light
        const color = STATUS_COLORS[light.status].icon

        const xVars = {
          ['--origin-x' as string]: `${light.origin.x}%`,
          ['--origin-y' as string]: `${light.origin.y}%`,
          ['--orbit-x' as string]: `${light.orbit.x}%`,
          ['--dur-x' as string]: `${light.duration}s`,
          ['--orbit-delay' as string]: `${light.delay}s`,
          ['--fade-delay' as string]: `${light.delay * 0.1}s`,
          ['--target-opacity' as string]: opacity.toFixed(3),
        } as React.CSSProperties

        const yVars = {
          ['--orbit-y' as string]: `${light.orbit.y}%`,
          ['--dur-y' as string]: `${light.duration * 0.82}s`,
          ['--orbit-delay' as string]: `${light.delay}s`,
        } as React.CSSProperties

        return (
          <div key={light.key} className="aurora-light-x" style={xVars}>
            <div className="aurora-light-y" style={yVars}>
              <div
                className="rounded-full"
                style={{
                  width: size,
                  height: size,
                  marginLeft: -size / 2,
                  marginTop: -size / 2,
                  background: `radial-gradient(circle, ${color}cc 0%, ${color}55 30%, ${color}00 65%)`,
                  filter: 'blur(50px)',
                  mixBlendMode: 'screen',
                }}
              />
            </div>
          </div>
        )
      })}

      {/* Breathing accent orb. Phase scales how loud it breathes — full at
          midday, almost-still at night. */}
      <div
        className="aurora-breath rounded-full"
        style={{
          width: 520,
          height: 520,
          marginLeft: 0,
          marginTop: 0,
          background:
            'radial-gradient(circle, color-mix(in oklab, var(--accent-color) 38%, transparent) 0%, color-mix(in oklab, var(--accent-color) 8%, transparent) 40%, transparent 70%)',
          filter: 'blur(36px)',
          mixBlendMode: 'screen',
          ['--breath-min' as string]: tone.breath.min.toFixed(3),
          ['--breath-max' as string]: tone.breath.max.toFixed(3),
          ['--breath-mid' as string]: ((tone.breath.min + tone.breath.max) / 2).toFixed(3),
          ['--breath-scale' as string]: tone.breath.scale.toFixed(3),
        }}
      />

      {/* Vignette — pulls focus to the center. Static per phase; the
          phase-change hard cut here is hidden behind the rare hourly switch. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            `radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(0,0,0,${tone.vignette}) 90%, rgba(0,0,0,${Math.min(tone.vignette + 0.3, 0.95)}) 100%)`,
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
