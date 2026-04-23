'use client'

import * as React from 'react'
import { OffiviewMark, type OffiviewMarkVariant } from './offiview-mark'

/**
 * Offiview wordmark — mark + "ffiview" in Manrope, one leading "O" replaced by the mark.
 *
 * The mark sits flush against "ffiview"; gap is proportional to size.
 * Letter-spacing is tight (-0.04em) to echo the brand HTML wordmark.
 */
export interface OffiviewWordmarkProps {
  /** Total pixel height of the wordmark. Mark size = height, text cap-height aligns. */
  size?: number
  variant?: OffiviewMarkVariant
  /** If true, hide the text — return just the mark (useful for icon slots). */
  markOnly?: boolean
  /** Optional accessible label. Default "Offiview". */
  title?: string
  className?: string
}

export function OffiviewWordmark({
  size = 28,
  variant = 'ink',
  markOnly = false,
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
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: `${gap}px`,
        lineHeight: 1,
      }}
      aria-label={title}
    >
      <OffiviewMark size={size} variant={variant} strokeWidth={6} />
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
