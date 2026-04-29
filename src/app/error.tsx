'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { no } from '@/lib/i18n/no'

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
  useEffect(() => {
    console.error('[error-boundary]', error)
  }, [error])

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 text-center">
      <p
        className="text-[96px] font-bold leading-none mb-4 select-none"
        style={{
          fontFamily: 'var(--font-sora)',
          color: 'var(--border-strong)',
          letterSpacing: '-0.04em',
        }}
      >
        !
      </p>
      <h1
        className="text-[24px] font-semibold mb-2"
        style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sora)' }}
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
          className="px-6 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--accent-color)', fontFamily: 'var(--font-body)' }}
        >
          {t.reload}
        </button>
        <Link
          href="/"
          className="px-6 py-2.5 rounded-xl text-[13px] font-semibold transition-opacity hover:opacity-80"
          style={{
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-body)',
            border: '1px solid var(--border-default)',
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
    </div>
  )
}
