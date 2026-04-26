import * as React from 'react'
import type { Preview } from '@storybook/nextjs'
import { Fraunces, Manrope } from 'next/font/google'
import { withThemeByClassName } from '@storybook/addon-themes'

import '../src/app/globals.css'

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  axes: ['opsz', 'SOFT'],
  style: ['normal', 'italic'],
  weight: 'variable',
})

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  weight: 'variable',
})

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'paper',
      values: [
        { name: 'paper', value: '#F5EFE4' },
        { name: 'espresso', value: '#15110E' },
      ],
    },
  },
  decorators: [
    (Story) => (
      <div className={`${fraunces.variable} ${manrope.variable}`} style={{ fontFamily: 'var(--font-manrope), system-ui, sans-serif' }}>
        <Story />
      </div>
    ),
    withThemeByClassName({
      themes: { light: 'light', dark: 'dark' },
      defaultTheme: 'light',
    }),
  ],
}

export default preview
