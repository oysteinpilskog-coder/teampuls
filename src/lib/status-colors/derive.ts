import type { EntryStatus } from '@/lib/supabase/types'
import type { HexColors } from './defaults'

/** One derived palette per status — every surface tone a component needs, from one hex input. */
export interface StatusPalette {
  /** Primary tint — used for icons, dots, solid accents. (Kept as `icon` to match the legacy STATUS_COLORS shape.) */
  icon: string
  /** Soft tinted surface for pills/chips (light mode). */
  bg: string
  /** Legible text color over `bg` (light mode). */
  text: string
  /** Soft tinted surface for pills/chips (dark mode). */
  bgDark: string
  /** Legible text color over `bgDark` (dark mode). */
  textDark: string
  /** 2-stop vertical gradient [top, bottom] per theme — for calendar matrix bars. */
  gradient: { light: [string, string]; dark: [string, string] }
  /** Glow source — paired with alpha at consume-time. */
  glow: string
}

/** Parse a #RRGGBB string to [r,g,b]. Returns null on failure. */
function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([a-f\d]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

function toHex([r, g, b]: [number, number, number]): string {
  const clamp = (x: number) => Math.max(0, Math.min(255, Math.round(x)))
  return '#' + [r, g, b].map(c => clamp(c).toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** Mix two colors. `t` is the amount of `b` to mix in (0 = pure a, 1 = pure b). */
function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

const BLACK: [number, number, number] = [0, 0, 0]
const WHITE: [number, number, number] = [255, 255, 255]

/** Derive all surface tones a status needs from a single hex color. */
export function derivePalette(hex: string): StatusPalette {
  const rgb = parseHex(hex) ?? [60, 60, 60]
  const icon = toHex(rgb)

  return {
    icon,
    // Light mode surfaces: very soft tint on near-white.
    bg:       toHex(mix(WHITE, rgb, 0.18)),
    text:     toHex(mix(rgb, BLACK, 0.45)),
    // Dark mode surfaces: deep tinted near-black.
    bgDark:   toHex(mix(BLACK, rgb, 0.18)),
    textDark: toHex(mix(rgb, WHITE, 0.45)),
    // Gradient — top is the pure color, bottom is darkened.
    // Slightly darker foot on dark mode so bars feel seated.
    gradient: {
      light: [icon, toHex(mix(rgb, BLACK, 0.18))],
      dark:  [icon, toHex(mix(rgb, BLACK, 0.32))],
    },
    glow: icon,
  }
}

/** Derive palettes for all statuses at once. */
export function derivePalettes(colors: HexColors): Record<EntryStatus, StatusPalette> {
  return {
    office:   derivePalette(colors.office),
    remote:   derivePalette(colors.remote),
    customer: derivePalette(colors.customer),
    event:    derivePalette(colors.event),
    travel:   derivePalette(colors.travel),
    vacation: derivePalette(colors.vacation),
    sick:     derivePalette(colors.sick),
    off:      derivePalette(colors.off),
  }
}
