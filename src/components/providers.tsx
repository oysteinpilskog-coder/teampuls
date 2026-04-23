'use client'

import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import { ThemeVariantProvider } from '@/components/theme-variant-provider'
import { StatusColorsProvider } from '@/lib/status-colors/context'
import { WorkspaceProvider } from '@/lib/workspace/context'
import { CommandPalette } from '@/components/command-palette'
import { KeyboardHelp } from '@/components/keyboard-help'
import { OnboardingHint } from '@/components/onboarding-hint'
import { I18nProvider } from '@/lib/i18n/context'
import type { Locale } from '@/lib/i18n/types'
import type { HexColors } from '@/lib/status-colors/defaults'
import type { WorkspaceSummary } from '@/lib/supabase/types'

export function Providers({
  children,
  initialStatusColors,
  initialLocale,
  initialWorkspaces,
  initialActiveSlug,
}: {
  children: React.ReactNode
  initialStatusColors?: Partial<HexColors> | null
  initialLocale?: Locale
  initialWorkspaces: WorkspaceSummary[]
  initialActiveSlug: string | null
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      <ThemeVariantProvider>
        <StatusColorsProvider initialColors={initialStatusColors}>
          <I18nProvider initialLocale={initialLocale}>
            <WorkspaceProvider
              initialWorkspaces={initialWorkspaces}
              initialActiveSlug={initialActiveSlug}
            >
              {children}
              <CommandPalette />
              <KeyboardHelp />
              <OnboardingHint />
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
            </WorkspaceProvider>
          </I18nProvider>
        </StatusColorsProvider>
      </ThemeVariantProvider>
    </ThemeProvider>
  )
}
