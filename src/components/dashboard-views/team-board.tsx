'use client'

import { motion } from 'framer-motion'
import { MemberAvatar } from '@/components/member-avatar'
import { StatusIcon } from '@/components/icons/status-icons'
import { useStatusColors } from '@/lib/status-colors/context'
import type { Member, Entry, EntryStatus } from '@/lib/supabase/types'
import { spring } from '@/lib/motion'
import { useT } from '@/lib/i18n/context'
import { AnimatedCount } from './animated-count'

interface TeamBoardProps {
  members: Member[]
  todayMap: Map<string, Entry>
}

interface StripDef {
  key: string
  label: string
  statuses: EntryStatus[]
  representative: EntryStatus
}

interface MemberChipProps {
  member: Member
  entry: Entry | undefined
  accent: string
  textTint: string
  bg: string
  delay: number
}

function MemberChip({ member, entry, accent, textTint, bg, delay }: MemberChipProps) {
  const location = entry?.location_label?.trim()
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...spring.gentle, delay }}
      className="relative flex items-center gap-2 pl-1 pr-3 py-1 rounded-full flex-shrink-0"
      style={{
        background: `linear-gradient(135deg, ${bg}e6 0%, ${bg}66 100%)`,
        border: `1px solid ${textTint}1f`,
        boxShadow: `inset 0 1px 0 ${textTint}14, 0 4px 12px -6px ${accent}66`,
      }}
    >
      <div
        className="rounded-full p-[1.5px] flex-shrink-0"
        style={{
          background: `linear-gradient(145deg, ${accent}, ${textTint}44)`,
          boxShadow: `0 2px 8px -2px ${accent}99`,
        }}
      >
        <div className="rounded-full p-[1px]" style={{ background: bg }}>
          <MemberAvatar name={member.display_name} avatarUrl={member.avatar_url} size="sm" />
        </div>
      </div>
      <div className="flex flex-col leading-tight min-w-0">
        <span
          className="text-[13px] font-semibold truncate"
          style={{ color: textTint, fontFamily: 'var(--font-body)', maxWidth: 120 }}
        >
          {member.display_name.split(' ')[0]}
        </span>
        {location && (
          <span
            className="text-[10px] font-medium truncate"
            style={{ color: `${textTint}88`, fontFamily: 'var(--font-body)', maxWidth: 120 }}
          >
            {location}
          </span>
        )}
      </div>
    </motion.div>
  )
}

