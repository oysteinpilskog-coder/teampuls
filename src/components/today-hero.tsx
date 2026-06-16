'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { formatDateLabelLong } from '@/lib/dates'
import { useT } from '@/lib/i18n/context'
import { spring } from '@/lib/motion'

/**
 * TodayHero — a serif display "oppslag" of today's date.
 *
 * Rendered as the left anchor of the WeekNav strip on the Oversikt page, so the
 * date and the week meta (week · range · NÅ · metrics · month) share a single
 * compact header row. The confident Fraunces line ("Mandag 27. april") reads
 * like a poster headline; `shrink-0` keeps it from compressing as the meta
 * pills wrap beside it.
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
      className="select-none shrink-0"
      suppressHydrationWarning
    >
      <h1
        className="calwin-bar lg-serif leading-[0.95] whitespace-nowrap"
        style={{
          color: 'var(--lg-text-1)',
          fontSize: 30,
        }}
      >
        {label || ' '}
      </h1>
    </motion.div>
  )
}
