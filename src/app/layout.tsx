import type { Metadata } from 'next'
import { fontDisplay, fontBody, fontSerif, fontMono } from '@/app/fonts'
import { Providers } from '@/components/providers'
import { ConditionalHeader } from '@/components/app-header'
import { themeVariantBootScript } from '@/components/theme-variant-provider'
import { getOrgStatusColors } from '@/lib/status-colors/server'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Offiview',
    template: '%s · Offiview',
  },
  description: 'Dagen, lagt på bordet. Hele teamet som ett klart landskap.',
  keywords: ['team', 'location', 'status', 'dashboard', 'remote work', 'office'],
  openGraph: {
    title: 'Offiview',
    description: 'Dagen, lagt på bordet. Hele teamet som ett klart landskap.',
    type: 'website',
    locale: 'nb_NO',
  },
  twitter: {
    card: 'summary',
    title: 'Offiview',
    description: 'Dagen, lagt på bordet. Hele teamet som ett klart landskap.',
  },
  robots: {
    index: false,
    follow: false,
  },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const initialStatusColors = await getOrgStatusColors()

  return (
    <html
      lang="no"
      className={`${fontDisplay.variable} ${fontBody.variable} ${fontSerif.variable} ${fontMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeVariantBootScript }} />
      </head>
      <body className="min-h-screen flex flex-col" suppressHydrationWarning>
        <Providers initialStatusColors={initialStatusColors}>
          {/* Ambient aurora — restrained Ember-tinted backdrop, sits below grain */}
          <div className="ambient-aurora" aria-hidden />
          {/* Offiview grain is applied via body::before (z-index: 1, fixed).
              Header and main sit at z-index: 2 so grain reads beneath content. */}
          <div className="relative z-[2] flex-1 flex flex-col">
            <ConditionalHeader />
            <main className="flex-1 relative">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  )
}
