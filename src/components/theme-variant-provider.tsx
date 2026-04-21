'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  isThemeId,
  type ThemeId,
} from '@/lib/themes'

interface ThemeVariantCtx {
  variant: ThemeId
  setVariant: (v: ThemeId) => void
}

const Ctx = createContext<ThemeVariantCtx | null>(null)

export function ThemeVariantProvider({ children }: { children: React.ReactNode }) {
  const [variant, setVariantState] = useState<ThemeId>(DEFAULT_THEME)

  useEffect(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    if (isThemeId(saved)) {
      setVariantState(saved)
      document.documentElement.setAttribute('data-theme', saved)
    } else {
      document.documentElement.setAttribute('data-theme', DEFAULT_THEME)
    }
  }, [])

  const setVariant = useCallback((v: ThemeId) => {
    setVariantState(v)
    localStorage.setItem(THEME_STORAGE_KEY, v)
    document.documentElement.setAttribute('data-theme', v)
  }, [])

  return <Ctx.Provider value={{ variant, setVariant }}>{children}</Ctx.Provider>
}

export function useThemeVariant() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useThemeVariant must be used inside ThemeVariantProvider')
  return ctx
}

export const themeVariantBootScript = `
(function(){try{
  var k='${THEME_STORAGE_KEY}';
  var v=localStorage.getItem(k);
  var allowed=['nordic','obsidian','aurora','crystal','ember','sakura','forest','monaco','champagne'];
  if(!v||allowed.indexOf(v)===-1)v='${DEFAULT_THEME}';
  document.documentElement.setAttribute('data-theme',v);
}catch(e){}})();
`.trim()
