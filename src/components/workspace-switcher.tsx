'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, ChevronsUpDown } from 'lucide-react'
import { useWorkspace } from '@/lib/workspace/context'
import { useT } from '@/lib/i18n/context'
import type { Dictionary } from '@/lib/i18n/types'
import { spring } from '@/lib/motion'
import type { WorkspaceSummary } from '@/lib/supabase/types'

/** Safe hex for inline style; falls back to accent-color CSS var. */
function safeHex(value: string | null): string | null {
  if (!value) return null
  return /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : null
}

function regionLabel(r: WorkspaceSummary['region'], t: Dictionary): string {
  switch (r) {
    case 'eu':   return t.workspace.regionEU
    case 'uk':   return t.workspace.regionUK
    case 'us':   return t.workspace.regionUS
    case 'apac': return t.workspace.regionAPAC
  }
}

/** Country code → emoji flag (used as a soft hint, not authoritative). */
function countryFlag(cc: string | null): string | null {
  if (!cc || cc.length !== 2) return null
  const base = 127397
  const chars = cc.toUpperCase().split('').map((c) => base + c.charCodeAt(0))
  return String.fromCodePoint(...chars)
}

export function WorkspaceSwitcher() {
  const { workspaces, active, switchTo, isSwitching } = useWorkspace()
  const t = useT()
  const [open, setOpen] = useState(false)
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // ⌘1..⌘9 — switch to N-th workspace. Escape closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) {
        setOpen(false)
        return
      }
      const isMeta = e.metaKey || e.ctrlKey
      if (!isMeta || e.altKey || e.shiftKey) return
      const n = Number(e.key)
      if (!Number.isInteger(n) || n < 1 || n > 9) return
      const target = workspaces[n - 1]
      if (!target) return
      e.preventDefault()
      void switchTo(target.slug)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [workspaces, switchTo, open])

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (
        !menuRef.current?.contains(e.target as Node) &&
        !btnRef.current?.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  if (!active || workspaces.length === 0) return null

  const accent = safeHex(active.accent_color)
  const flag = countryFlag(active.country_code)
  const badge = active.short_name || active.name.slice(0, 2).toUpperCase()

  return (
    <div className="relative">
      <motion.button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.97 }}
        transition={spring.snappy}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${t.workspace.switcher}: ${active.name}`}
        className="group flex items-center gap-2 pl-1.5 pr-2 h-8 rounded-xl text-[12px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
        style={{
          color: 'var(--text-primary)',
          background: 'color-mix(in oklab, var(--bg-elevated) 70%, transparent)',
          backdropFilter: 'blur(14px) saturate(180%)',
          WebkitBackdropFilter: 'blur(14px) saturate(180%)',
          border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
          boxShadow: accent
            ? `0 1px 2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.4), 0 0 0 1px color-mix(in oklab, ${accent} 30%, transparent)`
            : '0 1px 2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.4)',
          fontFamily: 'var(--font-body)',
          opacity: isSwitching ? 0.75 : 1,
          transition: 'opacity 140ms ease',
        }}
      >
        <WorkspaceBadge workspace={active} size="sm" />
        <span className="hidden md:inline max-w-[140px] truncate">{active.name}</span>
        <span className="md:hidden">{badge}</span>
        {flag && <span aria-hidden className="text-[13px] leading-none">{flag}</span>}
        <ChevronsUpDown
          className="w-3 h-3 opacity-60 transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}
          aria-hidden
        />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={spring.snappy}
            className="absolute right-0 mt-2 w-[280px] origin-top-right rounded-2xl p-1.5 z-50"
            style={{
              background: 'color-mix(in oklab, var(--bg-elevated) 92%, transparent)',
              backdropFilter: 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
              border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
              boxShadow: '0 20px 50px -20px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.05) inset',
            }}
          >
            <div
              className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wider uppercase"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {t.workspace.switcher}
            </div>
            <ul className="flex flex-col">
              {workspaces.map((w, i) => {
                const isActive = w.slug === active.slug
                const wAccent = safeHex(w.accent_color)
                const shortcut = i < 9 ? `⌘${i + 1}` : null
                const tint = wAccent ?? 'var(--accent-color)'
                const isHovered = hoveredSlug === w.slug
                const rowBackground = isActive
                  ? `linear-gradient(135deg, color-mix(in oklab, ${tint} 28%, transparent), color-mix(in oklab, ${tint} 18%, transparent))`
                  : isHovered
                    ? 'color-mix(in oklab, var(--bg-subtle) 70%, transparent)'
                    : 'transparent'
                return (
                  <li key={w.org_id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => {
                        setOpen(false)
                        void switchTo(w.slug)
                      }}
                      onMouseEnter={() => setHoveredSlug(w.slug)}
                      onMouseLeave={() => setHoveredSlug((s) => (s === w.slug ? null : s))}
                      onFocus={() => setHoveredSlug(w.slug)}
                      onBlur={() => setHoveredSlug((s) => (s === w.slug ? null : s))}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-[background,box-shadow] duration-150"
                      style={{
                        background: rowBackground,
                        boxShadow: isActive
                          ? `inset 0 0 0 1px color-mix(in oklab, ${tint} 55%, transparent), 0 1px 0 color-mix(in oklab, ${tint} 18%, transparent)`
                          : 'none',
                      }}
                    >
                      <WorkspaceBadge workspace={w} size="md" />
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-[13px] font-medium truncate"
                          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
                        >
                          {w.name}
                        </div>
                        <div
                          className="text-[11px] truncate flex items-center gap-1.5"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          <span>{regionLabel(w.region, t)}</span>
                          <span aria-hidden>·</span>
                          <span className="capitalize">{w.role}</span>
                        </div>
                      </div>
                      {isActive ? (
                        <Check
                          className="w-4 h-4 shrink-0"
                          style={{ color: wAccent ?? 'var(--accent-color)' }}
                          aria-hidden
                        />
                      ) : shortcut ? (
                        <span
                          className="shrink-0 inline-flex items-center justify-center min-w-[28px] h-5 px-1.5 rounded-md text-[10px] font-semibold"
                          style={{
                            background: 'color-mix(in oklab, var(--bg-subtle) 80%, transparent)',
                            color: 'var(--text-tertiary)',
                            border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
                            letterSpacing: '0.02em',
                          }}
                        >
                          {shortcut}
                        </span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
            {workspaces.length > 1 && (
              <div
                className="px-3 pt-2 pb-1.5 mt-1 border-t text-[10.5px]"
                style={{
                  borderColor: 'color-mix(in oklab, var(--border-subtle) 60%, transparent)',
                  color: 'var(--text-tertiary)',
                }}
              >
                {t.workspace.shortcutHint.replace('{n}', '1–' + Math.min(workspaces.length, 9))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * Square gradient badge with the workspace's short_name, tinted by
 * the accent color. Used in both the header pill and the dropdown.
 */
export function WorkspaceBadge({
  workspace,
  size = 'md',
}: {
  workspace: WorkspaceSummary
  size?: 'sm' | 'md'
}) {
  const accent = safeHex(workspace.accent_color) ?? 'var(--accent-color)'
  const label = workspace.short_name || workspace.name.slice(0, 2).toUpperCase()
  const px = size === 'sm' ? 20 : 26
  const fontPx = size === 'sm' ? 9 : 10.5
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center rounded-md shrink-0"
      style={{
        width: px,
        height: px,
        background: `linear-gradient(135deg, color-mix(in oklab, ${accent} 85%, white), ${accent})`,
        color: 'white',
        fontSize: fontPx,
        fontWeight: 700,
        letterSpacing: '0.04em',
        fontFamily: 'var(--font-body)',
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.35), 0 1px 2px color-mix(in oklab, ${accent} 40%, transparent)`,
      }}
    >
      {label}
    </span>
  )
}
