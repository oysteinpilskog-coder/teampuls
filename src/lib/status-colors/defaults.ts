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

/**
 * Optional per-pin overrides of the map-pin aurora glow (the "Nordlys").
 * When absent, the map pins auto-derive the aurora as the 180° complement
 * of the pin colour. Persisted alongside the status colours in the same
 * `organizations.status_colors` JSONB (keys `office_aurora`, `customer_aurora`).
 */
export interface AuroraColors {
  office?: string
  customer?: string
}

/** Loose shape of the `organizations.status_colors` JSONB. Covers the
 *  per-status hex keys plus the optional aurora overrides. */
export type StatusColorsPayload =
  & Partial<HexColors>
  & { office_aurora?: string; customer_aurora?: string }

/** Merge user-provided colors with defaults. Missing keys fall back to defaults. */
export function mergeHexColors(input: Partial<HexColors> | null | undefined): HexColors {
  if (!input) return DEFAULT_HEX_COLORS
  return { ...DEFAULT_HEX_COLORS, ...input }
}

/** Pull the optional aurora overrides out of the raw JSONB payload.
 *  Invalid entries are dropped. Empty object when nothing is set, so
 *  callers can treat the result as "override or auto-derive". */
export function extractAuroraColors(
  input: StatusColorsPayload | null | undefined
): AuroraColors {
  if (!input) return {}
  const out: AuroraColors = {}
  if (typeof input.office_aurora === 'string' && /^#[0-9a-fA-F]{6}$/.test(input.office_aurora)) {
    out.office = input.office_aurora.toUpperCase()
  }
  if (typeof input.customer_aurora === 'string' && /^#[0-9a-fA-F]{6}$/.test(input.customer_aurora)) {
    out.customer = input.customer_aurora.toUpperCase()
  }
  return out
}
