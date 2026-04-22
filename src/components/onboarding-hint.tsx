'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import { spring } from '@/lib/motion'

const STORAGE_KEY = 'teampulse.onboarding.cmdk.dismissed'
const SHOW_DELAY_MS = 2200
const AUTO_HIDE_MS = 12_000

/**
 * A one-time floating hint that teaches new users about ⌘K. Appears
 * near the bottom of the screen, dismisses on click, Esc, palette open,
 * or after 12s. Remembers the dismissal in localStorage so it never
 * comes back.
 */
export function OnboardingHint() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    // SSR-safe: only check localStorage on the client.
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') return
    } catch { /* incognito / blocked storage — skip the hint */ }

    const delayed = setTimeout(() => setShow(true), SHOW_DELAY_MS)
    return () => clearTimeout(delayed)
  }, [])

  useEffect(() => {
    if (!show) return
    const autoHide = setTimeout(() => dismiss(), AUTO_HIDE_MS)
    return () => clearTimeout(autoHide)
  }, [show])

  useEffect(() => {
    const handleOpen = () => dismiss()
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
    }
    window.addEventListener('teampulse:palette:open', handleOpen)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('teampulse:palette:open', handleOpen)
      window.removeEventListener('keydown', handleKey)
    }
  }, [])

  function dismiss() {
    setShow(false)
    try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* ignore */ }
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.button
          type="button"
          onClick={() => {
            window.dispatchEvent(new CustomEvent('teampulse:palette:open'))
            dismiss()
          }}
          initial={{ opacity: 0, y: 14, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.96 }}
          transition={spring.gentle}
          whileHover={{ y: -2 }}
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 px-4 py-2.5 rounded-2xl text-[13px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
          style={{
            background: 'color-mix(in oklab, var(--bg-elevated) 88%, transparent)',
            backdropFilter: 'blur(22px) saturate(180%)',
            WebkitBackdropFilter: 'blur(22px) saturate(180%)',
            color: 'var(--text-primary)',
            border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
            boxShadow:
              '0 24px 48px -16px rgba(10,20,40,0.28), 0 10px 20px -12px rgba(10,20,40,0.18), inset 0 1px 0 rgba(255,255,255,0.55)',
            fontFamily: 'var(--font-body)',
            letterSpacing: '-0.005em',
          }}
        >
          <span
            className="inline-flex items-center justify-center w-6 h-6 rounded-lg shrink-0"
            style={{
              background: 'color-mix(in oklab, var(--accent-color) 16%, transparent)',
              color: 'var(--accent-color)',
            }}
          >
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden>
              <path
                d="M7 2.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 1.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm3.77 6.47 2.12 2.12a.8.8 0 1 1-1.13 1.13l-2.12-2.12a.8.8 0 1 1 1.13-1.13Z"
                fill="currentColor"
              />
            </svg>
          </span>
          <span>Trykk</span>
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
          <span>for å søke eller navigere raskt</span>
          <span
            aria-hidden
            className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full cursor-pointer"
            style={{ color: 'var(--text-tertiary)' }}
            onClick={(e) => {
              e.stopPropagation()
              dismiss()
            }}
          >
            <svg viewBox="0 0 10 10" width="10" height="10" fill="none">
              <path d="M1.5 1.5 8.5 8.5M8.5 1.5 1.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-md text-[10px] font-semibold"
      style={{
        background: 'color-mix(in oklab, var(--bg-subtle) 80%, transparent)',
        color: 'var(--text-secondary)',
        border: '1px solid color-mix(in oklab, var(--border-subtle) 70%, transparent)',
        fontFamily: 'var(--font-body)',
      }}
    >
      {children}
    </kbd>
  )
}
