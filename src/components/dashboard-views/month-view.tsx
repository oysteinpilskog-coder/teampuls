'use client'

import { motion } from 'framer-motion'
import { StatusIcon } from '@/components/icons/status-icons'
import { useStatusColors } from '@/lib/status-colors/context'
import { MemberAvatar } from '@/components/member-avatar'
import type { Member, Entry, EntryStatus } from '@/lib/supabase/types'
import { getDayLabel, getISOWeek } from '@/lib/dates'
import { spring } from '@/lib/motion'
import { useT } from '@/lib/i18n/context'
import { AnimatedCount } from './animated-count'

interface MonthViewProps {
  members: Member[]
  weekDays: Date[]
  entries: Entry[]   // current week entries
  orgName: string
  time: Date
}

function pad(n: number) { return String(n).padStart(2, '0') }

const STATUS_ORDER: EntryStatus[] = ['office', 'remote', 'customer', 'travel', 'vacation', 'sick', 'off']

export function MonthView({ members, weekDays, entries, orgName, time }: MonthViewProps) {
  const STATUS_COLORS = useStatusColors()
  const t = useT()
  const STATUS_LABELS: Record<EntryStatus, string> = {
    office: t.status.office,
    remote: t.pulse.atHomeShort,
    customer: t.status.customer,
    travel: t.status.travel,
    vacation: t.status.vacation,
    sick: t.status.sick,
    off: t.status.off,
  }
  const hours   = pad(time.getHours())
  const minutes = pad(time.getMinutes())
  const weekNum = getISOWeek(time)
  const year    = time.getFullYear()

  const entryMap = new Map<string, Entry>()
  entries.forEach(e => entryMap.set(`${e.member_id}_${e.date}`, e))

  // Members away at any point this week
  const onVacation = members.filter(m =>
    weekDays.some(d => {
      const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      const entry = entryMap.get(`${m.id}_${dateStr}`)
      return entry && (entry.status === 'vacation' || entry.status === 'off' || entry.status === 'sick')
    })
  )

  // Tallies for full week
  const weekTotals = STATUS_ORDER.map(s => ({
    status: s,
    count: entries.filter(e => e.status === s).length,
  }))
  const weekTotal = entries.length
  const topStatuses = weekTotals.filter(w => w.count > 0).sort((a, b) => b.count - a.count)

  // Donut arithmetic
  const CIRC = 2 * Math.PI * 96
  let runningPct = 0

  return (
    <div className="relative h-full flex flex-col px-10 pt-6 pb-4 gap-6">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.05 }}
        >
          <p
            className="text-[13px] font-medium tracking-[0.22em] uppercase"
            style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body)' }}
          >
            {orgName}
          </p>
          <p
            className="text-[30px] font-semibold tracking-tight leading-none mt-1"
            style={{
              fontFamily: 'var(--font-sora)',
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.7) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Ukehorisonten
          </p>
        </motion.div>
        <motion.div
          className="tabular-nums text-right"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.12 }}
          style={{
            fontSize: '64px',
            fontWeight: 700,
            fontFamily: 'var(--font-sora)',
            letterSpacing: '-0.04em',
            background: 'linear-gradient(180deg, #ffffff 0%, #d4dbff 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            filter: 'drop-shadow(0 0 24px rgba(120,150,255,0.18))',
          }}
        >
          {hours}:{minutes}
        </motion.div>
      </div>

      {/* ── Main content ─────────────────────────────────────────── */}
      <div className="flex-1 grid grid-cols-3 gap-6 min-h-0">
        {/* Donut + week number */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.2 }}
          className="col-span-2 relative rounded-3xl flex flex-col items-center justify-center gap-8 overflow-hidden p-8"
          style={{
            background:
              'linear-gradient(155deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          {/* Decorative concentric orbit rings */}
          {[420, 320, 220, 120].map((size, i) => (
            <div
              key={i}
              aria-hidden
              className="absolute rounded-full"
              style={{
                width: size,
                height: size,
                border: '1px solid rgba(255,255,255,0.05)',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
              }}
            />
          ))}

          {/* Center donut */}
          <div className="relative flex items-center justify-center" style={{ width: 280, height: 280 }}>
            <svg width={280} height={280} viewBox="-140 -140 280 280" className="absolute inset-0">
              {/* Base track */}
              <circle
                r={96}
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={14}
              />
              {/* Stacked status arcs */}
              {weekTotal > 0 && weekTotals.map(({ status, count }) => {
                if (count === 0) return null
                const pct = count / weekTotal
                const dash = CIRC * pct
                const gap = CIRC - dash
                const offset = -runningPct * CIRC
                runningPct += pct
                return (
                  <motion.circle
                    key={status}
                    r={96}
                    fill="none"
                    stroke={STATUS_COLORS[status].icon}
                    strokeWidth={14}
                    strokeLinecap="butt"
                    strokeDasharray={`${dash} ${gap}`}
                    initial={{ strokeDashoffset: 0, opacity: 0 }}
                    animate={{ strokeDashoffset: offset, opacity: 1 }}
                    transition={{
                      strokeDashoffset: { duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.4 },
                      opacity: { duration: 0.6, delay: 0.4 },
                    }}
                    transform="rotate(-90)"
                    style={{
                      filter: `drop-shadow(0 0 12px ${STATUS_COLORS[status].icon}66)`,
                    }}
                  />
                )
              })}
            </svg>

            <div className="relative z-10 flex flex-col items-center gap-1 text-center">
              <span
                className="text-[11px] font-semibold tracking-[0.22em] uppercase"
                style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body)' }}
              >
                Uke
              </span>
              <AnimatedCount
                value={weekNum}
                delay={0.2}
                duration={0.9}
                className="tabular-nums leading-none"
                style={{
                  fontSize: '96px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-sora)',
                  letterSpacing: '-0.05em',
                  background:
                    'linear-gradient(180deg, #ffffff 0%, #a9b4ff 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  filter: 'drop-shadow(0 0 28px rgba(120,150,255,0.35))',
                }}
              />
              <span
                className="text-[14px] font-medium"
                style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-body)' }}
              >
                {year}
              </span>
            </div>
          </div>

          {/* Week mini-grid */}
          <div className="relative z-10 flex gap-4">
            {weekDays.map((date, di) => {
              const { weekday, day } = getDayLabel(date)
              const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
              const dayEntries = entries.filter(e => e.date === dateStr)

              return (
                <motion.div
                  key={date.toISOString()}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring.gentle, delay: 0.6 + di * 0.05 }}
                  className="flex flex-col items-center gap-1.5 min-w-[56px]"
                >
                  <span
                    className="text-[11px] font-semibold uppercase tracking-[0.18em]"
                    style={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-body)' }}
                  >
                    {weekday}
                  </span>
                  <span
                    className="tabular-nums text-[20px] font-semibold"
                    style={{ color: 'rgba(255,255,255,0.75)', fontFamily: 'var(--font-sora)' }}
                  >
                    {day}
                  </span>
                  <div className="flex flex-col gap-0.5 mt-0.5">
                    {STATUS_ORDER.map(status => {
                      const count = dayEntries.filter(e => e.status === status).length
                      if (count === 0) return null
                      return (
                        <div key={status} className="flex items-center gap-1.5">
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{
                              backgroundColor: STATUS_COLORS[status].icon,
                              boxShadow: `0 0 6px ${STATUS_COLORS[status].icon}88`,
                            }}
                          />
                          <span
                            className="text-[10px] tabular-nums font-medium"
                            style={{ color: STATUS_COLORS[status].textDark, fontFamily: 'var(--font-body)' }}
                          >
                            {count}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </motion.div>
              )
            })}
          </div>
        </motion.div>

        {/* Right column */}
        <div className="flex flex-col gap-5 min-h-0">
          {/* Fordeling (week breakdown) */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...spring.gentle, delay: 0.25 }}
            className="rounded-2xl p-5 flex flex-col gap-4"
            style={{
              background:
                'linear-gradient(155deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 100%)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <h3
              className="text-[11px] font-semibold uppercase tracking-[0.22em]"
              style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body)' }}
            >
              Fordeling denne uken
            </h3>
            {topStatuses.length === 0 ? (
              <p
                className="text-[14px]"
                style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-body)' }}
              >
                {t.dashboard.noMonthEntries}
              </p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {topStatuses.map(({ status, count }, i) => {
                  const pct = Math.round((count / weekTotal) * 100)
                  const c = STATUS_COLORS[status]
                  return (
                    <motion.div
                      key={status}
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ ...spring.gentle, delay: 0.4 + i * 0.06 }}
                      className="flex items-center gap-3"
                    >
                      <StatusIcon status={status} size={18} color={c.textDark} />
                      <span
                        className="text-[14px] font-medium flex-shrink-0"
                        style={{ color: c.textDark, fontFamily: 'var(--font-body)', minWidth: 72 }}
                      >
                        {STATUS_LABELS[status]}
                      </span>
                      <div className="flex-1 h-[6px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.5 + i * 0.06 }}
                          className="h-full rounded-full"
                          style={{
                            background: `linear-gradient(90deg, ${c.icon} 0%, ${c.textDark} 100%)`,
                            boxShadow: `0 0 10px ${c.icon}88`,
                          }}
                        />
                      </div>
                      <span
                        className="tabular-nums text-[13px] font-semibold"
                        style={{ color: c.textDark, fontFamily: 'var(--font-body)', minWidth: 28, textAlign: 'right' }}
                      >
                        {count}
                      </span>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </motion.div>

          {/* Borte denne uken */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...spring.gentle, delay: 0.32 }}
            className="flex-1 rounded-2xl p-5 flex flex-col gap-3 min-h-0"
            style={{
              background:
                'linear-gradient(155deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 100%)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <h3
              className="text-[11px] font-semibold uppercase tracking-[0.22em]"
              style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body)' }}
            >
              Borte denne uken
            </h3>
            {onVacation.length === 0 ? (
              <p
                className="text-[14px]"
                style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-body)' }}
              >
                Alle er på jobb.
              </p>
            ) : (
              <div className="flex flex-col gap-3 overflow-hidden">
                {onVacation.map((m, i) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...spring.gentle, delay: 0.45 + i * 0.05 }}
                    className="flex items-center gap-3"
                  >
                    <MemberAvatar name={m.display_name} avatarUrl={m.avatar_url} size="md" />
                    <span
                      className="text-[15px] font-medium"
                      style={{ color: 'rgba(255,255,255,0.8)', fontFamily: 'var(--font-body)' }}
                    >
                      {m.display_name.split(' ')[0]}
                    </span>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  )
}
