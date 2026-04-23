import type { Metadata, Viewport } from 'next'
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
import { getSessionMember } from '@/lib/supabase/session'
import './globals.css'

const DICT_FOR_METADATA = { no, en, sv, es, lt }

export const viewport: Viewport = {
  // Fill the notch on iOS when launched from the home screen; also lets
  // the SW-cached offline page keep using env(safe-area-inset-*) if needed.
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAFAF9' },
    { media: '(prefers-color-scheme: dark)',  color: '#0A0A0B' },
  ],
}

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
    manifest: '/manifest.webmanifest',
    icons: {
      icon: [
        { url: '/icons/icon.svg', type: 'image/svg+xml' },
      ],
      apple: [
        { url: '/icons/apple-touch-icon.svg', sizes: '180x180' },
      ],
      shortcut: ['/icons/icon.svg'],
    },
    appleWebApp: {
      capable: true,
      title: dict.app.name,
      statusBarStyle: 'black-translucent',
    },
    formatDetection: {
      telephone: false,
    },
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [initialStatusColors, initialLocale, session] = await Promise.all([
    getOrgStatusColors(),
    getServerLocale(),
    getSessionMember(),
  ])

  const activeWorkspace = session.activeWorkspace
  // Sanitize: only allow 3/4/6/8-digit hex so we can't inject
  // arbitrary CSS via a malicious workspace accent_color value.
  const accentColor = activeWorkspace?.accent_color?.match(/^#[0-9a-fA-F]{3,8}$/)
    ? activeWorkspace.accent_color
    : null

  // Override the theme's --accent-color with the active workspace's tint so
  // every downstream consumer (focus rings, year-wheel, buttons, the
  // switcher pill's outer ring, breathing accent orb, etc.) visually
  // reflects the selected team. Also retint --aurora-a so the ambient
  // backdrop picks up the team color — keep --aurora-b as the theme's
  // complementary tone so the aurora still reads as a gradient.
  const bodyStyle = accentColor
    ? ({
        ['--workspace-accent-color' as string]: accentColor,
        ['--accent-color' as string]: accentColor,
        ['--accent-glow' as string]: `color-mix(in oklab, ${accentColor} 35%, transparent)`,
        ['--aurora-a' as string]: `color-mix(in oklab, ${accentColor} 32%, transparent)`,
      } as React.CSSProperties)
    : undefined

  return (
    <html
      lang={LOCALE_META[initialLocale].htmlLang}
      className={`${fontDisplay.variable} ${fontBody.variable} ${fontSerif.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeVariantBootScript }} />
      </head>
      <body
        className="min-h-screen flex flex-col"
        style={bodyStyle}
        suppressHydrationWarning
      >
        <Providers
          initialStatusColors={initialStatusColors}
          initialLocale={initialLocale}
          initialWorkspaces={session.workspaces}
          initialActiveSlug={activeWorkspace?.slug ?? null}
        >
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
