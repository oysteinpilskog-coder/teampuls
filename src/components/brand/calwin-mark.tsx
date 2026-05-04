import * as React from 'react'

/**
 * CalWin mark — circle of varied-size dots matching the BrandBook §1
 * "logo symbol" (a process growing from beginning to end).
 *
 * 10 dots arranged on a circle; sizes alternate large→small around the
 * ring, mirroring the brandbook's visual rhythm. Colors alternate Blue
 * Violet (#322E7A) and Light Blue (#66C4EF). For a single-color
 * negative variant pass `monochrome`.
 *
 * Sizing is fixed by `size` (px). The viewBox is normalized to 100×100.
 */
export interface CalwinMarkProps {
  size?: number
  /** When set, all dots use `currentColor` instead of brand colors. */
  monochrome?: boolean
  /** Accessible label. If omitted, the mark is aria-hidden. */
  title?: string
  className?: string
}

// 10-dot ring. Each entry = (angle in degrees, radius in viewBox units).
// Radii vary slightly so dots aren't perfectly equidistant — matches the
// brandbook's organic feel where some dots sit closer to the center.
// Index 0 starts at top (12 o'clock), going clockwise.
const RING: ReadonlyArray<{ angle: number; r: number; size: number; useAccent: boolean }> = [
  { angle: -75,  r: 36, size: 11, useAccent: false }, // big dark — top
  { angle: -35,  r: 36, size:  6, useAccent: true  }, // small light
  { angle: -10,  r: 36, size:  4, useAccent: false }, // tiny dark
  { angle:  25,  r: 36, size:  9, useAccent: true  }, // big light — right
  { angle:  60,  r: 36, size:  6, useAccent: false }, // small dark
  { angle:  95,  r: 36, size:  9, useAccent: true  }, // big light — bottom-right
  { angle: 130,  r: 36, size: 10, useAccent: false }, // big dark — bottom
  { angle: 170,  r: 36, size:  8, useAccent: true  }, // medium light
  { angle: 210,  r: 36, size: 10, useAccent: false }, // big dark — bottom-left
  { angle: 250,  r: 36, size: 12, useAccent: true  }, // largest light — left
] as const

export function CalwinMark({
  size = 64,
  monochrome = false,
  title,
  className,
}: CalwinMarkProps) {
  const cx = 50
  const cy = 50
  const dark = monochrome ? 'currentColor' : '#322E7A'   // Blue Violet
  const light = monochrome ? 'currentColor' : '#66C4EF'  // Light Blue

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={className}
    >
      {title ? <title>{title}</title> : null}
      {RING.map((d, i) => {
        const rad = (d.angle * Math.PI) / 180
        const x = cx + d.r * Math.cos(rad)
        const y = cy + d.r * Math.sin(rad)
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={d.size / 2}
            fill={d.useAccent ? light : dark}
          />
        )
      })}
    </svg>
  )
}
