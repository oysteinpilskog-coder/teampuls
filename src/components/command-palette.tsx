'use client'

import { Dialog } from '@base-ui/react/dialog'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { spring } from '@/lib/motion'
import { useT } from '@/lib/i18n/context'
import { useHotkeys } from '@/hooks/use-hotkeys'
import { useWorkspace } from '@/lib/workspace/context'
import {
  ArrowRight,
  Calendar,
  Home,
  LayoutGrid,
  Moon,
  Settings,
  Sun,
  PenSquare,
  Keyboard,
  CircleUser,
  Monitor,
  Sparkles,
  Building2,
  MessageSquare,
} from 'lucide-react'

type CommandGroup = 'nav' | 'actions' | 'theme' | 'workspace'

interface Command {
  id: string
  label: string
  group: CommandGroup
  icon?: React.ReactNode
  shortcut?: string[]
  keywords?: string
  run: () => void
}

// ─────────────────────────────────────────────────────────────────────────────

interface OpenEvent {
  /** Optional pre-fill search query. */
  query?: string
}

/** Fire this from anywhere to open the palette (e.g. shortcut ⌘K, nav button). */
export function openCommandPalette(init?: OpenEvent) {
  window.dispatchEvent(new CustomEvent<OpenEvent>('teampulse:palette:open', { detail: init }))
}

