/**
 * Thin analytics wrapper. No real provider wired up yet — this is a stub
 * that logs to console (dev) and stashes events in localStorage so they
 * can be inspected during prototype rollout. When PostHog (or similar)
 * lands, replace the body of `track()` and remove the localStorage path.
 *
 * Design constraints:
 *  - Fire-and-forget: never throws, never blocks the caller.
 *  - SSR-safe: no-op on the server.
 *  - Forward-compat: if `window.posthog` happens to exist (script tag
 *    injected externally), we call it too — that lets us roll out PostHog
 *    via a snippet without redeploying the app.
 */

const STORAGE_KEY = 'offiview:analytics_events'
const MAX_STORED = 100

type Props = Record<string, string | number | boolean | null>

interface PostHogLike {
  capture?: (event: string, props?: Props) => void
}

declare global {
  interface Window {
    posthog?: PostHogLike
  }
}

export function track(event: string, props: Props = {}): void {
  if (typeof window === 'undefined') return
  try {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log(`[analytics] ${event}`, props)
    }
    window.posthog?.capture?.(event, props)
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const list: Array<{ event: string; props: Props; ts: number }> = raw
      ? JSON.parse(raw)
      : []
    list.push({ event, props, ts: Date.now() })
    while (list.length > MAX_STORED) list.shift()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    /* analytics never breaks the app */
  }
}

export interface BrandImpressionProps extends Props {
  view_key: 'A' | 'B' | 'C' | 'D' | 'E'
  dwell_sec: number
  org_id: string
}

export function trackBrandImpression(props: BrandImpressionProps): void {
  track('brand_impression', props)
}
