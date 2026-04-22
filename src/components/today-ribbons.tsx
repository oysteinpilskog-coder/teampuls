'use client'

import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
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
  /** Category color — dempet, ikke neon. Drives left-border + soft glow. */
  color: string
  /** Lighter variant for text/labels when paired with the tinted bg. */
  tint: string
}

// Kategorifargene er hentet rett fra designsystemet (dempede pasteller).
const BANDS: Band[] = [
  {
    id: 'together',
    label: no.today.bandTogether,
    sublabel: no.today.bandTogetherSub,
    statuses: ['office'],
    color: '#2DD4BF', // teal — "work / tilstede"
    tint: '#5EEAD4',
  },
  {
    id: 'spread',
    label: no.today.bandSpread,
    sublabel: no.today.bandSpreadSub,
    statuses: ['remote', 'customer', 'travel'],
    color: '#FBBF24', // amber — "travel / spredt"
    tint: '#FDE68A',
  },
  {
    id: 'rest',
    label: no.today.bandRest,
    sublabel: no.today.bandRestSub,
    statuses: ['vacation', 'sick', 'off'],
    color: '#6366F1', // indigo — "focus / i ro"
    tint: '#A5B4FC',
  },
]

function useClock(timezone: string, mounted: boolean) {
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
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const reduce = !!useReducedMotion()
  const statusColors = useStatusColors()
  const { now, timeStr } = useClock(timezone, mounted)

  const today = useMemo(() => toDateString(now ?? new Date()), [now])
  const { entries, loading } = useEntries(orgId, [today])

  const memberById = useMemo(() => {
    const m = new Map<string, Member>()
    allMembers.forEach((x) => m.set(x.id, x))
    return m
  }, [allMembers])

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
  const emptyState = mounted && !loading && totalRegistered === 0

  // "Primær" band = the one with most people. Gets violet accent treatment.
  const primaryBand: BandId | null = useMemo(() => {
    if (totalRegistered === 0) return null
    let best: BandId = 'together'
    let bestN = -1
    for (const b of BANDS) {
      const n = grouped.map[b.id].length
      if (n > bestN) {
        best = b.id
        bestN = n
      }
    }
    return bestN > 0 ? best : null
  }, [grouped, totalRegistered])

  const [expanded, setExpanded] = useState<BandId | null>(null)

  const STATUS_ORDER: EntryStatus[] = ['office', 'remote', 'customer', 'travel', 'vacation', 'sick', 'off']
  const STATUS_LABELS: Record<EntryStatus, string> = no.status

  return (
    <div className="relative mx-auto max-w-6xl px-6 py-12 md:py-16">
      {/* Scoped ambient aurora — violet top-right, teal bottom-left, 8% */}
      <div className="lg-aurora" aria-hidden />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        className="relative flex items-end justify-between gap-6 mb-10 md:mb-14"
      >
        <div className="min-w-0">
          <div
            className="lg-eyebrow mb-3 min-h-[14px]"
            suppressHydrationWarning
          >
            {now ? formatDateLabelLong(now) : ' '}
          </div>
          <h1
            className="lg-serif leading-[0.92]"
            style={{
              color: 'var(--lg-text-1)',
              fontSize: 'clamp(48px, 8vw, 96px)',
            }}
          >
            Hvor er teamet
            <span style={{ color: 'var(--lg-accent)' }}>?</span>
          </h1>
        </div>

        {/* Live pill */}
        <div
          className="hidden md:flex items-center gap-2.5 shrink-0 pb-3 px-3.5 py-2 rounded-full"
          style={{
            background: 'rgba(22, 22, 27, 0.5)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid var(--lg-divider)',
          }}
        >
          <motion.span
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: 'var(--lg-accent)',
              boxShadow: '0 0 10px var(--lg-accent-glow)',
            }}
            animate={reduce ? {} : { opacity: [0.35, 1, 0.35] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
          <span className="lg-eyebrow" style={{ color: 'var(--lg-text-2)' }}>
            {no.today.live}
          </span>
          <span
            className="lg-mono text-[12px]"
            style={{ color: 'var(--lg-text-1)' }}
            suppressHydrationWarning
          >
            {timeStr || '––:––'}
          </span>
        </div>
      </motion.div>

      {/* Ribbons */}
      <div className="relative">
        {emptyState ? (
          <RibbonEmpty />
        ) : (
          <div className="flex flex-col gap-4">
            {BANDS.map((band, i) => {
              const items = grouped.map[band.id]
              const isExpanded = expanded === band.id
              const isPrimary = primaryBand === band.id
              return (
                <Ribbon
                  key={band.id}
                  band={band}
                  index={i}
                  items={items}
                  total={totalRegistered}
                  isExpanded={isExpanded}
                  isPrimary={isPrimary}
                  onToggle={() => setExpanded(isExpanded ? null : band.id)}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Breakdown chips */}
      {!emptyState && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
          className="relative mt-14"
        >
          <div className="lg-eyebrow mb-4">{no.today.breakdown}</div>
          <div className="flex flex-wrap gap-2">
            {STATUS_ORDER.map((status, idx) => {
              const count = grouped.byStatus[status] ?? 0
              if (count === 0) return null
              const pal = statusColors[status]
              return (
                <motion.div
                  key={status}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 + idx * 0.04, duration: 0.25 }}
                  className="flex items-center gap-2 rounded-full pl-2 pr-3 py-1"
                  style={{
                    background: 'var(--lg-surface-2)',
                    border: '1px solid var(--lg-divider)',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  <span
                    className="flex items-center justify-center rounded-full"
                    style={{
                      width: 18,
                      height: 18,
                      background: `color-mix(in oklab, ${pal.icon} 22%, transparent)`,
                      boxShadow: `0 0 0 1px color-mix(in oklab, ${pal.icon} 40%, transparent)`,
                    }}
                  >
                    <StatusIcon status={status} size={10} color={pal.icon} />
                  </span>
                  <span
                    className="text-[12px] font-medium"
                    style={{ color: 'var(--lg-text-2)' }}
                  >
                    {STATUS_LABELS[status]}
                  </span>
                  <span
                    className="lg-mono text-[12px] font-semibold"
                    style={{ color: 'var(--lg-text-1)' }}
                  >
                    {count}
                  </span>
                </motion.div>
              )
            })}
          </div>
        </motion.div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────

function Ribbon({
  band,
  index,
  items,
  total,
  isExpanded,
  isPrimary,
  onToggle,
}: {
  band: Band
  index: number
  items: { member: Member; status: EntryStatus }[]
  total: number
  isExpanded: boolean
  isPrimary: boolean
  onToggle: () => void
}) {
  const count = items.length
  const hasMembers = count > 0
  const pct = total > 0 ? count / total : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.08 + index * 0.05, ease: [0.4, 0, 0.2, 1] }}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={!hasMembers}
        aria-expanded={isExpanded}
        aria-label={`${band.label} — ${count} ${count === 1 ? no.today.person : no.today.people}`}
        className="group relative block w-full text-left overflow-hidden rounded-[16px] transition-[transform,border-color,background] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{
          background: hasMembers
            ? 'rgba(22, 22, 27, 0.55)'
            : 'var(--lg-surface-1)',
          border: `1px solid ${isPrimary ? 'rgba(139, 92, 246, 0.35)' : 'var(--lg-divider)'}`,
          backdropFilter: hasMembers ? 'blur(20px) saturate(180%)' : undefined,
          WebkitBackdropFilter: hasMembers ? 'blur(20px) saturate(180%)' : undefined,
          boxShadow: hasMembers
            ? isPrimary
              ? `inset 2px 0 0 ${band.color}, 0 0 0 0 ${band.color}, 0 0 24px -6px ${band.color}44, 0 0 0 3px rgba(139, 92, 246, 0.10)`
              : `inset 2px 0 0 ${band.color}, 0 0 18px -8px ${band.color}55`
            : 'none',
          cursor: hasMembers ? 'pointer' : 'default',
          minHeight: 112,
        }}
      >
        <div className="relative flex items-stretch gap-6 md:gap-10 p-5 md:p-6">
          {/* Left — label stack */}
          <div className="flex-1 min-w-0 flex flex-col justify-between">
            <div className="flex flex-col gap-1">
              {/* Band label — small mono eyebrow (already uppercase in i18n) */}
              <div
                className="lg-mono text-[10.5px] font-semibold"
                style={{
                  color: hasMembers ? band.tint : 'var(--lg-text-3)',
                  letterSpacing: '0.2em',
                }}
              >
                {band.label}
              </div>
              {/* Sublabel — serif italic, the quiet feature typography */}
              <div
                className="lg-serif"
                style={{
                  color: hasMembers ? 'var(--lg-text-1)' : 'var(--lg-text-3)',
                  fontSize: 'clamp(22px, 3.2vw, 32px)',
                  lineHeight: 1.1,
                }}
              >
                {band.sublabel}
              </div>
            </div>

            {hasMembers && (
              <div className="flex items-center gap-0 mt-4 flex-wrap">
                {items.slice(0, 10).map((it, i) => (
                  <motion.div
                    key={it.member.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...spring.gentle, delay: 0.2 + index * 0.05 + i * 0.03 }}
                    style={{
                      marginLeft: i === 0 ? 0 : -8,
                      boxShadow: `0 0 0 2px var(--lg-surface-1)`,
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
                    transition={{ delay: 0.35 + index * 0.05 }}
                    className="lg-mono flex items-center justify-center font-semibold rounded-full"
                    style={{
                      width: 26,
                      height: 26,
                      marginLeft: -8,
                      background: 'var(--lg-surface-3)',
                      color: 'var(--lg-text-2)',
                      fontSize: 10,
                      boxShadow: `0 0 0 2px var(--lg-surface-1)`,
                    }}
                  >
                    +{items.length - 10}
                  </motion.div>
                )}
              </div>
            )}
          </div>

          {/* Right — count + meta */}
          <div className="flex flex-col items-end justify-between shrink-0 min-w-[96px]">
            <div className="flex items-baseline gap-2">
              <motion.span
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring.gentle, delay: 0.15 + index * 0.05 }}
                className="lg-mono leading-none"
                style={{
                  color: hasMembers ? 'var(--lg-text-1)' : 'var(--lg-text-3)',
                  fontSize: 'clamp(44px, 7vw, 72px)',
                  fontWeight: 500,
                }}
              >
                {count}
              </motion.span>
            </div>

            {total > 0 && hasMembers && (
              <div className="flex items-center gap-2 mt-2">
                {/* Slim proportional bar — live data, restrained */}
                <div
                  aria-hidden
                  className="h-1 w-16 rounded-full overflow-hidden"
                  style={{ background: 'var(--lg-divider)' }}
                >
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: pct }}
                    transition={{ delay: 0.3 + index * 0.05, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                    className="h-full w-full origin-left rounded-full"
                    style={{
                      background: band.color,
                      boxShadow: `0 0 8px ${band.color}88`,
                    }}
                  />
                </div>
                <span
                  className="lg-mono text-[11px]"
                  style={{ color: 'var(--lg-text-3)' }}
                >
                  {Math.round(pct * 100)}%
                </span>
              </div>
            )}
          </div>
        </div>
      </button>

      {/* Expanded member list */}
      <AnimatePresence initial={false}>
        {isExpanded && hasMembers && (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div
              className="rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
              style={{
                background: 'var(--lg-surface-2)',
                border: '1px solid var(--lg-divider)',
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
            boxShadow: '0 0 0 2px var(--lg-surface-2)',
          }}
        >
          <StatusIcon status={status} size={10} color="#ffffff" />
        </span>
      </div>
      <div className="min-w-0">
        <div
          className="text-[13px] font-medium truncate"
          style={{ color: 'var(--lg-text-1)', fontFamily: 'var(--font-body)' }}
        >
          {member.display_name}
        </div>
        <div
          className="text-[11px] truncate"
          style={{ color: 'var(--lg-text-3)', fontFamily: 'var(--font-body)' }}
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
