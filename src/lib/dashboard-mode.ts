/**
 * Per-browser preference for which dashboard variant `/dashboard` resolves
 * to. The cookie is read server-side in the dashboard server page and
 * written client-side from the settings toggle.
 *
 *   "brand"      → redirect /dashboard to /dashboard-brand (CalWin BrandBook)
 *   "standard"   → render the standard rotating dashboard (default)
 *
 * Cookie-based instead of localStorage so the redirect can happen on the
 * server before any HTML is sent — no flicker, no client-side reroute.
 *
 * Named "dashboard-mode" rather than "dashboard-default" to avoid colliding
 * with the long-standing `dashboard-defaults.ts` (plural — view durations).
 */
export const DASHBOARD_MODE_COOKIE = 'tp_dashboard_mode'

export type DashboardMode = 'standard' | 'brand'

/** Set the cookie from the browser. Path=/ so it scopes to the whole app. */
export function setDashboardMode(value: DashboardMode) {
  if (typeof document === 'undefined') return
  const oneYear = 60 * 60 * 24 * 365
  document.cookie = `${DASHBOARD_MODE_COOKIE}=${value}; Path=/; Max-Age=${oneYear}; SameSite=Lax`
}

/** Read the current value from the browser. Returns 'standard' if unset. */
export function getDashboardMode(): DashboardMode {
  if (typeof document === 'undefined') return 'standard'
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${DASHBOARD_MODE_COOKIE}=([^;]+)`),
  )
  return match?.[1] === 'brand' ? 'brand' : 'standard'
}
