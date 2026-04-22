'use client'

import { Dialog } from '@base-ui/react/dialog'
import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import { spring } from '@/lib/motion'
import { useT } from '@/lib/i18n/context'

interface Shortcut {
  keys: string[]
  label: string
}

interface Section {
  title: string
  items: Shortcut[]
}

export function KeyboardHelp() {
  const [open, setOpen] = useState(false)
  const t = useT()

  const SECTIONS: Section[] = [
    {
      title: t.hotkeys.group.global,
      items: [
        { keys: ['⌘', 'K'], label: t.hotkeys.k.palette },
        { keys: ['/'], label: t.hotkeys.k.slash },
        { keys: ['?'], label: t.hotkeys.k.help },
      ],
    },
    {
      title: t.hotkeys.group.week,
      items: [
        { keys: ['T'], label: t.hotkeys.k.today },
        { keys: ['←'], label: t.hotkeys.k.prevWeek },
        { keys: ['→'], label: t.hotkeys.k.nextWeek },
      ],
    },
    {
      title: t.hotkeys.group.editing,
      items: [
        { keys: ['Esc'], label: t.hotkeys.k.esc },
        { keys: ['↵'], label: t.hotkeys.k.enter },
      ],
    },
  ]

  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('teampulse:help:open', handler)
    return () => window.removeEventListener('teampulse:help:open', handler)
  }, [])

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal keepMounted>
            <Dialog.Backdrop
              render={
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="fixed inset-0 z-[100]"
                  style={{
                    background: 'color-mix(in oklab, var(--bg-primary) 55%, rgba(5,8,18,0.55))',
                    backdropFilter: 'blur(14px) saturate(160%)',
                    WebkitBackdropFilter: 'blur(14px) saturate(160%)',
                  }}
                />
              }
            />
            <Dialog.Popup
              render={
                <motion.div
                  initial={{ opacity: 0, y: 12, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 12, scale: 0.97 }}
                  transition={spring.snappy}
                  className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-[min(92vw,540px)] rounded-2xl overflow-hidden outline-none"
                  style={{
                    background: 'color-mix(in oklab, var(--bg-elevated) 92%, transparent)',
                    backdropFilter: 'blur(28px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(28px) saturate(180%)',
                    border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
                    boxShadow:
                      '0 50px 100px -24px rgba(10,20,40,0.4), 0 24px 48px -20px rgba(10,20,40,0.22), inset 0 1px 0 rgba(255,255,255,0.55)',
                  }}
                />
              }
            >
              <div
                className="px-6 pt-5 pb-3"
                style={{ borderBottom: '1px solid color-mix(in oklab, var(--border-subtle) 50%, transparent)' }}
              >
                <Dialog.Title
                  className="font-bold"
                  style={{
                    fontFamily: 'var(--font-sora)',
                    color: 'var(--text-primary)',
                    fontSize: 20,
                    letterSpacing: '-0.028em',
                  }}
                >
                  {t.hotkeys.title}
                </Dialog.Title>
                <Dialog.Description
                  className="mt-0.5"
                  style={{
                    color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-body)',
                    fontSize: 13,
                  }}
                >
                  {t.hotkeys.desc}
                </Dialog.Description>
              </div>

              <div className="px-6 py-4 grid gap-5">
                {SECTIONS.map((sec) => (
                  <div key={sec.title}>
                    <div
                      className="text-[10px] font-bold uppercase tracking-[0.2em] mb-2"
                      style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
                    >
                      {sec.title}
                    </div>
                    <div className="grid gap-1.5">
                      {sec.items.map((s, i) => (
                        <div key={i} className="flex items-center justify-between h-8">
                          <span
                            className="text-[13.5px]"
                            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
                          >
                            {s.label}
                          </span>
                          <span className="flex items-center gap-1">
                            {s.keys.map((k, j) => (
                              <HelpKbd key={j}>{k}</HelpKbd>
                            ))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div
                className="flex items-center justify-end gap-2 px-6 h-12"
                style={{
                  borderTop: '1px solid color-mix(in oklab, var(--border-subtle) 50%, transparent)',
                  background: 'color-mix(in oklab, var(--bg-subtle) 70%, transparent)',
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 11,
                }}
              >
                <HelpKbd>Esc</HelpKbd>
                <span>{t.hotkeys.closeHint}</span>
              </div>
            </Dialog.Popup>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}

function HelpKbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="inline-flex items-center justify-center min-w-[26px] h-6 px-2 rounded-md text-[11px] font-semibold"
      style={{
        background: 'color-mix(in oklab, var(--bg-elevated) 95%, transparent)',
        color: 'var(--text-primary)',
        border: '1px solid color-mix(in oklab, var(--border-subtle) 70%, transparent)',
        boxShadow: '0 1px 0 rgba(0,0,0,0.04), inset 0 -1px 0 color-mix(in oklab, var(--border-subtle) 75%, transparent)',
        fontFamily: 'var(--font-body)',
        letterSpacing: '0.02em',
      }}
    >
      {children}
    </kbd>
  )
}
