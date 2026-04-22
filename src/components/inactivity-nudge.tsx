'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import { X, PenSquare } from 'lucide-react'
import { addDays, subDays } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { toDateString, getWeekStart } from '@/lib/dates'
import { getISOWeek, getISOWeekYear } from 'date-fns'

interface InactivityNudgeProps {
  orgId: string
  memberId: string
}

const DISMISS_KEY = 'tp:inactivity-nudge-dismissed-until'
/** Working days (Mon-Fri) with no entry before we surface the nudge. */
const MIN_MISSING_DAYS = 5

/**
 * Gentle reminder for users who haven't logged presence recently. Checks the
 * current ISO week Mon-Fri for this member's entries; if fewer than 2 days
 * are registered, show a dismissible glass chip that focuses the AI input.
 *
 * Dismissal persists for 24h via localStorage so we don't nag.
 */
export function InactivityNudge({ orgId, memberId }: InactivityNudgeProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let cancelled = false

    // Respect prior dismissal — 24h cooldown.
    const dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) ?? '0')
    if (Date.now() < dismissedUntil) return

    async function check() {
      const supabase = createClient()
      const now = new Date()
      const week = getISOWeek(now)
      const year = getISOWeekYear(now)
      const weekStart = getWeekStart(week, year)
      // Only look at weekdays up to and including today (no future scolding).
      const lastRelevantDay = now < addDays(weekStart, 4) ? now : addDays(weekStart, 4)
      const from = toDateString(weekStart)
      const to = toDateString(lastRelevantDay)

      const { data, error } = await supabase
        .from('entries')
        .select('date')
        .eq('org_id', orgId)
        .eq('member_id', memberId)
        .gte('date', from)
        .lte('date', to)

      if (cancelled || error) return

      // Days from Monday (inclusive) up to and including today — max 5.
      const weekdaysElapsed = Math.min(
        5,
        Math.floor((now.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24)) + 1,
      )
      const registered = new Set((data ?? []).map((r) => r.date))
      const missing = weekdaysElapsed - registered.size

      // Only nag when the week is at least partly through AND the gap is wide.
      // Prevents Monday-morning pop-ups.
      if (weekdaysElapsed >= 2 && missing >= 2) {
        setVisible(true)
      }
      // For users just joining: if they have no entries in the last ~5 working
      // days counted across weeks, still nudge.
      if (registered.size === 0) {
        const checkFrom = toDateString(subDays(now, 10))
        const { data: pastData } = await supabase
          .from('entries')
          .select('date')
          .eq('member_id', memberId)
          .gte('date', checkFrom)
          .limit(1)
        if (!cancelled && (pastData ?? []).length === 0) {
          setVisible(true)
        }
      }
    }

    check()
    return () => {
      cancelled = true
    }
  }, [orgId, memberId])

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + 24 * 60 * 60 * 1000))
    setVisible(false)
  }

  function focusAIInput() {
    // AI input listens for "/" — fire a synthetic focus via the existing global
    // event shortcut. Falls back to querying the DOM if the shortcut fails.
    const event = new KeyboardEvent('keydown', { key: '/' })
    window.dispatchEvent(event)
    const el = document.querySelector<HTMLInputElement>('input[type="text"]')
    el?.focus()
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.98 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          className="fixed bottom-6 right-6 z-40 max-w-[340px]"
          style={{
            background: 'rgba(22, 22, 27, 0.7)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid rgba(139, 92, 246, 0.28)',
            borderRadius: 14,
            boxShadow:
              '0 0 0 3px rgba(139, 92, 246, 0.10), 0 20px 40px -12px rgba(0,0,0,0.45), 0 0 24px -6px var(--lg-accent-glow)',
          }}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3 p-4">
            <div
              className="flex items-center justify-center rounded-lg shrink-0"
              style={{
                width: 32,
                height: 32,
                background: 'rgba(139, 92, 246, 0.14)',
                color: 'var(--lg-accent)',
              }}
            >
              <PenSquare className="w-4 h-4" strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <div
                className="text-[13px] font-medium mb-0.5"
                style={{ color: 'var(--lg-text-1)', fontFamily: 'var(--font-body)' }}
              >
                Har du vært på kontoret denne uken?
              </div>
              <div
                className="text-[12px] leading-snug"
                style={{ color: 'var(--lg-text-2)', fontFamily: 'var(--font-body)' }}
              >
                Logg statusen din så teamet vet hvor du jobber fra.
              </div>
              <div className="flex items-center gap-2 mt-2.5">
                <button
                  type="button"
                  onClick={focusAIInput}
                  className="px-2.5 py-1 rounded-full text-[11.5px] font-medium transition-[background] duration-150"
                  style={{
                    background: 'var(--lg-accent)',
                    color: '#ffffff',
                    fontFamily: 'var(--font-body)',
                    boxShadow: '0 0 0 3px rgba(139, 92, 246, 0.18), 0 0 14px var(--lg-accent-glow)',
                  }}
                >
                  Logg nå
                </button>
                <button
                  type="button"
                  onClick={dismiss}
                  className="text-[11.5px] transition-colors duration-150"
                  style={{ color: 'var(--lg-text-3)', fontFamily: 'var(--font-body)' }}
                >
                  Senere
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Lukk"
              className="rounded-lg p-1 -m-1 transition-colors duration-150 shrink-0"
              style={{ color: 'var(--lg-text-3)' }}
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Silence unused-import warning for `MIN_MISSING_DAYS` — kept as a tunable.
void MIN_MISSING_DAYS
