'use client'

import { motion } from 'framer-motion'
import { useStatusColors } from '@/lib/status-colors/context'
import type { Entry, EntryStatus, Member } from '@/lib/supabase/types'
import { spring } from '@/lib/motion'
import { useT } from '@/lib/i18n/context'
import type { Dictionary } from '@/lib/i18n/types'
import { AnimatedCount } from './animated-count'

interface HeroPulseProps {
  members: Member[]
  todayEntries: Entry[]   // deduped: one entry per member at most
}

const STATUS_ORDER: EntryStatus[] = ['office', 'remote', 'customer', 'event', 'travel', 'vacation', 'sick', 'off']

function insightFor(registered: number, total: number, todayEntries: Entry[], t: Dictionary) {
  if (total === 0) return { title: t.pulse.ready, subtitle: t.pulse.readyHint }
  if (registered === 0) return { title: t.pulse.noRegistrationsToday, subtitle: t.pulse.noRegistrationsSubtitle }

  const onPositive = todayEntries.filter(e =>
    ['office', 'remote', 'customer', 'event', 'travel'].includes(e.status)
  ).length
  const away = todayEntries.filter(e => ['vacation', 'sick', 'off'].includes(e.status)).length

  if (registered === total && away === 0) {
    return { title: t.pulse.fullTeam, subtitle: t.pulse.fullTeamHint }
  }
  if (registered === total && away > 0) {
    return {
      title: t.pulse.mixedFull.replace('{active}', String(onPositive)).replace('{away}', String(away)),
      subtitle: t.pulse.mixedFullHint,
    }
  }
  const missing = total - registered
  return {
    title: t.pulse.activeToday.replace('{active}', String(onPositive)),
    subtitle: t.pulse.missingRegistration.replace('{n}', String(missing)),
  }
}

