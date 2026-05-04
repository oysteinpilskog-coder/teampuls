'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import {
  setDashboardMode as writeCookie,
  type DashboardMode,
} from '@/lib/dashboard-mode'

interface Ctx {
  mode: DashboardMode
  setMode: (m: DashboardMode) => void
}

const DashboardModeCtx = createContext<Ctx | null>(null)

export function DashboardModeProvider({
  initialMode,
  children,
}: {
  initialMode: DashboardMode
  children: React.ReactNode
}) {
  const [mode, setModeState] = useState<DashboardMode>(initialMode)

  const setMode = useCallback((m: DashboardMode) => {
    setModeState(m)
    writeCookie(m)
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-dashboard-mode', m)
    }
  }, [])

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-dashboard-mode', mode)
    }
  }, [mode])

  return (
    <DashboardModeCtx.Provider value={{ mode, setMode }}>
      {children}
    </DashboardModeCtx.Provider>
  )
}

/** Returns the active dashboard mode and a setter. Outside the provider it
 *  defaults to 'standard' so isolated test renders and edge cases don't
 *  crash — the avatar simply falls back to its hashed gradient. */
export function useDashboardMode(): Ctx {
  const ctx = useContext(DashboardModeCtx)
  if (!ctx) return { mode: 'standard', setMode: () => {} }
  return ctx
}
