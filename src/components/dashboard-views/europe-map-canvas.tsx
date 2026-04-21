'use client'

import { motion } from 'framer-motion'
import { project, EUROPE_BOUNDS } from '@/lib/geo'
import { ease } from '@/lib/motion'
import { EUROPE_COUNTRY_PATHS } from '@/lib/europe-paths'

export const MAP_WIDTH = 1400
export const MAP_HEIGHT = 900

/**
 * Shared dark cosmic map canvas. Renders a subtle Mercator graticule and a
 * few "orbit" arcs radiating from Central Europe. Children are placed in
 * the same coordinate space (use the `project` helper from @/lib/geo).
 */
export function EuropeMapCanvas({ children }: { children: React.ReactNode }) {
  const latLines: number[] = []
  for (let lat = 40; lat <= 70; lat += 10) latLines.push(lat)
  const lngLines: number[] = []
  for (let lng = -10; lng <= 30; lng += 10) lngLines.push(lng)

  // Project four "key" corners to draw a faint bounding frame
  const tl = project(EUROPE_BOUNDS.latMax, EUROPE_BOUNDS.lngMin, MAP_WIDTH, MAP_HEIGHT)
  const br = project(EUROPE_BOUNDS.latMin, EUROPE_BOUNDS.lngMax, MAP_WIDTH, MAP_HEIGHT)

  // Centre (roughly) for orbit arcs
  const centre = project(55, 12, MAP_WIDTH, MAP_HEIGHT)

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full"
        style={{
          filter: 'drop-shadow(0 0 48px rgba(80,120,255,0.05))',
          overflow: 'hidden',
        }}
      >
        <defs>
          <radialGradient id="mapVignette" cx="50%" cy="50%" r="75%">
            <stop offset="0%"  stopColor="rgba(255,255,255,0)" />
            <stop offset="70%" stopColor="rgba(255,255,255,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
          </radialGradient>
          <radialGradient id="centreGlow" cx="50%" cy="50%" r="55%">
            <stop offset="0%"  stopColor="rgba(120,160,255,0.14)" />
            <stop offset="100%" stopColor="rgba(120,160,255,0)" />
          </radialGradient>
          <radialGradient id="oceanGrad" cx="50%" cy="50%" r="78%">
            <stop offset="0%"  stopColor="rgba(14,24,58,0.35)" />
            <stop offset="70%" stopColor="rgba(10,18,42,0.18)" />
            <stop offset="100%" stopColor="rgba(5,8,18,0)" />
          </radialGradient>
          <linearGradient id="countryFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="rgba(140,180,240,0.55)" />
            <stop offset="55%" stopColor="rgba(75,115,205,0.42)" />
            <stop offset="100%" stopColor="rgba(35,60,140,0.32)" />
          </linearGradient>
          <clipPath id="mapClip">
            <rect x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT} />
          </clipPath>
        </defs>

        {/* Ocean backdrop */}
        <rect x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#oceanGrad)" />

        {/* Ambient centre glow */}
        <circle
          cx={centre.x}
          cy={centre.y}
          r={560}
          fill="url(#centreGlow)"
        />

        {/* Country outlines */}
        <g clipPath="url(#mapClip)">
          {EUROPE_COUNTRY_PATHS.map((c, i) => (
            <motion.path
              key={c.name}
              d={c.d}
              fill="url(#countryFill)"
              stroke="rgba(200,225,255,0.80)"
              strokeWidth={1.3}
              strokeLinejoin="round"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: Math.min(i, 30) * 0.012, ease: ease.out }}
            />
          ))}
        </g>

        {/* Graticule — latitude lines */}
        <g stroke="rgba(255,255,255,0.035)" strokeWidth={1}>
          {latLines.map(lat => {
            const p1 = project(lat, EUROPE_BOUNDS.lngMin, MAP_WIDTH, MAP_HEIGHT)
            const p2 = project(lat, EUROPE_BOUNDS.lngMax, MAP_WIDTH, MAP_HEIGHT)
            return (
              <line
                key={`lat-${lat}`}
                x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                strokeDasharray="2 6"
              />
            )
          })}
          {lngLines.map(lng => {
            const p1 = project(EUROPE_BOUNDS.latMax, lng, MAP_WIDTH, MAP_HEIGHT)
            const p2 = project(EUROPE_BOUNDS.latMin, lng, MAP_WIDTH, MAP_HEIGHT)
            return (
              <line
                key={`lng-${lng}`}
                x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                strokeDasharray="2 6"
              />
            )
          })}
        </g>

        {/* Orbit arcs for depth */}
        <g fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={1}>
          {[300, 500, 720].map((r, i) => (
            <motion.circle
              key={r}
              cx={centre.x}
              cy={centre.y}
              r={r}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.2, delay: 0.15 + i * 0.12, ease: ease.out }}
            />
          ))}
        </g>

        {/* Soft vignette frame */}
        <rect
          x={tl.x} y={tl.y}
          width={br.x - tl.x} height={br.y - tl.y}
          fill="url(#mapVignette)"
          pointerEvents="none"
        />

        {/* User layer */}
        {children}
      </svg>
    </div>
  )
}
