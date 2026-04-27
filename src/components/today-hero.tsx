'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { formatDateLabelLong } from '@/lib/dates'
import { useT } from '@/lib/i18n/context'
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
  const [label, setLabel] = useState('')

  useEffect(() => {
    setLabel(formatDateLabelLong(new Date(), t))
  }, [t])

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.gentle}
      className="select-none"
      suppressHydrationWarning
    >
      <h1
        className="lg-serif leading-[0.95]"
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
