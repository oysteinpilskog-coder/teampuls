import type { DashboardViewKey } from './supabase/types'

/**
 * Default auto-rotation dwell time per dashboard view. Used as fallback
 * when an org hasn't customized durations in Settings, and to fill in
 * any missing keys in a partial payload.
 *
 * Wheel (E) reads slower than the operational boards, so it gets longer.
 * Nå (A) is the headline view and benefits from a longer hold so visitors
 * can read it without rushing.
 */
export const DEFAULT_VIEW_DURATIONS: Record<DashboardViewKey, number> = {
  A: 30,
  B: 20,
  C: 15,
  D: 15,
  E: 20,
}

/**
 * Bounds for user-edited durations in Settings. Below 5s the view barely
 * has time to mount cleanly; above 120s the rotation feels stuck.
 */
export const DURATION_MIN_SEC = 5
export const DURATION_MAX_SEC = 120

export function resolveViewDuration(
  view: DashboardViewKey,
  override: Partial<Record<DashboardViewKey, number>> | null | undefined,
): number {
  const v = override?.[view]
  if (typeof v === 'number' && Number.isFinite(v) && v >= DURATION_MIN_SEC && v <= DURATION_MAX_SEC) {
    return v
  }
  return DEFAULT_VIEW_DURATIONS[view]
}
