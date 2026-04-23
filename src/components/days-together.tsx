'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'
import { Sparkles, RefreshCw, ArrowUpRight } from 'lucide-react'
import { spring } from '@/lib/motion'
import { useHaptic } from '@/hooks/use-haptic'
import { useT } from '@/lib/i18n/context'

interface SuggestedDay {
  date: string
  score: number
  plannedIn: string[]
  plannedOut: string[]
  likelyIn: string[]
  likelyOut: string[]
  reason: string
  label: string
}

interface ApiResponse {
  suggestions: SuggestedDay[]
  hasSignal: boolean
}

export function DaysTogether() {
  const t = useT()
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const haptic = useHaptic()

  // Palette command "Foreslå samlingsdager" dispatches this event — we scroll
  // the section into view and trigger a refresh for a feeling of "I asked, the
  // app responded".
  useEffect(() => {
    const handler = () => {
      const el = document.getElementById('days-together')
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      load()
    }
    window.addEventListener('teampulse:days-together:focus', handler)
    return () => window.removeEventListener('teampulse:days-together:focus', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/ai/suggest-days', { cache: 'no-store' })
      if (!res.ok) {
        setData({ suggestions: [], hasSignal: false })
      } else {
        setData(await res.json())
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
    const handler = () => load()
    window.addEventListener('teampulse:entries-changed', handler)
    return () => window.removeEventListener('teampulse:entries-changed', handler)
  }, [load])

  return (
    <section id="days-together" className="relative scroll-mt-24">
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 lg-eyebrow mb-1.5">
            <Sparkles className="w-3 h-3" style={{ color: 'var(--lg-accent)' }} />
            AI-anbefalt · neste 2 uker
          </div>
          <h2
            className="lg-serif leading-none"
            style={{
              color: 'var(--lg-text-1)',
              fontSize: 'clamp(28px, 3.4vw, 40px)',
            }}
          >
            Samlingsdager
          </h2>
        </div>
        <button
          type="button"
          onClick={() => { haptic('light'); load() }}
          disabled={refreshing}
          aria-label={t.daysTogether.refresh}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium focus:outline-none disabled:opacity-60"
          style={{
            background: 'rgba(22, 22, 27, 0.5)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid var(--lg-divider)',
            color: 'var(--lg-text-2)',
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

      <div className="grid gap-4 md:grid-cols-3">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => <SuggestionSkeleton key={i} index={i} />)
          : (data?.suggestions ?? []).length === 0
            ? (
              <div className="md:col-span-3">
                <EmptySignal />
              </div>
            )
            : (
              <AnimatePresence mode="popLayout" initial={false}>
                {data!.suggestions.map((s, i) => (
                  <SuggestionCard key={s.date} day={s} index={i} />
                ))}
              </AnimatePresence>
            )}
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function SuggestionCard({ day, index }: { day: SuggestedDay; index: number }) {
  // Score-driven accent: top pick gets the full accent gradient, #2 gets a
  // tinted version, #3 a muted version. Visual ranking without numeric rank.
  const isTop = index === 0
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.97 }}
      transition={{ ...spring.gentle, delay: 0.05 + index * 0.06 }}
      className="relative rounded-2xl p-5 overflow-hidden"
      style={{
        background: isTop ? 'rgba(22, 22, 27, 0.55)' : 'var(--lg-surface-1)',
        backdropFilter: isTop ? 'blur(20px) saturate(180%)' : undefined,
        WebkitBackdropFilter: isTop ? 'blur(20px) saturate(180%)' : undefined,
        border: isTop
          ? '1px solid rgba(139, 92, 246, 0.35)'
          : '1px solid var(--lg-divider)',
        boxShadow: isTop
          ? '0 0 0 3px rgba(139, 92, 246, 0.10), 0 0 28px -6px var(--lg-accent-glow)'
          : 'none',
      }}
    >
      {isTop && (
        <div
          className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full lg-mono text-[9.5px] font-medium uppercase"
          style={{
            background: 'var(--lg-accent)',
            color: '#ffffff',
            letterSpacing: '0.16em',
            boxShadow: '0 0 12px var(--lg-accent-glow)',
          }}
        >
          <Sparkles className="w-2.5 h-2.5" />
          Sterkeste
        </div>
      )}

      <div className="lg-eyebrow mb-1">
        {new Date(day.date).toLocaleDateString('nb-NO', { weekday: 'short' }).replace('.', '')}
      </div>
      <div
        className="lg-serif leading-none mb-3"
        style={{
          color: 'var(--lg-text-1)',
          fontSize: 'clamp(24px, 2.8vw, 30px)',
        }}
      >
        {day.label}
      </div>

      {/* Score bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="lg-eyebrow">Score</span>
          <span
            className="lg-mono text-[13px]"
            style={{
              color: isTop ? 'var(--lg-accent)' : 'var(--lg-text-1)',
              fontWeight: 500,
            }}
          >
            {day.score}
          </span>
        </div>
        <div
          className="relative h-1 rounded-full overflow-hidden"
          style={{ background: 'var(--lg-divider)' }}
        >
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${day.score}%` }}
            transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1], delay: 0.1 + index * 0.05 }}
            className="h-full rounded-full"
            style={{
              background: 'var(--lg-accent)',
              boxShadow: '0 0 8px var(--lg-accent-glow)',
            }}
          />
        </div>
      </div>

      {/* Reason */}
      <p
        className="text-[13px] leading-relaxed"
        style={{ color: 'var(--lg-text-2)', fontFamily: 'var(--font-body)' }}
      >
        {day.reason}
      </p>

      {/* Counts row */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <CountChip label="planlagt" value={day.plannedIn.length} tone="accent" />
        {day.likelyIn.length > 0 && (
          <CountChip label="sannsynlig" value={day.likelyIn.length} tone="muted" />
        )}
        {day.plannedOut.length > 0 && (
          <CountChip label="borte" value={day.plannedOut.length} tone="warn" />
        )}
      </div>
    </motion.article>
  )
}

function CountChip({ label, value, tone }: { label: string; value: number; tone: 'accent' | 'muted' | 'warn' }) {
  const colors = {
    accent: {
      bg: 'rgba(139, 92, 246, 0.12)',
      ring: 'rgba(139, 92, 246, 0.28)',
      fg: 'var(--lg-accent)',
    },
    muted: {
      bg: 'var(--lg-surface-2)',
      ring: 'var(--lg-divider)',
      fg: 'var(--lg-text-2)',
    },
    warn: {
      bg: 'rgba(251, 191, 36, 0.12)',
      ring: 'rgba(251, 191, 36, 0.28)',
      fg: '#FBBF24',
    },
  }[tone]
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
      style={{
        background: colors.bg,
        color: colors.fg,
        border: `1px solid ${colors.ring}`,
        fontFamily: 'var(--font-body)',
      }}
    >
      <span className="lg-mono">{value}</span>
      <span style={{ color: 'var(--lg-text-3)' }}>{label}</span>
    </span>
  )
}

function SuggestionSkeleton({ index }: { index: number }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: 'var(--lg-surface-1)',
        border: '1px solid var(--lg-divider)',
        minHeight: 190,
      }}
    >
      <span
        className="tp-shimmer inline-block mb-2"
        style={{ height: 10, width: 60, borderRadius: 3, animationDelay: `${index * 80}ms` }}
      />
      <div
        className="tp-shimmer mb-4"
        style={{ height: 24, width: '75%', borderRadius: 5, animationDelay: `${index * 80}ms` }}
      />
      <div
        className="tp-shimmer mb-3"
        style={{ height: 6, width: '100%', borderRadius: 9999, animationDelay: `${index * 80 + 40}ms` }}
      />
      <div
        className="tp-shimmer"
        style={{ height: 10, width: '90%', borderRadius: 3, animationDelay: `${index * 80 + 80}ms` }}
      />
    </div>
  )
}

function EmptySignal() {
  return (
    <div
      className="rounded-2xl p-8 text-center"
      style={{
        background: 'var(--lg-surface-1)',
        border: '1px solid var(--lg-divider)',
      }}
    >
      <div
        className="inline-flex items-center justify-center mx-auto mb-3 w-10 h-10 rounded-full"
        style={{
          background: 'rgba(139, 92, 246, 0.12)',
          color: 'var(--lg-accent)',
        }}
      >
        <Sparkles className="w-4 h-4" />
      </div>
      <h3
        className="lg-serif mb-1"
        style={{
          color: 'var(--lg-text-1)',
          fontSize: 22,
        }}
      >
        Ikke nok signal ennå
      </h3>
      <p
        className="text-[13px] max-w-sm mx-auto"
        style={{ color: 'var(--lg-text-2)', fontFamily: 'var(--font-body)' }}
      >
        Legg inn et par planlagte kontordager så finner jeg beste samlingsmuligheter.
        Prøv <span className="inline-flex items-center gap-1" style={{ color: 'var(--lg-accent)' }}>
          Åpne <ArrowUpRight className="w-3.5 h-3.5" />
        </span> for å skrive en statusoppdatering.
      </p>
    </div>
  )
}
