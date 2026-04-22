'use client'

import { motion } from 'framer-motion'
import { spring } from '@/lib/motion'

interface EmptyStateProps {
  /** Optional SVG or icon element; rendered inside a soft gradient-glow disc. */
  icon?: React.ReactNode
  title: string
  description?: React.ReactNode
  /** Optional primary call-to-action area (buttons, links). */
  action?: React.ReactNode
  /** Optional accent colour for the glow disc; defaults to the app accent. */
  tone?: string
  /** Smaller padding + type for inline use. */
  compact?: boolean
}

export function EmptyState({ icon, title, description, action, tone, compact }: EmptyStateProps) {
  const accent = tone ?? 'var(--accent-color)'
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.gentle}
      className={`relative mx-auto text-center ${compact ? 'py-8' : 'py-14'}`}
      style={{ maxWidth: compact ? 360 : 520 }}
    >
      {/* Soft radial halo so the block feels like a focal point, not dead space */}
      <motion.div
        aria-hidden
        className="absolute left-1/2 -translate-x-1/2 rounded-full pointer-events-none"
        style={{
          top: compact ? 4 : 8,
          width: compact ? 180 : 240,
          height: compact ? 180 : 240,
          background: `radial-gradient(closest-side, color-mix(in oklab, ${accent} 25%, transparent), transparent 70%)`,
          filter: 'blur(22px)',
        }}
        animate={{ opacity: [0.55, 0.85, 0.55] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      />

      {icon && (
        <div
          className="relative mx-auto mb-5 flex items-center justify-center rounded-full"
          style={{
            width: compact ? 56 : 72,
            height: compact ? 56 : 72,
            background: `linear-gradient(155deg,
              color-mix(in oklab, ${accent} 18%, var(--bg-elevated)) 0%,
              var(--bg-elevated) 60%,
              color-mix(in oklab, ${accent} 8%, var(--bg-elevated)) 100%)`,
            boxShadow: `
              0 20px 40px -16px color-mix(in oklab, ${accent} 38%, transparent),
              0 2px 6px rgba(0,0,0,0.06),
              inset 0 1px 0 rgba(255,255,255,0.6),
              inset 0 0 0 1px color-mix(in oklab, ${accent} 14%, transparent)`,
            color: accent,
          }}
        >
          {icon}
        </div>
      )}

      <h2
        className="font-bold"
        style={{
          fontFamily: 'var(--font-sora)',
          color: 'var(--text-primary)',
          fontSize: compact ? 18 : 22,
          letterSpacing: '-0.028em',
          lineHeight: 1.15,
        }}
      >
        {title}
      </h2>

      {description && (
        <p
          className="mt-2"
          style={{
            fontFamily: 'var(--font-body)',
            color: 'var(--text-secondary)',
            fontSize: compact ? 13 : 14,
            lineHeight: 1.55,
            letterSpacing: '-0.005em',
          }}
        >
          {description}
        </p>
      )}

      {action && <div className="mt-5 flex items-center justify-center gap-2">{action}</div>}
    </motion.div>
  )
}
