'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { StatusIcon } from '@/components/icons/status-icons'
import type { EntryStatus } from '@/lib/supabase/types'
import { AvatarStack } from '@/components/member-avatar'
import { useT } from '@/lib/i18n/context'
import { useState, useEffect, useRef } from 'react'
import { useStatusColors } from '@/lib/status-colors/context'

interface MemberWithEntry {
  id: string
  display_name: string
  full_name?: string | null
  initials?: string | null
  avatar_url: string | null
  status: EntryStatus
  location_label: string | null
  /** true when this status was inferred from the org/member default, not logged. */
  assumed?: boolean
}

interface TodayPulseProps {
  entries: MemberWithEntry[]
}

// Compact strip layout — one row per status group, two columns on wide
// screens. Replaces the previous bento grid which left a lot of empty
// space inside each tall card and used a `mix(tone, white)` accent that
// vanished on the cream Paper background in light mode.
const COL_CLASSES: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 lg:grid-cols-2',
  3: 'grid-cols-1 lg:grid-cols-2',
  4: 'grid-cols-1 lg:grid-cols-2',
  5: 'grid-cols-1 lg:grid-cols-2',
  6: 'grid-cols-1 lg:grid-cols-2',
  7: 'grid-cols-1 lg:grid-cols-2',
}

