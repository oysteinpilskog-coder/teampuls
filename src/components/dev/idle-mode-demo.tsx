'use client'

import { useEffect, useState } from 'react'
import { useIdleMode } from '@/hooks/use-idle-mode'

export interface IdleModeDemoProps {
  /** Override defaults for testing — short windows so the story is observable. */
  idleAfterMs?: number
  checkIntervalMs?: number
}

export function IdleModeDemo({
  idleAfterMs = 10 * 60 * 1000,
  checkIntervalMs = 60 * 1000,
}: IdleModeDemoProps) {
  const [activeCount, setActiveCount] = useState(0)
  const { isIdle, activate, deactivate } = useIdleMode({
    activeCount,
    idleAfterMs,
    checkIntervalMs,
  })

  // Cmd/Ctrl+D — demo binding for force-toggling idle. preventDefault so the
  // browser doesn't pop the bookmark dialog.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        if (isIdle) deactivate()
        else activate()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isIdle, activate, deactivate])

  return (
    <div
      data-idle-demo-root
      style={{
        position: 'fixed',
        inset: 0,
        background: '#050507',
        color: '#F5EFE4',
        fontFamily: 'var(--font-manrope), system-ui, sans-serif',
        padding: 32,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <h1
        style={{
          fontFamily: 'var(--font-fraunces), Georgia, serif',
          fontStyle: 'italic',
          fontWeight: 300,
          fontVariationSettings: '"opsz" 144, "SOFT" 60',
          fontSize: 64,
          margin: 0,
          opacity: isIdle ? 0.3 : 1,
          transition: 'opacity 500ms ease',
        }}
      >
        useIdleMode
      </h1>

      <div
        data-idle-state
        data-is-idle={isIdle ? 'true' : 'false'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 16px',
          borderRadius: 999,
          width: 'fit-content',
          background: isIdle ? 'rgba(124, 58, 237, 0.18)' : 'rgba(0, 245, 160, 0.14)',
          border: `1px solid ${isIdle ? 'rgba(124, 58, 237, 0.55)' : 'rgba(0, 245, 160, 0.55)'}`,
          fontSize: 12,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: isIdle ? '#7C3AED' : '#00F5A0',
            boxShadow: `0 0 10px ${isIdle ? '#7C3AED' : '#00F5A0'}`,
          }}
        />
        State: <strong data-state-label>{isIdle ? 'IDLE' : 'BUSY'}</strong>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
        <p style={{ margin: 0, color: '#8A7F70' }}>
          Active count: <strong data-active-count style={{ color: '#F5EFE4' }}>{activeCount}</strong>{' '}
          (idle when &lt; 2)
        </p>
        <p style={{ margin: 0, color: '#8A7F70' }}>
          idleAfterMs: <strong style={{ color: '#F5EFE4' }}>{idleAfterMs}</strong>
          {' · '}checkIntervalMs: <strong style={{ color: '#F5EFE4' }}>{checkIntervalMs}</strong>
        </p>
        <p style={{ margin: 0, color: '#8A7F70' }}>
          Cmd/Ctrl+D toggles · move mouse / type to wake
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <DemoButton onClick={() => setActiveCount((c) => c + 1)} data-action="bump-up">
          activeCount + 1
        </DemoButton>
        <DemoButton
          onClick={() => setActiveCount((c) => Math.max(0, c - 1))}
          data-action="bump-down"
        >
          activeCount − 1
        </DemoButton>
        <DemoButton onClick={activate} data-action="activate">
          activate()
        </DemoButton>
        <DemoButton onClick={deactivate} data-action="deactivate">
          deactivate()
        </DemoButton>
      </div>
    </div>
  )
}

function DemoButton({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      style={{
        padding: '8px 14px',
        borderRadius: 8,
        background: 'rgba(245, 239, 228, 0.08)',
        border: '1px solid rgba(245, 239, 228, 0.18)',
        color: '#F5EFE4',
        fontFamily: 'var(--font-manrope), system-ui, sans-serif',
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}
