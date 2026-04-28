'use client'

import dynamic from 'next/dynamic'
import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import { ThemeVariantProvider } from '@/components/theme-variant-provider'
import { StatusColorsProvider } from '@/lib/status-colors/context'
import { WorkspaceProvider } from '@/lib/workspace/context'
import { PresenceProvider } from '@/lib/presence/context'
// Modals are dead weight on the first frame — none of them is visible until
// the user explicitly summons them (⌘K, AI query, install nudge…). Lazy-
// load so they don't bloat every route's first-load JS.
const CommandPalette = dynamic(
  () => import('@/components/command-palette').then(m => ({ default: m.CommandPalette })),
  { ssr: false }
)
const AIQueryModal = dynamic(
  () => import('@/components/ai-query-modal').then(m => ({ default: m.AIQueryModal })),
  { ssr: false }
)
const KeyboardHelp = dynamic(
  () => import('@/components/keyboard-help').then(m => ({ default: m.KeyboardHelp })),
  { ssr: false }
)
const OnboardingHint = dynamic(
  () => import('@/components/onboarding-hint').then(m => ({ default: m.OnboardingHint })),
  { ssr: false }
)
const InstallPrompt = dynamic(
  () => import('@/components/install-prompt').then(m => ({ default: m.InstallPrompt })),
  { ssr: false }
)
import { ServiceWorkerRegister } from '@/components/service-worker-register'
import { I18nProvider } from '@/lib/i18n/context'
import type { Locale } from '@/lib/i18n/types'
import type { StatusColorsPayload } from '@/lib/status-colors/defaults'
import type { WorkspaceSummary } from '@/lib/supabase/types'

export function Providers({
  children,
  initialStatusColors,
  initialLocale,
  initialWorkspaces,
  initialActiveSlug,
}: {
  children: React.ReactNode
  initialStatusColors?: StatusColorsPayload | null
  initialLocale?: Locale
  initialWorkspaces: WorkspaceSummary[]
  initialActiveSlug: string | null
}) {
  return (
    // Offiview: marketing/product default to light (Paper). Users can toggle
    // via ThemeToggle; the /dashboard route force-locks dark via
    // DashboardDarkLock regardless of this default.
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <ThemeVariantProvider>
        <StatusColorsProvider initialColors={initialStatusColors}>
          <I18nProvider initialLocale={initialLocale}>
            <WorkspaceProvider
              initialWorkspaces={initialWorkspaces}
              initialActiveSlug={initialActiveSlug}
            >
              <PresenceProvider>
                {children}
                <CommandPalette />
                <KeyboardHelp />
                <OnboardingHint />
                <AIQueryModal />
                <InstallPrompt />
                <ServiceWorkerRegister />
                <Toaster
                  position="top-right"
                  offset={80}
                  duration={3600}
                  toastOptions={{
                    unstyled: true,
                    classNames: {
                      toast: 'tp-toast',
                      title: 'tp-toast-title',
                      description: 'tp-toast-desc',
                      success: 'tp-toast-success',
                      error: 'tp-toast-error',
                      info: 'tp-toast-info',
                      warning: 'tp-toast-warning',
                      icon: 'tp-toast-icon',
                      closeButton: 'tp-toast-close',
                    },
                  }}
                />
              </PresenceProvider>
            </WorkspaceProvider>
          </I18nProvider>
        </StatusColorsProvider>
      </ThemeVariantProvider>
    </ThemeProvider>
  )
}
