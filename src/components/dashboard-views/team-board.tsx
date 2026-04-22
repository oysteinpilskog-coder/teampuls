'use client'

import { motion } from 'framer-motion'
import { useRef, useState, useEffect, useCallback } from 'react'
import { MemberAvatar } from '@/components/member-avatar'
import { StatusIcon, STATUS_COLORS } from '@/components/icons/status-icons'
import type { Member, Entry, EntryStatus } from '@/lib/supabase/types'
import { spring } from '@/lib/motion'
import { no } from '@/lib/i18n/no'
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

const STRIPS: StripDef[] = [
  { key: 'office',   label: no.pulse.atOffice,   statuses: ['office'],                      representative: 'office' },
  { key: 'remote',   label: no.pulse.atHome,     statuses: ['remote'],                      representative: 'remote' },
  { key: 'customer', label: no.pulse.atCustomer, statuses: ['customer', 'travel'],          representative: 'customer' },
  { key: 'away',     label: no.pulse.away,       statuses: ['vacation', 'sick', 'off'],     representative: 'vacation' },
]

const STATUS_LABEL: Record<EntryStatus, string> = {
  office: 'Kontor',
  remote: 'Hjemme',
  customer: 'Hos kunde',
  travel: 'Reise',
  vacation: 'Ferie',
  sick: 'Syk',
  off: 'Fri',
}

interface MemberCardProps {
  member: Member
  entry: Entry | undefined
  accent: string
  textTint: string
  bg: string
  delay: number
}

