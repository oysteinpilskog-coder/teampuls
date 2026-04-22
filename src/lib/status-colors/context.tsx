'use client'

import { createContext, useContext, useMemo, useState, useCallback } from 'react'
import type { EntryStatus } from '@/lib/supabase/types'
import { DEFAULT_HEX_COLORS, mergeHexColors, type HexColors } from './defaults'
import { derivePalettes, type StatusPalette } from './derive'

type Palettes = Record<EntryStatus, StatusPalette>

interface StatusColorsCtx {
  /** Raw hex per status (current effective — org overrides merged with defaults). */
  hex: HexColors
  /** Derived palette per status (gradients, chip surfaces, glow). */
  palettes: Palettes
  /** Replace the hex map client-side (used after the user saves new colors). */
  setHex: (next: HexColors) => void
}

const Ctx = createContext<StatusColorsCtx | null>(null)

export function StatusColorsProvider({
  initialColors,
  children,
}: {
  initialColors?: Partial<HexColors> | null
  children: React.ReactNode
}) {
  const [hex, setHexState] = useState<HexColors>(() => mergeHexColors(initialColors))
  const setHex = useCallback((next: HexColors) => setHexState(next), [])
  const palettes = useMemo(() => derivePalettes(hex), [hex])

  return <Ctx.Provider value={{ hex, palettes, setHex }}>{children}</Ctx.Provider>
}

/** Read the current derived palette for all statuses. Safe outside provider — falls back to defaults. */
export function useStatusColors(): Palettes {
  const ctx = useContext(Ctx)
  if (ctx) return ctx.palettes
  return derivePalettes(DEFAULT_HEX_COLORS)
}

/** Read + set hex colors. Returns null if not inside a provider. */
export function useStatusColorsController(): StatusColorsCtx | null {
  return useContext(Ctx)
}
