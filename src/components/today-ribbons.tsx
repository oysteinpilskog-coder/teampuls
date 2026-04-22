'use client'

import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { useTheme } from 'next-themes'
import { useEntries } from '@/hooks/use-entries'
import { useStatusColors } from '@/lib/status-colors/context'
import { StatusIcon } from '@/components/icons/status-icons'
import { MemberAvatar } from '@/components/member-avatar'
import { toDateString, formatDateLabelLong } from '@/lib/dates'
import { spring } from '@/lib/motion'
import { no } from '@/lib/i18n/no'
import { EmptyState } from '@/components/empty-state'
import type { EntryStatus } from '@/lib/supabase/types'

type Member = { id: string; display_name: string; avatar_url: string | null }

interface TodayRibbonsProps {
  orgId: string
  timezone: string
  allMembers: Member[]
}

type BandId = 'together' | 'spread' | 'rest'

interface Band {
  id: BandId
  label: string
  sublabel: string
  statuses: EntryStatus[]
  // Three-stop gradient — light center, saturated edges, like the reference image
  gradient: { light: [string, string, string]; dark: [string, string, string] }
  glow: string
}

// Colors chosen to evoke the inspiration: glossy red, saffron gold, cobalt blue.
const BANDS: Band[] = [
  {
    id: 'together',
    label: no.today.bandTogether,
    sublabel: no.today.bandTogetherSub,
    statuses: ['office'],
    gradient: {
      light: ['#C1241A', '#FF6A35', '#B21B10'],
      dark:  ['#A01A12', '#FF5A24', '#860E06'],
    },
    glow: '#FF4F2A',
  },
  {
    id: 'spread',
    label: no.today.bandSpread,
    sublabel: no.today.bandSpreadSub,
    statuses: ['remote', 'customer', 'travel'],
    gradient: {
      light: ['#D68910', '#FFC83D', '#B87308'],
      dark:  ['#B87308', '#FFB820', '#8A5406'],
    },
    glow: '#F5B40C',
  },
  {
    id: 'rest',
    label: no.today.bandRest,
    sublabel: no.today.bandRestSub,
    statuses: ['vacation', 'sick', 'off'],
    gradient: {
      light: ['#0A4AA8', '#36A3FF', '#0640A0'],
      dark:  ['#082F7A', '#2589F0', '#041F58'],
    },
    glow: '#2E97FF',
  },
]

function ribbonGradient(band: Band, isDark: boolean): string {
  const [a, b, c] = isDark ? band.gradient.dark : band.gradient.light
  // Horizontal gloss with a bright center — like a polished metal strip
  return `linear-gradient(90deg, ${a} 0%, ${b} 45%, ${b} 55%, ${c} 100%)`
}

function ribbonSheen(): string {
  return 'linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.14) 35%, rgba(255,255,255,0) 55%, rgba(0,0,0,0.12) 100%)'
}

function useClock(timezone: string, mounted: boolean) {
  // Start with null so the server render and initial client hydration match —
  // we fill in real values only after mount, avoiding hydration mismatches.
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    if (!mounted) return
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000 * 20)
    return () => clearInterval(t)
  }, [mounted])
  const timeStr = useMemo(() => {
    if (!now) return ''
    try {
      return new Intl.DateTimeFormat('nb-NO', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: timezone,
      }).format(now)
    } catch {
      return new Intl.DateTimeFormat('nb-NO', { hour: '2-digit', minute: '2-digit' }).format(now)
    }
  }, [now, timezone])
  return { now, timeStr }
}

