'use client'

import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import { ThemeVariantProvider } from '@/components/theme-variant-provider'
import { StatusColorsProvider } from '@/lib/status-colors/context'
import { CommandPalette } from '@/components/command-palette'
import { KeyboardHelp } from '@/components/keyboard-help'
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
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <ThemeVariantProvider>
        <StatusColorsProvider initialColors={initialStatusColors}>
          {children}
          <CommandPalette />
          <KeyboardHelp />
          <Toaster
            richColors
            position="top-right"
            toastOptions={{
              style: {
                fontFamily: 'var(--font-inter-tight)',
              },
            }}
          />
        </StatusColorsProvider>
      </ThemeVariantProvider>
    </ThemeProvider>
  )
}