// ─────────────────────────────────────────────────────────────────────────────

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const t = useT()

  // Listen for programmatic open events
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<OpenEvent>
      setQuery(ce.detail?.query ?? '')
      setActiveIdx(0)
      setOpen(true)
    }
    window.addEventListener('teampulse:palette:open', handler)
    return () => window.removeEventListener('teampulse:palette:open', handler)
  }, [])

  // ⌘K / Ctrl+K opens the palette (works globally, even in inputs)
  useHotkeys('mod+k', () => setOpen((o) => !o), { allowInInputs: true })

  // ⌘J opens the AI query modal directly — complements ⌘K for the "ask"
  // surface, since palette is "do / navigate" and query is "wonder about".
  useHotkeys('mod+j', () => {
    window.dispatchEvent(new CustomEvent('teampulse:ai-query:open'))
  }, { allowInInputs: true })

  // "/" focuses the AI status field on the home page (like Slack / Raycast)
  useHotkeys('/', () => {
    router.push('/')
    // Let the page mount, then focus the first text input in the main element.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.querySelector('main input[type="text"]') as HTMLInputElement | null
        el?.focus()
      })
    })
  })

  // "?" opens the shortcut help
  useHotkeys('shift+/', () => {
    window.dispatchEvent(new CustomEvent('teampulse:help:open'))
  })

  // Focus the search field when opening, reset state when closing
  useEffect(() => {
    if (open) {
      // wait a tick for the popup to mount
      requestAnimationFrame(() => inputRef.current?.focus())
    } else {
      setQuery('')
      setActiveIdx(0)
    }
  }, [open])

  const workspace = useWorkspace()
  const commands = useCommands({
    router,
    resolvedTheme,
    setTheme,
    close: () => setOpen(false),
    workspace,
    t,
  })

  const filtered = useMemo(() => filterCommands(commands, query), [commands, query])

  // Clamp the active index whenever filtered list size changes
  useEffect(() => {
    setActiveIdx((i) => Math.min(i, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  // Keep the selected row in view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector(`[data-index="${activeIdx}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const runActive = useCallback(() => {
    const cmd = filtered[activeIdx]
    if (cmd) {
      cmd.run()
      setOpen(false)
    }
  }, [filtered, activeIdx])

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => (i + 1) % Math.max(1, filtered.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => (i - 1 + filtered.length) % Math.max(1, filtered.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      runActive()
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActiveIdx(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActiveIdx(Math.max(0, filtered.length - 1))
    }
  }

  // Group for rendering
  const grouped = useMemo(() => groupByHeading(filtered, t), [filtered, t])

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
                    backdropFilter: 'blur(18px) saturate(160%)',
                    WebkitBackdropFilter: 'blur(18px) saturate(160%)',
                  }}
                />
              }
            />
            <Dialog.Popup
              render={
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.97 }}
                  transition={spring.snappy}
                  className="fixed left-1/2 top-[14vh] -translate-x-1/2 z-[101] w-[min(92vw,640px)] rounded-2xl overflow-hidden outline-none"
                  style={{
                    background: 'color-mix(in oklab, var(--bg-elevated) 88%, transparent)',
                    backdropFilter: 'blur(32px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(32px) saturate(180%)',
                    border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
                    boxShadow:
                      '0 50px 100px -24px rgba(10,20,40,0.42), 0 24px 48px -20px rgba(10,20,40,0.25), 0 0 0 1px color-mix(in oklab, var(--border-subtle) 35%, transparent), inset 0 1px 0 rgba(255,255,255,0.55)',
                  }}
                />
              }
            >
              {/* Accessible title — visually hidden */}
              <Dialog.Title className="sr-only">{t.palette.title}</Dialog.Title>

              {/* Input row */}
              <div
                className="flex items-center gap-3 px-5 h-14"
                style={{
                  borderBottom: '1px solid color-mix(in oklab, var(--border-subtle) 55%, transparent)',
                }}
              >
                <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden>
                  <path
                    d="M9 3a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm5.02 8.6 2.84 2.84a.9.9 0 0 1-1.27 1.27l-2.84-2.84a.9.9 0 0 1 1.27-1.27Z"
                    fill="var(--text-tertiary)"
                  />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setActiveIdx(0)
                  }}
                  onKeyDown={onInputKey}
                  placeholder={t.palette.placeholder}
                  className="flex-1 bg-transparent outline-none"
                  style={{
                    fontSize: 16,
                    fontFamily: 'var(--font-body)',
                    color: 'var(--text-primary)',
                    letterSpacing: '-0.005em',
                    caretColor: 'var(--accent-color)',
                  }}
                  autoComplete="off"
                  spellCheck={false}
                  aria-label={t.palette.placeholder}
                />
                <Kbd>esc</Kbd>
              </div>

              {/* Results */}
              <div
                ref={listRef}
                role="listbox"
                aria-label={t.palette.placeholder}
                className="overflow-y-auto py-2"
                style={{ maxHeight: 'min(60vh, 480px)' }}
              >
                {filtered.length === 0 ? (
                  <div
                    className="px-5 py-10 text-center"
                    style={{
                      color: 'var(--text-tertiary)',
                      fontFamily: 'var(--font-body)',
                      fontSize: 14,
                    }}
                  >
                    {t.palette.empty}
                  </div>
                ) : (
                  grouped.map((section) => (
                    <div key={section.group} className="mb-1.5">
                      <div
                        className="px-5 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-[0.2em]"
                        style={{
                          color: 'var(--text-tertiary)',
                          fontFamily: 'var(--font-body)',
                        }}
                      >
                        {section.label}
                      </div>
                      {section.items.map((cmd) => (
                        <CommandRow
                          key={cmd.id}
                          cmd={cmd}
                          selected={filtered[activeIdx]?.id === cmd.id}
                          index={filtered.indexOf(cmd)}
                          onSelect={() => {
                            cmd.run()
                            setOpen(false)
                          }}
                          onHover={() => setActiveIdx(filtered.indexOf(cmd))}
                        />
                      ))}
                    </div>
                  ))
                )}
              </div>

              {/* Footer hints */}
              <div
                className="flex items-center gap-4 px-5 h-10 text-[11px]"
                style={{
                  borderTop: '1px solid color-mix(in oklab, var(--border-subtle) 55%, transparent)',
                  background: 'color-mix(in oklab, var(--bg-subtle) 65%, transparent)',
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-body)',
                }}
              >
                <span className="flex items-center gap-1.5">
                  <Kbd>↑</Kbd>
                  <Kbd>↓</Kbd>
                  {t.palette.kbd.nav}
                </span>
                <span className="flex items-center gap-1.5">
                  <Kbd>↵</Kbd>
                  {t.palette.kbd.select}
                </span>
                <span className="ml-auto flex items-center gap-1.5">
                  <Kbd>?</Kbd>
                  {t.hotkeys.k.help}
                </span>
              </div>
            </Dialog.Popup>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function CommandRow({
  cmd,
  selected,
  index,
  onSelect,
  onHover,
}: {
  cmd: Command
  selected: boolean
  index: number
  onSelect: () => void
  onHover: () => void
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      data-index={index}
      onClick={onSelect}
      onMouseMove={onHover}
      className="group w-full flex items-center gap-3 px-3 mx-2 rounded-xl h-11 text-left transition-colors"
      style={{
        background: selected ? 'color-mix(in oklab, var(--accent-color) 12%, transparent)' : 'transparent',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-body)',
      }}
    >
      <span
        className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
        style={{
          background: selected
            ? 'color-mix(in oklab, var(--accent-color) 18%, transparent)'
            : 'color-mix(in oklab, var(--bg-subtle) 80%, transparent)',
          color: selected ? 'var(--accent-color)' : 'var(--text-secondary)',
          transition: 'background 160ms, color 160ms',
        }}
      >
        {cmd.icon}
      </span>
      <span className="flex-1 text-[14px] font-medium truncate" style={{ letterSpacing: '-0.005em' }}>
        {cmd.label}
      </span>
      {cmd.shortcut && (
        <span className="flex items-center gap-1 shrink-0">
          {cmd.shortcut.map((k, i) => (
            <Kbd key={i}>{k}</Kbd>
          ))}
        </span>
      )}
      {selected && <ArrowRight className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent-color)' }} />}
    </button>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-md text-[10px] font-semibold"
      style={{
        background: 'color-mix(in oklab, var(--bg-elevated) 95%, transparent)',
        color: 'var(--text-secondary)',
        border: '1px solid color-mix(in oklab, var(--border-subtle) 70%, transparent)',
        boxShadow: '0 1px 0 rgba(0,0,0,0.04), inset 0 -1px 0 color-mix(in oklab, var(--border-subtle) 70%, transparent)',
        fontFamily: 'var(--font-body)',
        letterSpacing: '0.02em',
      }}
    >
      {children}
    </kbd>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function useCommands({
  router,
  resolvedTheme,
  setTheme,
  close,
  workspace,
  t,
}: {
  router: ReturnType<typeof useRouter>
  resolvedTheme: string | undefined
  setTheme: (t: string) => void
  close: () => void
  workspace: ReturnType<typeof useWorkspace>
  t: ReturnType<typeof useT>
}): Command[] {
  return useMemo<Command[]>(() => {
    const nav = (href: string) => () => {
      router.push(href)
    }

    const isDark = resolvedTheme === 'dark'

    const workspaceCommands: Command[] = workspace.workspaces
      .filter((w) => w.slug !== workspace.active?.slug)
      .map((w, i) => ({
        id: `workspace-${w.slug}`,
        label: `${t.workspace.switchTo} ${w.name}`,
        group: 'workspace' as CommandGroup,
        icon: <Building2 className="w-4 h-4" />,
        shortcut: i < 9 ? [`⌘${workspace.workspaces.findIndex((x) => x.slug === w.slug) + 1}`] : undefined,
        keywords: `workspace arbeidsomrade bytt switch ${w.name} ${w.slug} ${w.region}`,
        run: () => {
          void workspace.switchTo(w.slug)
        },
      }))

    return [
      // NAVIGATION
      {
        id: 'nav-home',
        label: t.nav.home,
        group: 'nav',
        icon: <Home className="w-4 h-4" />,
        keywords: 'oversikt hjem team kalender uke',
        run: nav('/'),
      },
      {
        id: 'nav-myplan',
        label: t.nav.myPlan,
        group: 'nav',
        icon: <CircleUser className="w-4 h-4" />,
        keywords: 'min plan meg',
        run: nav('/min-plan'),
      },
      {
        id: 'nav-wheel',
        label: t.nav.wheel,
        group: 'nav',
        icon: <Calendar className="w-4 h-4" />,
        keywords: 'årshjul år hjul plandisc events begivenheter',
        run: nav('/wheel'),
      },
      {
        id: 'nav-dashboard',
        label: t.nav.dashboard,
        group: 'nav',
        icon: <LayoutGrid className="w-4 h-4" />,
        keywords: 'dashboard skjerm live karusell kart',
        run: nav('/dashboard'),
      },
      {
        id: 'nav-settings',
        label: t.nav.settings,
        group: 'nav',
        icon: <Settings className="w-4 h-4" />,
        keywords: 'innstillinger konfig medlemmer kontor tema',
        run: nav('/settings'),
      },

      // ACTIONS
      {
        id: 'action-focus-input',
        label: t.palette.cmd.focusInput,
        group: 'actions',
        icon: <PenSquare className="w-4 h-4" />,
        shortcut: ['/'],
        keywords: 'ai status skriv input legg til',
        run: () => {
          router.push('/')
          // Close first so the focus on the input below is uncontested
          close()
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const el = document.querySelector('main input[type="text"]') as HTMLInputElement | null
              el?.focus()
            })
          })
        },
      },
      {
        id: 'action-ai-query',
        label: 'Still et spørsmål om teamet',
        group: 'actions',
        icon: <MessageSquare className="w-4 h-4" />,
        shortcut: ['⌘', 'J'],
        keywords: 'ai spørsmål oslo vilnius hvem hvor når ferie reise query',
        run: () => {
          window.dispatchEvent(new CustomEvent('teampulse:ai-query:open'))
        },
      },
      {
        id: 'action-suggest-days',
        label: t.palette.cmd.suggestDays,
        group: 'actions',
        icon: <Sparkles className="w-4 h-4" />,
        keywords: 'ai samlingsdager koordinere kontor sammen ukentlig møte',
        run: () => {
          router.push('/')
          // Let the page mount before scrolling.
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              window.dispatchEvent(new CustomEvent('teampulse:days-together:focus'))
            })
          })
        },
      },
      {
        id: 'action-help',
        label: t.palette.cmd.help,
        group: 'actions',
        icon: <Keyboard className="w-4 h-4" />,
        shortcut: ['?'],
        keywords: 'hjelp snarveier tastatur',
        run: () => {
          window.dispatchEvent(new CustomEvent('teampulse:help:open'))
        },
      },

      // THEME
      {
        id: 'theme-toggle',
        label: isDark ? t.palette.cmd.themeLight : t.palette.cmd.themeDark,
        group: 'theme',
        icon: isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />,
        keywords: 'tema mørkt lyst dark light',
        run: () => setTheme(isDark ? 'light' : 'dark'),
      },
      {
        id: 'theme-system',
        label: t.palette.cmd.themeSystem,
        group: 'theme',
        icon: <Monitor className="w-4 h-4" />,
        keywords: 'system auto',
        run: () => setTheme('system'),
      },

      ...workspaceCommands,
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, resolvedTheme, t, workspace.active?.slug, workspace.workspaces])
}

