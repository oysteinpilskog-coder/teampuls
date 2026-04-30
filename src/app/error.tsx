'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { no } from '@/lib/i18n/no'
import { ease } from '@/lib/motion'

// Error boundary doesn't render through the I18nProvider reliably (the error
// might be in the layout itself), so fall back to the Norwegian dictionary
// directly. Norwegian is the primary locale and this page is a last resort.
const t = no.errorBoundary

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const prefersReducedMotion = useReducedMotion()

  useEffect(() => {
    console.error('[error-boundary]', error)
  }, [error])

  return (
    <motion.div
      className="min-h-[60vh] flex flex-col items-center justify-center px-6 text-center"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: ease.horizon }}
    >
      <span
        aria-hidden
        className="text-[120px] leading-none mb-6 select-none italic"
        style={{
          fontFamily: 'var(--font-fraunces)',
          fontWeight: 300,
          fontVariationSettings: '"opsz" 144, "SOFT" 80',
          color: 'var(--accent-color)',
          letterSpacing: '-0.04em',
        }}
      >
        !
      </span>
      <h1
        className="text-[24px] font-semibold mb-2"
        style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-fraunces)', letterSpacing: '-0.02em' }}
      >
        {t.title}
      </h1>
      <p
        className="text-[15px] mb-8 max-w-sm"
        style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
      >
        {t.description}
      </p>
      <div className="flex gap-3 items-center">
        <button
          type="button"
          onClick={reset}
          className="px-6 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-transform active:scale-[0.98]"
          style={{
            backgroundColor: 'var(--accent-color)',
            boxShadow: 'var(--shadow-accent)',
            fontFamily: 'var(--font-body)',
          }}
        >
          {t.reload}
        </button>
        <Link
          href="/"
          className="px-6 py-2.5 rounded-xl text-[13px] font-semibold transition-colors hover:bg-[color-mix(in_oklab,var(--bg-subtle)_70%,transparent)]"
          style={{
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-body)',
            border: '1px solid color-mix(in oklab, var(--border-subtle) 70%, transparent)',
          }}
        >
          {t.backToHome}
        </Link>
      </div>
      {error.digest && (
        <p
          className="mt-8 text-[11px] font-mono opacity-50"
          style={{ color: 'var(--text-tertiary)' }}
        >
          ref: {error.digest}
        </p>
      )}
    </motion.div>
  )
}
