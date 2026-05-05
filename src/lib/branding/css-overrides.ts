/**
 * SaaS-grade brand overrides — converts an org's `(brand_primary,
 * brand_accent)` pair into a CSS string that overrides the canonical
 * Blue Violet / Light Blue tokens from `globals.css` for both light
 * and dark mode.
 *
 * Why a CSS string (and not body-style props):
 *   - Need to redefine `:root` and `html.dark` scopes — body inline
 *     styles can't carry mode-specific overrides.
 *   - Server-rendered into <head> so the very first paint already
 *     reflects the org's brand. Zero flash to defaults on hydration.
 *
 * Why color-mix() for shades:
 *   - Two hex values drive the entire ramp. Approximations match the
 *     canonical CalWin pair within ~2 ΔE — visually identical for
 *     CalWin's own org, and the *correct* derivation for any other
 *     brand pair a future SaaS customer plugs in.
 *
 * Why strict hex validation:
 *   - Defense-in-depth. The DB CHECK constraint already enforces
 *     `^#[0-9a-f]{6}$`, but this string is interpolated into a
 *     server-rendered <style> tag, so an attacker-controlled value
 *     would otherwise be a CSS-injection seam.
 */

const HEX_RE = /^#[0-9a-fA-F]{6}$/

/** Canonical CalWin BrandBook pair — defaults when an org has no
 *  brand_primary/brand_accent (pre-migration-030 rows). */
export const CALWIN_BRAND_PRIMARY = '#322E7A'
export const CALWIN_BRAND_ACCENT  = '#66C4EF'

/** Validate + normalize a hex color. Returns `null` if invalid. */
export function safeHex(value: string | null | undefined): string | null {
  if (!value) return null
  return HEX_RE.test(value) ? value : null
}

export interface BrandPair {
  primary: string
  accent: string
}

/** Read an org's brand pair, falling back to the CalWin defaults. The
 *  result is always safe to interpolate into a CSS string. */
export function brandPairFromWorkspace(
  workspace: { brand_primary?: string | null; brand_accent?: string | null } | null | undefined,
): BrandPair {
  return {
    primary: safeHex(workspace?.brand_primary) ?? CALWIN_BRAND_PRIMARY,
    accent:  safeHex(workspace?.brand_accent)  ?? CALWIN_BRAND_ACCENT,
  }
}

/** True when the pair matches the canonical CalWin defaults — lets
 *  the layout skip emitting a redundant <style> block. */
export function isDefaultBrand(pair: BrandPair): boolean {
  return (
    pair.primary.toUpperCase() === CALWIN_BRAND_PRIMARY &&
    pair.accent.toUpperCase()  === CALWIN_BRAND_ACCENT
  )
}

/**
 * Build the override CSS for a brand pair. The output redefines:
 *   - Named tokens (--ink, --ember, gradient stops) — apply in both modes.
 *   - shadcn light-mode tokens — :root:not(.dark) scope.
 *   - shadcn dark-mode tokens   — html.dark scope.
 *
 * Returned string is `<style>`-tag-safe (no `</style>` injection
 * possible because hex values are validated).
 */
export function buildBrandOverrideCss({ primary, accent }: BrandPair): string {
  // Mid-shades between primary and a neutral. color-mix-in-oklab gives
  // a perceptually even ramp regardless of the source hue.
  const espresso  = `color-mix(in oklab, ${primary} 65%, #000000)`        // -35% lightness
  const dusk      = `color-mix(in oklab, ${primary} 75%, #FFFFFF)`        // +25% lightness
  const mist      = `color-mix(in oklab, ${primary} 50%, #FFFFFF)`        // +50% lightness

  const accentDeep = `color-mix(in oklab, ${accent} 75%, #000000)`
  const accentSoft = `color-mix(in oklab, ${accent} 70%, #FFFFFF)`
  const accentGlow = `color-mix(in oklab, ${accent} 50%, #FFFFFF)`

  // Translucent variants — for aurora, rings, panel tints.
  const accentTint32 = `color-mix(in oklab, ${accent} 32%, transparent)`
  const accentTint20 = `color-mix(in oklab, ${accent} 20%, transparent)`
  const primaryTint16 = `color-mix(in oklab, ${primary} 16%, transparent)`
  const primaryTint62 = `color-mix(in oklab, ${primary} 62%, transparent)`

  // Dark-mode canvas ramp — derived from primary.
  const darkBg      = `color-mix(in oklab, ${primary} 75%, #000000)`     // #1F1C52-ish
  const darkBgDeep  = `color-mix(in oklab, ${primary} 55%, #000000)`     // #15123E-ish
  const darkSurf1   = `color-mix(in oklab, ${primary} 88%, #000000)`     // #2A2668-ish
  const darkSurf3   = `color-mix(in oklab, ${primary} 88%, #FFFFFF)`     // #3D3892-ish

  return `
:root {
  --ink: ${primary};
  --espresso: ${espresso};
  --dusk: ${dusk};
  --mist: ${mist};
  --ember: ${accent};
  --ember-soft: ${accentSoft};
  --ember-deep: ${accentDeep};
  --ember-glow: ${accentGlow};
  --nordlys-a: ${accent};
  --nordlys-b: ${dusk};
  --nordlys-c: ${primary};
}
:root:not(.dark) {
  --accent-color: ${accent};
  --accent-glow: ${accentTint32};
  --aurora-a: ${primaryTint16};
  --aurora-b: ${accentTint20};
  --foreground: ${primary};
  --card-foreground: ${primary};
  --popover-foreground: ${primary};
  --secondary-foreground: ${primary};
  --accent-foreground: ${primary};
  --primary: ${primary};
  --ring: ${accent};
  --sidebar-foreground: ${primary};
  --sidebar-primary: ${primary};
  --sidebar-accent-foreground: ${primary};
  --sidebar-ring: ${accent};
}
html.dark {
  --bg-primary: ${darkBg};
  --bg-elevated: ${primary};
  --bg-subtle: ${darkBgDeep};
  --lg-bg: ${darkBg};
  --lg-surface-1: ${darkSurf1};
  --lg-surface-2: ${primary};
  --lg-surface-3: ${darkSurf3};
  --accent-color: ${accent};
  --accent-glow: ${accentTint32};
  --aurora-a: ${accentTint20};
  --glass-tint: ${primary};
  --background: ${darkBg};
  --card: ${primary};
  --popover: ${primary};
  --secondary: ${darkSurf3};
  --muted: ${darkSurf1};
  --primary: ${accent};
  --primary-foreground: ${darkBg};
  --accent-foreground: ${darkBg};
  --ring: ${accent};
  --sidebar: ${darkBg};
  --sidebar-primary: ${accent};
  --sidebar-primary-foreground: ${darkBg};
  --sidebar-accent: ${primary};
  --sidebar-ring: ${accent};
  --lg-panel-bg: ${primaryTint62};
}
`.trim()
}