// ─────────────────────────────────────────────────────────────────────────────
// Fuzzy filter: rank by prefix match, then substring, then keywords.

function filterCommands(commands: Command[], query: string): Command[] {
  const q = query.trim().toLowerCase()
  if (!q) return commands
  const scored: Array<{ cmd: Command; score: number }> = []
  for (const cmd of commands) {
    const label = cmd.label.toLowerCase()
    const kw = (cmd.keywords ?? '').toLowerCase()
    let score = 0
    if (label === q) score = 1000
    else if (label.startsWith(q)) score = 500
    else if (label.includes(q)) score = 200
    else if (kw.split(/\s+/).some((k) => k.startsWith(q))) score = 120
    else if (kw.includes(q)) score = 60
    if (score > 0) scored.push({ cmd, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.map((x) => x.cmd)
}

function groupByHeading(cmds: Command[], t: ReturnType<typeof useT>): Array<{ group: CommandGroup; label: string; items: Command[] }> {
  const order: CommandGroup[] = ['workspace', 'nav', 'actions', 'theme']
  const labels: Record<CommandGroup, string> = {
    nav: t.palette.group.nav,
    actions: t.palette.group.actions,
    theme: t.palette.group.theme,
    workspace: t.palette.group.workspace,
  }
  return order
    .map((group) => ({ group, label: labels[group], items: cmds.filter((c) => c.group === group) }))
    .filter((s) => s.items.length > 0)
}
