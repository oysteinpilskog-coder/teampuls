'use client'

import { motion } from 'framer-motion'
import { StatusIcon, STATUS_COLORS } from '@/components/icons/status-icons'
import type { EntryStatus } from '@/lib/supabase/types'
import { AvatarStack } from '@/components/member-avatar'
import { no } from '@/lib/i18n/no'
import { useTheme } from 'next-themes'
import { useState, useEffect } from 'react'
import { spring } from '@/lib/motion'

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
            background: '#16A362',
            boxShadow: '0 0 8px rgba(22,163,98,0.7)',
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

          // iPhone-glossy: vertical gradient, top bright → bottom deep, with lustrous overlay.
          const gradient = isDark
            ? `linear-gradient(180deg,
                 color-mix(in oklab, ${tone} 68%, black) 0%,
                 color-mix(in oklab, ${tone} 95%, black) 100%)`
            : `linear-gradient(180deg,
                 ${tone} 0%,
                 color-mix(in oklab, ${tone} 82%, black) 100%)`

          return (
            <motion.div
              key={group.key}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring.gentle, delay: 0.05 + i * 0.06 }}
              whileHover={{ y: -4, scale: 1.015 }}
              className="relative rounded-3xl p-5 flex flex-col gap-5 overflow-hidden"
              style={{
                background: gradient,
                boxShadow: isDark
                  ? `0 22px 44px -12px color-mix(in oklab, ${tone} 60%, transparent),
                     0 6px 14px -2px color-mix(in oklab, ${tone} 45%, transparent),
                     inset 0 1px 0 rgba(255,255,255,0.2),
                     inset 0 -1px 0 rgba(0,0,0,0.35),
                     inset 0 0 0 1px color-mix(in oklab, ${tone} 50%, transparent)`
                  : `0 22px 50px -14px color-mix(in oklab, ${tone} 70%, transparent),
                     0 6px 14px -2px color-mix(in oklab, ${tone} 40%, transparent),
                     inset 0 1px 0 rgba(255,255,255,0.55),
                     inset 0 -1px 0 rgba(0,0,0,0.22),
                     inset 0 0 0 0.5px rgba(255,255,255,0.2)`,
              }}
            >
              {/* Glossy top reflection — premium glass highlight */}
              <div
                aria-hidden
                className="absolute top-0 left-0 right-0 pointer-events-none"
                style={{
                  height: '55%',
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.1) 45%, transparent 100%)',
                  borderTopLeftRadius: 'inherit',
                  borderTopRightRadius: 'inherit',
                }}
              />

              {/* Specular edge highlight */}
              <div
                aria-hidden
                className="absolute top-0 left-[10%] right-[10%] pointer-events-none"
                style={{
                  height: '1px',
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
                }}
              />

              {/* Deep tone pool bottom-right — ambient depth */}
              <div
                aria-hidden
                className="absolute pointer-events-none"
                style={{
                  bottom: '-40%',
                  right: '-20%',
                  width: '70%',
                  height: '100%',
                  background: `radial-gradient(circle, color-mix(in oklab, ${tone} 95%, black), transparent 65%)`,
                  filter: 'blur(22px)',
                  opacity: 0.45,
                }}
              />

              {/* Header */}
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex items-center justify-center rounded-xl"
                    style={{
                      width: 34,
                      height: 34,
                      background: 'rgba(255,255,255,0.22)',
                      backdropFilter: 'blur(6px)',
                      WebkitBackdropFilter: 'blur(6px)',
                      boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.38), 0 2px 6px rgba(0,0,0,0.12)',
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
                      textShadow: '0 1px 2px rgba(0,0,0,0.2)',
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
                    textShadow: '0 2px 6px rgba(0,0,0,0.25)',
                  }}
                >
                  {groupMembers.length}
                </span>
              </div>

              {/* Avatar stack */}
              <div className="relative">
                {groupMembers.length > 0 ? (
                  <AvatarStack members={groupMembers} max={6} size="md" ringColor="rgba(255,255,255,0.65)" />
                ) : (
                  <p
                    className="text-[12px] font-medium"
                    style={{
                      color: 'rgba(255,255,255,0.75)',
                      fontFamily: 'var(--font-body)',
                      textShadow: '0 1px 2px rgba(0,0,0,0.15)',
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
