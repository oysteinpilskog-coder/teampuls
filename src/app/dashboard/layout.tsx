import * as React from 'react'
import { DashboardDarkLock } from '@/components/dashboard-dark-lock'

/**
 * Dashboard-scoped layout. The dashboard is a dark, ambient surface regardless
 * of the user's global light/dark preference — it's designed for TV screens
 * and the reception-wall display.
 *
 * DashboardDarkLock adds `.dark` to <html> on mount and removes it on unmount,
 * so navigating away from /dashboard restores the user's saved theme.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DashboardDarkLock />
      {children}
    </>
  )
}
