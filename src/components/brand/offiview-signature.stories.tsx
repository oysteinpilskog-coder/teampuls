import type { Meta, StoryObj } from '@storybook/nextjs'
import { OffiviewSignature } from './offiview-signature'

const meta: Meta<typeof OffiviewSignature> = {
  title: 'Brand/OffiviewSignature',
  component: OffiviewSignature,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    visible: true,
    opacity: 0.85,
  },
}

export default meta

type Story = StoryObj<typeof OffiviewSignature>

const Backdrop = ({ background }: { background: string }) => (
  <div
    style={{
      position: 'fixed',
      inset: 0,
      background,
    }}
  />
)

export const Light: Story = {
  parameters: {
    backgrounds: { default: 'paper' },
  },
  render: (args) => (
    <>
      <Backdrop background="#F5EFE4" />
      <OffiviewSignature {...args} />
    </>
  ),
}

export const Dark: Story = {
  parameters: {
    backgrounds: { default: 'espresso' },
  },
  render: (args) => (
    <>
      <Backdrop background="#15110E" />
      <OffiviewSignature {...args} />
    </>
  ),
}
