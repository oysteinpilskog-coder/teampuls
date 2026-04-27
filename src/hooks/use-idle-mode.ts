'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { isPublicHolidayNO } from '@/lib/no-holidays'
import { track } from '@/lib/analytics'

export interface UseIdleModeOptions {
  /**
   * Live count of active "office" or "customer" entries from the latest
   * data fetch. Hook reacts when this changes — a Realtime push that bumps
   * the count above `minActiveForBusy` deactivates idle without waiting for
   * the 60s tick.
   */
  activeCount: number
  /** Idle when `activeCount < minActiveForBusy`. Default 2. */
  minActiveForBusy?: number
  /** No input for this long → idle-eligible. Default 10 min. */
  idleAfterMs?: number
  /** How often to re-evaluate auto-conditions. Default 60 sec. */
  checkIntervalMs?: number
  /** Business-day window in minutes-of-day. Default 07:30 → 17:00. */
  businessStartMin?: number
  businessEndMin?: number
}

export interface UseIdleModeResult {
  isIdle: boolean
  /** Force-activate. Used by demos and Cmd+D bindings. */
  activate: () => void
  /** Force-deactivate. */
  deactivate: () => void
}

type Reason =
  | 'manual_activate'
  | 'manual_deactivate'
  | 'auto_conditions_met'
  | 'input'
  | 'business_hours_started'
  | 'activity_detected'

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

function isWeekend(d: Date): boolean {
  const day = d.getDay()
  return day === 0 || day === 6
}

/**
 * useIdleMode — TV-dashboard whisper mode.
 *
 * Auto-activates when ALL of:
 *  1. Outside business hours (07:30–17:00 weekday) OR weekend OR NO holiday.
 *  2. activeCount < minActiveForBusy ("På kontoret"/"Hos kunde" tally).
 *  3. No keydown / mousemove / touchstart in the last `idleAfterMs`.
 *
 * The 60s tick re-evaluates all three; activeCount changes also trigger an
 * immediate re-evaluation so a Realtime push wakes the dashboard right
 * away rather than after up to a minute.
 *
 * Auto-deactivates when ANY of:
 *  1. Input event detected (instant; consumer is responsible for the 500ms
 *     visual fade — the hook only flips `isIdle: false` synchronously).
 *  2. Business-hours window opens on a non-weekend, non-holiday day.
 *  3. activeCount rises to `minActiveForBusy` or higher.
 *
 * Manual: `activate()` / `deactivate()` — useful for Cmd+D demo bindings.
 *
 * Each transition fires `track('idle_mode_activated' | 'idle_mode_deactivated')`
 * with `{ reason, ts_iso }`.
 */
export function useIdleMode({
  activeCount,
  minActiveForBusy = 2,
  idleAfterMs = 10 * 60 * 1000,
  checkIntervalMs = 60 * 1000,
  businessStartMin = 7 * 60 + 30,
  businessEndMin = 17 * 60,
}: UseIdleModeOptions): UseIdleModeResult {
  const [isIdle, setIsIdle] = useState(false)

  // Synced inside `transition()`. Used as the source of truth for guards
  // because React state updates lag a render — without this ref, two events
  // in the same tick could both decide "the user is idle" and double-fire
  // the analytics event.
  const isIdleRef = useRef(false)
  const lastInputAtRef = useRef<number>(Date.now())

  const transition = useCallback((nextIdle: boolean, reason: Reason) => {
    if (isIdleRef.current === nextIdle) return
    isIdleRef.current = nextIdle
    setIsIdle(nextIdle)
    track(nextIdle ? 'idle_mode_activated' : 'idle_mode_deactivated', {
      reason,
      ts_iso: new Date().toISOString(),
    })
  }, [])

  const activate = useCallback(() => transition(true, 'manual_activate'), [transition])
  const deactivate = useCallback(() => transition(false, 'manual_deactivate'), [transition])

  // Helper: are we currently outside the business window? (Used by both
  // the 60s tick and the activeCount-change effect.)
  const isOutsideBusinessHoursRef = useRef<(now: Date) => boolean>(() => false)
  isOutsideBusinessHoursRef.current = (now: Date) => {
    if (isWeekend(now)) return true
    if (isPublicHolidayNO(now)) return true
    const m = minutesOfDay(now)
    return m < businessStartMin || m >= businessEndMin
  }

  // Input listener: ref-based stamp + instant wake. Ref writes are O(1) so
  // no throttling — and the wake-up branch only runs while idle, so no
  // re-render storm during normal usage.
  useEffect(() => {
    const onInput = () => {
      lastInputAtRef.current = Date.now()
      if (isIdleRef.current) transition(false, 'input')
    }
    window.addEventListener('keydown', onInput, { passive: true })
    window.addEventListener('mousemove', onInput, { passive: true })
    window.addEventListener('touchstart', onInput, { passive: true })
    return () => {
      window.removeEventListener('keydown', onInput)
      window.removeEventListener('mousemove', onInput)
      window.removeEventListener('touchstart', onInput)
    }
  }, [transition])

  // Auto-evaluation tick.
  useEffect(() => {
    const evaluate = () => {
      const now = new Date()
      const outsideHours = isOutsideBusinessHoursRef.current(now)
      const lowActivity = activeCount < minActiveForBusy
      const noInput = Date.now() - lastInputAtRef.current >= idleAfterMs

      if (isIdleRef.current) {
        if (!outsideHours) {
          transition(false, 'business_hours_started')
          return
        }
        if (!lowActivity) {
          transition(false, 'activity_detected')
          return
        }
        // Stay idle if user manually activated despite some condition not
        // holding — manual activation is sticky until input or business
        // hours / activity force a wake.
      } else {
        if (outsideHours && lowActivity && noInput) {
          transition(true, 'auto_conditions_met')
        }
      }
    }
    evaluate()
    const id = setInterval(evaluate, checkIntervalMs)
    return () => clearInterval(id)
  }, [activeCount, minActiveForBusy, idleAfterMs, checkIntervalMs, transition])

  // Reactive deactivation on activity bump — don't wait for the 60s tick
  // when a Realtime push has already told us someone showed up.
  useEffect(() => {
    if (isIdleRef.current && activeCount >= minActiveForBusy) {
      transition(false, 'activity_detected')
    }
  }, [activeCount, minActiveForBusy, transition])

  return { isIdle, activate, deactivate }
}
