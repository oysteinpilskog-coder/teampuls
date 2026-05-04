import { Josefin_Sans, Orbitron } from 'next/font/google'

// CalWin BrandBook §2 — typography.
//
// Primary typeface: Josefin Sans. Used for body, UI, and headlines (all
// weights, italic supported). Solves hierarchy "in a easy and clean way."
//
// Secondary: Good Times. Reserved for highlighting specific content.
// Good Times is a commercial Larabie font and is not available on Google
// Fonts, so we use Orbitron — the closest free, geometric, digital-feel
// substitute on Google Fonts — wherever the brandbook calls for Good Times.
//
// CSS variable names (`--font-fraunces`, `--font-manrope`) are KEPT for
// backwards compatibility — they're referenced from ~30 component files
// and globals.css utilities. The variables now resolve to the CalWin
// fonts. If a future cleanup pass renames them everywhere, that's fine,
// but it isn't required for the visual rebrand.

// Display / highlight — Orbitron (Good Times stand-in).
// Geometric, digital feel; reserved for big numbers, hero headlines, and
// the existing "italic Ember word" slots that previously used Fraunces.
export const fontDisplay = Orbitron({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-fraunces',
  weight: ['400', '500', '600', '700', '800', '900'],
})

// Body / UI — Josefin Sans (CalWin primary typeface).
export const fontBody = Josefin_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-manrope',
  weight: ['100', '200', '300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
})

/**
 * Mono is delivered via the system stack (SF Mono on Apple, Consolas/Menlo
 * elsewhere) — see the .lg-mono utility in globals.css. The --font-mono var
 * is aliased in globals.css for backward compat.
 */
