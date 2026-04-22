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
          {no.pulse.title}
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
            boxShadow: '0 0 10px rgba(16,185,129,0.75)',
          }}
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <div className={`grid ${colClasses} gap-5`}>
        {visibleGroups.map((group, i) => (
          <PulseCard
            key={group.status}
            status={group.status}
            label={group.label}
            members={group.members}
            index={i}
            isDark={isDark}
            tone={STATUS_COLORS[group.status].icon}
          />
        ))}
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
  isDark: boolean
  tone: string
}

function PulseCard({ status, label, members, index, isDark, tone }: PulseCardProps) {
  const [hover, setHover] = useState(false)

  // Richer, deeper three-stop gradient:
  // top = slightly lighter (highlight), middle = saturated, bottom = deeper.
  // `color-mix` in oklab keeps the hue perceptually even across the stops.
  const gradient = isDark
    ? `linear-gradient(170deg,
         color-mix(in oklab, ${tone} 94%, white) 0%,
         ${tone} 46%,
         color-mix(in oklab, ${tone} 70%, black) 100%)`
    : `linear-gradient(170deg,
         color-mix(in oklab, ${tone} 96%, white) 0%,
         ${tone} 48%,
         color-mix(in oklab, ${tone} 78%, black) 100%)`

  // Outer colored halo — this is the "gløde" the brief asked for. Two layers:
  // a tight rim of color + a broader soft bloom that grows on hover.
  const haloBase = isDark ? 0.55 : 0.45
  const haloHover = isDark ? 0.85 : 0.7
  const outerGlow = hover
    ? `0 0 0 1px color-mix(in oklab, ${tone} 55%, transparent),
       0 8px 20px -8px color-mix(in oklab, ${tone} ${Math.round(haloHover * 100)}%, transparent),
       0 24px 56px -16px color-mix(in oklab, ${tone} ${Math.round(haloHover * 100)}%, transparent),
       0 44px 90px -24px color-mix(in oklab, ${tone} ${Math.round(haloHover * 70)}%, transparent)`
    : `0 0 0 1px color-mix(in oklab, ${tone} 28%, transparent),
       0 8px 20px -10px color-mix(in oklab, ${tone} ${Math.round(haloBase * 100)}%, transparent),
       0 22px 44px -14px color-mix(in oklab, ${tone} ${Math.round(haloBase * 90)}%, transparent)`

  const innerEdges = isDark
    ? 'inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.28)'
    : 'inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -1px 0 rgba(0,0,0,0.18)'

  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...spring.gentle, delay: 0.05 + index * 0.06 }}
      onHoverStart={() => setHover(true)}
      onHoverEnd={() => setHover(false)}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.985 }}
      className="relative"
    >
      {/* Ambient bloom — a soft, breathing halo that sits BEHIND the card.
          This is what makes the card feel like it's radiating light. */}
      <motion.div
        aria-hidden
        className="absolute rounded-[28px] pointer-events-none"
        style={{
          inset: -14,
          background: `radial-gradient(60% 60% at 50% 55%, color-mix(in oklab, ${tone} 55%, transparent) 0%, transparent 70%)`,
          filter: 'blur(22px)',
          zIndex: -1,
        }}
        animate={{ opacity: hover ? 0.95 : [0.45, 0.7, 0.45] }}
        transition={
          hover
            ? { duration: 0.35, ease: 'easeOut' }
            : { duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: index * 0.4 }
        }
      />

      {/* The card itself */}
      <div
        className="relative rounded-[22px] overflow-hidden"
        style={{
          background: gradient,
          boxShadow: `${outerGlow}, ${innerEdges}`,
          transition: 'box-shadow 360ms cubic-bezier(0.22, 1, 0.36, 1)',
          minHeight: 170,
        }}
      >
        {/* Radial top-left highlight — the iOS liquid-glass "specular" point */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(120% 90% at 12% 0%, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.12) 28%, rgba(255,255,255,0) 58%)',
            mixBlendMode: 'soft-light',
          }}
        />

        {/* Glass top sheen + bottom dip — the layered gloss */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0.06) 22%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.14) 100%)',
          }}
        />

        {/* Hairline specular edge along the top */}
        <div
          aria-hidden
          className="absolute top-0 left-[10%] right-[10%] h-px pointer-events-none"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.75) 50%, transparent 100%)',
          }}
        />

        {/* Shimmer sweep — a slow diagonal glint, like polished metal in sunlight */}
        <motion.div
          aria-hidden
          className="absolute pointer-events-none"
          style={{
            top: '-30%',
            bottom: '-30%',
            width: '45%',
            background:
              'linear-gradient(100deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.28) 45%, rgba(255,255,255,0) 100%)',
            filter: 'blur(6px)',
            mixBlendMode: 'soft-light',
          }}
          initial={{ left: '-60%' }}
          animate={{ left: ['-60%', '160%'] }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 2 + index * 1.2,
            repeatDelay: 3.5,
          }}
        />

        {/* Grain texture — subtle noise for premium depth */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-[0.12] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
            backgroundSize: '140px 140px',
          }}
        />

        {/* Content */}
        <div className="relative flex flex-col gap-4 p-4">
          {/* Header row: icon chip + big count */}
          <div className="relative flex items-start justify-between gap-2">
            <motion.div
              className="flex items-center justify-center rounded-xl flex-shrink-0"
              animate={{
                boxShadow: hover
                  ? 'inset 0 0 0 1px rgba(255,255,255,0.42), 0 2px 6px rgba(0,0,0,0.18)'
                  : 'inset 0 0 0 1px rgba(255,255,255,0.28), 0 1px 3px rgba(0,0,0,0.12)',
              }}
              transition={{ duration: 0.3 }}
              style={{
                width: 32,
                height: 32,
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.12) 100%)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <StatusIcon status={status} size={17} color="#ffffff" />
            </motion.div>

            <div className="flex items-baseline gap-0.5">
              <motion.span
                className="font-bold tabular-nums leading-none"
                animate={{ scale: hover ? 1.04 : 1 }}
                transition={spring.gentle}
                style={{
                  fontFamily: 'var(--font-sora)',
                  color: '#ffffff',
                  fontSize: 46,
                  letterSpacing: '-0.055em',
                  textShadow:
                    '0 2px 8px rgba(0,0,0,0.22), 0 1px 1px rgba(0,0,0,0.18)',
                }}
              >
                {members.length}
              </motion.span>
            </div>
          </div>

          {/* Label — uppercase small caps, tight letter-spacing, carved shadow */}
          <span
            className="text-[12px] font-semibold truncate"
            style={{
              color: 'rgba(255,255,255,0.96)',
              fontFamily: 'var(--font-body)',
              letterSpacing: '-0.005em',
              textShadow: '0 1px 2px rgba(0,0,0,0.22)',
            }}
          >
            {label}
          </span>

          {/* Avatar stack — larger rings for a more jewel-like finish */}
          <div className="relative">
            <AvatarStack
              members={members}
              max={4}
              size="sm"
              ringColor="rgba(255,255,255,0.85)"
            />
          </div>
        </div>

        {/* Live heartbeat pip — small, in bottom-right, only visible on hover */}
        <motion.div
          aria-hidden
          className="absolute bottom-3 right-3 rounded-full pointer-events-none"
          style={{
            width: 6,
            height: 6,
            background: '#ffffff',
            boxShadow: '0 0 10px rgba(255,255,255,0.8)',
          }}
          animate={{ opacity: hover ? [0.5, 1, 0.5] : 0 }}
          transition={
            hover
              ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }
              : { duration: 0.25 }
          }
        />
      </div>
    </motion.div>
  )
}
