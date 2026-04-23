'use client'

import * as React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { OffiviewMarkVariant } from './offiview-mark'
import { OffiviewWordmark } from './offiview-wordmark'

const SESSION_FLAG = 'offiview:horizon-has-risen'

/**
 * Animated Offiview wordmark — "Horisonten stiger".
 *
 * Plays once per session on mount:
 *  - Ring fades in + scales 0.9 → 1 (gentle)
 *  - Horizon line sweeps from left (scaleX 0 → 1) in Nordlys gradient with glow
 *  - After a beat, horizon crossfades to the steady ink/paper stroke
 *
 * This is the Offiview "once-per-surface" Nordlys moment, time-boxed: the
 * signature is a transition, not a permanent surface element. After the
 * animation, the wordmark is indistinguishable from the static variant.
 *
 * Honours `prefers-reduced-motion` (skips straight to the settled state) and
 * `sessionStorage` so the entry only plays once per browser tab. Navigation
 * between routes inside the same session reuses the settled state.
 */
export interface OffiviewWordmarkAnimatedProps {
  size?: number
  /** Variant used once the Nordlys horizon settles. Default `ink`. */
  variant?: OffiviewMarkVariant
  title?: string
  className?: string
  /** Override the session gate — force a fresh animation. */
  forcePlay?: boolean
}

export function OffiviewWordmarkAnimated({
  size = 22,
  variant = 'ink',
  title = 'Offiview',
  className,
  forcePlay = false,
}: OffiviewWordmarkAnimatedProps) {
  const prefersReducedMotion = useReducedMotion()
  const [shouldPlay, setShouldPlay] = React.useState(false)
  const [phase, setPhase] = React.useState<'pre' | 'rising' | 'settled'>('pre')

  // Decide whether to play exactly once per session — run on mount so
  // server-render returns the static settled variant (no hydration flash).
  React.useEffect(() => {
    if (prefersReducedMotion) {
      setPhase('settled')
      return
    }
    try {
      if (!forcePlay && sessionStorage.getItem(SESSION_FLAG) === '1') {
        setPhase('settled')
        return
      }
      sessionStorage.setItem(SESSION_FLAG, '1')
    } catch {
      /* private mode / no storage — play anyway, harmless */
    }
    setShouldPlay(true)
    setPhase('rising')
    // Crossfade Nordlys → ink/paper after horizon completes.
    // 0.8s ring delay + 1.6s horizon draw + 0.4s settle hold = 2.8s
    const settleTimer = window.setTimeout(() => setPhase('settled'), 2800)
    return () => window.clearTimeout(settleTimer)
  }, [forcePlay, prefersReducedMotion])

  // Settled state: render the plain static wordmark so SSR and post-animation
  // share identical markup (no layout jitter, no flash).
  if (phase === 'settled') {
    return (
      <OffiviewWordmark
        size={size}
        variant={variant}
        title={title}
        className={className}
      />
    )
  }

  // Pre-animation (before effect runs) or rising — render the animated SVG.
  // Geometry matches the static mark: viewBox 0 0 100 100, ring r=47,
  // horizon from x=15 to x=85 at y=62, stroke-width 6.
  const uid = React.useId()
  const gradId = `offiview-anim-${uid}`
  const glowId = `offiview-anim-glow-${uid}`

  // Text color follows currentColor so caller's CSS tone applies.
  const textColor =
    variant === 'paper' || variant === 'nordlys' ? '#F5EFE4' : 'currentColor'
  const ringStroke = variant === 'nordlys' ? '#F5EFE4' : 'currentColor'
  const gap = Math.max(3, Math.round(size * 0.12))

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: `${gap}px`,
        lineHeight: 1,
      }}
      aria-label={title}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 100 100"
        width={size}
        height={size}
        role="img"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#00F5A0" />
            <stop offset="55%" stopColor="#00D9F5" />
            <stop offset="100%" stopColor="#7C3AED" />
          </linearGradient>
          <filter
            id={glowId}
            x="-30%"
            y="-30%"
            width="160%"
            height="160%"
          >
            <feGaussianBlur stdDeviation="1.6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Ring — fades + scales in */}
        <motion.circle
          cx="50"
          cy="50"
          r="47"
          fill="none"
          stroke={ringStroke}
          strokeWidth={6}
          initial={shouldPlay ? { opacity: 0, scale: 0.88 } : { opacity: 1, scale: 1 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.2, 0.8, 0.3, 1] }}
          style={{ transformOrigin: '50% 50%' }}
        />

        {/* Horizon — Nordlys gradient, draws in from left, then fades to static */}
        <motion.line
          x1={15}
          y1={62}
          x2={85}
          y2={62}
          stroke={`url(#${gradId})`}
          strokeWidth={6}
          strokeLinecap="round"
          filter={`url(#${glowId})`}
          initial={shouldPlay ? { pathLength: 0, opacity: 0 } : { pathLength: 1, opacity: 1 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{
            pathLength: { duration: 1.6, ease: [0.2, 0.8, 0.3, 1], delay: 0.8 },
            opacity: { duration: 0.3, delay: 0.8 },
          }}
        />

        {/* Settled horizon — ink/paper, layered on top, cross-fades in as Nordlys fades */}
        <motion.line
          x1={15}
          y1={62}
          x2={85}
          y2={62}
          stroke={ringStroke}
          strokeWidth={6}
          strokeLinecap="round"
          initial={{ opacity: 0 }}
          animate={{ opacity: phase === 'rising' ? 0 : 1 }}
          transition={{ duration: 0.4, ease: [0.2, 0.8, 0.3, 1] }}
        />
      </svg>

      <span
        aria-hidden
        style={{
          fontFamily: 'var(--font-manrope), system-ui, sans-serif',
          fontWeight: 300,
          fontSize: `${size}px`,
          letterSpacing: '-0.04em',
          color: textColor,
          transform: 'translateY(0.02em)',
          whiteSpace: 'nowrap',
        }}
      >
        ffiview
      </span>
    </span>
  )
}
