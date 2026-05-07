'use client'

import * as React from 'react'
import { useEffect, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs'
import { BrandTransition } from './brand-transition'

const meta: Meta<typeof BrandTransition> = {
  title: 'Brand/BrandTransition',
  component: BrandTransition,
  parameters: { layout: 'fullscreen' },
}

export default meta

type Story = StoryObj<typeof BrandTransition>

// Storybook-data oppdatert til CalWin-paletten så previews speiler det
// produktet faktisk renderer. Bg-er vandrer gjennom Blue Violet-stack
// (deepest -> canonical -> elevated -> mid), accenter veksler mellom
// Silver Gray (paper-tekst på dyp blå) og Light Blue / Light Blue glow.
const VIEWS = [
  { label: 'Dagen',  bg: '#15123E', accent: '#EAEAE6' },
  { label: 'Måned',  bg: '#1F1C52', accent: '#B3E2F7' },
  { label: 'Kontor', bg: '#322E7A', accent: '#66C4EF' },
  { label: 'Kunder', bg: '#2A2668', accent: '#93D6F3' },
] as const

function PlaceholderView({
  label,
  bg,
  accent,
}: {
  label: string
  bg: string
  accent: string
}) {
  return (
    <div
      data-view={label}
      style={{
        position: 'absolute',
        inset: 0,
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <h1
        style={{
          fontFamily: 'var(--font-fraunces), Georgia, serif',
          fontStyle: 'italic',
          fontWeight: 300,
          fontVariationSettings: '"opsz" 144, "SOFT" 60',
          fontSize: 'clamp(64px, 12vw, 160px)',
          color: accent,
          letterSpacing: '-0.03em',
          margin: 0,
        }}
      >
        {label}
      </h1>
    </div>
  )
}

function Demo({ autoRotate }: { autoRotate: boolean }) {
  const [idx, setIdx] = useState(0)
  const [transitioning, setTransitioning] = useState(false)
  const [signaturePos, setSignaturePos] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  })

  useEffect(() => {
    const update = () => {
      setSignaturePos({
        x: window.innerWidth - 96,
        y: window.innerHeight - 72,
      })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    if (!autoRotate || transitioning) return
    const t = setTimeout(() => setTransitioning(true), 1500)
    return () => clearTimeout(t)
  }, [autoRotate, transitioning, idx])

  const next = (idx + 1) % VIEWS.length

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#050507',
        fontFamily: 'var(--font-manrope), system-ui, sans-serif',
      }}
    >
      {transitioning ? (
        <BrandTransition
          key={`transition-${idx}`}
          outgoingView={<PlaceholderView {...VIEWS[idx]} />}
          incomingView={<PlaceholderView {...VIEWS[next]} />}
          signaturePosition={signaturePos}
          onComplete={() => {
            setIdx(next)
            setTransitioning(false)
          }}
        />
      ) : (
        <>
          <PlaceholderView {...VIEWS[idx]} />
          {!autoRotate && (
            <button
              onClick={() => setTransitioning(true)}
              style={{
                position: 'fixed',
                bottom: 24,
                left: 24,
                padding: '12px 20px',
                background: '#F5EFE4',
                color: '#0E0B08',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontFamily: 'var(--font-manrope), system-ui, sans-serif',
                fontWeight: 600,
                fontSize: 14,
                zIndex: 50,
              }}
            >
              Trigger transition →
            </button>
          )}
          <div
            style={{
              position: 'fixed',
              bottom: 24,
              right: 24,
              fontFamily: 'var(--font-manrope), system-ui, sans-serif',
              fontSize: 11,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#8A7F70',
              zIndex: 50,
            }}
          >
            View {idx + 1} / {VIEWS.length}
          </div>
        </>
      )}
    </div>
  )
}

export const Manual: Story = {
  render: () => <Demo autoRotate={false} />,
}

export const AutoRotate: Story = {
  render: () => <Demo autoRotate />,
}
