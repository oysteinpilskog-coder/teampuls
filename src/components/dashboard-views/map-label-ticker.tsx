'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'

interface MapLabelTickerProps {
  /** Names rotated through. Length 1 means a static label, no cycling. */
  names: string[]
  x: number
  y: number
  textAnchor: 'start' | 'middle' | 'end'
  visited: boolean
  /** Stable index → desyncs the rotation phase across labels so the whole
   *  map doesn't tick in lockstep. */
  index: number
  /** Time in ms each name lingers before the crossfade. Defaults to 4200. */
  intervalMs?: number
}

/**
 * Rotating-name SVG label for cluster pins. When several customers fold
 * into one nucleus, the ticker reveals each name in turn with a quiet
 * crossfade (no sliding banners or marquee scroll — Apple-style "swap and
 * settle"). Solo clusters just render their single name without animation.
 *
 * Built as a client component so the cycling state lives in React, not in
 * SMIL; this keeps it composable with `framer-motion` exit transitions
 * already used by the surrounding label group.
 */
export function MapLabelTicker({
  names,
  x,
  y,
  textAnchor,
  visited,
  index,
  intervalMs = 4200,
}: MapLabelTickerProps) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (names.length <= 1) return
    // Stagger start so neighbouring tickers never crossfade at the same
    // instant — uses a small phase offset based on the pin's index.
    const phase = (index * 730) % intervalMs
    let intervalId: number | null = null

    const timeoutId = window.setTimeout(() => {
      setStep(s => (s + 1) % names.length)
      intervalId = window.setInterval(() => {
        setStep(s => (s + 1) % names.length)
      }, intervalMs)
    }, intervalMs - phase)

    return () => {
      window.clearTimeout(timeoutId)
      if (intervalId !== null) window.clearInterval(intervalId)
    }
  }, [names.length, intervalMs, index])

  const safeStep = step % names.length
  const current = names[safeStep] ?? names[0] ?? ''
  const fontSize = visited ? 16 : 13
  const fontWeight = visited ? 600 : 500
  const fill = visited ? 'white' : 'rgba(255,255,255,0.62)'
  const strokeWidth = visited ? 4.5 : 3.5

  // Solo cluster → static text, no presence wrapper. Cleaner DOM, no
  // unnecessary remounts on parent re-renders.
  if (names.length <= 1) {
    return (
      <text
        x={x}
        y={y}
        textAnchor={textAnchor}
        fontSize={fontSize}
        fontWeight={fontWeight}
        fontFamily="var(--font-sora)"
        fill={fill}
        letterSpacing={0.3}
        style={{
          paintOrder: 'stroke',
          stroke: 'rgba(2,4,10,0.78)',
          strokeWidth,
          strokeLinejoin: 'round',
        }}
      >
        {current}
      </text>
    )
  }

  // Wrap the text in a motion.g and animate the group's transform — keeps
  // the crossfade-with-drift effect without colliding with the SVG `y`
  // attribute on the inner <text>. Framer's `y` motion-value on a <g>
  // resolves to `transform="translate(0, …)"`.
  return (
    <AnimatePresence mode="wait">
      <motion.g
        key={safeStep}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
      >
        <text
          x={x}
          y={y}
          textAnchor={textAnchor}
          fontSize={fontSize}
          fontWeight={fontWeight}
          fontFamily="var(--font-sora)"
          fill={fill}
          letterSpacing={0.3}
          style={{
            paintOrder: 'stroke',
            stroke: 'rgba(2,4,10,0.78)',
            strokeWidth,
            strokeLinejoin: 'round',
          }}
        >
          {current}
        </text>
      </motion.g>
    </AnimatePresence>
  )
}
