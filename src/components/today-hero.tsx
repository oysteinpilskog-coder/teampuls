'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { formatDateLabelLong } from '@/lib/dates'
import { useT } from '@/lib/i18n/context'
import { useWorkspace } from '@/lib/workspace/context'
import { CalwinMark } from '@/components/brand/calwin-mark'
import { spring } from '@/lib/motion'

/**
 * TodayHero — a serif display "oppslag" of today's date.
 *
 * Lives just above the week meta-strip on the Oversikt page. It anchors the
 * page in the current day with a confident Fraunces italic line ("Mandag 27.
 * april") that reads like a poster headline. The compact eyebrow strip below
 * still carries the week number, range, NÅ pulse and metrics.
 *
 * The label is computed in `useEffect` so server- and client-rendered HTML
 * agree even if the wall clock ticks across midnight between SSR and
 * hydration — same trick WeekNav used for its inline date label.
 */
export function TodayHero() {
  const t = useT()
  const { active } = useWorkspace()
  const [label, setLabel] = useState('')

  useEffect(() => {
    setLabel(formatDateLabelLong(new Date(), t))
  }, [t])

  // Subtle brand watermark in the empty space beside the date — only for
  // CalWin workspaces, desktop only (avoids colliding with longer date
  // strings on narrow screens).
  const showMark = !!active && /calwin/i.test(active.name)

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.gentle}
      className="relative select-none"
      suppressHydrationWarning
    >
      {showMark && (
        <span
          aria-hidden
          className="pointer-events-none absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 hidden sm:block"
          style={{ color: 'var(--accent-color)', opacity: 0.1 }}
        >
          <CalwinMark size={72} monochrome />
        </span>
      )}
      <h1
        className="calwin-bar lg-serif leading-[0.95]"
        style={{
          color: 'var(--lg-text-1)',
          fontSize: 36,
        }}
      >
        {label || ' '}
      </h1>
    </motion.div>
  )
}
