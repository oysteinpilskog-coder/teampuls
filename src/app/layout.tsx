import type { Metadata } from 'next'
import { fontDisplay, fontBody } from '@/app/fonts'
import { Providers } from '@/components/providers'
import { ConditionalHeader } from '@/components/app-header'
import { themeVariantBootScript } from '@/components/theme-variant-provider'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'TeamPulse',
    template: '%s · TeamPulse',
  },
  description: 'Den vakreste og enkleste måten å vite hvor teamet ditt er.',
  keywords: ['team', 'location', 'status', 'dashboard', 'remote work'],
  openGraph: {
    title: 'TeamPulse',
    description: 'Den vakreste og enkleste måten å vite hvor teamet ditt er.',
    type: 'website',
    locale: 'nb_NO',
  },
  twitter: {
    card: 'summary',
    title: 'TeamPulse',
    description: 'Den vakreste og enkleste måten å vite hvor teamet ditt er.',
  },
  robots: {
    index: false,
    follow: false,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="no"
      className={`${fontDisplay.variable} ${fontBody.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeVariantBootScript }} />
      </head>
      <body className="min-h-screen flex flex-col" suppressHydrationWarning>
        <Providers>
          {/* Ambient aurora backdrop — fixed, non-interactive */}
          <div className="ambient-aurora" aria-hidden />
          <ConditionalHeader />
          <main className="flex-1 relative">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  )
}
