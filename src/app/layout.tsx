import type { Metadata } from 'next'
import { fontDisplay, fontBody, fontSerif } from '@/app/fonts'
import { Providers } from '@/components/providers'
import { ConditionalHeader } from '@/components/app-header'
import { themeVariantBootScript } from '@/components/theme-variant-provider'
import { getOrgStatusColors } from '@/lib/status-colors/server'
import { getServerLocale } from '@/lib/i18n/server'
import { LOCALE_META } from '@/lib/i18n/types'
import { no } from '@/lib/i18n/no'
import { en } from '@/lib/i18n/en'
import { sv } from '@/lib/i18n/sv'
import { es } from '@/lib/i18n/es'
import { lt } from '@/lib/i18n/lt'
import './globals.css'

const DICT_FOR_METADATA = { no, en, sv, es, lt }

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  const dict = DICT_FOR_METADATA[locale]
  return {
    title: {
      default: dict.app.name,
      template: `%s · ${dict.app.name}`,
    },
    description: dict.app.tagline,
    keywords: ['team', 'location', 'status', 'dashboard', 'remote work'],
    openGraph: {
      title: dict.app.name,
      description: dict.app.tagline,
      type: 'website',
      locale: LOCALE_META[locale].intl.replace('-', '_'),
    },
    twitter: {
      card: 'summary',
      title: dict.app.name,
      description: dict.app.tagline,
    },
    robots: {
      index: false,
      follow: false,
    },
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [initialStatusColors, initialLocale] = await Promise.all([
    getOrgStatusColors(),
    getServerLocale(),
  ])

  return (
    <html
      lang={LOCALE_META[initialLocale].htmlLang}
      className={`${fontDisplay.variable} ${fontBody.variable} ${fontSerif.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeVariantBootScript }} />
      </head>
      <body className="min-h-screen flex flex-col" suppressHydrationWarning>
        <Providers initialStatusColors={initialStatusColors} initialLocale={initialLocale}>
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
