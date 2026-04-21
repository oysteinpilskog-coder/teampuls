'use client'

import { motion } from 'framer-motion'
import { project, EUROPE_BOUNDS } from '@/lib/geo'
import { ease } from '@/lib/motion'
import { EUROPE_COUNTRY_PATHS } from '@/lib/europe-paths'

export const MAP_WIDTH = 1400
export const MAP_HEIGHT = 900

interface EuropeMapCanvasProps {
  children: React.ReactNode
  /** Accent hue used for atmosphere and land highlights. Defaults to cool blue. */
  accent?: string
}

/**
 * Shared atmospheric map canvas. Designed to feel like a polished globe
 * viewport — layered ocean, tonal land, subtle graticule, dusty stars and
 * a soft vignette. Children render in the same 1400×900 coordinate space
 * via the `project` helper from @/lib/geo.
 */
export function EuropeMapCanvas({
  children,
  accent = '#5E8CFF',
}: EuropeMapCanvasProps) {
  const latLines: number[] = []
  for (let lat = 40; lat <= 70; lat += 10) latLines.push(lat)
  const lngLines: number[] = []
  for (let lng = -10; lng <= 30; lng += 10) lngLines.push(lng)

  // Centre roughly on Nordic-Central Europe, where the company operates.
  const centre = project(58, 12, MAP_WIDTH, MAP_HEIGHT)

  // Deterministic-ish "stars" for depth. Positions are stable across renders.
  const stars = STAR_FIELD

  return (
    <div className="relative w-full h-full overflow-hidden">
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full"
        style={{ display: 'block' }}
      >
        <defs>
          {/* Deep atmospheric ocean — cool teal-indigo from horizon to void */}
          <radialGradient id="ocean" cx="50%" cy="45%" r="80%">
            <stop offset="0%"   stopColor="rgba(24, 46, 92, 0.55)" />
            <stop offset="45%"  stopColor="rgba(14, 26, 56, 0.42)" />
            <stop offset="75%"  stopColor="rgba(7, 12, 28, 0.35)" />
            <stop offset="100%" stopColor="rgba(2, 4, 10, 0.5)" />
          </radialGradient>

          {/* Warm centre glow that feels like the atmosphere over Europe */}
          <radialGradient id="atmosphere" cx="50%" cy="50%" r="55%">
            <stop offset="0%"   stopColor={`${accent}26`} />
            <stop offset="60%"  stopColor={`${accent}00`} />
            <stop offset="100%" stopColor={`${accent}00`} />
          </radialGradient>

          {/* Land gradient — richer, more painterly than flat blue */}
          <linearGradient id="land" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%"   stopColor="rgba(168, 198, 240, 0.58)" />
            <stop offset="40%"  stopColor="rgba(110, 150, 220, 0.50)" />
            <stop offset="100%" stopColor="rgba(42, 68, 140, 0.38)" />
          </linearGradient>

          {/* Land sheen — top highlight that catches the "light" */}
          <linearGradient id="landSheen" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"  stopColor="rgba(255,255,255,0.18)" />
            <stop offset="45%" stopColor="rgba(255,255,255,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </linearGradient>

          {/* Vignette — radial fade to dark edges with no visible rectangle */}
          <radialGradient id="vignette" cx="50%" cy="50%" r="72%">
            <stop offset="0%"   stopColor="rgba(0,0,0,0)" />
            <stop offset="65%"  stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.78)" />
          </radialGradient>

          {/* Soft drop-shadow filter for country silhouettes */}
          <filter id="landShadow" x="-5%" y="-5%" width="110%" height="115%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
            <feOffset dx="0" dy="4" result="offset" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.35" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ── Deep space + ocean ─────────────────────────────────── */}
        <rect x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#ocean)" />

        {/* ── Soft atmospheric glow centred over Europe ──────────── */}
        <circle cx={centre.x} cy={centre.y} r={620} fill="url(#atmosphere)" />

        {/* ── Stars / dust for depth ─────────────────────────────── */}
        <g>
          {stars.map((s, i) => (
            <motion.circle
              key={i}
              cx={s.x}
              cy={s.y}
              r={s.r}
              fill="white"
              opacity={s.o}
              initial={{ opacity: 0 }}
              animate={{ opacity: [s.o * 0.4, s.o, s.o * 0.4] }}
              transition={{
                duration: 4 + (i % 5),
                delay: (i % 9) * 0.3,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          ))}
        </g>

        {/* ── Graticule: latitude + longitude lines ──────────────── */}
        <g stroke="rgba(255,255,255,0.045)" strokeWidth={1} fill="none">
          {latLines.map(lat => {
            const p1 = project(lat, EUROPE_BOUNDS.lngMin - 4, MAP_WIDTH, MAP_HEIGHT)
            const p2 = project(lat, EUROPE_BOUNDS.lngMax + 4, MAP_WIDTH, MAP_HEIGHT)
            return (
              <line
                key={`lat-${lat}`}
                x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                strokeDasharray="1 7"
              />
            )
          })}
          {lngLines.map(lng => {
            const p1 = project(EUROPE_BOUNDS.latMax + 2, lng, MAP_WIDTH, MAP_HEIGHT)
            const p2 = project(EUROPE_BOUNDS.latMin - 2, lng, MAP_WIDTH, MAP_HEIGHT)
            return (
              <line
                key={`lng-${lng}`}
                x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                strokeDasharray="1 7"
              />
            )
          })}
        </g>

        {/* ── Countries ──────────────────────────────────────────── */}
        <g filter="url(#landShadow)">
          {EUROPE_COUNTRY_PATHS.map((c, i) => (
            <motion.path
              key={c.name}
              d={c.d}
              fill="url(#land)"
              stroke="rgba(210,228,255,0.32)"
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

        {/* ── User markers layer ─────────────────────────────────── */}
        {children}

        {/* ── Radial vignette (edges only, no rectangle) ─────────── */}
        <rect
          x="0" y="0"
          width={MAP_WIDTH} height={MAP_HEIGHT}
          fill="url(#vignette)"
          pointerEvents="none"
        />
      </svg>
    </div>
  )
}

// ── Stable pseudo-random star field ──────────────────────────────
// Generated once so re-renders don't shuffle dots. Mix of sizes/opacities.
const STAR_FIELD = (() => {
  const stars: Array<{ x: number; y: number; r: number; o: number }> = []
  // Use a small LCG so the field is deterministic.
  let seed = 1337
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  for (let i = 0; i < 140; i++) {
    const x = rnd() * MAP_WIDTH
    const y = rnd() * MAP_HEIGHT
    const bright = rnd()
    stars.push({
      x,
      y,
      r: bright > 0.92 ? 1.4 : bright > 0.7 ? 0.9 : 0.5,
      o: 0.15 + rnd() * 0.35,
    })
  }
  return stars
})()
