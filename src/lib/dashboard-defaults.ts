import type { DashboardViewKey } from './supabase/types'

/**
 * Default auto-rotation dwell time per dashboard view. Used as fallback
 * when an org hasn't customized durations in Settings, and to fill in
 * any missing keys in a partial payload.
 *
 * Wheel (E) reads slower than the operational boards, so it gets longer.
 * Nå (A) is the headline view and benefits from a longer hold so visitors
 * can read it without rushing.
 *
 * Velkomst (F) er ikke konfigurerbar i Settings — den injiseres dynamisk
 * når et besøk er innenfor sitt vindu. Default på 30 sek; ved flere
 * samtidige besøk skalerer welcomeDwellSec() varigheten så hver person
 * får sin sykling før vi går videre.
 */
export const DEFAULT_VIEW_DURATIONS: Record<DashboardViewKey, number> = {
  A: 30,
  B: 20,
  C: 15,
  D: 15,
  E: 20,
  F: 30,
}

/**
 * Velkomst-modusen cycler gjennom n besøk på ~12 s per besøkende; vi gir
 * minst 30 s totalt så animasjonene rekker å slutte selv ved ett besøk.
 */
export function welcomeDwellSec(visitCount: number): number {
  if (visitCount <= 1) return DEFAULT_VIEW_DURATIONS.F
  return Math.max(DEFAULT_VIEW_DURATIONS.F, visitCount * 12)
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

/**
 * After-hours window (local time). Outside 07:00–18:00 the dashboard
 * acts as if the office is empty — slower rotation, dimmer aurora.
 * Symmetric so reception TVs in different timezones get the same feel.
 */
export const QUIET_START_HOUR = 18
export const QUIET_END_HOUR = 7
export const QUIET_DWELL_FACTOR = 1.5

export function isQuietHour(hour: number): boolean {
  return hour < QUIET_END_HOUR || hour >= QUIET_START_HOUR
}

/**
 * Stretches the dwell window by 1.5× when no one is around. Reception is
 * empty after 18:00 — the screen should breathe slower, not march on at
 * the same cadence as 11:00.
 */
export function applyQuietHours(durationSec: number, hour: number): number {
  return isQuietHour(hour) ? Math.round(durationSec * QUIET_DWELL_FACTOR) : durationSec
}
