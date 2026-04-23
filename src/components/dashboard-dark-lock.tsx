'use client'

import { useEffect } from 'react'

/**
 * Forces `.dark` on <html> while the dashboard is mounted, without permanently
 * changing the user's theme preference (next-themes localStorage is untouched).
 *
 * This lets the dashboard render on warm Espresso, even if the user browses
 * the rest of the app in light mode. Cleanup restores whatever class was
 * present before mount.
 */
export function DashboardDarkLock() {
  useEffect(() => {
    const html = document.documentElement
    const hadDark = html.classList.contains('dark')
    const hadLight = html.classList.contains('light')

    html.classList.add('dark')
    html.classList.remove('light')

    return () => {
      if (!hadDark) html.classList.remove('dark')
      if (hadLight) html.classList.add('light')
    }
  }, [])

  return null
}
