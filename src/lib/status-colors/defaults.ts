import type { EntryStatus } from '@/lib/supabase/types'

/**
 * Canonical default hex colors per status — the Linear/Notion-calibrated palette.
 * Organizations can override via `organizations.status_colors` JSONB column.
 *
 * Single value per status: gradient top + darker bottom + glow are all derived from this one hex.
 */
export const DEFAULT_HEX_COLORS: Record<EntryStatus, string> = {
  office:   '#2563EB',  // cobalt
  remote:   '#059669',  // emerald
  customer: '#14B8A6',  // teal
  travel:   '#7C3AED',  // violet
  vacation: '#CA8A04',  // saffron
  sick:     '#E11D48',  // coral
  off:      '#78716C',  // warm stone
}

export type HexColors = Record<EntryStatus, string>

/** Merge user-provided colors with defaults. Missing keys fall back to defaults. */
export function mergeHexColors(input: Partial<HexColors> | null | undefined): HexColors {
  if (!input) return DEFAULT_HEX_COLORS
  return { ...DEFAULT_HEX_COLORS, ...input }
}
