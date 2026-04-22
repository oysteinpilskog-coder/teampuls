import { Sora, Inter_Tight, Instrument_Serif } from 'next/font/google'

export const fontDisplay = Sora({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sora',
  weight: ['300', '400', '500', '600', '700', '800'],
})

export const fontBody = Inter_Tight({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter-tight',
  weight: ['400', '500', '600', '700'],
})

// Instrument Serif (italic) for display headings in the dark liquid-glass surfaces.
export const fontSerif = Instrument_Serif({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-serif',
  weight: ['400'],
  style: ['normal', 'italic'],
})

/**
 * Mono is delivered via the system stack (SF Mono on Apple, Consolas/Menlo elsewhere).
 * We keep the --font-mono variable for backwards compat but it's now empty —
 * the .lg-mono utility in globals.css resolves to the system mono stack directly.
 */
