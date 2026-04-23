'use client'

import { useEffect } from 'react'

/**
 * Registers /sw.js on mount in production. Skipped in development so
 * hot-reloads aren't interfered with by a stale cached bundle, and in any
 * browser that doesn't support service workers. Safe to mount multiple
 * times — register() is idempotent for the same scope.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    // Let the app hydrate first so the SW doesn't steal bandwidth during
    // the initial critical fetches.
    const handle = window.setTimeout(() => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((err) => {
          console.warn('[sw] register failed', err)
        })
    }, 1500)

    return () => window.clearTimeout(handle)
  }, [])

  return null
}
