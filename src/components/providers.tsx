'use client'

import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import { ThemeVariantProvider } from '@/components/theme-variant-provider'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <ThemeVariantProvider>
        {children}
        <Toaster
          richColors
          position="top-right"
          toastOptions={{
            style: {
              fontFamily: 'var(--font-inter-tight)',
            },
          }}
        />
      </ThemeVariantProvider>
    </ThemeProvider>
  )
}
