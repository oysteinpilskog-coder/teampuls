import type { EntryStatus } from '@/lib/supabase/types'

/**
 * Canonical default hex colors per status.
 *
 * Dark Liquid Glass (2026) palette — "dempet, ikke neon". Shifted from the
 * previous saturated Linear/Notion palette to subdued pastels that read as
 * category accents against dark glass surfaces rather than as primary signals.
 * Organizations can still override via `organizations.status_colors`.
 */
export const DEFAULT_HEX_COLORS: Record<EntryStatus, string> = {
  office:   '#6366F1',  // indigo — "focus / tilstede"
  remote:   '#2DD4BF',  // teal — "work / hjemme"
  customer: '#A78BFA',  // soft violet — "ute / hos kunde"
  event:    '#F472B6',  // pink — "messe / konferanse / kurs"
  travel:   '#FBBF24',  // amber — "reise"
  vacation: '#FB7185',  // rose — "viktig / ferie"
  sick:     '#F87171',  // coral-dempet — "syk"
  off:      '#94A3B8',  // slate — "fri / borte"
}

export type HexColors = Record<EntryStatus, string>

/** Merge user-provided colors with defaults. Missing keys fall back to defaults. */
export function mergeHexColors(input: Partial<HexColors> | null | undefined): HexColors {
  if (!input) return DEFAULT_HEX_COLORS
  return { ...DEFAULT_HEX_COLORS, ...input }
}
