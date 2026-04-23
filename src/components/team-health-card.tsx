'use client'

import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { Heart, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  getISOWeek,
  getISOWeekYear,
  getLastISOWeek,
  getWeekDays,
  toDateString,
} from '@/lib/dates'
import { spring } from '@/lib/motion'
import { scoreTeamHealth, type HealthReport } from '@/lib/team-health'
import { useHaptic } from '@/hooks/use-haptic'
import type { Entry } from '@/lib/supabase/types'

interface TeamHealthCardProps {
  orgId: string
  /** How many weeks back to measure. Default 6 = 30 weekdays. */
  weeks?: number
}

export function TeamHealthCard({ orgId, weeks = 6 }: TeamHealthCardProps) {
  const [report, setReport] = useState<HealthReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const haptic = useHaptic()

  // Weekdays window — same logic as the heatmap so the two features stay in
  // lockstep when we talk about "last 6 weeks".
  const weekdays = useMemo(() => {
    const today = new Date()
    const curW = getISOWeek(today)
    const curY = getISOWeekYear(today)
    const pairs: Array<{ week: number; year: number }> = []
    for (let i = weeks - 1; i >= 0; i--) {
      let w = curW - i
      let y = curY
      while (w < 1) {
        y -= 1
        w += getLastISOWeek(y)
      }
      pairs.push({ week: w, year: y })
    }
    return pairs.flatMap(({ week, year }) => getWeekDays(week, year))
  }, [weeks])

  const dateStrings = useMemo(() => weekdays.map(toDateString), [weekdays])

  const load = useMemo(
    () => async () => {
      setRefreshing(true)
      try {
        const supabase = createClient()
        const [{ count: memberCount }, { data: entries }] = await Promise.all([
          supabase
            .from('members')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', orgId)
            .eq('is_active', true),
          supabase
            .from('entries')
            .select('id, org_id, member_id, date, status, location_label, note, source, source_text, created_by, created_at, updated_at')
            .eq('org_id', orgId)
            .gte('date', dateStrings[0])
            .lte('date', dateStrings[dateStrings.length - 1]),
        ])
        const r = scoreTeamHealth({
          memberCount: memberCount ?? 0,
          entries: (entries ?? []) as Entry[],
          weekdays,
        })
        setReport(r)
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [orgId, dateStrings, weekdays],
  )

  useEffect(() => {
    load()
    const handler = () => load()
    window.addEventListener('teampulse:entries-changed', handler)
    return () => window.removeEventListener('teampulse:entries-changed', handler)
  }, [load])

  if (loading) return <Skeleton />

  if (!report || report.slotCount === 0) return null

  const tone = toneForGrade(report.grade)

  return (
    <section className="relative">
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <div
            className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] mb-1.5"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
          >
            <Heart className="w-3 h-3" style={{ color: tone.accent }} />
            Team-helse · siste {weeks} uker
          </div>
          <h2
            className="font-bold leading-none"
            style={{
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sora)',
              fontSize: 'clamp(24px, 3vw, 34px)',
              letterSpacing: '-0.035em',
            }}
          >
            Hvordan står det til?
          </h2>
        </div>
        <button
          type="button"
          onClick={() => { haptic('light'); load() }}
          disabled={refreshing}
          aria-label="Oppdater team-helse"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] disabled:opacity-60"
          style={{
            background: 'color-mix(in oklab, var(--bg-elevated) 70%, transparent)',
            backdropFilter: 'blur(14px) saturate(180%)',
            WebkitBackdropFilter: 'blur(14px) saturate(180%)',
            border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-body)',
          }}
        >
          <RefreshCw
            className="w-3.5 h-3.5"
            style={{ animation: refreshing ? 'spin 0.9s linear infinite' : undefined }}
          />
          <span>Oppdater</span>
        </button>
      </div>

      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          background: `linear-gradient(160deg, color-mix(in oklab, ${tone.accent} 12%, var(--bg-elevated)) 0%, var(--bg-elevated) 60%)`,
          border: `1px solid color-mix(in oklab, ${tone.accent} 22%, transparent)`,
          boxShadow: `0 24px 48px -16px color-mix(in oklab, ${tone.accent} 22%, transparent), inset 0 1px 0 rgba(255,255,255,0.5)`,
        }}
      >
        {/* Soft halo in the top-right corner, tinted to the grade */}
        <div
          aria-hidden
          className="absolute -top-24 -right-16 w-72 h-72 rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(closest-side, color-mix(in oklab, ${tone.accent} 35%, transparent), transparent 70%)`,
            filter: 'blur(38px)',
          }}
        />

        <div className="relative p-6 md:p-8 grid gap-8 md:grid-cols-[auto,1fr] items-start">
          {/* Big score dial */}
          <ScoreDial report={report} tone={tone} />

          {/* Right column — metrics + recommendation */}
          <div className="flex flex-col gap-5 min-w-0">
            <div className="grid grid-cols-2 gap-3">
              {report.metrics.map((m, i) => (
                <MetricBlock key={m.id} metric={m} tone={tone} index={i} />
              ))}
            </div>
            <div
              className="rounded-xl p-4"
              style={{
                background: `color-mix(in oklab, ${tone.accent} 8%, transparent)`,
                border: `1px solid color-mix(in oklab, ${tone.accent} 20%, transparent)`,
              }}
            >
              <div
                className="text-[10px] font-bold uppercase tracking-[0.22em] mb-1"
                style={{ color: tone.accent, fontFamily: 'var(--font-body)' }}
              >
                Anbefaling
              </div>
              <p
                className="text-[13.5px] leading-relaxed"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
              >
                {report.recommendation}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function ScoreDial({ report, tone }: { report: HealthReport; tone: Tone }) {
  const size = 170
  const stroke = 14
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const progress = (report.overall / 100) * circumference

  return (
    <div className="relative shrink-0 flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="color-mix(in oklab, var(--bg-subtle) 75%, transparent)"
          strokeWidth={stroke}
        />
        {/* Progress */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tone.accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - progress }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{
            filter: `drop-shadow(0 0 10px color-mix(in oklab, ${tone.accent} 45%, transparent))`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span
          className="font-bold tabular-nums leading-none"
          style={{
            fontFamily: 'var(--font-sora)',
            color: 'var(--text-primary)',
            fontSize: 52,
            letterSpacing: '-0.055em',
          }}
        >
          {report.overall}
        </span>
        <span
          className="mt-0.5 font-bold"
          style={{
            fontFamily: 'var(--font-sora)',
            color: tone.accent,
            fontSize: 14,
            letterSpacing: '-0.015em',
          }}
        >
          {report.grade} · {tone.label}
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function MetricBlock({
  metric,
  tone,
  index,
}: {
  metric: { id: string; label: string; score: number; note: string }
  tone: Tone
  index: number
}) {
  return (
    <div
      className="rounded-xl p-3.5"
      style={{
        background: 'color-mix(in oklab, var(--bg-elevated) 65%, transparent)',
        border: '1px solid color-mix(in oklab, var(--border-subtle) 45%, transparent)',
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
        >
          {metric.label}
        </span>
        <span
          className="text-[15px] font-bold tabular-nums"
          style={{
            fontFamily: 'var(--font-sora)',
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em',
          }}
        >
          {metric.score}
        </span>
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden mb-2"
        style={{ background: 'color-mix(in oklab, var(--bg-subtle) 80%, transparent)' }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${metric.score}%` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.2 + index * 0.05 }}
          className="h-full rounded-full"
          style={{ background: tone.accent, boxShadow: `0 0 8px color-mix(in oklab, ${tone.accent} 45%, transparent)` }}
        />
      </div>
      <p
        className="text-[11.5px] leading-snug"
        style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
      >
        {metric.note}
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <section className="relative">
      <div className="mb-5">
        <span className="tp-shimmer block mb-2" style={{ height: 10, width: 180, borderRadius: 3 }} />
        <span className="tp-shimmer block" style={{ height: 28, width: 280, borderRadius: 5 }} />
      </div>
      <div
        className="rounded-2xl p-8"
        style={{
          background: 'color-mix(in oklab, var(--bg-elevated) 92%, transparent)',
          border: '1px solid color-mix(in oklab, var(--border-subtle) 45%, transparent)',
          minHeight: 240,
        }}
      >
        <div className="grid gap-8 md:grid-cols-[auto,1fr] items-start">
          <span className="tp-shimmer block" style={{ width: 170, height: 170, borderRadius: '9999px' }} />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <span
                key={i}
                className="tp-shimmer block"
                style={{ height: 82, borderRadius: 12, animationDelay: `${i * 80}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

interface Tone { accent: string; label: string }

function toneForGrade(grade: HealthReport['grade']): Tone {
  switch (grade) {
    case 'A': return { accent: '#10B981', label: 'Glimrende' }  // emerald
    case 'B': return { accent: 'var(--accent-color)', label: 'Bra' } // violet
    case 'C': return { accent: '#F59E0B', label: 'Kan bli bedre' } // amber
    case 'D': return { accent: '#EF4444', label: 'Trenger oppmerksomhet' } // coral
  }
}
