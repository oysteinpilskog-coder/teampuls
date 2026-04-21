'use client'

import { motion } from 'framer-motion'
import { Check, Sparkles } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useThemeVariant } from '@/components/theme-variant-provider'
import { spring } from '@/lib/motion'
import { THEMES, type ThemeId, type ThemeMeta } from '@/lib/themes'

export function ThemeClient() {
  const { variant, setVariant } = useThemeVariant()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

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
            className="text-[24px] font-semibold flex items-center gap-2"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sora)' }}
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
    </div>
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
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sora)' }}
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
