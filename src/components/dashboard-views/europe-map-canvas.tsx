'use client'

import { motion } from 'framer-motion'
import { project, EUROPE_BOUNDS } from '@/lib/geo'
import { MAP_WIDTH, MAP_HEIGHT } from '@/lib/europe-projection'
import { ease } from '@/lib/motion'
import { EUROPE_COUNTRY_PATHS } from '@/lib/europe-paths'
import { COUNTRY_LABELS } from '@/lib/country-labels'

export { MAP_WIDTH, MAP_HEIGHT }

interface EuropeMapCanvasProps {
  children: React.ReactNode
  /** Accent hue used for atmosphere and land highlights. Defaults to cool blue. */
  accent?: string
}

/**
 * Shared atmospheric map canvas. The container itself carries the deep-ocean
 * gradient and vignette so they always fill edge-to-edge, regardless of
 * aspect ratio. The inner SVG uses `xMidYMid meet` so Europe is never
 * cropped — the letterbox area naturally shows the ocean background.
 */
export function EuropeMapCanvas({
  children,
  accent = '#5E8CFF',
}: EuropeMapCanvasProps) {
  const latLines: number[] = []
  for (let lat = 40; lat <= 70; lat += 10) latLines.push(lat)
  const lngLines: number[] = []
  for (let lng = -10; lng <= 30; lng += 10) lngLines.push(lng)

  // Conic Conformal projects lat/lng lines as curves — sample each line at
  // multiple points and build an SVG polyline so they bend naturally.
  const SAMPLES = 32
  const latLineD = (lat: number) => {
    const pts: string[] = []
    for (let i = 0; i <= SAMPLES; i++) {
      const lng = EUROPE_BOUNDS.lngMin - 4 +
        (i / SAMPLES) * (EUROPE_BOUNDS.lngMax - EUROPE_BOUNDS.lngMin + 8)
      const p = project(lat, lng, MAP_WIDTH, MAP_HEIGHT)
      pts.push(`${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    }
    return pts.join('')
  }
  const lngLineD = (lng: number) => {
    const pts: string[] = []
    for (let i = 0; i <= SAMPLES; i++) {
      const lat = EUROPE_BOUNDS.latMin - 2 +
        (i / SAMPLES) * (EUROPE_BOUNDS.latMax - EUROPE_BOUNDS.latMin + 4)
      const p = project(lat, lng, MAP_WIDTH, MAP_HEIGHT)
      pts.push(`${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    }
    return pts.join('')
  }

  // Centre roughly on Nordic-Central Europe, where the company operates.
  const centre = project(58, 12, MAP_WIDTH, MAP_HEIGHT)

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{
        // Deep-space ocean — painted on the container so it fills every
        // pixel, even the letterbox strips the `meet` SVG leaves behind.
        background:
          'radial-gradient(ellipse 80% 75% at 50% 45%, ' +
          '#1a2e5a 0%, ' +
          '#0e1a38 42%, ' +
          '#070c1c 72%, ' +
          '#02040a 100%)',
      }}
    >
      {/* Ambient star field — separate SVG stretched to fill the container
          so stars are scattered across ocean, not clustered in the map box. */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 1000 600"
        preserveAspectRatio="none"
        aria-hidden
      >
        {STAR_FIELD.map((s, i) => (
          <motion.circle
            key={i}
            cx={s.x}
            cy={s.y}
            r={s.r}
            fill="white"
            opacity={s.o}
            initial={{ opacity: 0 }}
            animate={{ opacity: [s.o * 0.35, s.o, s.o * 0.35] }}
            transition={{
              duration: 4 + (i % 5),
              delay: (i % 9) * 0.3,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        ))}
      </svg>

      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 w-full h-full"
        style={{ display: 'block' }}
      >
        <defs>
          {/* Warm centre glow that feels like the atmosphere over Europe */}
          <radialGradient id="atmosphere" cx="50%" cy="50%" r="55%">
            <stop offset="0%"   stopColor={`${accent}2E`} />
            <stop offset="55%"  stopColor={`${accent}0A`} />
            <stop offset="100%" stopColor={`${accent}00`} />
          </radialGradient>

          {/* Land gradient — richer, more painterly than flat blue */}
          <linearGradient id="land" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%"   stopColor="rgba(188, 214, 250, 0.68)" />
            <stop offset="40%"  stopColor="rgba(124, 162, 228, 0.55)" />
            <stop offset="100%" stopColor="rgba(52, 82, 156, 0.42)" />
          </linearGradient>

          {/* Land sheen — top highlight that catches the "light" */}
          <linearGradient id="landSheen" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"  stopColor="rgba(255,255,255,0.22)" />
            <stop offset="45%" stopColor="rgba(255,255,255,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </linearGradient>

          {/* Soft drop-shadow filter for country silhouettes */}
          <filter id="landShadow" x="-5%" y="-5%" width="110%" height="115%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
            <feOffset dx="0" dy="5" result="offset" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.4" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ── Soft atmospheric glow centred over Europe ──────────── */}
        <circle cx={centre.x} cy={centre.y} r={620} fill="url(#atmosphere)" />

        {/* ── Graticule: latitude + longitude lines ──────────────── */}
        <g stroke="rgba(255,255,255,0.05)" strokeWidth={1} fill="none">
          {latLines.map(lat => (
            <path key={`lat-${lat}`} d={latLineD(lat)} strokeDasharray="1 7" />
          ))}
          {lngLines.map(lng => (
            <path key={`lng-${lng}`} d={lngLineD(lng)} strokeDasharray="1 7" />
          ))}
        </g>

        {/* ── Countries ──────────────────────────────────────────── */}
        <g filter="url(#landShadow)">
          {EUROPE_COUNTRY_PATHS.map((c, i) => (
            <motion.path
              key={c.name}
              d={c.d}
              fill="url(#land)"
              stroke="rgba(220,234,255,0.38)"
              strokeWidth={0.8}
              strokeLinejoin="round"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: Math.min(i, 30) * 0.01, ease: ease.out }}
            />
          ))}
        </g>

        {/* ── Land sheen (top light) ─────────────────────────────── */}
        <g opacity={0.7} style={{ mixBlendMode: 'screen', pointerEvents: 'none' }}>
          {EUROPE_COUNTRY_PATHS.map(c => (
            <path key={`sheen-${c.name}`} d={c.d} fill="url(#landSheen)" />
          ))}
        </g>

        {/* ── Country labels — quiet, atlas-like ──────────────────── */}
        <g style={{ pointerEvents: 'none' }}>
          {COUNTRY_LABELS.map((c, i) => {
            const p = project(c.lat, c.lng, MAP_WIDTH, MAP_HEIGHT)
            const rank = c.rank ?? 2
            const size = rank === 3 ? 14 : rank === 2 ? 11.5 : 10
            const opacity = rank === 3 ? 0.34 : rank === 2 ? 0.26 : 0.18
            const letterSpacing = rank === 3 ? 4.8 : rank === 2 ? 3.8 : 3.0
            return (
              <motion.text
                key={c.name}
                x={p.x}
                y={p.y}
                textAnchor="middle"
                fontSize={size}
                fontWeight={600}
                fontFamily="var(--font-body)"
                fill="white"
                opacity={0}
                animate={{ opacity }}
                transition={{
                  duration: 1.2,
                  delay: 0.9 + i * 0.04,
                  ease: ease.out,
                }}
                style={{ letterSpacing: `${letterSpacing}px` }}
              >
                {c.name}
              </motion.text>
            )
          })}
        </g>

        {/* ── User markers layer ─────────────────────────────────── */}
        {children}
      </svg>

      {/* CSS vignette — lives on the container so it always reaches the
          true edge, not the letterboxed viewBox edge. */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 82% 78% at 50% 50%, ' +
            'rgba(0,0,0,0) 55%, rgba(0,0,0,0.45) 85%, rgba(0,0,0,0.85) 100%)',
        }}
      />
    </div>
  )
}

// ── Stable pseudo-random star field ──────────────────────────────
// Generated once so re-renders don't shuffle dots. Coordinates are in a
// 1000×600 stretched viewBox — the container SVG uses
// preserveAspectRatio="none" so stars distribute across the full canvas.
const STAR_FIELD = (() => {
  const stars: Array<{ x: number; y: number; r: number; o: number }> = []
  let seed = 1337
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  for (let i = 0; i < 160; i++) {
    const x = rnd() * 1000
    const y = rnd() * 600
    const bright = rnd()
    stars.push({
      x,
      y,
      r: bright > 0.92 ? 1.1 : bright > 0.7 ? 0.7 : 0.4,
      o: 0.15 + rnd() * 0.35,
    })
  }
  return stars
})()
