import { Fraunces, Manrope, JetBrains_Mono } from 'next/font/google'

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

// Fraunces alias for serif slot (components read --font-serif for italic display).
export const fontSerif = fontDisplay

// JetBrains Mono — tabular numerals, precise timekeeping, dashboard metrics.
export const fontMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
  weight: 'variable',
})
