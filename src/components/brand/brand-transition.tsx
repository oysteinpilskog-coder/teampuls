'use client'

import * as React from 'react'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'

/*
 * Sekvens-tidslinje (uten reduced-motion, ~3.1s totalt):
 *
 *     0–300ms     outgoingView fader ut + glir -8px (ease [.4,0,.2,1])
 *   300–1100ms   sirkel-stroke tegnes (strokeDashoffset C → 0, 800ms)
 *  1100–1900ms   meridian skaleres center-out (spring 180/22, ~800ms)
 *  1900–2300ms   hold (400ms)
 *  2300–2700ms   monogram flyr til signaturePosition + scale 0.3 + fade
 *  2600–3100ms   incomingView fader inn + glir 8px → 0 (overlapper fly med 300ms)
 *      3100ms   onComplete()
 *
 * Reduced-motion-snarvei: 200ms crossfade outgoing → incoming, ingen hero-mark.
 */

const TIMINGS = {
  outgoing: 300,
  circle: 800,
  meridian: 800,
  hold: 400,
  fly: 400,
  incoming: 500,
  incomingOverlap: 300,
  reducedCrossfade: 200,
} as const

type MarkPhase = 'hidden' | 'circle' | 'meridian' | 'hold' | 'fly' | 'gone'

export interface BrandTransitionProps {
  outgoingView: React.ReactNode
  incomingView: React.ReactNode
  onComplete: () => void
  signaturePosition: { x: number; y: number }
}

export function BrandTransition({
  outgoingView,
  incomingView,
  onComplete,
  signaturePosition,
}: BrandTransitionProps) {
  const reduce = !!useReducedMotion()
  const [outgoingVisible, setOutgoingVisible] = useState(true)
  const [markPhase, setMarkPhase] = useState<MarkPhase>('hidden')
  const [incomingVisible, setIncomingVisible] = useState(false)

  useEffect(() => {
    if (reduce) {
      setOutgoingVisible(false)
      setIncomingVisible(true)
      const t = setTimeout(onComplete, TIMINGS.reducedCrossfade)
      return () => clearTimeout(t)
    }

    const timers: ReturnType<typeof setTimeout>[] = []
    const t = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms))

    const outEnd = TIMINGS.outgoing
    const circleEnd = outEnd + TIMINGS.circle
    const meridianEnd = circleEnd + TIMINGS.meridian
    const holdEnd = meridianEnd + TIMINGS.hold
    const flyStart = holdEnd
    const flyEnd = flyStart + TIMINGS.fly
    const incomingStart = flyStart + TIMINGS.incomingOverlap
    const incomingEnd = incomingStart + TIMINGS.incoming
    const total = Math.max(flyEnd, incomingEnd)

    t(outEnd, () => {
      setOutgoingVisible(false)
      setMarkPhase('circle')
    })
    t(circleEnd, () => setMarkPhase('meridian'))
    t(meridianEnd, () => setMarkPhase('hold'))
    t(flyStart, () => setMarkPhase('fly'))
    t(incomingStart, () => setIncomingVisible(true))
    t(flyEnd, () => setMarkPhase('gone'))
    t(total, () => onComplete())

    return () => timers.forEach(clearTimeout)
  }, [reduce, onComplete])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <AnimatePresence>
        {outgoingVisible && (
          <motion.div
            key="outgoing"
            style={{ position: 'absolute', inset: 0 }}
            initial={{ opacity: 1, y: 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{
              opacity: 0,
              y: reduce ? 0 : -8,
            }}
            transition={{
              duration: reduce ? TIMINGS.reducedCrossfade / 1000 : TIMINGS.outgoing / 1000,
              ease: reduce ? 'linear' : [0.4, 0, 0.2, 1],
            }}
          >
            {outgoingView}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {incomingVisible && (
          <motion.div
            key="incoming"
            style={{ position: 'absolute', inset: 0 }}
            initial={{ opacity: 0, y: reduce ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: reduce ? TIMINGS.reducedCrossfade / 1000 : TIMINGS.incoming / 1000,
              ease: reduce ? 'linear' : 'easeOut',
            }}
          >
            {incomingView}
          </motion.div>
        )}
      </AnimatePresence>

      {!reduce && markPhase !== 'hidden' && markPhase !== 'gone' && (
        <HeroMark phase={markPhase} signaturePosition={signaturePosition} />
      )}
    </div>
  )
}

function HeroMark({
  phase,
  signaturePosition,
}: {
  phase: Exclude<MarkPhase, 'hidden' | 'gone'>
  signaturePosition: { x: number; y: number }
}) {
  const [center, setCenter] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    setCenter({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
  }, [])

  const HERO_PX = 200
  const RADIUS = 47
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS
  const dx = center ? signaturePosition.x - center.x : 0
  const dy = center ? signaturePosition.y - center.y : 0

  const meridianMounted = phase === 'meridian' || phase === 'hold' || phase === 'fly'

  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 100,
        pointerEvents: 'none',
        width: HERO_PX,
        height: HERO_PX,
      }}
    >
      <motion.div
        animate={
          phase === 'fly'
            ? { x: dx, y: dy, scale: 0.3, opacity: 0 }
            : { x: 0, y: 0, scale: 1, opacity: 1 }
        }
        transition={{ duration: TIMINGS.fly / 1000, ease: [0.42, 0, 0.58, 1] }}
        style={{ width: HERO_PX, height: HERO_PX }}
      >
        <svg viewBox="0 0 100 100" width={HERO_PX} height={HERO_PX} aria-hidden>
          <defs>
            {/*
             * userSpaceOnUse keeps the gradient stable on the horizontal
             * meridian. With the default objectBoundingBox, a <line> with
             * y1=y2 collapses to a zero-height bbox and the gradient renders
             * transparent — same root cause as the favicon fix.
             */}
            <linearGradient
              id="brand-transition-grad"
              x1={15}
              y1={62}
              x2={85}
              y2={62}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#00F5A0" />
              <stop offset="55%" stopColor="#00D9F5" />
              <stop offset="100%" stopColor="#7C3AED" />
            </linearGradient>
            <filter
              id="brand-transition-glow"
              x="-30%"
              y="-30%"
              width="160%"
              height="160%"
            >
              <feGaussianBlur stdDeviation="1.6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <motion.circle
            cx={50}
            cy={50}
            r={RADIUS}
            fill="none"
            stroke="#F5EFE4"
            strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            initial={{ strokeDashoffset: CIRCUMFERENCE }}
            animate={{ strokeDashoffset: 0 }}
            transition={{ duration: TIMINGS.circle / 1000, ease: [0.4, 0, 0.2, 1] }}
          />

          {meridianMounted && (
            <motion.g
              style={{
                transformOrigin: '50px 62px',
                transformBox: 'view-box',
              }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ type: 'spring', stiffness: 180, damping: 22 }}
            >
              <line
                x1={15}
                y1={62}
                x2={85}
                y2={62}
                stroke="url(#brand-transition-grad)"
                strokeWidth={5}
                strokeLinecap="round"
                filter="url(#brand-transition-glow)"
              />
            </motion.g>
          )}
        </svg>
      </motion.div>
    </div>
  )
}
