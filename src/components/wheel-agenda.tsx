'use client'

import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { spring } from '@/lib/motion'

// Glassmorphic side panel that hangs to the right of every wheel view.
// Generic over what fills it — bursdags-/jubileumshjulet supplies its own
// rader, hendelseshjulet beholder sin.

export function WheelAgendaShell({
  children,
  delay = 0.3,
}: {
  children: ReactNode
  delay?: number
}) {
  return (
    <motion.aside
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...spring.gentle, delay }}
      className="w-full xl:w-[320px] flex-shrink-0 flex flex-col gap-3"
    >
      {children}
    </motion.aside>
  )
}

export function WheelAgendaSection({
  title, meta, empty, children,
}: {
  title: string
  meta?: string
  empty?: string
  children: ReactNode
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children
  return (
    <section
      className="rounded-2xl p-4 flex flex-col gap-2"
      style={{
        background: 'color-mix(in oklab, var(--bg-elevated) 70%, transparent)',
        backdropFilter: 'blur(18px) saturate(180%)',
        WebkitBackdropFilter: 'blur(18px) saturate(180%)',
        border: '1px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <header className="flex items-baseline justify-between">
        <h3
          className="text-[11px] font-bold uppercase"
          style={{
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-body)',
            letterSpacing: '0.22em',
          }}
        >
          {title}
        </h3>
        {meta && (
          <span
            className="text-[11px] font-medium tabular-nums"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
          >
            {meta}
          </span>
        )}
      </header>
      {hasChildren ? (
        <ul className="flex flex-col gap-1.5">{children}</ul>
      ) : empty ? (
        <p
          className="text-[13px] py-1"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
        >
          {empty}
        </p>
      ) : null}
    </section>
  )
}
