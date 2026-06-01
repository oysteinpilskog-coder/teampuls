import type { Metadata, Viewport } from 'next'
import { cookies } from 'next/headers'
import { fontBody } from '@/app/fonts'
import { Providers } from '@/components/providers'
import { ConditionalHeader } from '@/components/app-header'
import { themeVariantBootScript } from '@/components/theme-variant-provider'
import { DEFAULT_THEME, isThemeId, type ThemeId } from '@/lib/themes'
import { getOrgStatusColors } from '@/lib/status-colors/server'
import { getServerLocale } from '@/lib/i18n/server'
import { LOCALE_META } from '@/lib/i18n/types'
import { DASHBOARD_MODE_COOKIE, type DashboardMode } from '@/lib/dashboard-mode'
import { no } from '@/lib/i18n/no'
import { en } from '@/lib/i18n/en'
import { sv } from '@/lib/i18n/sv'
import { es } from '@/lib/i18n/es'
import { lt } from '@/lib/i18n/lt'
import { getSessionMember } from '@/lib/supabase/session'
import {
  brandPairFromWorkspace,
  buildBrandOverrideCss,
  isDefaultBrand,
} from '@/lib/branding/css-overrides'
import './globals.css'

const DICT_FOR_METADATA = { no, en, sv, es, lt }

export const viewport: Viewport = {
  // Fill the notch on iOS when launched from the home screen; also lets
  // the SW-cached offline page keep using env(safe-area-inset-*) if needed.
  viewportFit: 'cover',
  themeColor: [
    // Light: Silver Gray (CalWin BrandBook §3). Dark: deep Blue Violet.
    { media: '(prefers-color-scheme: light)', color: '#EAEAE6' },
    { media: '(prefers-color-scheme: dark)',  color: '#1F1C52' },
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
    keywords: ['team', 'location', 'status', 'dashboard', 'remote work', 'office'],
    openGraph: {
      title: dict.app.name,
      description: dict.app.tagline,
      type: 'website',
      locale: LOCALE_META[locale].intl.replace('-', '_'),
    },
    twitter: {
      // summary_large_image lets the auto-generated opengraph-image render
      // full-width on Twitter/X and most chat-platform previews.
      card: 'summary_large_image',
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
  const [initialStatusColors, initialLocale, session, cookieStore] = await Promise.all([
    getOrgStatusColors(),
    getServerLocale(),
    getSessionMember(),
    cookies(),
  ])
  const activeWorkspace = session.activeWorkspace

  // Branding is org-wide by default: an admin's chosen theme variant and
  // dashboard mode become the fallback every user sees. A local override
  // (theme: localStorage, dashboard: cookie) always wins over the org default.
  const orgDefaultTheme: ThemeId = isThemeId(activeWorkspace?.default_theme_variant)
    ? activeWorkspace.default_theme_variant
    : DEFAULT_THEME
  const orgDefaultDashboardMode: DashboardMode =
    activeWorkspace?.default_dashboard_mode === 'brand' ? 'brand' : 'standard'
  const dashboardCookie = cookieStore.get(DASHBOARD_MODE_COOKIE)?.value
  const initialDashboardMode: DashboardMode =
    dashboardCookie === 'brand'
      ? 'brand'
      : dashboardCookie === 'standard'
        ? 'standard'
        : orgDefaultDashboardMode

  // Sanitize: only allow 3/4/6/8-digit hex so we can't inject
  // arbitrary CSS via a malicious workspace accent_color value.
  const accentColor = activeWorkspace?.accent_color?.match(/^#[0-9a-fA-F]{3,8}$/)
    ? activeWorkspace.accent_color
    : null

  // Per-org SaaS brand pair (Blue Violet / Light Blue slot replacements).
  // Skip the override block entirely for orgs running the canonical
  // CalWin defaults — globals.css already nails those pixel-perfect.
  const brandPair = brandPairFromWorkspace(activeWorkspace)
  const brandOverrideCss = isDefaultBrand(brandPair)
    ? null
    : buildBrandOverrideCss(brandPair)

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
      className={fontBody.variable}
      data-dashboard-mode={initialDashboardMode}
      suppressHydrationWarning
    >
      <head>
        {/* Open the TLS handshake to Supabase as soon as the browser parses
            <head>. Auth, DB, Realtime, Storage all share the same hostname,
            so one preconnect saves ~150-300ms on the first call to any of
            them. `crossOrigin="anonymous"` matches the fetch credentials
            mode the supabase-js client uses. */}
        {process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <>
            <link
              rel="preconnect"
              href={process.env.NEXT_PUBLIC_SUPABASE_URL}
              crossOrigin="anonymous"
            />
            <link
              rel="dns-prefetch"
              href={process.env.NEXT_PUBLIC_SUPABASE_URL}
            />
          </>
        )}
        <script dangerouslySetInnerHTML={{ __html: themeVariantBootScript(orgDefaultTheme) }} />
        {brandOverrideCss && (
          <style
            id="tp-brand-overrides"
            dangerouslySetInnerHTML={{ __html: brandOverrideCss }}
          />
        )}
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
          initialDashboardMode={initialDashboardMode}
          initialPresenceMe={
            session.member
              ? {
                  id: session.member.id,
                  orgId: session.member.org_id,
                  display_name: session.member.display_name,
                  avatar_url: session.member.avatar_url,
                  initials: session.member.initials,
                }
              : null
          }
          initialThemeVariant={orgDefaultTheme}
        >
          {/* Ambient aurora backdrop — restrained Ember-tint, sits below grain */}
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
