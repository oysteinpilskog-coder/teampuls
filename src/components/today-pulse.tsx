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

const GROUPS: Array<{
  key: string
  label: string
  statuses: EntryStatus[]
}> = [
  { key: 'office',   label: no.pulse.atOffice,   statuses: ['office'] },
  { key: 'remote',   label: no.pulse.atHome,      statuses: ['remote'] },
  { key: 'customer', label: no.pulse.atCustomer,  statuses: ['customer', 'travel'] },
  { key: 'away',     label: no.pulse.away,        statuses: ['vacation', 'sick', 'off'] },
]

// Representative status for each group (for icon + color)
const GROUP_STATUS: Record<string, EntryStatus> = {
  office: 'office',
  remote: 'remote',
  customer: 'customer',
  away: 'vacation',
}

export function TodayPulse({ entries }: TodayPulseProps) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = mounted && resolvedTheme === 'dark'
  const STATUS_COLORS = useStatusColors()

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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {GROUPS.map((group, i) => {
          const groupMembers = entries.filter((e) => group.statuses.includes(e.status))
          const status = GROUP_STATUS[group.key]
          const colors = STATUS_COLORS[status]
          const tone = colors.icon

          // Subtle 2-stop vertical gradient — flat modern surface, not a glossy orb.
          const gradient = isDark
            ? `linear-gradient(180deg, ${tone} 0%, color-mix(in oklab, ${tone} 85%, black) 100%)`
            : `linear-gradient(180deg, ${tone} 0%, color-mix(in oklab, ${tone} 88%, black) 100%)`

          return (
            <motion.div
              key={group.key}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring.gentle, delay: 0.05 + i * 0.06 }}
              whileHover={{ y: -3 }}
              className="relative rounded-3xl p-5 flex flex-col gap-5 overflow-hidden"
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
              {/* Header */}
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex items-center justify-center rounded-xl"
                    style={{
                      width: 34,
                      height: 34,
                      background: 'rgba(255,255,255,0.16)',
                      boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.22)',
                    }}
                  >
                    <StatusIcon status={status} size={18} color="#ffffff" />
                  </div>
                  <span
                    className="text-[13px] font-semibold"
                    style={{
                      color: '#ffffff',
                      fontFamily: 'var(--font-body)',
                      letterSpacing: '-0.005em',
                    }}
                  >
                    {group.label}
                  </span>
                </div>
                <span
                  className="text-[52px] font-bold tabular-nums leading-none"
                  style={{
                    fontFamily: 'var(--font-sora)',
                    color: '#ffffff',
                    letterSpacing: '-0.05em',
                  }}
                >
                  {groupMembers.length}
                </span>
              </div>

              {/* Avatar stack */}
              <div className="relative">
                {groupMembers.length > 0 ? (
                  <AvatarStack members={groupMembers} max={6} size="md" ringColor="rgba(255,255,255,0.55)" />
                ) : (
                  <p
                    className="text-[12px] font-medium"
                    style={{
                      color: 'rgba(255,255,255,0.72)',
                      fontFamily: 'var(--font-body)',
                    }}
                  >
                    Ingen
                  </p>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
