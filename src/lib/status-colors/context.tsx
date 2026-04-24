'use client'

import { createContext, useContext, useMemo, useState, useCallback } from 'react'
import type { EntryStatus } from '@/lib/supabase/types'
import {
  DEFAULT_HEX_COLORS,
  mergeHexColors,
  extractAuroraColors,
  type HexColors,
  type AuroraColors,
  type StatusColorsPayload,
} from './defaults'
import { derivePalettes, type StatusPalette } from './derive'

type Palettes = Record<EntryStatus, StatusPalette>

interface StatusColorsCtx {
  /** Raw hex per status (current effective — org overrides merged with defaults). */
  hex: HexColors
  /** Derived palette per status (gradients, chip surfaces, glow). */
  palettes: Palettes
  /** Optional per-pin Nordlys overrides. Empty object = auto-derive from pin hue. */
  auroras: AuroraColors
  /** Replace the hex map client-side (used after the user saves new colors). */
  setHex: (next: HexColors) => void
  /** Replace the Nordlys overrides client-side (used after the user saves). */
  setAuroras: (next: AuroraColors) => void
}

const Ctx = createContext<StatusColorsCtx | null>(null)

export function StatusColorsProvider({
  initialColors,
  children,
}: {
  initialColors?: StatusColorsPayload | null
  children: React.ReactNode
}) {
  const [hex, setHexState] = useState<HexColors>(() => mergeHexColors(initialColors))
  const [auroras, setAurorasState] = useState<AuroraColors>(() => extractAuroraColors(initialColors))
  const setHex = useCallback((next: HexColors) => setHexState(next), [])
  const setAuroras = useCallback((next: AuroraColors) => setAurorasState(next), [])
  const palettes = useMemo(() => derivePalettes(hex), [hex])

  return (
    <Ctx.Provider value={{ hex, palettes, auroras, setHex, setAuroras }}>
      {children}
    </Ctx.Provider>
  )
}

/** Read the current derived palette for all statuses. Safe outside provider — falls back to defaults. */
export function useStatusColors(): Palettes {
  const ctx = useContext(Ctx)
  if (ctx) return ctx.palettes
  return derivePalettes(DEFAULT_HEX_COLORS)
}

/** Read current Nordlys overrides. Empty object when none are set or outside provider. */
export function useAuroraColors(): AuroraColors {
  const ctx = useContext(Ctx)
  return ctx?.auroras ?? {}
}

/** Read + set hex colors. Returns null if not inside a provider. */
export function useStatusColorsController(): StatusColorsCtx | null {
  return useContext(Ctx)
}
