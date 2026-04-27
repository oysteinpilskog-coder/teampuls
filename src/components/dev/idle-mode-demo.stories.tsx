import type { Meta, StoryObj } from '@storybook/nextjs'
import { IdleModeDemo } from './idle-mode-demo'

const meta: Meta<typeof IdleModeDemo> = {
  title: 'Dev/IdleModeDemo',
  component: IdleModeDemo,
  parameters: { layout: 'fullscreen' },
}

export default meta

type Story = StoryObj<typeof IdleModeDemo>

/**
 * Defaults — 10 min idle window, 60 s tick. Use this to inspect the hook's
 * behaviour with realistic timings; the auto-activation will only fire after
 * 10 minutes of inactivity AND outside business hours AND low activity.
 */
export const Defaults: Story = {
  args: {},
}

/**
 * Fast windows — 5 s idle window, 1 s tick. Use this to observe auto-
 * activation/deactivation in real time without waiting 10 minutes.
 */
export const FastWindows: Story = {
  args: {
    idleAfterMs: 5_000,
    checkIntervalMs: 1_000,
  },
}
