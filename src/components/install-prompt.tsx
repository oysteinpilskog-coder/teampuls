'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import { spring } from '@/lib/motion'

/**
 * "Add to Home Screen" nudge for iOS/Safari, where the beforeinstallprompt
 * event never fires. Shows once per browser (localStorage), never when the
 * app is already running standalone, never in non-iOS browsers (they get
 * the native install UI anyway).
 */

const STORAGE_KEY = 'teampulse.pwa.install.dismissed'
const SHOW_AFTER_MS = 8_000
const AUTO_HIDE_MS = 16_000

export function InstallPrompt() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    try { if (localStorage.getItem(STORAGE_KEY) === '1') return } catch { /* */ }

    // Already running as installed PWA — nothing to prompt for.
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      // iOS Safari exposes `navigator.standalone` when launched from home screen.
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    if (standalone) return

    const ua = window.navigator.userAgent
    const isIOS = /iP(hone|ad|od)/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua)
    if (!isIOS) return // non-iOS gets the native install prompt; nothing to add

    const show = window.setTimeout(() => setShow(true), SHOW_AFTER_MS)
    return () => window.clearTimeout(show)
  }, [])

  useEffect(() => {
    if (!show) return
    const t = window.setTimeout(() => dismiss(), AUTO_HIDE_MS)
    return () => window.clearTimeout(t)
  }, [show])

  function dismiss() {
    setShow(false)
    try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* */ }
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.96 }}
          transition={spring.gentle}
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] max-w-[min(92vw,420px)] w-full px-4"
        >
          <div
            className="flex items-start gap-3 rounded-2xl p-3.5"
            style={{
              background: 'color-mix(in oklab, var(--bg-elevated) 92%, transparent)',
              backdropFilter: 'blur(22px) saturate(180%)',
              WebkitBackdropFilter: 'blur(22px) saturate(180%)',
              border: '1px solid color-mix(in oklab, var(--border-subtle) 55%, transparent)',
              boxShadow:
                '0 24px 48px -16px rgba(10,20,40,0.32), 0 10px 20px -12px rgba(10,20,40,0.18), inset 0 1px 0 rgba(255,255,255,0.5)',
              fontFamily: 'var(--font-body)',
            }}
          >
            <span
              className="inline-flex items-center justify-center rounded-xl shrink-0"
              style={{
                width: 36,
                height: 36,
                background: 'color-mix(in oklab, var(--accent-color) 14%, transparent)',
                color: 'var(--accent-color)',
              }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
                <path d="M12 3v12m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <div className="flex-1 min-w-0">
              <div
                className="text-[13.5px] font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                Legg til Offiview på Hjem-skjermen
              </div>
              <p
                className="text-[12.5px] mt-0.5 leading-snug"
                style={{ color: 'var(--text-secondary)' }}
              >
                Trykk <ShareIcon /> Del, og velg <strong style={{ color: 'var(--text-primary)' }}>"Legg til på Hjem-skjerm"</strong>.
                Du får en app-opplevelse uten Safari-linja.
              </p>
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Lukk"
              className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <svg viewBox="0 0 10 10" width="10" height="10" fill="none">
                <path d="M1.5 1.5 8.5 8.5M8.5 1.5 1.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      aria-hidden
      className="inline-block align-text-bottom mx-0.5"
      style={{ color: 'var(--accent-color)' }}
    >
      <path d="M12 4v12m0-12l-3.5 3.5M12 4l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
