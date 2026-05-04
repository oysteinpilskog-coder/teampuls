import { Inter } from 'next/font/google'

// CalWin's actual web typography: Inter (per calwin.no — they use Inter
// exclusively, all weights). Matching the live site so this product reads
// as part of the same family.
//
// CSS variable names (--font-fraunces, --font-manrope) are kept for
// backwards compatibility — they're referenced from ~30 component files
// and globals.css utilities. Both now resolve to Inter.
//
// next/font requires literal options passed to the font function (it does
// static analysis at build time and rejects spreads), so each call lists
// its options inline rather than sharing a const.

// Body / UI — Inter.
export const fontBody = Inter({
  subsets: ['latin'],
  display: 'swap',
  weight: 'variable',
  variable: '--font-manrope',
})

// Display / "italic ember-word" slot — also Inter (calwin.no uses one
// face only). The legacy variable name --font-fraunces is preserved.
export const fontDisplay = Inter({
  subsets: ['latin'],
  display: 'swap',
  weight: 'variable',
  variable: '--font-fraunces',
})

/**
 * Mono is delivered via the system stack (SF Mono on Apple, Consolas/Menlo
 * elsewhere) — see the .lg-mono utility in globals.css. The --font-mono var
 * is aliased in globals.css for backward compat.
 */
