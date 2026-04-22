'use client'

/**
 * Thin wrapper around navigator.vibrate. Safe to call from any environment —
 * silently no-ops where the API is missing (desktop browsers, Safari iOS < 18,
 * reduced-motion preference).
 *
 * Usage:
 *   const haptic = useHaptic()
 *   <button onClick={() => { haptic('light'); submit() }}>…</button>
 */

type HapticKind = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error'

const PATTERNS: Record<HapticKind, number | number[]> = {
  light:   6,
  medium:  12,
  heavy:   22,
  success: [8, 40, 14],
  warning: [12, 50, 12],
  error:   [22, 60, 22, 60, 22],
}

export function useHaptic() {
  return (kind: HapticKind = 'light') => {
    if (typeof window === 'undefined') return
    // Respect the reduced-motion preference — users who opted out of
    // motion generally also want fewer incidental buzzes.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const v = navigator.vibrate?.bind(navigator)
    if (!v) return
    try {
      v(PATTERNS[kind])
    } catch {
      /* Some embedded contexts throw on vibrate; swallow. */
    }
  }
}
