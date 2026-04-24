'use client'

import { motion } from 'framer-motion'
import { useStatusColors } from '@/lib/status-colors/context'
import type { Member, Entry, EntryStatus } from '@/lib/supabase/types'
import { getDayLabel, getISOWeek, isToday } from '@/lib/dates'
import { spring } from '@/lib/motion'
import { HeroPulse } from './hero-pulse'
import { TeamBoard } from './team-board'

interface TodayViewProps {
  members: Member[]
  weekDays: Date[]
  entries: Entry[]
  todayEntries: Entry[]
  orgName: string
  time: Date
}

const WEEK_STATUS_GROUPS: Array<{ key: string; statuses: EntryStatus[]; representative: EntryStatus }> = [
  { key: 'office',   statuses: ['office'],                  representative: 'office' },
  { key: 'remote',   statuses: ['remote'],                  representative: 'remote' },
  { key: 'customer', statuses: ['customer', 'event', 'travel'],      representative: 'customer' },
  { key: 'away',     statuses: ['vacation', 'sick', 'off'], representative: 'vacation' },
]

function pad(n: number) { return String(n).padStart(2, '0') }

function greetingFor(h: number) {
  if (h < 5)  return 'God natt'
  if (h < 10) return 'God morgen'
  if (h < 12) return 'God formiddag'
  if (h < 17) return 'God ettermiddag'
  if (h < 22) return 'God kveld'
  return 'God natt'
}

/**
 * Keep one Entry per member for the target date — the most recently updated.
 * Also drops entries belonging to members not in the active list, so counts
 * stay consistent with the team roster.
 */
function dedupeForMembers(entries: Entry[], members: Member[]): Map<string, Entry> {
  const activeIds = new Set(members.map(m => m.id))
  const map = new Map<string, Entry>()
  for (const e of entries) {
    if (!activeIds.has(e.member_id)) continue
    const existing = map.get(e.member_id)
    if (!existing || new Date(e.updated_at).getTime() > new Date(existing.updated_at).getTime()) {
      map.set(e.member_id, e)
    }
  }
  return map
}

