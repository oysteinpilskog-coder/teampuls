'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'
import { Sparkles, RefreshCw, ArrowUpRight } from 'lucide-react'
import { spring } from '@/lib/motion'
import { useHaptic } from '@/hooks/use-haptic'

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
          <div
            className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] mb-1.5"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
          >
            <Sparkles className="w-3 h-3" style={{ color: 'var(--accent-color)' }} />
            AI-anbefalt · neste 2 uker
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
            Samlingsdager
          </h2>
        </div>
        <button
          type="button"
          onClick={() => { haptic('light'); load() }}
          disabled={refreshing}
          aria-label="Oppdater forslag"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] disabled:opacity-60"
          style={{
            background: 'color-mix(in oklab, var(--bg-elevated) 70%, transparent)',
            backdropFilter: 'blur(14px) saturate(180%)',
            WebkitBackdropFilter: 'blur(14px) saturate(180%)',
            border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-body)',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
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
        background: isTop
          ? 'linear-gradient(170deg, color-mix(in oklab, var(--accent-color) 14%, var(--bg-elevated)) 0%, var(--bg-elevated) 70%)'
          : 'color-mix(in oklab, var(--bg-elevated) 92%, transparent)',
        backdropFilter: 'blur(22px) saturate(180%)',
        WebkitBackdropFilter: 'blur(22px) saturate(180%)',
        border: isTop
          ? '1px solid color-mix(in oklab, var(--accent-color) 35%, transparent)'
          : '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
        boxShadow: isTop
          ? '0 24px 48px -16px color-mix(in oklab, var(--accent-color) 32%, transparent), 0 8px 16px -12px rgba(10,20,40,0.14), inset 0 1px 0 rgba(255,255,255,0.5)'
          : '0 10px 24px -16px rgba(10,20,40,0.14), 0 1px 2px rgba(10,20,40,0.04), inset 0 1px 0 rgba(255,255,255,0.45)',
      }}
    >
      {isTop && (
        <div
          className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-[0.12em]"
          style={{
            background: 'linear-gradient(135deg, var(--accent-color), color-mix(in oklab, var(--accent-color) 70%, black))',
            color: '#ffffff',
            boxShadow: '0 4px 10px color-mix(in oklab, var(--accent-color) 35%, transparent)',
          }}
        >
          <Sparkles className="w-2.5 h-2.5" />
          Sterkeste
        </div>
      )}

      <div
        className="text-[10px] font-bold uppercase tracking-[0.22em] mb-1"
        style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
      >
        {new Date(day.date).toLocaleDateString('nb-NO', { weekday: 'short' }).replace('.', '')}
      </div>
      <div
        className="font-bold leading-none mb-3"
        style={{
          fontFamily: 'var(--font-sora)',
          color: 'var(--text-primary)',
          fontSize: 'clamp(22px, 2.6vw, 28px)',
          letterSpacing: '-0.03em',
        }}
      >
        {day.label}
      </div>

      {/* Score bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
          >
            Score
          </span>
          <span
            className="text-[13px] font-bold tabular-nums"
            style={{
              color: isTop ? 'var(--accent-color)' : 'var(--text-primary)',
              fontFamily: 'var(--font-sora)',
              letterSpacing: '-0.02em',
            }}
          >
            {day.score}
          </span>
        </div>
        <div
          className="relative h-1.5 rounded-full overflow-hidden"
          style={{ background: 'color-mix(in oklab, var(--bg-subtle) 80%, transparent)' }}
        >
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${day.score}%` }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.15 + index * 0.06 }}
            className="h-full rounded-full"
            style={{
              background: 'linear-gradient(90deg, var(--accent-color), color-mix(in oklab, var(--accent-color) 70%, #8b3fe6))',
              boxShadow: '0 0 10px color-mix(in oklab, var(--accent-color) 45%, transparent)',
            }}
          />
        </div>
      </div>

      {/* Reason */}
      <p
        className="text-[13px] leading-relaxed"
        style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', letterSpacing: '-0.005em' }}
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
      bg: 'color-mix(in oklab, var(--accent-color) 14%, transparent)',
      ring: 'color-mix(in oklab, var(--accent-color) 25%, transparent)',
      fg: 'var(--accent-color)',
    },
    muted: {
      bg: 'color-mix(in oklab, var(--text-tertiary) 14%, transparent)',
      ring: 'color-mix(in oklab, var(--text-tertiary) 22%, transparent)',
      fg: 'var(--text-secondary)',
    },
    warn: {
      bg: 'color-mix(in oklab, #F59E0B 14%, transparent)',
      ring: 'color-mix(in oklab, #F59E0B 22%, transparent)',
      fg: '#B45309',
    },
  }[tone]
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{
        background: colors.bg,
        color: colors.fg,
        border: `1px solid ${colors.ring}`,
        fontFamily: 'var(--font-body)',
      }}
    >
      <span className="tabular-nums">{value}</span>
      <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
    </span>
  )
}

function SuggestionSkeleton({ index }: { index: number }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: 'color-mix(in oklab, var(--bg-elevated) 88%, transparent)',
        border: '1px solid color-mix(in oklab, var(--border-subtle) 45%, transparent)',
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
        background: 'color-mix(in oklab, var(--bg-elevated) 92%, transparent)',
        backdropFilter: 'blur(14px) saturate(180%)',
        WebkitBackdropFilter: 'blur(14px) saturate(180%)',
        border: '1px solid color-mix(in oklab, var(--border-subtle) 55%, transparent)',
      }}
    >
      <div className="inline-flex items-center justify-center mx-auto mb-3 w-10 h-10 rounded-full"
        style={{
          background: 'color-mix(in oklab, var(--accent-color) 12%, transparent)',
          color: 'var(--accent-color)',
        }}
      >
        <Sparkles className="w-4 h-4" />
      </div>
      <h3
        className="font-bold mb-1"
        style={{
          fontFamily: 'var(--font-sora)',
          color: 'var(--text-primary)',
          fontSize: 17,
          letterSpacing: '-0.02em',
        }}
      >
        Ikke nok signal ennå
      </h3>
      <p
        className="text-[13.5px] max-w-sm mx-auto"
        style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
      >
        Legg inn et par planlagte kontordager så finner jeg beste samlingsmuligheter.
        Prøv <span className="inline-flex items-center gap-1" style={{ color: 'var(--accent-color)' }}>
          Åpne <ArrowUpRight className="w-3.5 h-3.5" />
        </span> for å skrive en statusoppdatering.
      </p>
    </div>
  )
}