function MemberCard({ member, entry, accent, textTint, bg, delay }: MemberCardProps) {
  const statusLabel = entry ? STATUS_LABEL[entry.status] : 'Ikke registrert'
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...spring.gentle, delay }}
      whileHover={{ y: -3, transition: spring.snappy }}
      className="relative flex items-center gap-3 px-3 py-2.5 rounded-2xl overflow-hidden flex-shrink-0"
      style={{
        background: `linear-gradient(135deg, ${bg}ee 0%, ${bg}88 100%)`,
        border: `1px solid ${textTint}22`,
        boxShadow: `inset 0 1px 0 ${textTint}18, 0 8px 24px -12px ${accent}66`,
        minWidth: 180,
        maxWidth: 220,
      }}
    >
      <div
        className="rounded-full p-[2px] flex-shrink-0"
        style={{
          background: `linear-gradient(145deg, ${accent}, ${textTint}55)`,
          boxShadow: `0 4px 14px -4px ${accent}aa`,
        }}
      >
        <div className="rounded-full p-[2px]" style={{ background: bg }}>
          <MemberAvatar name={member.display_name} avatarUrl={member.avatar_url} size="lg" />
        </div>
      </div>

      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span
          className="text-[15px] font-semibold leading-tight truncate"
          style={{ color: textTint, fontFamily: 'var(--font-body)' }}
        >
          {member.display_name.split(' ')[0]}
        </span>
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: accent, boxShadow: `0 0 6px ${accent}aa` }}
          />
          <span
            className="text-[11px] font-medium truncate"
            style={{ color: `${textTint}99`, fontFamily: 'var(--font-body)' }}
          >
            {statusLabel}
          </span>
        </div>
        {entry?.location_label && (
          <div className="flex items-center gap-1 min-w-0 mt-0.5">
            <svg width={9} height={9} viewBox="0 0 24 24" fill="none" className="flex-shrink-0 opacity-75">
              <path
                d="M12 21s-7-6.5-7-12a7 7 0 1 1 14 0c0 5.5-7 12-7 12Z"
                stroke={textTint}
                strokeWidth={2.4}
                strokeLinejoin="round"
              />
              <circle cx={12} cy={9} r={2.4} stroke={textTint} strokeWidth={2.4} />
            </svg>
            <span
              className="text-[11px] truncate"
              style={{ color: `${textTint}80`, fontFamily: 'var(--font-body)' }}
            >
              {entry.location_label}
            </span>
          </div>
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
    stripKey === 'unregistered' ? 'Alle er registrert' :
    'Ingen akkurat nå'

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...spring.gentle, delay }}
      className="relative rounded-3xl p-4 flex items-center gap-5 overflow-hidden"
      style={{
        background: hasPeople
          ? `
            radial-gradient(120% 100% at 0% 50%, ${accent}18 0%, transparent 55%),
            linear-gradient(90deg, ${bg}cc 0%, ${bg}55 50%, rgba(10,10,10,0.75) 100%)
          `
          : `linear-gradient(90deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.01) 100%)`,
        border: hasPeople
          ? `1px solid ${textTint}22`
          : '1px solid rgba(255,255,255,0.05)',
        boxShadow: hasPeople
          ? `inset 0 1px 0 ${textTint}18, 0 20px 48px -28px ${accent}55`
          : 'inset 0 1px 0 rgba(255,255,255,0.04)',
        opacity: hasPeople ? 1 : 0.55,
        minHeight: 84,
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

      <div
        className="relative flex items-center gap-3 flex-shrink-0"
        style={{ minWidth: 200 }}
      >
        <div
          className="flex items-center justify-center rounded-2xl flex-shrink-0"
          style={{
            width: 44,
            height: 44,
            background: `linear-gradient(145deg, ${accent}33, ${accent}0d)`,
            border: `1px solid ${accent}33`,
            boxShadow: `inset 0 1px 0 ${textTint}22, 0 6px 18px -8px ${accent}88`,
          }}
        >
          <StatusIcon status={representative} size={22} color={textTint} />
        </div>
        <div className="flex flex-col gap-0.5">
          <span
            className="text-[10px] font-semibold tracking-[0.22em] uppercase"
            style={{ color: `${textTint}99`, fontFamily: 'var(--font-body)' }}
          >
            Nå
          </span>
          <span
            className="text-[17px] font-semibold leading-tight"
            style={{ color: textTint, fontFamily: 'var(--font-body)' }}
          >
            {label}
          </span>
        </div>
        <AnimatedCount
          value={count}
          delay={delay + 0.15}
          duration={0.9}
          className="tabular-nums ml-auto"
          style={{
            fontSize: '44px',
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
        className="relative w-px self-stretch my-1 flex-shrink-0"
        style={{ background: `${textTint}1c` }}
      />

      <div className="relative flex-1 min-w-0">
        {!hasPeople ? (
          <p
            className="text-[14px]"
            style={{ color: `${textTint}88`, fontFamily: 'var(--font-body)' }}
          >
            {emptyCopy}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2.5">
            {members.map(({ member, entry }, i) => (
              <MemberCard
                key={member.id}
                member={member}
                entry={entry}
                accent={accent}
                textTint={textTint}
                bg={bg}
                delay={delay + 0.15 + i * 0.04}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

export function TeamBoard({ members, todayMap }: TeamBoardProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScroll, setCanScroll] = useState<{ top: boolean; bottom: boolean }>({
    top: false,
    bottom: false,
  })

  // Only update state when the hint values actually change — otherwise we'd
  // schedule a re-render for every scroll event and every resize tick.
  const updateScrollHints = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const atTop = el.scrollTop <= 2
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2
    const nextTop = !atTop
    const nextBottom = !atBottom && el.scrollHeight > el.clientHeight
    setCanScroll(prev =>
      prev.top === nextTop && prev.bottom === nextBottom
        ? prev
        : { top: nextTop, bottom: nextBottom },
    )
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateScrollHints()
    const onScroll = () => updateScrollHints()
    el.addEventListener('scroll', onScroll, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateScrollHints)
      : null
    ro?.observe(el)
    return () => {
      el.removeEventListener('scroll', onScroll)
      ro?.disconnect()
    }
  }, [updateScrollHints, members.length, todayMap.size])

  const buckets = STRIPS.map(strip => ({
    ...strip,
    members: members
      .filter(m => {
        const e = todayMap.get(m.id)
        return e && strip.statuses.includes(e.status)
      })
      .map(m => ({ member: m, entry: todayMap.get(m.id) })),
  }))

  const unregistered = members
    .filter(m => !todayMap.has(m.id))
    .map(m => ({ member: m, entry: undefined }))

  return (
    <div className="relative flex-1 min-h-0">
      {/* Top fade overlay when scrolled down */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-10 z-10 rounded-t-xl"
        animate={{ opacity: canScroll.top ? 1 : 0 }}
        transition={{ duration: 0.25 }}
        style={{
          background:
            'linear-gradient(180deg, rgba(5,5,7,0.92) 0%, rgba(5,5,7,0.5) 50%, rgba(5,5,7,0) 100%)',
        }}
      />
      {/* Bottom fade overlay when more content below */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-10 z-10 rounded-b-xl"
        animate={{ opacity: canScroll.bottom ? 1 : 0 }}
        transition={{ duration: 0.25 }}
        style={{
          background:
            'linear-gradient(0deg, rgba(5,5,7,0.92) 0%, rgba(5,5,7,0.5) 50%, rgba(5,5,7,0) 100%)',
        }}
      />

      <div
        ref={scrollRef}
        className="team-scroll absolute inset-0 flex flex-col gap-3 overflow-y-auto overscroll-contain pr-2"
        style={{ scrollBehavior: 'smooth' }}
      >
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

        {unregistered.length > 0 && (
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...spring.gentle, delay: 0.3 + buckets.length * 0.06 }}
            className="relative rounded-3xl p-4 flex items-center gap-5 overflow-hidden"
            style={{
              background:
                'repeating-linear-gradient(45deg, rgba(255,255,255,0.025) 0px, rgba(255,255,255,0.025) 4px, rgba(255,255,255,0.01) 4px, rgba(255,255,255,0.01) 8px)',
              border: '1px dashed rgba(255,255,255,0.12)',
              minHeight: 72,
            }}
          >
            <div className="flex items-center gap-3 flex-shrink-0" style={{ minWidth: 200 }}>
              <div
                className="flex items-center justify-center rounded-2xl flex-shrink-0"
                style={{
                  width: 44,
                  height: 44,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                  <circle cx={12} cy={12} r={9} stroke="rgba(255,255,255,0.45)" strokeWidth={2} strokeDasharray="3 3" />
                  <path d="M12 8v4M12 16h0" stroke="rgba(255,255,255,0.6)" strokeWidth={2} strokeLinecap="round" />
                </svg>
              </div>
              <div className="flex flex-col gap-0.5">
                <span
                  className="text-[10px] font-semibold tracking-[0.22em] uppercase"
                  style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-body)' }}
                >
                  Mangler
                </span>
                <span
                  className="text-[17px] font-semibold leading-tight"
                  style={{ color: 'rgba(255,255,255,0.75)', fontFamily: 'var(--font-body)' }}
                >
                  Ikke registrert
                </span>
              </div>
              <AnimatedCount
                value={unregistered.length}
                delay={0.4}
                duration={0.9}
                className="tabular-nums ml-auto"
                style={{
                  fontSize: '44px',
                  fontWeight: 700,
                  lineHeight: 0.9,
                  fontFamily: 'var(--font-sora)',
                  letterSpacing: '-0.04em',
                  color: 'rgba(255,255,255,0.65)',
                }}
              />
            </div>
            <div className="w-px self-stretch my-1" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap gap-2.5">
                {unregistered.map(({ member }, i) => (
                  <motion.div
                    key={member.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...spring.gentle, delay: 0.45 + i * 0.03 }}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-full"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <MemberAvatar name={member.display_name} avatarUrl={member.avatar_url} size="sm" />
                    <span
                      className="text-[13px] font-medium"
                      style={{ color: 'rgba(255,255,255,0.65)', fontFamily: 'var(--font-body)' }}
                    >
                      {member.display_name.split(' ')[0]}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Custom thin scrollbar (WebKit + Firefox) */}
      <style>{`
        .team-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.14) transparent;
        }
        .team-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .team-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .team-scroll::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.14);
          border-radius: 999px;
        }
        .team-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.28);
        }
      `}</style>
    </div>
  )
}
