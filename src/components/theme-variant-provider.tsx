'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import {
  THEME_STORAGE_KEY,
  isThemeId,
  type ThemeId,
} from '@/lib/themes'

interface ThemeVariantCtx {
  variant: ThemeId
  setVariant: (v: ThemeId) => void
  /** Org-wide default set by an admin. Applied when the user has no
   *  local override. */
  orgDefault: ThemeId
  /** True when the active variant is the org default (no local override). */
  followsOrg: boolean
  /** Drop the local override and follow the org default again. */
  followOrgDefault: () => void
}

const Ctx = createContext<ThemeVariantCtx | null>(null)

export function ThemeVariantProvider({
  orgDefault,
  children,
}: {
  orgDefault: ThemeId
  children: React.ReactNode
}) {
  const [variant, setVariantState] = useState<ThemeId>(orgDefault)
  const [followsOrg, setFollowsOrg] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    if (isThemeId(saved)) {
      setVariantState(saved)
      setFollowsOrg(false)
      document.documentElement.setAttribute('data-theme', saved)
    } else {
      setVariantState(orgDefault)
      setFollowsOrg(true)
      document.documentElement.setAttribute('data-theme', orgDefault)
    }
  }, [orgDefault])

  const setVariant = useCallback((v: ThemeId) => {
    setVariantState(v)
    setFollowsOrg(false)
    localStorage.setItem(THEME_STORAGE_KEY, v)
    document.documentElement.setAttribute('data-theme', v)
  }, [])

  const followOrgDefault = useCallback(() => {
    localStorage.removeItem(THEME_STORAGE_KEY)
    setVariantState(orgDefault)
    setFollowsOrg(true)
    document.documentElement.setAttribute('data-theme', orgDefault)
  }, [orgDefault])

  return (
    <Ctx.Provider value={{ variant, setVariant, orgDefault, followsOrg, followOrgDefault }}>
      {children}
    </Ctx.Provider>
  )
}

export function useThemeVariant() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useThemeVariant must be used inside ThemeVariantProvider')
  return ctx
}
