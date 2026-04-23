import { Fraunces, Manrope } from 'next/font/google'

// Fraunces — display serif with optical sizing and softness.
// Italic is critical (Ember-words). opsz 9..144, SOFT 0..100.
export const fontDisplay = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-fraunces',
  axes: ['opsz', 'SOFT'],
  style: ['normal', 'italic'],
  weight: 'variable',
})

// Manrope — UI body, variable 200..800.
export const fontBody = Manrope({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-manrope',
  weight: 'variable',
})

// Fraunces alias for the serif slot. Components that read var(--font-serif)
// (italic display) resolve here.
export const fontSerif = fontDisplay

/**
 * Mono is delivered via the system stack (SF Mono on Apple, Consolas/Menlo
 * elsewhere) — see the .lg-mono utility in globals.css. The --font-mono var
 * is aliased in globals.css for backward compat.
 */