export function TodayPulse({ entries }: TodayPulseProps) {
  const t = useT()
  const STATUS_COLORS = useStatusColors()
  const reduce = !!useReducedMotion()

  const GROUPS: Array<{ status: EntryStatus; label: string }> = [
    { status: 'office',   label: t.status.office },
    { status: 'remote',   label: t.status.remote },
    { status: 'customer', label: t.status.customer },
    { status: 'travel',   label: t.status.travel },
    { status: 'vacation', label: t.status.vacation },
    { status: 'sick',     label: t.status.sick },
    { status: 'off',      label: t.status.off },
  ]

  const visibleGroups = GROUPS
    .map((g) => ({ ...g, members: entries.filter((e) => e.status === g.status) }))
    .filter((g) => g.members.length > 0)

  const totalToday = entries.length

  if (visibleGroups.length === 0) return null

  const colClasses = COL_CLASSES[visibleGroups.length] ?? COL_CLASSES[7]

  return (
    <section className="relative isolate" aria-label="Akkurat nå">
      <div className="flex items-center gap-2 mb-3">
        <motion.span
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: 'var(--lg-accent)',
            boxShadow: '0 0 10px var(--lg-accent-glow)',
          }}
          animate={reduce ? {} : { opacity: [0.35, 1, 0.35] }}
          transition={reduce ? undefined : { duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <span className="lg-eyebrow">Akkurat nå</span>
      </div>

      <TeamBalanceBar
        visibleGroups={visibleGroups}
        total={totalToday}
        statusColors={STATUS_COLORS}
        reduce={reduce}
      />

      <div className={`grid ${colClasses} gap-2`}>
        {visibleGroups.map((group, i) => (
          <PulseRow
            key={group.status}
            status={group.status}
            label={group.label}
            members={group.members}
            index={i}
            tone={STATUS_COLORS[group.status].icon}
            reduce={reduce}
          />
        ))}
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

interface TeamBalanceBarProps {
  visibleGroups: Array<{ status: EntryStatus; label: string; members: MemberWithEntry[] }>
  total: number
  statusColors: ReturnType<typeof useStatusColors>
  reduce: boolean
}

function TeamBalanceBar({ visibleGroups, total, statusColors, reduce }: TeamBalanceBarProps) {
  const [hovered, setHovered] = useState<EntryStatus | null>(null)
  if (total === 0) return null

  const active = hovered ?? visibleGroups[0]?.status ?? null
  const activeGroup = active ? visibleGroups.find((g) => g.status === active) : null
  const activePct = activeGroup ? Math.round((activeGroup.members.length / total) * 100) : 0

  return (
    <div className="mb-4">
      <div
        className="flex items-center gap-2 mb-2 text-[12px] h-[18px]"
        style={{ fontFamily: 'var(--font-body)', color: 'var(--lg-text-2)' }}
      >
        {activeGroup && (
          <motion.div
            key={activeGroup.status}
            initial={reduce ? undefined : { opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="flex items-center gap-2"
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: statusColors[activeGroup.status].icon }}
            />
            <span style={{ color: 'var(--lg-text-1)' }}>{activeGroup.label}</span>
            <span style={{ color: 'var(--lg-text-3)' }}>·</span>
            <span className="lg-mono" style={{ color: 'var(--lg-text-2)' }}>
              {activeGroup.members.length} av {total}
            </span>
            <span style={{ color: 'var(--lg-text-3)' }}>·</span>
            <span className="lg-mono" style={{ color: 'var(--lg-text-2)' }}>{activePct}%</span>
          </motion.div>
        )}
      </div>

      {/* Slim, quiet balance bar — hairline background, no shadows, no gloss */}
      <div
        role="group"
        aria-label="Team-fordeling i dag"
        className="relative flex items-stretch w-full h-[6px] rounded-full overflow-hidden"
        style={{ background: 'var(--lg-divider)' }}
        onMouseLeave={() => setHovered(null)}
      >
        {visibleGroups.map((g, i) => {
          const pct = (g.members.length / total) * 100
          const tone = statusColors[g.status].icon
          const isActive = (hovered ?? visibleGroups[0]?.status) === g.status
          return (
            <motion.button
              key={g.status}
              type="button"
              onMouseEnter={() => setHovered(g.status)}
              onFocus={() => setHovered(g.status)}
              initial={reduce ? undefined : { width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={
                reduce
                  ? { duration: 0 }
                  : { duration: 0.5, ease: [0.4, 0, 0.2, 1], delay: 0.05 + i * 0.03 }
              }
              className="relative h-full focus:outline-none transition-[filter] duration-200"
              style={{
                background: tone,
                filter: hovered && !isActive ? 'saturate(0.6) brightness(0.75)' : 'none',
                boxShadow: isActive ? `0 0 8px ${tone}88` : undefined,
              }}
              aria-label={`${g.label}: ${g.members.length} av ${total}`}
            />
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

interface PulseRowProps {
  status: EntryStatus
  label: string
  members: MemberWithEntry[]
  index: number
  tone: string
  reduce: boolean
}

function PulseRow({ status, label, members, index, tone, reduce }: PulseRowProps) {
  const count = useCountUp(members.length, reduce ? 0 : 600 + index * 80)
  const assumedCount = members.filter((m) => m.assumed).length

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.05 + index * 0.04, ease: [0.4, 0, 0.2, 1] }}
      className="relative rounded-xl overflow-hidden transition-[border-color,background] duration-200"
      style={{
        background: 'var(--lg-surface-1)',
        border: '1px solid var(--lg-divider)',
        boxShadow: `inset 2px 0 0 ${tone}, 0 1px 2px -1px ${tone}22`,
      }}
    >
      <div className="flex items-center gap-3 px-3 py-2.5 min-h-[56px]">
        {/* Icon pill */}
        <div
          className="flex items-center justify-center rounded-lg flex-shrink-0"
          style={{
            width: 28,
            height: 28,
            background: `color-mix(in oklab, ${tone} 16%, transparent)`,
            boxShadow: `0 0 0 1px color-mix(in oklab, ${tone} 32%, transparent)`,
          }}
        >
          <StatusIcon status={status} size={14} color={tone} />
        </div>

        {/* Label + assumed sub-line */}
        <div className="flex flex-col min-w-0 flex-1 leading-tight">
          <span
            className="font-medium truncate"
            style={{
              color: 'var(--lg-text-1)',
              fontFamily: 'var(--font-body)',
              fontSize: 13.5,
            }}
          >
            {label}
          </span>
          {assumedCount > 0 && (
            <span
              className="lg-mono"
              style={{
                color: 'var(--lg-text-3)',
                fontSize: 10,
                letterSpacing: '0.06em',
                marginTop: 1,
              }}
              title={`${assumedCount} antatt — ikke registrert`}
            >
              {assumedCount} antatt
            </span>
          )}
        </div>

        {/* Count */}
        <span
          className="lg-mono leading-none tabular-nums shrink-0"
          style={{
            color: 'var(--lg-text-1)',
            fontSize: 22,
            fontWeight: 500,
          }}
        >
          {count}
        </span>

        {/* Avatars */}
        <div className="shrink-0">
          <AvatarStack
            members={members}
            max={4}
            size="sm"
            ringColor="var(--lg-surface-1)"
          />
        </div>
      </div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 600): number {
  const [display, setDisplay] = useState(0)
  const prevRef = useRef(0)

  useEffect(() => {
    const from = prevRef.current
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = duration === 0 ? 1 : Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const v = Math.round(from + (target - from) * eased)
      setDisplay(v)
      if (t < 1) raf = requestAnimationFrame(tick)
      else prevRef.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return display
}