export function TodayView({ members, weekDays, entries, todayEntries, orgName, time }: TodayViewProps) {
  const STATUS_COLORS = useStatusColors()
  const hours   = pad(time.getHours())
  const minutes = pad(time.getMinutes())
  const weekNum = getISOWeek(time)

  const MONTH_FULL: Record<number, string> = {
    0: 'januar', 1: 'februar', 2: 'mars', 3: 'april', 4: 'mai', 5: 'juni',
    6: 'juli', 7: 'august', 8: 'september', 9: 'oktober', 10: 'november', 11: 'desember',
  }
  const WEEKDAY_FULL: Record<number, string> = {
    0: 'Søndag', 1: 'Mandag', 2: 'Tirsdag', 3: 'Onsdag',
    4: 'Torsdag', 5: 'Fredag', 6: 'Lørdag',
  }
  const dateLabel = `${WEEKDAY_FULL[time.getDay()]} ${time.getDate()}. ${MONTH_FULL[time.getMonth()]}`
  const greeting = greetingFor(time.getHours())

  // Deduplicate: one entry per member, per day. Fixes the "12/5 · 240%" bug.
  const todayMap = dedupeForMembers(todayEntries, members)
  const dedupedTodayEntries = Array.from(todayMap.values())

  // Per-day maps for the week strip — same dedup logic per date
  function getDedupedDayEntries(date: Date): Entry[] {
    const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    const dayRows = entries.filter(e => e.date === dateStr)
    return Array.from(dedupeForMembers(dayRows, members).values())
  }

  return (
    <div className="relative h-full flex flex-col px-10 pt-5 pb-3 gap-3">
      {/* ── Header band ──────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.05 }}
        >
          <p
            className="text-[13px] font-medium tracking-[0.22em] uppercase"
            style={{ color: 'rgba(245,239,228,0.45)', fontFamily: 'var(--font-manrope), system-ui, sans-serif' }}
          >
            {orgName}
          </p>
          {/* Product name — Fraunces italic on Paper. Quiet, warm, restrained.
              The clock is the Nordlys hero of this surface; the wordmark sits
              on the ink/paper scale so there's room for a single signature. */}
          <p
            className="leading-none mt-1"
            style={{
              fontFamily: 'var(--font-fraunces), "Iowan Old Style", Georgia, serif',
              fontWeight: 300,
              fontStyle: 'italic',
              fontVariationSettings: '"opsz" 32, "SOFT" 80',
              fontSize: 26,
              letterSpacing: '-0.025em',
              color: '#F5EFE4',
            }}
          >
            Offiview
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-widest uppercase"
              style={{
                background: 'color-mix(in oklab, var(--accent-color) 16%, transparent)',
                border: '1px solid color-mix(in oklab, var(--accent-color) 35%, transparent)',
                color: 'color-mix(in oklab, var(--accent-color) 60%, white)',
                fontFamily: 'var(--font-body)',
              }}
            >
              <motion.span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: 'var(--accent-color)' }}
                animate={{ opacity: [1, 0.35, 1], scale: [1, 1.25, 1] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              />
              Live · Uke {weekNum}
            </span>
            <span
              className="text-[12px]"
              style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body)' }}
            >
              {greeting}
            </span>
          </div>
        </motion.div>

        {/* Clock */}
        <motion.div
          className="text-right"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.12 }}
        >
          {/* THE CLOCK — Nordlys signature moment.
              Once per flate: this is the one place on the TV dashboard where
              Nordlys appears. Everything else stays on Paper/Ember.
              Fraunces 300 with opsz 144 + SOFT 80 gives the digits soft
              terminals — warm and precise. Green→cyan→violet gradient
              bakes the signature into the glyphs themselves. */}
          <div
            className="tabular-nums leading-none"
            style={{
              fontSize: 84,
              fontWeight: 300,
              fontFamily: 'var(--font-fraunces), "Iowan Old Style", Georgia, serif',
              fontVariationSettings: '"opsz" 144, "SOFT" 80',
              letterSpacing: '-0.04em',
              backgroundImage:
                'linear-gradient(120deg, #00F5A0 0%, #00D9F5 55%, #7C3AED 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: 'drop-shadow(0 0 28px rgba(0,245,160,0.22))',
            }}
          >
            {hours}
            <span
              aria-hidden
              style={{
                opacity: 0.5,
                animation: 'clockBlink 1.2s ease-in-out infinite',
                WebkitTextFillColor: 'rgba(245,239,228,0.75)',
                backgroundImage: 'none',
                margin: '0 -0.04em',
              }}
            >
              :
            </span>
            {minutes}
          </div>
          {/* Date subline — Fraunces italic, weekday in Ember-glow */}
          <div
            className="flex items-baseline justify-end gap-3 mt-1"
            style={{
              color: 'rgba(245,239,228,0.6)',
              fontFamily: 'var(--font-fraunces), "Iowan Old Style", Georgia, serif',
              fontStyle: 'italic',
              fontWeight: 300,
              fontVariationSettings: '"opsz" 24, "SOFT" 80',
            }}
          >
            <span style={{ fontSize: 17, letterSpacing: '-0.015em' }}>
              <span style={{ color: '#FBBF24' }}>
                {WEEKDAY_FULL[time.getDay()].toLowerCase()}
              </span>
              <span>{' · '}{time.getDate()}. {MONTH_FULL[time.getMonth()]}</span>
            </span>
          </div>
        </motion.div>
      </div>

      {/* ── Hero pulse strip (with deduped entries) ──────────────── */}
      <HeroPulse members={members} todayEntries={dedupedTodayEntries} />

      {/* ── Team board ───────────────────────────────────────────── */}
      <TeamBoard members={members} todayMap={todayMap} />

      {/* ── Week strip ────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring.gentle, delay: 0.65 }}
        className="relative rounded-2xl px-5 py-2.5 flex gap-3 overflow-hidden flex-shrink-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        {weekDays.map(date => {
          const { weekday, day } = getDayLabel(date)
          const dayEntries = getDedupedDayEntries(date)
          const today = isToday(date)

          const counts = WEEK_STATUS_GROUPS.map(g => ({
            group: g,
            count: dayEntries.filter(e => g.statuses.includes(e.status)).length,
          }))
          const registered = dayEntries.length
          const regPct = members.length > 0 ? Math.round((registered / members.length) * 100) : 0

          return (
            <div
              key={date.toISOString()}
              className="relative flex-1 flex flex-col items-center gap-1 rounded-xl py-1.5 px-2"
              style={{
                background: today
                  ? 'linear-gradient(180deg, color-mix(in oklab, var(--accent-color) 20%, transparent) 0%, color-mix(in oklab, var(--accent-color) 0%, transparent) 100%)'
                  : 'transparent',
                border: today
                  ? '1px solid color-mix(in oklab, var(--accent-color) 50%, transparent)'
                  : '1px solid transparent',
                boxShadow: today
                  ? '0 0 32px -8px color-mix(in oklab, var(--accent-color) 65%, transparent), inset 0 1px 0 color-mix(in oklab, var(--accent-color) 30%, transparent)'
                  : 'none',
              }}
            >
              <span
                className="text-[11px] font-semibold uppercase tracking-[0.18em]"
                style={{
                  color: today ? 'color-mix(in oklab, var(--accent-color) 60%, white)' : 'rgba(255,255,255,0.35)',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {weekday}
              </span>
              <span
                className="tabular-nums text-[18px] font-semibold leading-none"
                style={{
                  fontFamily: 'var(--font-sora)',
                  color: today ? '#ffffff' : 'rgba(255,255,255,0.5)',
                }}
              >
                {day}
              </span>

              <div
                className="flex w-full h-[6px] rounded-full overflow-hidden mt-0.5"
                style={{ background: 'rgba(255,255,255,0.05)' }}
              >
                {counts.map(({ group, count }) =>
                  count > 0 ? (
                    <div
                      key={group.key}
                      style={{
                        flex: count,
                        background: STATUS_COLORS[group.representative].icon,
                        boxShadow: `0 0 8px ${STATUS_COLORS[group.representative].icon}55`,
                      }}
                    />
                  ) : null
                )}
              </div>

              <div className="flex items-center gap-1">
                <span
                  className="tabular-nums text-[12px] font-semibold"
                  style={{
                    color: today ? '#ffffff' : 'rgba(255,255,255,0.55)',
                    fontFamily: 'var(--font-sora)',
                  }}
                >
                  {registered}
                </span>
                <span
                  className="text-[10px]"
                  style={{
                    color: today ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.25)',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  / {members.length} · {regPct}%
                </span>
              </div>
            </div>
          )
        })}
      </motion.div>

      <style>{`
        @keyframes clockBlink {
          0%, 100% { opacity: 0.35 }
          50%      { opacity: 0.08 }
        }
      `}</style>
    </div>
  )
}
