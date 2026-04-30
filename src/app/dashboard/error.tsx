'use client'

import { useEffect } from 'react'
import { no } from '@/lib/i18n/no'

const t = no.errorBoundary

// Dashboard runs unattended on a TV in reception. If something crashes,
// recover automatically — never show a stack trace or interactive prompt.
const AUTO_RESET_MS = 8_000

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[dashboard-error]', error)
    const id = window.setTimeout(reset, AUTO_RESET_MS)
    return () => window.clearTimeout(id)
  }, [error, reset])

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
      style={{ backgroundColor: '#15110E', color: '#F5EFE4' }}
    >
      <h1
        className="text-[36px] font-semibold mb-3"
        style={{ fontFamily: 'var(--font-fraunces)', letterSpacing: '-0.02em' }}
      >
        {t.dashboardTitle}
      </h1>
      <p
        className="text-[17px] opacity-70 max-w-md"
        style={{ fontFamily: 'var(--font-body)' }}
      >
        {t.dashboardDescription}
      </p>
    </div>
  )
}
