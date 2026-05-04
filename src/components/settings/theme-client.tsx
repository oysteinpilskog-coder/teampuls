'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowUpRight, Check, Monitor, Sparkles } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useThemeVariant } from '@/components/theme-variant-provider'
import { CalwinMark } from '@/components/brand/calwin-mark'
import {
  getDashboardMode,
  setDashboardMode,
  type DashboardMode,
} from '@/lib/dashboard-mode'
import { spring } from '@/lib/motion'
import { THEMES, type ThemeId, type ThemeMeta } from '@/lib/themes'

export function ThemeClient() {
  const { variant, setVariant } = useThemeVariant()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [dashMode, setDashMode] = useState<DashboardMode>('standard')

  useEffect(() => {
    setMounted(true)
    setDashMode(getDashboardMode())
  }, [])

  function chooseDashboardMode(next: DashboardMode) {
    if (next === dashMode) return
    setDashMode(next)
    setDashboardMode(next)
    toast.success(
      next === 'brand'
        ? 'CalWin-merket dashboard er satt som standard'
        : 'Standard dashboard er gjenopprettet',
      {
        description:
          next === 'brand'
            ? '/dashboard åpner nå CalWin-versjonen'
            : '/dashboard viser den roterende versjonen som før',
      },
    )
  }

  function choose(id: ThemeId, meta: ThemeMeta) {
    if (id === variant) return
    setVariant(id)
    toast.success(`${meta.name} aktivert`, {
      description: meta.tagline,
    })
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1
            className="calwin-bar text-[24px] font-semibold flex items-center gap-2"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-fraunces)' }}
          >
            <Sparkles className="w-5 h-5" strokeWidth={1.5} style={{ color: 'var(--accent-color)' }} />
            Tema
          </h1>
          <p
            className="text-[14px] mt-0.5"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
          >
            Velg et premium uttrykk — endres umiddelbart for alle visninger
          </p>
        </div>
        {mounted && (
          <div
            className="flex rounded-xl p-1 shrink-0"
            style={{ backgroundColor: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}
          >
            {(['light', 'dark'] as const).map(m => {
              const active = resolvedTheme === m
              return (
                <button
                  key={m}
                  onClick={() => setTheme(m)}
                  className="relative px-3 py-1.5 text-[12px] font-medium transition-colors"
                  style={{
                    color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  {active && (
                    <motion.span
                      layoutId="mode-pill"
                      className="absolute inset-0 rounded-lg"
                      style={{
                        background: 'var(--bg-elevated)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px var(--border-subtle)',
                      }}
                      transition={spring.snappy}
                    />
                  )}
                  <span className="relative z-10">{m === 'light' ? 'Lys' : 'Mørk'}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {THEMES.map(meta => (
          <ThemeCard
            key={meta.id}
            meta={meta}
            selected={variant === meta.id}
            onSelect={() => choose(meta.id, meta)}
          />
        ))}
      </div>

      {/* CalWin BrandBook dashboard — opt-in alternative to /dashboard.
          The standard rotating dashboard is left untouched; this section
          lets the user pick which one /dashboard should open AND link
          straight to the brand variant for ad-hoc viewing. */}
      <div className="mt-10 pt-8 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="mb-5">
          <h2
            className="calwin-bar text-[18px] font-semibold flex items-center gap-2"
            style={{ color: 'var(--text-primary)' }}
          >
            <Monitor className="w-4 h-4" strokeWidth={1.5} style={{ color: 'var(--accent-color)' }} />
            Standard dashboard
          </h2>
          <p
            className="text-[13px] mt-1.5 max-w-xl"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Velg hva <code style={{ fontFamily: 'var(--font-body)' }}>/dashboard</code> skal åpne.
            Innstillingen lagres i en cookie i nettleseren.
          </p>
        </div>

        {/* Radio-style cards — large, obvious, side-by-side. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6" suppressHydrationWarning>
          <DashboardModeCard
            id="standard"
            title="Standard"
            description="Original mørk presentasjon — varm aurora, Nordlys-klokke, Offiview-signatur"
            active={dashMode === 'standard'}
            onSelect={() => chooseDashboardMode('standard')}
          />
          <DashboardModeCard
            id="brand"
            title="CalWin-merket"
            description="Samme rotasjon (Nå · Måned · Kontorer · Kunder · Hjul · Globe), men på Blue Violet canvas med prikkesirkel-logo og Light Blue accent"
            active={dashMode === 'brand'}
            onSelect={() => chooseDashboardMode('brand')}
          />
        </div>

        {/* Quick-link to the brand variant regardless of which is default. */}
        <Link
          href="/dashboard-brand"
          className="block rounded-2xl overflow-hidden transition-transform hover:-translate-y-0.5"
          style={{
            backgroundColor: '#1F1C52',
            color: '#EAEAE6',
            boxShadow: '0 12px 32px -16px rgba(31,28,82,0.5), 0 0 0 1px rgba(102,196,239,0.18)',
          }}
        >
          <div className="px-6 py-5 flex items-center justify-between gap-4 relative">
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'radial-gradient(circle at 92% 50%, rgba(102,196,239,0.16), transparent 45%)',
              }}
            />
            <div className="relative flex items-center gap-4 min-w-0">
              <CalwinMark size={48} title="CalWin" />
              <div className="min-w-0">
                <div className="text-[15px] font-semibold tracking-[-0.01em]">
                  Åpne CalWin-merket dashboard nå
                </div>
                <div className="text-[12px] mt-0.5" style={{ color: 'rgba(234,234,230,0.7)' }}>
                  Direkte forhåndsvisning — fungerer uavhengig av valget over
                </div>
              </div>
            </div>
            <ArrowUpRight
              className="relative w-5 h-5 flex-shrink-0"
              strokeWidth={1.5}
              style={{ color: '#66C4EF' }}
            />
          </div>
        </Link>
      </div>
    </div>
  )
}

function DashboardModeCard({
  id,
  title,
  description,
  active,
  onSelect,
}: {
  id: 'standard' | 'brand'
  title: string
  description: string
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      type="button"
      aria-pressed={active}
      className="text-left rounded-2xl p-4 transition-all focus-visible:outline-none"
      style={{
        backgroundColor: active ? 'var(--bg-elevated)' : 'var(--bg-subtle)',
        border: active
          ? '1.5px solid var(--accent-color)'
          : '1px solid var(--border-subtle)',
        boxShadow: active ? 'var(--shadow-md)' : 'none',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-[15px] font-semibold"
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
        </span>
        <span
          className="inline-flex items-center justify-center w-5 h-5 rounded-full"
          style={{
            backgroundColor: active ? 'var(--accent-color)' : 'transparent',
            border: active ? 'none' : '1.5px solid var(--border-strong)',
          }}
        >
          {active && (
            <Check
              className="w-3 h-3"
              strokeWidth={3}
              style={{ color: 'var(--accent-foreground)' }}
            />
          )}
        </span>
      </div>
      <p className="text-[12px] leading-snug" style={{ color: 'var(--text-tertiary)' }}>
        {description}
      </p>
      <div
        className="mt-2 text-[10.5px] uppercase tracking-[0.18em]"
        style={{ color: active ? 'var(--accent-color)' : 'var(--text-tertiary)' }}
      >
        Brukes på /dashboard
      </div>
    </button>
  )
}

function ThemeCard({
  meta,
  selected,
  onSelect,
}: {
  meta: ThemeMeta
  selected: boolean
  onSelect: () => void
}) {
  return (
    <motion.button
      onClick={onSelect}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
      transition={spring.snappy}
      className="group relative text-left rounded-2xl overflow-hidden focus-visible:outline-none"
      style={{
        backgroundColor: 'var(--bg-elevated)',
        border: selected
          ? '1.5px solid var(--accent-color)'
          : '1px solid var(--border-subtle)',
        boxShadow: selected
          ? '0 12px 32px color-mix(in oklab, var(--accent-color) 22%, transparent), 0 0 0 4px color-mix(in oklab, var(--accent-color) 14%, transparent)'
          : 'var(--shadow-sm)',
        transition: 'box-shadow 220ms ease, border-color 220ms ease',
      }}
      aria-pressed={selected}
    >
      {/* Preview surface */}
      <div
        className="relative h-36 overflow-hidden"
        style={{ background: meta.previewGradient }}
      >
        {/* Soft blobs */}
        <span
          className="absolute -top-6 -left-4 w-32 h-32 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(255,255,255,0.45), transparent 65%)',
            filter: 'blur(18px)',
          }}
        />
        <span
          className="absolute -bottom-10 -right-6 w-40 h-40 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(255,255,255,0.25), transparent 65%)',
            filter: 'blur(22px)',
          }}
        />
        {/* Gloss sheen */}
        <span
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0) 45%)',
            mixBlendMode: 'screen',
          }}
        />
        {/* Mini glass chip */}
        <div
          className="absolute bottom-3 left-3 right-3 rounded-xl px-3 py-2 flex items-center gap-2"
          style={{
            background: 'rgba(255,255,255,0.18)',
            border: '1px solid rgba(255,255,255,0.28)',
            backdropFilter: 'blur(14px) saturate(160%)',
            WebkitBackdropFilter: 'blur(14px) saturate(160%)',
            color: 'white',
            fontFamily: 'var(--font-body)',
          }}
        >
          <span
            className="w-2 h-2 rounded-full"
            style={{
              background: meta.accent,
              boxShadow: `0 0 8px ${meta.accent}`,
            }}
          />
          <span className="text-[11px] font-semibold tracking-wide uppercase">
            {meta.finish}
          </span>
          <span className="ml-auto text-[11px] opacity-80 font-mono">{meta.accent}</span>
        </div>

        {/* Selected badge */}
        {selected && (
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={spring.snappy}
            className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center"
            style={{
              background: 'var(--accent-color)',
              color: 'white',
              boxShadow: '0 4px 14px color-mix(in oklab, var(--accent-color) 40%, transparent)',
            }}
          >
            <Check className="w-4 h-4" strokeWidth={3} />
          </motion.div>
        )}
      </div>

      {/* Meta */}
      <div className="px-4 py-3">
        <div
          className="text-[15px] font-semibold"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-fraunces)' }}
        >
          {meta.name}
        </div>
        <div
          className="text-[12.5px] mt-0.5"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
        >
          {meta.tagline}
        </div>
      </div>
    </motion.button>
  )
}