export function HeroPulse({ members, todayEntries }: HeroPulseProps) {
  const STATUS_COLORS = useStatusColors()
  const t = useT()
  const STATUS_LABELS: Record<EntryStatus, string> = {
    office: t.status.office,
    remote: t.pulse.atHomeShort,
    customer: t.status.customer,
    event: t.status.event,
    travel: t.status.travel,
    vacation: t.status.vacation,
    sick: t.status.sick,
    off: t.status.off,
  }
  const total = members.length
  const registered = todayEntries.length
  const pct = total > 0 ? Math.round((registered / total) * 100) : 0

  const counts = STATUS_ORDER.map(s => ({
    status: s,
    count: todayEntries.filter(e => e.status === s).length,
  })).filter(c => c.count > 0)

  // Location aggregation — group members currently present by their city/location
  const locMap = new Map<string, number>()
  todayEntries.forEach(e => {
    if (!['office', 'customer', 'event', 'travel', 'remote'].includes(e.status)) return
    const key = (e.location_label?.trim() || (e.status === 'remote' ? t.pulse.atHomeShort : '')).trim()
    if (!key) return
    locMap.set(key, (locMap.get(key) ?? 0) + 1)
  })
  const locations = Array.from(locMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)

  const insight = insightFor(registered, total, todayEntries, t)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring.gentle, delay: 0.18 }}
      className="relative rounded-3xl px-6 py-4 flex items-stretch gap-6 overflow-hidden flex-shrink-0"
      style={{
        background:
          'linear-gradient(155deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.015) 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
      }}
    >
      {/* ── Activity ring ──────────────────────────────────────────── */}
      <div className="flex items-center gap-4 flex-shrink-0">
        <div className="relative" style={{ width: 104, height: 104 }}>
          <svg width={104} height={104} viewBox="-52 -52 104 104" className="absolute inset-0">
            {/* Track */}
            <circle
              r={44}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={7}
            />
            {/* Progress */}
            <motion.circle
              r={44}
              fill="none"
              stroke="url(#ringGradient)"
              strokeWidth={7}
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 44 * (pct / 100)} ${2 * Math.PI * 44}`}
              initial={{ strokeDasharray: `0 ${2 * Math.PI * 44}` }}
              animate={{ strokeDasharray: `${2 * Math.PI * 44 * (pct / 100)} ${2 * Math.PI * 44}` }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
              transform="rotate(-90)"
              style={{ filter: 'drop-shadow(0 0 12px color-mix(in oklab, var(--accent-color) 60%, transparent))' }}
            />
            <defs>
              <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="color-mix(in oklab, var(--accent-color) 50%, white)" />
                <stop offset="100%" stopColor="var(--accent-color)" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="flex items-baseline gap-1">
              <AnimatedCount
                value={registered}
                delay={0.25}
                duration={0.9}
                className="tabular-nums leading-none"
                style={{
                  fontSize: '36px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-sora)',
                  letterSpacing: '-0.03em',
                  background: 'linear-gradient(180deg, #ffffff 0%, #c9d4ff 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              />
              <span
                className="tabular-nums leading-none"
                style={{
                  fontSize: '15px',
                  fontWeight: 500,
                  color: 'rgba(255,255,255,0.45)',
                  fontFamily: 'var(--font-sora)',
                }}
              >
                /{total}
              </span>
            </div>
            <span
              className="text-[10px] font-semibold tracking-[0.22em] uppercase mt-1"
              style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-body)' }}
            >
              {t.pulse.registered}
            </span>
          </div>
        </div>

        {/* Insight text */}
        <div className="flex flex-col gap-1">
          <span
            className="text-[11px] font-semibold tracking-[0.22em] uppercase"
            style={{ color: 'rgba(127,178,255,0.85)', fontFamily: 'var(--font-body)' }}
          >
            {t.pulse.today} · {pct}%
          </span>
          <span
            className="text-[22px] font-semibold leading-tight tracking-tight"
            style={{
              fontFamily: 'var(--font-sora)',
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.75) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {insight.title}
          </span>
          <span
            className="text-[14px]"
            style={{ color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-body)' }}
          >
            {insight.subtitle}
          </span>
        </div>
      </div>

      {/* ── Vertical divider ──────────────────────────────────────── */}
      <div className="w-px self-stretch" style={{ background: 'rgba(255,255,255,0.08)' }} />

      {/* ── Distribution + legend ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-2.5 justify-center min-w-0">
        <span
          className="text-[11px] font-semibold tracking-[0.22em] uppercase"
          style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body)' }}
        >
          {t.today.breakdown}
        </span>

        {/* Stacked bar */}
        <div
          className="flex w-full h-[10px] rounded-full overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.05)' }}
        >
          {registered === 0 ? null : counts.map(({ status, count }, i) => (
            <motion.div
              key={status}
              initial={{ flex: 0 }}
              animate={{ flex: count }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.4 + i * 0.05 }}
              style={{
                background: `linear-gradient(90deg, ${STATUS_COLORS[status].icon} 0%, ${STATUS_COLORS[status].textDark} 100%)`,
                boxShadow: `0 0 10px ${STATUS_COLORS[status].icon}88`,
              }}
              title={`${count} ${STATUS_LABELS[status]}`}
            />
          ))}
        </div>

        {/* Legend chips */}
        <div className="flex flex-wrap gap-2">
          {counts.length === 0 ? (
            <span
              className="text-[13px]"
              style={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-body)' }}
            >
              {t.pulse.noRegistrationsBoard}
            </span>
          ) : (
            counts.map(({ status, count }) => (
              <span
                key={status}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                style={{
                  background: `${STATUS_COLORS[status].icon}14`,
                  border: `1px solid ${STATUS_COLORS[status].icon}30`,
                  color: STATUS_COLORS[status].textDark,
                  fontFamily: 'var(--font-body)',
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: STATUS_COLORS[status].icon,
                    boxShadow: `0 0 6px ${STATUS_COLORS[status].icon}aa`,
                  }}
                />
                <span className="text-[12px] font-semibold">
                  {STATUS_LABELS[status]}
                </span>
                <span className="text-[12px] tabular-nums font-semibold opacity-70">
                  {count}
                </span>
              </span>
            ))
          )}
        </div>
      </div>

      {/* ── Divider ───────────────────────────────────────────────── */}
      {locations.length > 0 && (
        <div className="w-px self-stretch" style={{ background: 'rgba(255,255,255,0.08)' }} />
      )}

      {/* ── Locations ─────────────────────────────────────────────── */}
      {locations.length > 0 && (
        <div className="flex flex-col gap-2 justify-center flex-shrink-0" style={{ minWidth: 170 }}>
          <span
            className="text-[11px] font-semibold tracking-[0.22em] uppercase"
            style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body)' }}
          >
            {t.pulse.where}
          </span>
          <div className="flex flex-col gap-1">
            {locations.map(([loc, count], i) => (
              <motion.div
                key={loc}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...spring.gentle, delay: 0.5 + i * 0.05 }}
                className="flex items-center gap-2"
              >
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
                  <path
                    d="M12 21s-7-6.5-7-12a7 7 0 1 1 14 0c0 5.5-7 12-7 12Z"
                    stroke="rgba(127,178,255,0.7)"
                    strokeWidth={1.8}
                    strokeLinejoin="round"
                  />
                  <circle cx={12} cy={9} r={2.4} stroke="rgba(127,178,255,0.7)" strokeWidth={1.8} />
                </svg>
                <span
                  className="text-[13px] font-medium flex-1 truncate"
                  style={{ color: 'rgba(255,255,255,0.75)', fontFamily: 'var(--font-body)' }}
                >
                  {loc}
                </span>
                <span
                  className="text-[12px] tabular-nums font-semibold px-1.5 py-0.5 rounded-md"
                  style={{
                    color: 'color-mix(in oklab, var(--accent-color) 55%, white)',
                    background: 'color-mix(in oklab, var(--accent-color) 20%, transparent)',
                    fontFamily: 'var(--font-body)',
                    minWidth: 22,
                    textAlign: 'center',
                  }}
                >
                  {count}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  )
}
