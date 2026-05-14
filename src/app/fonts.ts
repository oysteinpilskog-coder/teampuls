import { Inter } from 'next/font/google'

// CalWin's actual web typography: Inter (per calwin.no — they use Inter
// exclusively, all weights). Matching the live site so this product reads
// as part of the same family.
//
// We used to call Inter() twice — once for `--font-manrope` and once for
// `--font-fraunces`. Even though next/font dedupes the network fetch,
// each call still emits its own CSS rule, font-face declaration, and
// preload <link>. On cold load that doubled the font-related work in the
// critical request path. Now we instantiate once and the legacy aliases
// piggy-back on the same loader via the `variable` array.
//
// `subsets: ['latin']` is intentional — Norwegian å/ø/æ live in the basic
// Latin block (U+00E5, U+00F8, U+00E6). latin-ext would add ~25 KB without
// covering anything we use.

// Single Inter instance — both --font-manrope (body) and --font-fraunces
// (display) point at the same CSS variable. Component code that reads
// either var resolves to the same font; switching one to a different face
// later is a one-line change.
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  weight: 'variable',
  variable: '--font-manrope',
})

export const fontBody = inter
export const fontDisplay = inter

/**
 * Mono is delivered via the system stack (SF Mono on Apple, Consolas/Menlo
 * elsewhere) — see the .lg-mono utility in globals.css. The --font-mono var
 * is aliased in globals.css for backward compat.
 */
