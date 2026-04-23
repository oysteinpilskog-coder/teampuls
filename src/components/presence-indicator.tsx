'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { MemberAvatar } from '@/components/member-avatar'
import { usePresenceCtx } from '@/lib/presence/context'
import { spring } from '@/lib/motion'

/**
 * Stacked avatars showing every other session currently on this workspace,
 * with a hover card listing their names + current route. Hidden entirely
 * when you're the only person online — nothing to show.
 */
export function PresenceIndicator() {
  const { others } = usePresenceCtx()
  const [open, setOpen] = useState(false)

  // Deduplicate by member_id so the same person on two tabs only counts once.
  const unique = Array.from(
    new Map(others.map((o) => [o.member_id, o])).values(),
  )

  if (unique.length === 0) return null

  const visible = unique.slice(0, 3)
  const overflow = unique.length - visible.length

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`${unique.length} andre ${unique.length === 1 ? 'er' : 'er'} online`}
        className="flex items-center gap-2 pl-1 pr-2.5 h-8 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
        style={{
          background: 'color-mix(in oklab, var(--bg-elevated) 70%, transparent)',
          backdropFilter: 'blur(14px) saturate(180%)',
          WebkitBackdropFilter: 'blur(14px) saturate(180%)',
          border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          fontFamily: 'var(--font-body)',
        }}
      >
        {/* Avatar stack — mini */}
        <div className="flex items-center">
          {visible.map((o, i) => (
            <div
              key={o.member_id}
              className="rounded-full relative"
              style={{
                marginLeft: i === 0 ? 0 : -8,
                boxShadow: `0 0 0 2px var(--bg-elevated)`,
                zIndex: visible.length - i,
              }}
              title={o.display_name}
            >
              <MemberAvatar
                name={o.display_name}
                avatarUrl={o.avatar_url}
                initials={o.initials}
                size="xs"
              />
              {/* Green presence pip */}
              <span
                aria-hidden
                className="absolute -bottom-0.5 -right-0.5 w-[7px] h-[7px] rounded-full"
                style={{
                  background: '#10B981',
                  boxShadow: '0 0 0 1.5px var(--bg-elevated), 0 0 6px rgba(16,185,129,0.8)',
                }}
              />
            </div>
          ))}
          {overflow > 0 && (
            <span
              className="inline-flex items-center justify-center rounded-full font-semibold"
              style={{
                width: 20,
                height: 20,
                marginLeft: -8,
                background: 'var(--bg-subtle)',
                color: 'var(--text-secondary)',
                fontSize: 9,
                letterSpacing: '-0.02em',
                boxShadow: `0 0 0 2px var(--bg-elevated)`,
                fontFamily: 'var(--font-body)',
              }}
            >
              +{overflow}
            </span>
          )}
        </div>
        <span
          className="text-[11px] font-semibold tabular-nums"
          style={{ color: 'var(--text-secondary)' }}
        >
          {unique.length}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={spring.snappy}
            className="absolute right-0 top-[calc(100%+8px)] w-[240px] rounded-xl overflow-hidden z-40"
            style={{
              background: 'color-mix(in oklab, var(--bg-elevated) 92%, transparent)',
              backdropFilter: 'blur(22px) saturate(180%)',
              WebkitBackdropFilter: 'blur(22px) saturate(180%)',
              border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
              boxShadow:
                '0 24px 48px -16px rgba(10,20,40,0.28), 0 10px 18px -12px rgba(10,20,40,0.16), inset 0 1px 0 rgba(255,255,255,0.5)',
            }}
          >
            <div
              className="px-3 pt-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-[0.22em]"
              style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
            >
              Online nå · {unique.length}
            </div>
            <div className="pb-1.5">
              {unique.map((o) => (
                <div
                  key={o.member_id}
                  className="flex items-center gap-2.5 px-3 h-9"
                >
                  <div className="relative shrink-0">
                    <MemberAvatar
                      name={o.display_name}
                      avatarUrl={o.avatar_url}
                      initials={o.initials}
                      size="xs"
                    />
                    <span
                      aria-hidden
                      className="absolute -bottom-0.5 -right-0.5 w-[7px] h-[7px] rounded-full"
                      style={{
                        background: '#10B981',
                        boxShadow: '0 0 0 1.5px var(--bg-elevated)',
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-[12.5px] font-semibold truncate"
                      style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
                    >
                      {o.display_name}
                    </div>
                    <div
                      className="text-[10.5px] truncate"
                      style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
                    >
                      {o.editing?.kind === 'cell'
                        ? 'Redigerer en status…'
                        : labelForPage(o.page)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function labelForPage(page: string): string {
  if (page === '/') return 'Oversikt'
  if (page.startsWith('/min-plan')) return 'Min plan'
  if (page.startsWith('/wheel')) return 'Årshjul'
  if (page.startsWith('/dashboard')) return 'Dashboard'
  if (page.startsWith('/settings')) return 'Innstillinger'
  return page
}
