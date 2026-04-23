'use client'

import * as React from 'react'
import { OffiviewMark, type OffiviewMarkVariant } from './offiview-mark'

/**
 * Offiview wordmark — mark + "ffiview" in Manrope, one leading "O" replaced by the mark.
 *
 * The mark sits flush against "ffiview"; gap is proportional to size.
 * Letter-spacing is tight (-0.04em) to echo the brand HTML wordmark.
 *
 * `hoverShimmer` enables a brief Ember pulse on the horizon when the user
 * hovers the wordmark — 600ms, Glød-family only (NOT Nordlys — that would
 * break "én gang per flate" for the shared header chrome). Used by the
 * AppHeader's animated wordmark in its settled state so the logo feels
 * alive without becoming the page's signature beat.
 */
export interface OffiviewWordmarkProps {
  /** Total pixel height of the wordmark. Mark size = height, text cap-height aligns. */
  size?: number
  variant?: OffiviewMarkVariant
  /** If true, hide the text — return just the mark (useful for icon slots). */
  markOnly?: boolean
  /** If true, hovering the wordmark briefly pulses the horizon in Ember. */
  hoverShimmer?: boolean
  /** Optional accessible label. Default "Offiview". */
  title?: string
  className?: string
}

export function OffiviewWordmark({
  size = 28,
  variant = 'ink',
  markOnly = false,
  hoverShimmer = false,
  title = 'Offiview',
  className,
}: OffiviewWordmarkProps) {
  // Gap between mark and wordmark text — HTML uses 14px gap at 96px wordmark
  // ≈ 0.146 of size. Tighten slightly for smaller sizes.
  const gap = Math.max(3, Math.round(size * 0.12))

  // Only Nordlys hard-bakes its own palette. Other variants inherit
  // `currentColor` so themes and dark-mode flip automatically.
  const textColor = variant === 'nordlys' ? '#F5EFE4' : 'currentColor'

  return (
    <span
      className={
        className
          ? `${className}${hoverShimmer ? ' offiview-shimmer-host' : ''}`
          : hoverShimmer
            ? 'offiview-shimmer-host'
            : undefined
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: `${gap}px`,
        lineHeight: 1,
      }}
      aria-label={title}
    >
      {hoverShimmer ? (
        <ShimmerMark size={size} variant={variant} />
      ) : (
        <OffiviewMark size={size} variant={variant} strokeWidth={6} />
      )}
      {markOnly ? null : (
        <span
          aria-hidden
          style={{
            fontFamily: 'var(--font-manrope), system-ui, sans-serif',
            fontWeight: 300,
            fontSize: `${size}px`,
            letterSpacing: '-0.04em',
            color: textColor,
            // Optical alignment: shift text up a hair so Manrope x-height
            // sits on the horizon line of the mark.
            transform: 'translateY(0.02em)',
            whiteSpace: 'nowrap',
          }}
        >
          ffiview
        </span>
      )}
    </span>
  )
}

/**
 * Internal mark with a hover-triggered Ember pulse overlay on the horizon.
 *
 * Geometry is byte-for-byte identical to `OffiviewMark` (r=47, horizon from
 * x=15 to x=85 at y=62, stroke-width 6) so switching between the two is
 * visually invisible. The pulse overlay is a second `<line>` with an Ember→
 * glow gradient, driven by CSS keyframes in globals.css that only fire when
 * the host span (`.offiview-shimmer-host`) is hovered.
 *
 * Nordlys variant doesn't get a hover effect — it's already maxed-out, and
 * the Ember shimmer would read as a competing gradient on top of a gradient.
 */
function ShimmerMark({
  size,
  variant,
}: {
  size: number
  variant: OffiviewMarkVariant
}) {
  const uid = React.useId()
  const gradId = `offiview-hover-ember-${uid}`
  const glowFilterId = `offiview-hover-glow-${uid}`

  // Reuse the same stroke conventions as OffiviewMark so the mark reads
  // identical outside the hover pulse.
  const ringStroke = variant === 'nordlys' ? '#F5EFE4' : 'currentColor'
  const baseHorizonStroke =
    variant === 'nordlys' || variant === 'ember' ? 'currentColor' : 'currentColor'

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#B45309" />
          <stop offset="55%" stopColor="#D97706" />
          <stop offset="100%" stopColor="#FBBF24" />
        </linearGradient>
        <filter id={glowFilterId} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Ring — static, matches OffiviewMark */}
      <circle
        cx="50"
        cy="50"
        r="47"
        fill="none"
        stroke={ringStroke}
        strokeWidth={6}
      />

      {/* Base horizon — always visible, currentColor */}
      <line
        x1={15}
        y1={62}
        x2={85}
        y2={62}
        stroke={baseHorizonStroke}
        strokeWidth={6}
        strokeLinecap="round"
      />

      {/* Ember shimmer overlay — opacity 0 at rest, animated on host :hover.
          Variant=nordlys skips the shimmer (its own horizon is already
          gradient-loaded; adding Ember on top reads as conflict). */}
      {variant !== 'nordlys' && (
        <line
          className="offiview-shimmer-horizon"
          x1={15}
          y1={62}
          x2={85}
          y2={62}
          stroke={`url(#${gradId})`}
          strokeWidth={6}
          strokeLinecap="round"
          filter={`url(#${glowFilterId})`}
          style={{ opacity: 0 }}
        />
      )}
    </svg>
  )
}