function Strip({
  stripKey,
  label,
  representative,
  members,
  delay,
}: {
  stripKey: string
  label: string
  representative: EntryStatus
  members: Array<{ member: Member; entry: Entry | undefined }>
  delay: number
}) {
  const STATUS_COLORS = useStatusColors()
  const colors = STATUS_COLORS[representative]
  const accent = colors.icon
  const textTint = colors.textDark
  const bg = colors.bgDark
  const count = members.length
  const hasPeople = count > 0

  const emptyCopy =
    stripKey === 'away'       ? 'Ingen er borte 🎉' :
    stripKey === 'office'     ? 'Ingen på kontoret' :
    stripKey === 'remote'     ? 'Ingen jobber hjemmefra' :
    stripKey === 'customer'   ? 'Ingen hos kunde' :
    'Ingen akkurat nå'

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...spring.gentle, delay }}
      className="relative rounded-2xl px-4 py-2.5 flex items-center gap-4 overflow-hidden min-h-0 flex-1 basis-0"
      style={{
        background: hasPeople
          ? `
            radial-gradient(120% 100% at 0% 50%, ${accent}18 0%, transparent 55%),
            linear-gradient(90deg, ${bg}cc 0%, ${bg}55 50%, rgba(10,10,10,0.72) 100%)
          `
          : `linear-gradient(90deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.01) 100%)`,
        border: hasPeople
          ? `1px solid ${textTint}22`
          : '1px solid rgba(255,255,255,0.05)',
        boxShadow: hasPeople
          ? `inset 0 1px 0 ${textTint}18, 0 20px 48px -28px ${accent}55`
          : 'inset 0 1px 0 rgba(255,255,255,0.04)',
        opacity: hasPeople ? 1 : 0.55,
      }}
    >
      {hasPeople && (
        <motion.div
          aria-hidden
          className="absolute -inset-24 pointer-events-none"
          animate={{ opacity: [0.45, 0.75, 0.45] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            background: `radial-gradient(circle at 10% 50%, ${accent}1a 0%, transparent 55%)`,
            filter: 'blur(32px)',
          }}
        />
      )}

      {/* Left rail: icon + label + count */}
      <div
        className="relative flex items-center gap-2.5 flex-shrink-0"
        style={{ minWidth: 170 }}
      >
        <div
          className="flex items-center justify-center rounded-xl flex-shrink-0"
          style={{
            width: 32,
            height: 32,
            background: `linear-gradient(145deg, ${accent}33, ${accent}0d)`,
            border: `1px solid ${accent}33`,
            boxShadow: `inset 0 1px 0 ${textTint}22, 0 6px 18px -8px ${accent}88`,
          }}
        >
          <StatusIcon status={representative} size={16} color={textTint} />
        </div>
        <span
          className="text-[13px] font-semibold leading-tight"
          style={{ color: textTint, fontFamily: 'var(--font-body)' }}
        >
          {label}
        </span>
        <AnimatedCount
          value={count}
          delay={delay + 0.15}
          duration={0.9}
          className="tabular-nums ml-auto"
          style={{
            fontSize: '28px',
            fontWeight: 700,
            lineHeight: 0.9,
            fontFamily: 'var(--font-sora)',
            letterSpacing: '-0.04em',
            background: `linear-gradient(180deg, ${textTint} 0%, ${accent} 100%)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            filter: hasPeople ? `drop-shadow(0 0 16px ${accent}55)` : 'none',
          }}
        />
      </div>

      <div
        className="relative w-px self-stretch flex-shrink-0"
        style={{ background: `${textTint}1c` }}
      />

      {/* Right rail: member chips or empty copy. Chips flex-wrap in-place so
          everything stays inside the strip — no scroll, no overflow. */}
      <div className="relative flex-1 min-w-0 self-center">
        {!hasPeople ? (
          <p
            className="text-[14px]"
            style={{ color: `${textTint}88`, fontFamily: 'var(--font-body)' }}
          >
            {emptyCopy}
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {members.map(({ member, entry }, i) => (
              <MemberChip
                key={member.id}
                member={member}
                entry={entry}
                accent={accent}
                textTint={textTint}
                bg={bg}
                delay={delay + 0.15 + i * 0.03}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

export function TeamBoard({ members, todayMap }: TeamBoardProps) {
  const t = useT()
  const STRIPS: StripDef[] = [
    { key: 'office',   label: t.pulse.atOffice,   statuses: ['office'],                      representative: 'office'   },
    { key: 'remote',   label: t.pulse.atHome,     statuses: ['remote'],                      representative: 'remote'   },
    { key: 'customer', label: t.pulse.atCustomer, statuses: ['customer', 'travel'],          representative: 'customer' },
    { key: 'away',     label: t.pulse.away,       statuses: ['vacation', 'sick', 'off'],     representative: 'vacation' },
  ]

  const buckets = STRIPS.map(strip => ({
    ...strip,
    members: members
      .filter(m => {
        const e = todayMap.get(m.id)
        return e && strip.statuses.includes(e.status)
      })
      .map(m => ({ member: m, entry: todayMap.get(m.id) })),
  }))

  // Four equal-height strips sharing whatever vertical space the parent gives
  // the board. No scroll container anywhere — chips wrap in-place, and the
  // unregistered count surfaces in HeroPulse so this board stays focused on
  // the live "where is everyone" answer.
  return (
    <div className="relative flex-1 min-h-0 flex flex-col gap-3">
      {buckets.map((bucket, i) => (
        <Strip
          key={bucket.key}
          stripKey={bucket.key}
          label={bucket.label}
          representative={bucket.representative}
          members={bucket.members}
          delay={0.3 + i * 0.06}
        />
      ))}
    </div>
  )
}
