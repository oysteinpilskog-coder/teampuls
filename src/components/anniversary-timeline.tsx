'use client'

import { useEffect, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useTeamMembers, type DerivedAnniversary } from '@/hooks/use-team-members'
import { useT } from '@/lib/i18n/context'
import { formatDateT } from './year-wheel-shared'

const NAME_COL = 220
const ROW_H = 64

export function AnniversaryTimeline({ orgId }: { orgId: string }) {
  const t = useT()

  const [today, setToday] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setToday(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const { tenureRanked, loading } = useTeamMembers(orgId)

  const max = useMemo(() => {
    let m = 1
    for (const r of tenureRanked) if (r.completedYears > m) m = r.completedYears
    return Math.max(m, 1)
  }, [tenureRanked])

  if (loading) {
    return null
  }

  if (tenureRanked.length === 0) {
    return (
      <div className="w-full max-w-[1180px] mx-auto py-20 text-center">
        <p
          className="text-[24px] italic"
          style={{
            fontFamily: 'var(--font-fraunces), Georgia, serif',
            fontVariationSettings: '"opsz" 36, "SOFT" 80',
            color: 'var(--text-secondary)',
          }}
        >
          {t.wheel.anniversaries.emptyTimeline}
        </p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-[1180px] mx-auto">
      <header className="px-2 pb-4 flex items-baseline justify-between">
        <h2
          className="text-[14px] font-semibold uppercase"
          style={{
            fontFamily: 'var(--font-body)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.22em',
          }}
        >
          {t.wheel.anniversaries.tenureHeader}
        </h2>
        <span
          className="text-[12px] tabular-nums"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
        >
          {tenureRanked.length}
        </span>
      </header>
      <div
        className="rounded-3xl px-3 sm:px-5 py-3"
        style={{
          background: 'color-mix(in oklab, var(--bg-elevated) 60%, transparent)',
          backdropFilter: 'blur(18px) saturate(180%)',
          WebkitBackdropFilter: 'blur(18px) saturate(180%)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <ul className="flex flex-col">
          {tenureRanked.map((entry, idx) => (
            <TenureRow key={entry.member.id} entry={entry} idx={idx} max={max} today={today} t={t} />
          ))}
        </ul>
      </div>
    </div>
  )
}

function TenureRow({
  entry, idx, max, today, t,
}: {
  entry: DerivedAnniversary
  idx: number
  max: number
  today: Date
  t: ReturnType<typeof useT>
}) {
  const years = entry.completedYears
  const fraction = (years + monthsSince(entry.startDate, today) / 12) / max
  const widthPct = Math.min(100, Math.max(2, fraction * 100))
  const sat = Math.min(80, 40 + years * 2.2)
  const initials = entry.member.initials ?? entry.member.display_name.slice(0, 2).toUpperCase()

  return (
    <motion.li
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, delay: idx * 0.04, ease: 'easeOut' }}
      className="flex items-center gap-3 sm:gap-5 py-2 border-b last:border-b-0"
      style={{ minHeight: ROW_H, borderColor: 'var(--border-subtle)' }}
    >
      <div
        className="flex items-center gap-2 sm:gap-3 flex-shrink-0"
        style={{ width: NAME_COL }}
      >
        <div className="flex-shrink-0">
          {entry.member.avatar_url ? (
            <img
              src={entry.member.avatar_url}
              alt=""
              className="w-9 h-9 rounded-full object-cover"
              style={{ boxShadow: `0 0 0 1.5px hsl(220, ${sat}%, 50%)` }}
            />
          ) : (
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-semibold"
              style={{
                background: 'var(--bg-subtle)',
                color: 'var(--text-primary)',
                boxShadow: `0 0 0 1.5px hsl(220, ${sat}%, 50%)`,
                fontFamily: 'var(--font-body)',
              }}
            >
              {initials.slice(0, 2)}
            </div>
          )}
        </div>
        <div className="min-w-0 flex flex-col">
          <span
            className="text-[14px] font-medium truncate leading-tight"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
          >
            {entry.member.full_name ?? entry.member.display_name}
          </span>
          <span
            className="text-[10.5px] font-medium"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
          >
            {t.wheel.anniversaries.startedOn.replace('{date}', formatDateT(entry.startDate, t))}
          </span>
        </div>
      </div>

      <div
        className="flex-1 min-w-0 relative h-8 rounded-2xl overflow-hidden"
        style={{
          background: 'color-mix(in oklab, var(--bg-subtle) 60%, transparent)',
        }}
      >
        {entry.isMilestone && (
          <div
            className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
            style={{ background: 'linear-gradient(180deg, #F5C861, #B98700)' }}
            aria-hidden
          />
        )}
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${widthPct}%` }}
          transition={{ duration: 0.7, delay: idx * 0.04 + 0.1, ease: [0.22, 0.9, 0.33, 1] }}
          className="absolute left-0 top-0 bottom-0 rounded-2xl flex items-center justify-end pr-3"
          style={{
            background: `linear-gradient(90deg, hsl(220, ${sat}%, 60%) 0%, hsl(220, ${sat + 5}%, 42%) 100%)`,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
          }}
        >
          <span
            className="text-[12.5px] font-medium tabular-nums whitespace-nowrap"
            style={{
              color: 'white',
              fontFamily: 'var(--font-fraunces), Georgia, serif',
              fontStyle: 'italic',
              fontVariationSettings: '"opsz" 24, "SOFT" 60',
              fontWeight: 500,
              letterSpacing: '-0.01em',
              textShadow: '0 1px 2px rgba(0,0,0,0.35)',
            }}
          >
            {years > 0
              ? t.wheel.anniversaries.yearsLabel.replace('{years}', String(years))
              : t.wheel.anniversaries.lessThanOneYear}
            {entry.isMilestone ? ' ★' : ''}
          </span>
        </motion.div>
      </div>
    </motion.li>
  )
}

function monthsSince(from: Date, to: Date): number {
  const yd = to.getFullYear() - from.getFullYear()
  const md = to.getMonth() - from.getMonth()
  const dd = to.getDate() - from.getDate()
  return yd * 12 + md + (dd < 0 ? -1 : 0)
}
