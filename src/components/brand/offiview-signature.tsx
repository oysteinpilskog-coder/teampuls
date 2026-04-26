'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { OffiviewMark } from './offiview-mark'

const TAGLINE_ROTATION = [
  'Dagen, lagt på bordet.',
  'Hvem er her. Hvem er der. Ferdig.',
  'Et felles blikk. En enklere uke.',
] as const

const ROTATION_INTERVAL_MS = 30 * 60 * 1000

export interface OffiviewSignatureProps {
  visible: boolean
  opacity?: number
}

export function OffiviewSignature({ visible, opacity = 0.85 }: OffiviewSignatureProps) {
  const [taglineIdx, setTaglineIdx] = useState(0)
  const reduce = useReducedMotion()

  useEffect(() => {
    const id = setInterval(() => {
      setTaglineIdx((i) => (i + 1) % TAGLINE_ROTATION.length)
    }, ROTATION_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={reduce ? { opacity } : { opacity: 0, y: 10 }}
          animate={{ opacity, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
          transition={{ duration: reduce ? 0 : 0.6, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'fixed',
            bottom: 48,
            right: 48,
            zIndex: 40,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            pointerEvents: 'none',
          }}
          aria-hidden
        >
          <div
            className="offiview-signature-mark"
            style={{
              width: 'clamp(33.6px, 2.8vw, 56px)',
              height: 'clamp(33.6px, 2.8vw, 56px)',
              flexShrink: 0,
            }}
          >
            <OffiviewMark variant="nordlys" size={56} strokeWidth={5} />
          </div>
          <style>{`.offiview-signature-mark > svg { width: 100% !important; height: 100% !important; }`}</style>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              lineHeight: 1,
            }}
          >
            <span
              className="serif"
              style={{
                fontFamily: 'var(--font-fraunces), Georgia, serif',
                fontStyle: 'italic',
                fontWeight: 300,
                fontVariationSettings: '"opsz" 32, "SOFT" 60',
                fontSize: 'clamp(24px, 2vw, 40px)',
                color: '#F5EFE4',
                letterSpacing: '-0.02em',
              }}
            >
              Offiview
            </span>
            <span
              style={{
                fontFamily: 'var(--font-manrope), system-ui, sans-serif',
                fontWeight: 400,
                fontSize: 11,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--mist)',
              }}
            >
              {reduce ? (
                TAGLINE_ROTATION[taglineIdx]
              ) : (
                <AnimatePresence mode="wait">
                  <motion.span
                    key={taglineIdx}
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 1 }}
                  >
                    {TAGLINE_ROTATION[taglineIdx]}
                  </motion.span>
                </AnimatePresence>
              )}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
