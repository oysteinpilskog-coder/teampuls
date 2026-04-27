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

/*
 * Tre visningskontekster, drevet av CSS-vars (--wm-size, --mono-size, --pad)
 * som omdefineres av media queries. Sizing innenfor hver state bruker clamp()
 * for myk skalering; modusbyttet er hardt og diskret per terskel.
 *
 *   mobil/print    → @media (max-width: 639px), print
 *                    wm 18, mono 25, pad 24
 *   desktop (def)  → ingen match — fallback for alt mellom 640 og 4K-vegg
 *                    wm clamp(28, 1.5vw, 32), mono = wm × 1.4, pad 48
 *   4K-vegg        → @media (min-resolution: 2dppx) and (min-width: 3000px)
 *                    wm clamp(40, 1.3vw, 48), mono = wm × 1.4, pad 72
 *
 * Wall-spørringen er identisk med den i spec-en
 * `window.matchMedia('(min-resolution: 2dppx) and (min-width: 3000px)')` —
 * CSS @media og JS matchMedia tolker den samme strengen likt, så detection
 * er konsistent uansett hvor vi spør.
 */

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
          className="offiview-signature"
          initial={reduce ? { opacity } : { opacity: 0, y: 10 }}
          animate={{ opacity, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
          transition={{ duration: reduce ? 0 : 0.6, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'fixed',
            bottom: 'var(--offiview-sig-pad)',
            right: 'var(--offiview-sig-pad)',
            zIndex: 40,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            pointerEvents: 'none',
          }}
          aria-hidden
        >
          <style>{`
            .offiview-signature {
              --offiview-sig-pad: 48px;
              --offiview-sig-wm: clamp(28px, 1.5vw, 32px);
              --offiview-sig-mono: clamp(40px, 2.1vw, 45px);
            }
            @media (max-width: 639px), print {
              .offiview-signature {
                --offiview-sig-pad: 24px;
                --offiview-sig-wm: 18px;
                --offiview-sig-mono: 25px;
              }
            }
            @media (min-resolution: 2dppx) and (min-width: 3000px) {
              .offiview-signature {
                --offiview-sig-pad: 72px;
                --offiview-sig-wm: clamp(40px, 1.3vw, 48px);
                --offiview-sig-mono: clamp(56px, 1.82vw, 67px);
              }
            }
            .offiview-signature-mark > svg { width: 100% !important; height: 100% !important; }
          `}</style>

          <div
            className="offiview-signature-mark"
            style={{
              width: 'var(--offiview-sig-mono)',
              height: 'var(--offiview-sig-mono)',
              flexShrink: 0,
            }}
          >
            <OffiviewMark variant="nordlys" size={56} strokeWidth={5} />
          </div>

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
                fontSize: 'var(--offiview-sig-wm)',
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