export function TodayRibbons({ orgId, timezone, allMembers }: TodayRibbonsProps) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = mounted && resolvedTheme === 'dark'
  const reduce = !!useReducedMotion()
  const statusColors = useStatusColors()
  const { now, timeStr } = useClock(timezone, mounted)

  // Recompute "today" once per mount and at midnight transitions (cheap).
  const today = useMemo(() => toDateString(now ?? new Date()), [now])
  const { entries, loading } = useEntries(orgId, [today])

  const memberById = useMemo(() => {
    const m = new Map<string, Member>()
    allMembers.forEach((x) => m.set(x.id, x))
    return m
  }, [allMembers])

  // Group members by band
  const grouped = useMemo(() => {
    const map: Record<BandId, { member: Member; status: EntryStatus }[]> = {
      together: [],
      spread: [],
      rest: [],
    }
    const byStatus: Partial<Record<EntryStatus, number>> = {}
    for (const e of entries) {
      const m = memberById.get(e.member_id)
      if (!m) continue
      byStatus[e.status] = (byStatus[e.status] ?? 0) + 1
      const band = BANDS.find((b) => b.statuses.includes(e.status))
      if (band) map[band.id].push({ member: m, status: e.status })
    }
    return { map, byStatus }
  }, [entries, memberById])

  const totalRegistered = entries.length
  // Only show the empty-state card once we've actually fetched and found nothing;
  // otherwise the three ribbons (dim, count=0) act as the skeleton.
  const emptyState = mounted && !loading && totalRegistered === 0

  const [expanded, setExpanded] = useState<BandId | null>(null)

  // Status chips in canonical order
  const STATUS_ORDER: EntryStatus[] = ['office', 'remote', 'customer', 'travel', 'vacation', 'sick', 'off']
  const STATUS_LABELS: Record<EntryStatus, string> = no.status

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:py-14">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 mb-8 md:mb-12">
        <div>
          <div
            className="text-[11px] font-semibold uppercase tracking-[0.22em] mb-2 min-h-[14px]"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
            suppressHydrationWarning
          >
            {now ? formatDateLabelLong(now) : ' '}
          </div>
          <h1
            className="font-bold leading-[0.9]"
            style={{
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sora)',
              letterSpacing: '-0.055em',
              fontSize: 'clamp(44px, 7vw, 84px)',
            }}
          >
            Hvor er teamet?
          </h1>
        </div>
        <div className="hidden md:flex items-center gap-2 pb-2 shrink-0">
          <span
            className="text-[12px] font-semibold uppercase tracking-[0.2em]"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
          >
            {no.today.live}
          </span>
          <motion.span
            className="w-2 h-2 rounded-full"
            style={{
              background: '#10B981',
              boxShadow: '0 0 10px rgba(16,185,129,0.7)',
            }}
            animate={{ opacity: [0.35, 1, 0.35] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </div>

      {/* Ribbons */}
      <div className="relative">
        {/* Speech bubble — floats over the top ribbon, tail pointing down-left */}
        <SpeechBubble timeStr={timeStr} />

        {emptyState ? (
          <RibbonEmpty />
        ) : (
          <div className="flex flex-col gap-6">
            {BANDS.map((band, i) => {
              const items = grouped.map[band.id]
              const isExpanded = expanded === band.id
              return (
                <Ribbon
                  key={band.id}
                  band={band}
                  index={i}
                  items={items}
                  total={totalRegistered}
                  isDark={isDark}
                  isExpanded={isExpanded}
                  reduce={reduce}
                  onToggle={() => setExpanded(isExpanded ? null : band.id)}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Breakdown chips — the fine-grained 7-status view */}
      {!emptyState && (
        <div className="mt-10 md:mt-14">
          <div
            className="text-[11px] font-semibold uppercase tracking-[0.22em] mb-4"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
          >
            {no.today.breakdown}
          </div>
          <div className="flex flex-wrap gap-2.5">
            {STATUS_ORDER.map((status) => {
              const count = grouped.byStatus[status] ?? 0
              if (count === 0) return null
              const pal = statusColors[status]
              return (
                <motion.div
                  key={status}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring.gentle, delay: 0.4 }}
                  className="flex items-center gap-2 rounded-full pl-2 pr-3.5 py-1.5"
                  style={{
                    background: isDark ? pal.bgDark : pal.bg,
                    color: isDark ? pal.textDark : pal.text,
                    boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${pal.icon} 24%, transparent)`,
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  <span
                    className="flex items-center justify-center rounded-full"
                    style={{
                      width: 22,
                      height: 22,
                      background: pal.icon,
                    }}
                  >
                    <StatusIcon status={status} size={12} color="#ffffff" />
                  </span>
                  <span className="text-[13px] font-semibold">{STATUS_LABELS[status]}</span>
                  <span
                    className="text-[13px] font-bold tabular-nums"
                    style={{ color: pal.icon }}
                  >
                    {count}
                  </span>
                </motion.div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────

function SpeechBubble({ timeStr }: { timeStr: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -18, scale: 0.7, rotate: -6 }}
      animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
      transition={{ ...spring.bouncy, delay: 0.35 }}
      className="absolute z-20 right-4 md:right-10 pointer-events-none select-none"
      style={{ top: -42 }}
    >
      <div
        className="relative rounded-full px-5 py-2.5"
        style={{
          background: 'linear-gradient(180deg, #FF6D3D 0%, #E53A1F 100%)',
          boxShadow:
            '0 12px 30px -10px rgba(229,58,31,0.55), 0 2px 4px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.35)',
        }}
      >
        <div className="flex items-baseline gap-2.5">
          <span
            className="text-white font-bold"
            style={{
              fontFamily: 'var(--font-sora)',
              fontSize: 18,
              letterSpacing: '-0.02em',
              textShadow: '0 1px 1px rgba(0,0,0,0.18)',
            }}
          >
            {no.today.bubble}
          </span>
          <span
            className="text-white/85 font-semibold tabular-nums"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              letterSpacing: '-0.01em',
            }}
          >
            {timeStr}
          </span>
        </div>
        {/* Tail */}
        <svg
          aria-hidden
          width="28"
          height="34"
          viewBox="0 0 28 34"
          className="absolute"
          style={{ left: 18, bottom: -22 }}
        >
          <path
            d="M 4 0 C 4 14, 18 24, 24 32 C 10 28, 2 18, 0 4 Z"
            fill="url(#bubbleTail)"
          />
          <defs>
            <linearGradient id="bubbleTail" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#E53A1F" />
              <stop offset="1" stopColor="#B82410" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </motion.div>
  )
}

// ────────────────────────────────────────────────────────────────────────────

function Ribbon({
  band,
  index,
  items,
  total,
  isDark,
  isExpanded,
  reduce,
  onToggle,
}: {
  band: Band
  index: number
  items: { member: Member; status: EntryStatus }[]
  total: number
  isDark: boolean
  isExpanded: boolean
  reduce: boolean
  onToggle: () => void
}) {
  const count = items.length
  const hasMembers = count > 0
  const gradient = ribbonGradient(band, isDark)
  const pct = total > 0 ? count / total : 0

  return (
    <motion.div
      initial={{ opacity: 0, x: -30, scaleX: 0.92 }}
      animate={{ opacity: 1, x: 0, scaleX: 1 }}
      transition={{ ...spring.gentle, delay: 0.05 + index * 0.1 }}
      style={{ originX: 0 }}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={!hasMembers}
        aria-expanded={isExpanded}
        aria-label={`${band.label} — ${count} ${count === 1 ? no.today.person : no.today.people}`}
        className="group relative block w-full text-left overflow-hidden rounded-[28px]"
        style={{
          background: hasMembers ? gradient : isDark ? '#1A1918' : '#EFECEA',
          boxShadow: hasMembers
            ? `0 30px 60px -24px ${band.glow}66,
               0 10px 24px -12px rgba(0,0,0,0.25),
               inset 0 1px 0 rgba(255,255,255,0.32),
               inset 0 -1px 0 rgba(0,0,0,0.2)`
            : isDark
              ? 'inset 0 0 0 1px rgba(255,255,255,0.05)'
              : 'inset 0 0 0 1px rgba(0,0,0,0.06)',
          transition: 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 320ms',
          cursor: hasMembers ? 'pointer' : 'default',
          minHeight: 164,
        }}
      >
        {/* Top sheen for the polished "glass strip" look */}
        {hasMembers && (
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{ background: ribbonSheen() }}
          />
        )}

        {/* Bright center highlight — sweeps across on hover.
            Held still when reduced-motion is requested. */}
        {hasMembers && (
          <motion.div
            aria-hidden
            className="absolute inset-y-0 pointer-events-none"
            style={{
              width: '38%',
              left: '10%',
              background:
                'radial-gradient(60% 100% at 50% 50%, rgba(255,255,255,0.45), rgba(255,255,255,0) 70%)',
              mixBlendMode: 'soft-light',
            }}
            animate={reduce ? { x: '0%' } : { x: ['-6%', '6%', '-6%'] }}
            transition={
              reduce
                ? { duration: 0 }
                : { duration: 7 + index * 1.3, repeat: Infinity, ease: 'easeInOut' }
            }
          />
        )}

        {/* Content */}
        <div className="relative flex items-stretch gap-5 md:gap-8 p-5 md:p-7" style={{ minHeight: 164 }}>
          {/* Left — label and sublabel */}
          <div className="flex-1 flex flex-col justify-between min-w-0">
            <div className="flex flex-col gap-1.5">
              <div
                className="font-bold leading-none"
                style={{
                  color: hasMembers ? '#FFFFFF' : 'var(--text-tertiary)',
                  fontFamily: 'var(--font-sora)',
                  fontSize: 'clamp(22px, 3.2vw, 34px)',
                  letterSpacing: '0.02em',
                  textShadow: hasMembers ? '0 2px 6px rgba(0,0,0,0.22)' : 'none',
                }}
              >
                {band.label}
              </div>
              <div
                className="font-medium"
                style={{
                  color: hasMembers ? 'rgba(255,255,255,0.88)' : 'var(--text-tertiary)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 14,
                  letterSpacing: '-0.005em',
                  textShadow: hasMembers ? '0 1px 2px rgba(0,0,0,0.18)' : 'none',
                }}
              >
                {band.sublabel}
              </div>
            </div>

            {/* Avatars along the strip */}
            {hasMembers && (
              <div className="flex items-center gap-0 mt-4 flex-wrap">
                {items.slice(0, 10).map((it, i) => (
                  <motion.div
                    key={it.member.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...spring.gentle, delay: 0.3 + index * 0.08 + i * 0.04 }}
                    style={{
                      marginLeft: i === 0 ? 0 : -10,
                      boxShadow: '0 0 0 2px rgba(255,255,255,0.7)',
                      borderRadius: 9999,
                      position: 'relative',
                      zIndex: items.length - i,
                    }}
                    title={it.member.display_name}
                  >
                    <MemberAvatar
                      name={it.member.display_name}
                      avatarUrl={it.member.avatar_url}
                      size="sm"
                    />
                  </motion.div>
                ))}
                {items.length > 10 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 + index * 0.08 }}
                    className="flex items-center justify-center font-semibold rounded-full"
                    style={{
                      width: 28,
                      height: 28,
                      marginLeft: -10,
                      background: 'rgba(255,255,255,0.28)',
                      color: '#ffffff',
                      fontSize: 10,
                      letterSpacing: '-0.02em',
                      boxShadow: '0 0 0 2px rgba(255,255,255,0.7)',
                      backdropFilter: 'blur(4px)',
                    }}
                  >
                    +{items.length - 10}
                  </motion.div>
                )}
              </div>
            )}
          </div>

          {/* Right — big count */}
          <div className="flex flex-col items-end justify-between shrink-0">
            <div className="flex items-baseline gap-2">
              <motion.span
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring.bouncy, delay: 0.25 + index * 0.08 }}
                className="font-bold tabular-nums leading-none"
                style={{
                  color: hasMembers ? '#FFFFFF' : 'var(--text-tertiary)',
                  fontFamily: 'var(--font-sora)',
                  fontSize: 'clamp(56px, 9vw, 104px)',
                  letterSpacing: '-0.06em',
                  textShadow: hasMembers
                    ? '0 6px 20px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.18)'
                    : 'none',
                }}
              >
                {count}
              </motion.span>
            </div>
            <div
              className="font-semibold lowercase"
              style={{
                color: hasMembers ? 'rgba(255,255,255,0.85)' : 'var(--text-tertiary)',
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                letterSpacing: '-0.005em',
                textShadow: hasMembers ? '0 1px 2px rgba(0,0,0,0.18)' : 'none',
              }}
            >
              {count === 1 ? no.today.person : no.today.people}
              {total > 0 && hasMembers && (
                <span className="ml-2 opacity-70 tabular-nums">
                  {Math.round(pct * 100)}%
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Proportional fill bar at the bottom — live data rendered into glass */}
        {hasMembers && total > 0 && (
          <div
            aria-hidden
            className="absolute left-0 right-0 bottom-0 h-[5px]"
            style={{ background: 'rgba(0,0,0,0.22)' }}
          >
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: pct }}
              transition={{ ...spring.smooth, delay: 0.35 + index * 0.1 }}
              className="h-full origin-left"
              style={{
                background: 'linear-gradient(90deg, rgba(255,255,255,0.75), rgba(255,255,255,1))',
                boxShadow: '0 0 12px rgba(255,255,255,0.6)',
              }}
            />
          </div>
        )}
      </button>

      {/* Expanded member list */}
      <AnimatePresence initial={false}>
        {isExpanded && hasMembers && (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ ...spring.smooth }}
            className="overflow-hidden"
          >
            <div
              className="rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
              style={{
                background: 'var(--bg-elevated)',
                boxShadow: 'var(--shadow-md)',
              }}
            >
              {items.map((it) => (
                <MemberLine key={it.member.id} member={it.member} status={it.status} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ────────────────────────────────────────────────────────────────────────────

function MemberLine({ member, status }: { member: Member; status: EntryStatus }) {
  const pal = useStatusColors()[status]
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="relative shrink-0">
        <MemberAvatar name={member.display_name} avatarUrl={member.avatar_url} size="md" />
        <span
          className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full"
          style={{
            width: 18,
            height: 18,
            background: pal.icon,
            boxShadow: '0 0 0 2px var(--bg-elevated)',
          }}
        >
          <StatusIcon status={status} size={10} color="#ffffff" />
        </span>
      </div>
      <div className="min-w-0">
        <div
          className="text-[13px] font-semibold truncate"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
        >
          {member.display_name}
        </div>
        <div
          className="text-[11px] truncate"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
        >
          {no.status[status]}
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────

function RibbonEmpty() {
  return (
    <EmptyState
      icon={
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
          <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      }
      title={no.today.noEntriesTitle}
      description={no.today.noEntriesHint}
    />
  )
}
