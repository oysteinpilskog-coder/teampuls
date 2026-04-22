'use client'

import { Popover } from '@base-ui/react/popover'
import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { MemberAvatar } from '@/components/member-avatar'
import { StatusIcon } from '@/components/icons/status-icons'
import { useStatusColors } from '@/lib/status-colors/context'
import { no } from '@/lib/i18n/no'
import { spring } from '@/lib/motion'
import type { EntryStatus } from '@/lib/supabase/types'

interface MemberHoverCardProps {
  memberId: string
  displayName: string
  fullName?: string | null
  avatarUrl: string | null
  initials?: string | null
  officeName?: string | null
  officeCity?: string | null
  timezone?: string | null
  todayStatus?: EntryStatus | null
  todayLocation?: string | null
  todayNote?: string | null
  children: React.ReactNode
}

/**
 * Wraps any content with a hover card that reveals the member's context:
 * full name, home office + city, their local time live-updating every
 * minute, and what they're doing today. Built on Base UI Popover's
 * Positioner + Portal so it never clips and always finds space.
 *
 * The hover trigger is controlled manually so we can add small enter/leave
 * delays — a purely declarative tooltip would flicker as the cursor moves
 * between trigger and card.
 */
export function MemberHoverCard({
  displayName,
  fullName,
  avatarUrl,
  initials,
  officeName,
  officeCity,
  timezone,
  todayStatus,
  todayLocation,
  todayNote,
  children,
}: MemberHoverCardProps) {
  const [open, setOpen] = useState(false)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function scheduleOpen() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    if (open) return
    openTimer.current = setTimeout(() => setOpen(true), 220)
  }

  function scheduleClose() {
    if (openTimer.current) clearTimeout(openTimer.current)
    closeTimer.current = setTimeout(() => setOpen(false), 140)
  }

  useEffect(() => () => {
    if (openTimer.current) clearTimeout(openTimer.current)
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }, [])

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        render={
          <span
            onMouseEnter={scheduleOpen}
            onMouseLeave={scheduleClose}
            onFocus={scheduleOpen}
            onBlur={scheduleClose}
            className="inline-flex items-center gap-2 cursor-default outline-none"
          />
        }
      >
        {children}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="start"
          sideOffset={10}
          className="z-50"
        >
          <Popover.Popup
            onMouseEnter={() => {
              if (closeTimer.current) clearTimeout(closeTimer.current)
            }}
            onMouseLeave={scheduleClose}
            className="outline-none"
          >
            <AnimatePresence>
              {open && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={spring.snappy}
                  className="w-[280px] rounded-2xl overflow-hidden"
                  style={{
                    background: 'color-mix(in oklab, var(--bg-elevated) 92%, transparent)',
                    backdropFilter: 'blur(22px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(22px) saturate(180%)',
                    border: '1px solid color-mix(in oklab, var(--border-subtle) 55%, transparent)',
                    boxShadow:
                      '0 24px 48px -12px rgba(10,20,40,0.22), 0 8px 18px -12px rgba(10,20,40,0.14), inset 0 1px 0 rgba(255,255,255,0.55)',
                  }}
                >
                  <HoverCardBody
                    displayName={displayName}
                    fullName={fullName ?? null}
                    avatarUrl={avatarUrl}
                    initials={initials ?? null}
                    officeName={officeName ?? null}
                    officeCity={officeCity ?? null}
                    timezone={timezone ?? null}
                    todayStatus={todayStatus ?? null}
                    todayLocation={todayLocation ?? null}
                    todayNote={todayNote ?? null}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function HoverCardBody({
  displayName,
  fullName,
  avatarUrl,
  initials,
  officeName,
  officeCity,
  timezone,
  todayStatus,
  todayLocation,
  todayNote,
}: {
  displayName: string
  fullName: string | null
  avatarUrl: string | null
  initials: string | null
  officeName: string | null
  officeCity: string | null
  timezone: string | null
  todayStatus: EntryStatus | null
  todayLocation: string | null
  todayNote: string | null
}) {
  const colors = useStatusColors()
  const [localTime, setLocalTime] = useState<string>('')

  useEffect(() => {
    if (!timezone) return
    const render = () => {
      try {
        setLocalTime(
          new Intl.DateTimeFormat('nb-NO', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: timezone,
          }).format(new Date()),
        )
      } catch {
        setLocalTime('')
      }
    }
    render()
    const t = setInterval(render, 30_000)
    return () => clearInterval(t)
  }, [timezone])

  const status = todayStatus
  const tone = status ? colors[status].icon : null

  return (
    <div className="p-4">
      {/* Head: avatar + name block. The avatar is wrapped in a halo ring
          tinted by today's status — if the person is on vacation, the ring
          picks up the vacation hue; if they're at the office, it glows blue. */}
      <div className="flex items-center gap-3">
        <div className="relative">
          {tone && (
            <>
              <span
                aria-hidden
                className="absolute rounded-full pointer-events-none"
                style={{
                  inset: -6,
                  background: `radial-gradient(circle, color-mix(in oklab, ${tone} 55%, transparent) 0%, transparent 70%)`,
                  filter: 'blur(10px)',
                }}
              />
              <span
                aria-hidden
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{
                  boxShadow: `0 0 0 2px color-mix(in oklab, ${tone} 38%, transparent),
                              0 8px 20px -4px color-mix(in oklab, ${tone} 55%, transparent)`,
                }}
              />
            </>
          )}
          <div className="relative">
            <MemberAvatar
              name={displayName}
              avatarUrl={avatarUrl}
              initials={initials}
              size="lg"
            />
          </div>
          {tone && (
            <span
              aria-hidden
              className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full"
              style={{
                width: 20,
                height: 20,
                background: tone,
                boxShadow: `0 0 0 2px var(--bg-elevated), 0 2px 6px color-mix(in oklab, ${tone} 55%, transparent)`,
              }}
            >
              <StatusIcon status={status!} size={11} color="#ffffff" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="font-bold truncate"
            style={{
              fontFamily: 'var(--font-sora)',
              color: 'var(--text-primary)',
              fontSize: 16,
              letterSpacing: '-0.02em',
            }}
          >
            {fullName || displayName}
          </div>
          {initials && (
            <div
              className="text-[11px] font-semibold uppercase tracking-[0.12em] mt-0.5"
              style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
            >
              {initials}
            </div>
          )}
        </div>
      </div>

      {/* Divider */}
      <div
        className="my-3 h-px"
        style={{ background: 'color-mix(in oklab, var(--border-subtle) 55%, transparent)' }}
      />

      {/* Office + local time row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Label>Hjemmekontor</Label>
          <div
            className="text-[13px] font-medium truncate"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
          >
            {officeName || officeCity || '—'}
          </div>
          {officeName && officeCity && officeName !== officeCity && (
            <div
              className="text-[11px] mt-0.5"
              style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
            >
              {officeCity}
            </div>
          )}
        </div>
        {timezone && (
          <div className="text-right shrink-0">
            <Label>Lokal tid</Label>
            <div
              className="font-bold tabular-nums"
              style={{
                fontFamily: 'var(--font-sora)',
                color: 'var(--text-primary)',
                fontSize: 16,
                letterSpacing: '-0.02em',
              }}
              suppressHydrationWarning
            >
              {localTime || '—'}
            </div>
          </div>
        )}
      </div>

      {/* Today status card */}
      {status && tone && (
        <>
          <div
            className="my-3 h-px"
            style={{ background: 'color-mix(in oklab, var(--border-subtle) 55%, transparent)' }}
          />
          <Label>I dag</Label>
          <div
            className="mt-1 flex items-center gap-2.5 rounded-xl px-3 py-2.5"
            style={{
              background: `color-mix(in oklab, ${tone} 12%, transparent)`,
              border: `1px solid color-mix(in oklab, ${tone} 22%, transparent)`,
            }}
          >
            <span
              className="flex items-center justify-center rounded-lg shrink-0"
              style={{ width: 28, height: 28, background: tone }}
            >
              <StatusIcon status={status} size={15} color="#ffffff" />
            </span>
            <div className="min-w-0 flex-1">
              <div
                className="text-[13px] font-semibold truncate"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
              >
                {no.status[status]}
                {todayLocation && (
                  <span
                    className="ml-1.5 font-medium"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    · {todayLocation}
                  </span>
                )}
              </div>
              {todayNote && (
                <div
                  className="text-[11.5px] truncate mt-0.5"
                  style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
                  title={todayNote}
                >
                  {todayNote}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[10px] font-bold uppercase tracking-[0.2em] mb-0.5"
      style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
    >
      {children}
    </div>
  )
}
