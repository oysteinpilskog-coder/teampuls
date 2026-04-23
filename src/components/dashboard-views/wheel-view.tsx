'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { DiskView } from '@/components/year-wheel'
import { spring } from '@/lib/motion'
import type { OrgEvent } from '@/lib/supabase/types'

interface WheelViewProps {
  orgId: string
  orgName: string
  time: Date
}

function pad(n: number) { return String(n).padStart(2, '0') }

export function WheelView({ orgId, orgName, time }: WheelViewProps) {
  const year = time.getFullYear()
  const [events, setEvents] = useState<OrgEvent[]>([])
  const [orgLogo, setOrgLogo] = useState<string | null>(null)

  // Dashboard-owned fetch. We avoid useEvents() because its Realtime channel
  // would re-subscribe every rotation; the dashboard cycles views every ~15s
  // and we want to keep subscription count predictable.
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('events')
      .select('*')
      .eq('org_id', orgId)
      .or(`start_date.gte.${year}-01-01,end_date.lte.${year}-12-31`)
      .order('start_date')
      .then(({ data }) => setEvents(data ?? []))

    supabase
      .from('organizations')
      .select('logo_url')
      .eq('id', orgId)
      .maybeSingle()
      .then(({ data }) => setOrgLogo(data?.logo_url ?? null))
  }, [orgId, year])

  const hours = pad(time.getHours())
  const minutes = pad(time.getMinutes())

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

      {/* ── Main stage: wheel fills remaining height, centred ───── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ ...spring.gentle, delay: 0.2 }}
        className="flex-1 min-h-0 relative rounded-3xl flex items-center justify-center overflow-hidden"
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
    </div>
  )
}
