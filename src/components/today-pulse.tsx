'use client'

import { motion } from 'framer-motion'
import { StatusIcon } from '@/components/icons/status-icons'
import type { EntryStatus } from '@/lib/supabase/types'
import { AvatarStack } from '@/components/member-avatar'
import { no } from '@/lib/i18n/no'
import { useTheme } from 'next-themes'
import { useState, useEffect } from 'react'
import { spring } from '@/lib/motion'
import { useStatusColors } from '@/lib/status-colors/context'

interface MemberWithEntry {
  id: string
  display_name: string
  avatar_url: string | null
  status: EntryStatus
  location_label: string | null
}

interface TodayPulseProps {
  entries: MemberWithEntry[]
}

// One card per status — no more buckets. Order matches the ribbon:
// "where they are" first, then "away" reasons.
const GROUPS: Array<{ status: EntryStatus; label: string }> = [
  { status: 'office',   label: no.status.office },
  { status: 'remote',   label: no.status.remote },
  { status: 'customer', label: no.status.customer },
  { status: 'travel',   label: no.status.travel },
  { status: 'vacation', label: no.status.vacation },
  { status: 'sick',     label: no.status.sick },
  { status: 'off',      label: no.status.off },
]

// Tailwind needs full class names at build time — map count → responsive columns.
const COL_CLASSES: Record<number, string> = {
  1: 'grid-cols-1 md:grid-cols-1 lg:grid-cols-1',
  2: 'grid-cols-2 md:grid-cols-2 lg:grid-cols-2',
  3: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-3',
  4: 'grid-cols-2 md:grid-cols-4 lg:grid-cols-4',
  5: 'grid-cols-2 md:grid-cols-4 lg:grid-cols-5',
  6: 'grid-cols-2 md:grid-cols-4 lg:grid-cols-6',
  7: 'grid-cols-2 md:grid-cols-4 lg:grid-cols-7',
}

export function TodayPulse({ entries }: TodayPulseProps) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = mounted && resolvedTheme === 'dark'
  const STATUS_COLORS = useStatusColors()

  const visibleGroups = GROUPS
    .map((g) => ({ ...g, members: entries.filter((e) => e.status === g.status) }))
    .filter((g) => g.members.length > 0)

  if (visibleGroups.length === 0) return null

  const colClasses = COL_CLASSES[visibleGroups.length] ?? COL_CLASSES[7]

  return (
    <div>
      <div className="flex items-baseline gap-3 mb-5">
        <h2
          className="text-[22px] font-bold"
          style={{
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sora)',
            letterSpacing: '-0.03em',
          }}
        >
          Akkurat nå
        </h2>
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
        >
          Live
        </span>
        <motion.span
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: '#10B981',
            boxShadow: '0 0 8px rgba(16,185,129,0.6)',
          }}
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
      <div className={`grid ${colClasses} gap-4`}>
        {visibleGroups.map((group, i) => {
          const { status } = group
          const groupMembers = group.members
          const colors = STATUS_COLORS[status]
          const tone = colors.icon

          // Subtle 2-stop vertical gradient — flat modern surface, not a glossy orb.
          const gradient = isDark
            ? `linear-gradient(180deg, ${tone} 0%, color-mix(in oklab, ${tone} 85%, black) 100%)`
            : `linear-gradient(180deg, ${tone} 0%, color-mix(in oklab, ${tone} 88%, black) 100%)`

          return (
            <motion.div
              key={status}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring.gentle, delay: 0.05 + i * 0.06 }}
              whileHover={{ y: -3 }}
              className="relative rounded-3xl p-4 flex flex-col gap-4 overflow-hidden"
              style={{
                background: gradient,
                boxShadow: isDark
                  ? `0 10px 24px -10px rgba(0,0,0,0.5),
                     0 2px 4px rgba(0,0,0,0.3),
                     inset 0 1px 0 rgba(255,255,255,0.10)`
                  : `0 12px 28px -12px color-mix(in oklab, ${tone} 45%, rgba(15,23,42,0.12)),
                     0 2px 4px rgba(15,23,42,0.06),
                     inset 0 1px 0 rgba(255,255,255,0.25)`,
              }}
            >
              {/* Header — stacked vertically so 7 cards fit comfortably */}
              <div className="relative flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div
                    className="flex items-center justify-center rounded-xl flex-shrink-0"
                    style={{
                      width: 30,
                      height: 30,
                      background: 'rgba(255,255,255,0.16)',
                      boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.22)',
                    }}
                  >
                    <StatusIcon status={status} size={16} color="#ffffff" />
                  </div>
                  <span
                    className="text-[40px] font-bold tabular-nums leading-none"
                    style={{
                      fontFamily: 'var(--font-sora)',
                      color: '#ffffff',
                      letterSpacing: '-0.05em',
                    }}
                  >
                    {groupMembers.length}
                  </span>
                </div>
                <span
                  className="text-[12px] font-semibold truncate"
                  style={{
                    color: '#ffffff',
                    fontFamily: 'var(--font-body)',
                    letterSpacing: '-0.005em',
                  }}
                >
                  {group.label}
                </span>
              </div>

              {/* Avatar stack */}
              <div className="relative">
                <AvatarStack members={groupMembers} max={4} size="sm" ringColor="rgba(255,255,255,0.55)" />
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
