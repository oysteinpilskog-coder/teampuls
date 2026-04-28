'use client'

import { useEffect, useState } from 'react'

/**
 * Returns true while `document.visibilityState === 'visible'`. SSR-safe — the
 * initial value is `true` so server output matches the most common state.
 *
 * Use this to pause animations, polling, and Realtime subscriptions while the
 * tab is hidden. Background work on a TV/laptop dashboard is the difference
 * between an idle CPU and a fan that never spins down.
 */
export function useDocumentVisibility(): boolean {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (typeof document === 'undefined') return
    const sync = () => setVisible(document.visibilityState === 'visible')
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])

  return visible
}
