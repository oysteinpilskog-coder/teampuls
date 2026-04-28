'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { DiskView } from '@/components/year-wheel'
import { CATEGORY_COLORS } from '@/components/event-editor'
import { spring } from '@/lib/motion'
import { getISOWeek } from '@/lib/dates'
import type { OrgEvent } from '@/lib/supabase/types'
import { useT } from '@/lib/i18n/context'

interface WheelViewProps {
  orgId: string
  orgName: string
  time: Date
}

function pad(n: number) { return String(n).padStart(2, '0') }

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatRange(startIso: string, endIso: string, monthsShort: string[]): string {
  const start = new Date(startIso + 'T12:00:00')
  const end   = new Date(endIso   + 'T12:00:00')
  const sameDay = startIso === endIso
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
  if (sameDay) return `${start.getDate()}. ${monthsShort[start.getMonth()]}`
  if (sameMonth) return `${start.getDate()}.–${end.getDate()}. ${monthsShort[start.getMonth()]}`
  return `${start.getDate()}. ${monthsShort[start.getMonth()]} – ${end.getDate()}. ${monthsShort[end.getMonth()]}`
}

export function WheelView({ orgId, orgName, time }: WheelViewProps) {
  const t = useT()
  const year = time.getFullYear()
  const todayYmd = toYmd(time)
  const [events, setEvents] = useState<OrgEvent[]>([])
  const [orgLogo, setOrgLogo] = useState<string | null>(null)

  // Dashboard-owned fetch. We avoid useEvents() because its Realtime channel
  // would re-subscribe every rotation; the dashboard cycles views every ~15s
  // and we want to keep subscription count predictable.
  useEffect(() => {
    const supabase = createClient()
    // Date overlap with `[year-01-01, year-12-31]`: an event overlaps the
    // window iff its start is before-or-on the window end AND its end is
    // after-or-on the window start. The previous OR-query missed events
    // that straddle Jan 1 / Dec 31 of the wrong year.
    supabase
      .from('events')
      .select('*')
      .eq('org_id', orgId)
      .lte('start_date', `${year}-12-31`)
      .gte('end_date', `${year}-01-01`)
      .order('start_date')
      .then(({ data }) => setEvents(data ?? []))

    supabase
      .from('organizations')
      .select('logo_url')
      .eq('id', orgId)
      .maybeSingle()
      .then(({ data }) => setOrgLogo(data?.logo_url ?? null))
  }, [orgId, year])

  const { todayEvents, upcomingEvents } = useMemo(() => {
    const ongoing = events.filter(e => e.start_date <= todayYmd && e.end_date >= todayYmd)
    const future = events
      .filter(e => e.start_date > todayYmd)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
      .slice(0, 4)
    return { todayEvents: ongoing, upcomingEvents: future }
  }, [events, todayYmd])

  const hours = pad(time.getHours())
  const minutes = pad(time.getMinutes())
  const weekNum = getISOWeek(time)

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
            Årshjulet · {year}
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
            background:
              'linear-gradient(180deg, #00F5A0 -12%, #00D9F5 16%, #ffffff 52%, #ffffff 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            filter: 'drop-shadow(0 0 24px rgba(0,217,245,0.22))',
          }}
        >
          {hours}:{minutes}
        </motion.div>
      </div>

      {/* ── Main: wheel (left) + agenda rail (right) ─────────────── */}
      <div className="flex-1 min-h-0 flex gap-6">
        {/* Wheel panel — aspect-square sized by column height so nothing clips. */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...spring.gentle, delay: 0.2 }}
          className="flex-1 relative rounded-3xl flex items-center justify-center overflow-hidden"
          style={{
            background:
              'linear-gradient(155deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          <DiskView
            year={year}
            today={time}
            events={events}
            orgLogo={orgLogo}
            selectedEvent={null}
            onSelectEvent={() => {}}
            tvMode
            hideAgenda
          />
        </motion.div>

        {/* Agenda rail — fixed-width sidebar styled for the dashboard aesthetic. */}
        <motion.aside
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...spring.gentle, delay: 0.28 }}
          className="w-[360px] flex-shrink-0 flex flex-col gap-4"
        >
          <AgendaTile
            eyebrow="I DAG"
            meta={`UKE ${pad(weekNum)}`}
            events={todayEvents}
            emptyLabel={t.wheel?.noEventsToday ?? 'Ingen hendelser i dag'}
            grow={false}
          />
          <AgendaTile
            eyebrow="KOMMENDE"
            events={upcomingEvents}
            emptyLabel={t.wheel?.noUpcoming ?? 'Ingenting planlagt'}
            grow
          />
        </motion.aside>
      </div>
    </div>
  )
}

// ─── Agenda tile ────────────────────────────────────────────────

function AgendaTile({
  eyebrow, meta, events, emptyLabel, grow,
}: {
  eyebrow: string
  meta?: string
  events: OrgEvent[]
  emptyLabel: string
  grow: boolean
}) {
  const t = useT()
  return (
    <section
      className={`${grow ? 'flex-1' : 'flex-shrink-0'} min-h-0 rounded-3xl px-5 py-4 flex flex-col gap-3 overflow-hidden`}
      style={{
        background:
          'linear-gradient(155deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
    >
      <header className="flex items-baseline justify-between">
        <h3
          className="text-[11px] font-semibold uppercase"
          style={{
            color: 'rgba(255,255,255,0.42)',
            fontFamily: 'var(--font-body)',
            letterSpacing: '0.26em',
          }}
        >
          {eyebrow}
        </h3>
        {meta && (
          <span
            className="text-[10px] tabular-nums uppercase"
            style={{
              color: 'rgba(255,255,255,0.3)',
              fontFamily: 'var(--font-body)',
              letterSpacing: '0.22em',
            }}
          >
            {meta}
          </span>
        )}
      </header>

      {events.length === 0 ? (
        <p
          className="text-[14px] leading-snug"
          style={{ color: 'rgba(255,255,255,0.38)', fontFamily: 'var(--font-body)' }}
        >
          {emptyLabel}
        </p>
      ) : (
        <ul className="flex flex-col gap-2 min-h-0 overflow-hidden">
          {events.map((ev, i) => (
            <motion.li
              key={ev.id}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...spring.gentle, delay: 0.35 + i * 0.05 }}
              className="flex items-start gap-3"
            >
              <span
                aria-hidden
                className="mt-1.5 flex-shrink-0 rounded-full"
                style={{
                  width: 9, height: 9,
                  background: ev.color ?? CATEGORY_COLORS[ev.category],
                  boxShadow: `0 0 12px ${ev.color ?? CATEGORY_COLORS[ev.category]}66`,
                }}
              />
              <div className="min-w-0 flex-1">
                <p
                  className="text-[14px] font-medium leading-tight truncate"
                  style={{ color: 'rgba(255,255,255,0.92)', fontFamily: 'var(--font-sora)' }}
                >
                  {ev.title}
                </p>
                <p
                  className="text-[10px] tabular-nums uppercase"
                  style={{
                    color: 'rgba(255,255,255,0.4)',
                    fontFamily: 'var(--font-body)',
                    letterSpacing: '0.14em',
                  }}
                >
                  {formatRange(ev.start_date, ev.end_date, t.dates.monthsShort)}
                </p>
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </section>
  )
}
