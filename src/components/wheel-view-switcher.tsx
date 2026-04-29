'use client'

import { motion } from 'framer-motion'
import { spring } from '@/lib/motion'
import { useT } from '@/lib/i18n/context'

export type WheelView = 'events' | 'birthdays' | 'anniversaries'
export type AnniversarySub = 'wheel' | 'timeline'

export function WheelViewSwitcher({
  value, sub, onView, onSub, available,
}: {
  value: WheelView
  sub: AnniversarySub
  onView: (v: WheelView) => void
  onSub: (s: AnniversarySub) => void
  available: { events: boolean; birthdays: boolean; anniversaries: boolean }
}) {
  const t = useT()

  const opts: Array<{ key: WheelView; label: string; show: boolean }> = [
    { key: 'events',        label: t.wheel.views.events,        show: available.events },
    { key: 'birthdays',     label: t.wheel.views.birthdays,     show: available.birthdays },
    { key: 'anniversaries', label: t.wheel.views.anniversaries, show: available.anniversaries },
  ]
  const visible = opts.filter(o => o.show)
  if (visible.length <= 1) return null

  return (
    <div className="w-full flex flex-col items-center gap-3">
      <div
        role="tablist"
        aria-label={t.wheel.title}
        className="relative inline-flex p-1 rounded-full"
        style={{
          background: 'color-mix(in oklab, var(--bg-elevated) 70%, transparent)',
          backdropFilter: 'blur(18px) saturate(180%)',
          WebkitBackdropFilter: 'blur(18px) saturate(180%)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {visible.map(o => {
          const active = o.key === value
          return (
            <button
              key={o.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onView(o.key)}
              className="relative px-4 py-1.5 rounded-full text-[13px] font-medium transition-colors"
              style={{
                fontFamily: 'var(--font-body)',
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                letterSpacing: '0.01em',
              }}
            >
              {active && (
                <motion.span
                  layoutId="wheel-pill"
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    boxShadow: 'var(--shadow-sm), inset 0 1px 0 color-mix(in oklab, white 8%, transparent)',
                  }}
                  transition={spring.snappy}
                />
              )}
              <span className="relative z-10">{o.label}</span>
            </button>
          )
        })}
      </div>

      {value === 'anniversaries' && available.anniversaries && (
        <div
          role="tablist"
          aria-label={t.wheel.views.anniversaries}
          className="relative inline-flex p-0.5 rounded-full"
          style={{
            background: 'color-mix(in oklab, var(--bg-subtle) 90%, transparent)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          {(['wheel', 'timeline'] as const).map((k) => {
            const active = sub === k
            const label = k === 'wheel' ? t.wheel.views.wheel : t.wheel.views.timeline
            return (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSub(k)}
                className="relative px-3 py-1 rounded-full text-[11.5px] font-semibold uppercase"
                style={{
                  fontFamily: 'var(--font-body)',
                  color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  letterSpacing: '0.18em',
                }}
              >
                {active && (
                  <motion.span
                    layoutId="wheel-sub-pill"
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                    transition={spring.snappy}
                  />
                )}
                <span className="relative z-10">{label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
