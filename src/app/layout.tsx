import type { Metadata } from 'next'
import { fontDisplay, fontBody, fontSerif } from '@/app/fonts'
import { Providers } from '@/components/providers'
import { ConditionalHeader } from '@/components/app-header'
import { themeVariantBootScript } from '@/components/theme-variant-provider'
import { getOrgStatusColors } from '@/lib/status-colors/server'
import { getSessionMember } from '@/lib/supabase/session'
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [initialStatusColors, session] = await Promise.all([
    getOrgStatusColors(),
    getSessionMember(),
  ])

  const activeWorkspace = session.activeWorkspace
  // Sanitize: only allow 3/4/6/8-digit hex so we can't inject
  // arbitrary CSS via a malicious workspace accent_color value.
  const accentColor = activeWorkspace?.accent_color?.match(/^#[0-9a-fA-F]{3,8}$/)
    ? activeWorkspace.accent_color
    : null

  const bodyStyle = accentColor
    ? ({ ['--workspace-accent-color' as string]: accentColor } as React.CSSProperties)
    : undefined

  return (
    <html
      lang="no"
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
