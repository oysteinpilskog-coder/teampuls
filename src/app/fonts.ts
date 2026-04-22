import { Sora, Inter_Tight, Instrument_Serif, JetBrains_Mono } from 'next/font/google'

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

// Mono for numerals, dates, week numbers — precision typography on the bars.
export const fontMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
  weight: ['400', '500', '600'],
})
