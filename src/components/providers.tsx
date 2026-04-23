'use client'

import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import { ThemeVariantProvider } from '@/components/theme-variant-provider'
import { StatusColorsProvider } from '@/lib/status-colors/context'
import { CommandPalette } from '@/components/command-palette'
import { KeyboardHelp } from '@/components/keyboard-help'
import { OnboardingHint } from '@/components/onboarding-hint'
import type { HexColors } from '@/lib/status-colors/defaults'

export function Providers({
  children,
  initialStatusColors,
}: {
  children: React.ReactNode
  initialStatusColors?: Partial<HexColors> | null
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <ThemeVariantProvider>
        <StatusColorsProvider initialColors={initialStatusColors}>
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
        </StatusColorsProvider>
      </ThemeVariantProvider>
    </ThemeProvider>
  )
}
