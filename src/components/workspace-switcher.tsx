'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, ChevronsUpDown, Layers } from 'lucide-react'
import { useWorkspace, COMBINED_SLUG } from '@/lib/workspace/context'
import { CalwinMark } from '@/components/brand/calwin-mark'
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

function roleLabel(role: WorkspaceSummary['role'], t: Dictionary): string {
  switch (role) {
    case 'admin':  return t.workspace.roleAdmin
    case 'member': return t.workspace.roleMember
    case 'viewer': return t.workspace.roleViewer
  }
}

export function WorkspaceSwitcher() {
  const { workspaces, active, switchTo, isSwitching, isCombined } = useWorkspace()
  const t = useT()
  const [open, setOpen] = useState(false)
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Combined view is offered only when the user has ≥2 *real*
  // memberships sharing one account. Viewer-rows (account-wide read
  // access without membership) are excluded — combined-view AI
  // writes need a per-workspace member row to attribute entries to.
  const combinedAvailable = useMemo(() => {
    const realMemberships = workspaces.filter((w) => w.role !== 'viewer')
    if (realMemberships.length < 2) return false
    const accountIds = new Set(realMemberships.map((w) => w.account_id).filter((x): x is string => !!x))
    return accountIds.size === 1
  }, [workspaces])

  // ⌘0..⌘9 — ⌘0 = combined view (when available), ⌘1..⌘9 = workspaces.
  // Escape closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) {
        setOpen(false)
        return
      }
      const isMeta = e.metaKey || e.ctrlKey
      if (!isMeta || e.altKey || e.shiftKey) return
      const n = Number(e.key)
      if (!Number.isInteger(n)) return
      if (n === 0) {
        if (!combinedAvailable) return
        e.preventDefault()
        void switchTo(COMBINED_SLUG)
        return
      }
      if (n < 1 || n > 9) return
      const target = workspaces[n - 1]
      if (!target) return
      e.preventDefault()
      void switchTo(target.slug)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [workspaces, switchTo, open, combinedAvailable])

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
  const badge = active.short_name || active.name.slice(0, 2).toUpperCase()
  // First-customer branding: CalWin workspaces show the brandbook dot-ring
  // in the header chip instead of a generated initials square. Other orgs
  // (future tenants) keep the generic WorkspaceBadge. The dropdown rows
  // below intentionally keep the initials badge so NO/UK stay distinct.
  const isCalwin = !isCombined && /calwin/i.test(active.name)

  // Nothing to switch to: a single workspace and no combined view. Render a
  // static brand identity chip instead of a dropdown. A chevron + clickable
  // control that opens a one-row menu reads as broken ("ingen funksjonalitet").
  // This auto-upgrades to the full switcher the moment a second workspace or
  // membership appears.
  const interactive = workspaces.length > 1 || combinedAvailable
  if (!interactive) {
    return (
      <div
        aria-label={active.name}
        className="flex items-center gap-2 pl-1.5 pr-2.5 h-8 rounded-xl text-[12px] font-medium select-none"
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
        }}
      >
        {isCalwin ? <CalwinMark size={20} /> : <WorkspaceBadge workspace={active} size="sm" />}
        <span className="hidden md:inline max-w-[140px] truncate">{active.name}</span>
        {isCalwin && active.short_name ? (
          <span
            className="inline-flex items-center justify-center h-[18px] px-1.5 rounded-md text-[10px] font-semibold uppercase tabular-nums"
            style={{
              background: 'color-mix(in oklab, var(--accent-color) 14%, transparent)',
              color: 'var(--accent-color)',
              letterSpacing: '0.04em',
              fontFamily: 'var(--font-body)',
            }}
          >
            {active.short_name}
          </span>
        ) : (
          <span className="md:hidden">{badge}</span>
        )}
      </div>
    )
  }

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
        {isCombined ? (
          <CombinedBadge size="sm" workspaces={workspaces} />
        ) : isCalwin ? (
          <CalwinMark size={20} />
        ) : (
          <WorkspaceBadge workspace={active} size="sm" />
        )}
        <span className="hidden md:inline max-w-[140px] truncate">{active.name}</span>
        {isCalwin && active.short_name ? (
          <span
            className="inline-flex items-center justify-center h-[18px] px-1.5 rounded-md text-[10px] font-semibold uppercase tabular-nums"
            style={{
              background: 'color-mix(in oklab, var(--accent-color) 14%, transparent)',
              color: 'var(--accent-color)',
              letterSpacing: '0.04em',
              fontFamily: 'var(--font-body)',
            }}
          >
            {active.short_name}
          </span>
        ) : (
          <span className="md:hidden">{badge}</span>
        )}
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
              {combinedAvailable && (
                <li key="__combined__">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isCombined}
                    onClick={() => {
                      setOpen(false)
                      void switchTo(COMBINED_SLUG)
                    }}
                    onMouseEnter={() => setHoveredSlug(COMBINED_SLUG)}
                    onMouseLeave={() => setHoveredSlug((s) => (s === COMBINED_SLUG ? null : s))}
                    onFocus={() => setHoveredSlug(COMBINED_SLUG)}
                    onBlur={() => setHoveredSlug((s) => (s === COMBINED_SLUG ? null : s))}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-[background,box-shadow] duration-150"
                    style={{
                      // Combined-pill bruker --accent-color slik at den
                      // dynamisk plukker accent-fargen som combined-vyen
                      // setter (via layout.tsx bodyStyle): for CalWin er
                      // det `--dusk` (mid Blue Violet) som skiller seg
                      // fra Light Blue og brand-accenter for hver org.
                      background: isCombined
                        ? 'linear-gradient(135deg, color-mix(in oklab, var(--accent-color) 28%, transparent), color-mix(in oklab, var(--accent-color) 18%, transparent))'
                        : hoveredSlug === COMBINED_SLUG
                          ? 'color-mix(in oklab, var(--bg-subtle) 70%, transparent)'
                          : 'transparent',
                      boxShadow: isCombined
                        ? 'inset 0 0 0 1px color-mix(in oklab, var(--accent-color) 55%, transparent), 0 1px 0 color-mix(in oklab, var(--accent-color) 18%, transparent)'
                        : 'none',
                    }}
                  >
                    <CombinedBadge size="md" workspaces={workspaces} />
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-[13px] font-medium truncate"
                        style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
                      >
                        {t.workspace.combinedAll}
                      </div>
                      <div
                        className="text-[11px] truncate flex items-center gap-1.5"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        <Layers className="w-3 h-3" aria-hidden />
                        <span>{t.workspace.combinedDescription}</span>
                      </div>
                    </div>
                    {isCombined ? (
                      <Check className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-color)' }} aria-hidden />
                    ) : (
                      <span
                        className="shrink-0 inline-flex items-center justify-center min-w-[28px] h-5 px-1.5 rounded-md text-[10px] font-semibold"
                        style={{
                          background: 'color-mix(in oklab, var(--bg-subtle) 80%, transparent)',
                          color: 'var(--text-tertiary)',
                          border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
                          letterSpacing: '0.02em',
                        }}
                      >
                        ⌘0
                      </span>
                    )}
                  </button>
                </li>
              )}
              {combinedAvailable && (
                <li
                  aria-hidden
                  className="my-1 mx-2 h-px"
                  style={{ background: 'color-mix(in oklab, var(--border-subtle) 50%, transparent)' }}
                />
              )}
              {workspaces.map((w, i) => {
                const isActive = !isCombined && w.slug === active.slug
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
                          <span style={w.role === 'viewer' ? { fontStyle: 'italic', opacity: 0.85 } : undefined}>
                            {roleLabel(w.role, t)}
                          </span>
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
                {t.workspace.shortcutHint.replace(
                  '{n}',
                  combinedAvailable
                    ? '0–' + Math.min(workspaces.length, 9)
                    : '1–' + Math.min(workspaces.length, 9),
                )}
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

/**
 * Two-tone badge for the combined "Alle CalWin" view — splits diagonally
 * so each workspace's accent reads on its own half. Falls back to the
 * neutral violet when fewer than two accent colors are available.
 */
export function CombinedBadge({
  workspaces,
  size = 'md',
}: {
  workspaces: WorkspaceSummary[]
  size?: 'sm' | 'md'
}) {
  const accents = workspaces
    .map((w) => safeHex(w.accent_color))
    .filter((x): x is string => !!x)
  // Fallback: CalWin --dusk (mid Blue Violet). Treffer når <CombinedBadge>
  // rendres for en tom workspace-liste — sjelden, men trenger en farge
  // som ikke kolliderer med Light Blue accent eller deep Blue Violet bg.
  const left = accents[0] ?? '#4A4595'
  const right = accents[1] ?? '#4A4595'
  const px = size === 'sm' ? 20 : 26
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center rounded-md shrink-0"
      style={{
        width: px,
        height: px,
        background: `linear-gradient(135deg, ${left} 0%, ${left} 48%, ${right} 52%, ${right} 100%)`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.35), 0 1px 2px color-mix(in oklab, var(--ink) 35%, transparent)`,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Layers
        className={size === 'sm' ? 'w-[10px] h-[10px]' : 'w-3 h-3'}
        style={{ color: 'white', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.45))' }}
        aria-hidden
      />
    </span>
  )
}
