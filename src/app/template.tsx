'use client'

import { motion } from 'framer-motion'
import { usePathname } from 'next/navigation'

/**
 * Root template that wraps every route in a subtle fade + lift.
 * Runs on every client navigation — layout.tsx is not re-rendered between
 * routes, but template.tsx is, which makes it the right place for
 * route-level transitions. Uses the pathname as the key so AnimatePresence
 * would swap cleanly if we ever add it at the layout level.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}
