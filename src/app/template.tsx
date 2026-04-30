'use client'

import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { usePathname } from 'next/navigation'
import { ease } from '@/lib/motion'

/**
 * Root template that wraps every route in a subtle fade + lift.
 *
 * Runs on every client navigation — layout.tsx is not re-rendered between
 * routes, but template.tsx is, which makes it the right place for
 * route-level transitions.
 *
 * Two safety nets that the previous version didn't have:
 *
 * 1. **Initial render renders at opacity 1.** Framer's `initial={{ opacity: 0 }}`
 *    SSR'd `<div style="opacity:0">`, so any visitor without JS — or any
 *    visitor whose tab was throttled/hidden during hydration — saw a blank
 *    page until framer kicked in. We track `hasMounted` and only enable the
 *    enter animation after the client has had a tick to take over.
 *
 * 2. **Respect prefers-reduced-motion.** Reduced-motion users skip the lift
 *    entirely and just get an instant cross-fade.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const prefersReducedMotion = useReducedMotion()
  const [hasMounted, setHasMounted] = useState(false)

  useEffect(() => {
    setHasMounted(true)
  }, [])

  return (
    <motion.div
      key={pathname}
      initial={hasMounted ? { opacity: 0, y: prefersReducedMotion ? 0 : 6 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0.12 : 0.24, ease: ease.horizon }}
    >
      {children}
    </motion.div>
  )
}
