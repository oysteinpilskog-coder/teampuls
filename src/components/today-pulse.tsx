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

// Bento-layout: size cards based on importance (member count).
// Total 12 column grid — columns adapt to how many groups are visible.
const COL_CLASSES: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 md:grid-cols-2',
  3: 'grid-cols-1 md:grid-cols-3',
  4: 'grid-cols-2 md:grid-cols-4',
  5: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5',
  6: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6',
  7: 'grid-cols-2 md:grid-cols-4 lg:grid-cols-7',
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
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <span className="lg-eyebrow">Akkurat nå</span>
      </div>

      <TeamBalanceBar
        visibleGroups={visibleGroups}
        total={totalToday}
        statusColors={STATUS_COLORS}
        reduce={reduce}
      />

      <div className={`grid ${colClasses} gap-2.5`}>
        {visibleGroups.map((group, i) => (
          <PulseCard
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

interface PulseCardProps {
  status: EntryStatus
  label: string
  members: MemberWithEntry[]
  index: number
  tone: string
  reduce: boolean
}

function PulseCard({ status, label, members, index, tone, reduce }: PulseCardProps) {
  const count = useCountUp(members.length, reduce ? 0 : 600 + index * 80)
  const assumedCount = members.filter((m) => m.assumed).length

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.05 + index * 0.04, ease: [0.4, 0, 0.2, 1] }}
      className="relative rounded-2xl overflow-hidden group transition-[border-color,background] duration-200"
      style={{
        background: 'var(--lg-surface-1)',
        border: '1px solid var(--lg-divider)',
        boxShadow: `inset 2px 0 0 ${tone}, 0 0 18px -10px ${tone}55`,
        minHeight: 124,
      }}
    >
      <div className="relative flex flex-col justify-between h-full p-3.5 md:p-4" style={{ minHeight: 124 }}>
        {/* Top row — icon + mono count */}
        <div className="flex items-start justify-between gap-3">
          <div
            className="flex items-center justify-center rounded-lg"
            style={{
              width: 26,
              height: 26,
              background: `color-mix(in oklab, ${tone} 18%, transparent)`,
              boxShadow: `0 0 0 1px color-mix(in oklab, ${tone} 35%, transparent)`,
            }}
          >
            <StatusIcon status={status} size={13} color={tone} />
          </div>

          <motion.span
            className="lg-mono leading-none"
            style={{
              color: 'var(--lg-text-1)',
              fontSize: 'clamp(30px, 3.6vw, 40px)',
              fontWeight: 500,
            }}
          >
            {count}
          </motion.span>
        </div>

        {/* Bottom — label + avatar stack */}
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <span
              className="font-medium truncate"
              style={{
                color: 'var(--lg-text-1)',
                fontFamily: 'var(--font-body)',
                fontSize: 13,
              }}
            >
              {label}
            </span>
            <span
              className="lg-mono shrink-0 flex items-center gap-1.5"
              style={{ color: 'var(--lg-text-3)', fontSize: 10.5 }}
            >
              <span>{members.length === 1 ? 'person' : 'personer'}</span>
              {assumedCount > 0 && (
                <span
                  title={`${assumedCount} antatt — ikke registrert`}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full"
                  style={{
                    background: `color-mix(in oklab, ${tone} 12%, transparent)`,
                    border: `1px dashed color-mix(in oklab, ${tone} 40%, transparent)`,
                    color: `color-mix(in oklab, ${tone} 60%, white)`,
                    fontSize: 9.5,
                    letterSpacing: '0.08em',
                  }}
                >
                  {assumedCount} antatt
                </span>
              )}
            </span>
          </div>

          <AvatarStack
            members={members}
            max={5}
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
