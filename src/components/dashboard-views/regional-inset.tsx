'use client'

import { motion } from 'framer-motion'
import { CustomerPin, type CustomerPinState } from './customer-pin'
import { US_COUNTRY_PATHS } from '@/lib/us-paths'
import { US_MAP_WIDTH, US_MAP_HEIGHT, projectUs } from '@/lib/us-projection'
import { useStatusColors, useAuroraColors } from '@/lib/status-colors/context'
import { spring, ease } from '@/lib/motion'

export interface InsetPoint {
  id: string
  lat: number
  lng: number
  display: string
  state: CustomerPinState
  visitCount: number
}

interface RegionalInsetProps {
  /** Tag shown above the title — e.g. "INSET" or "REGIONAL". */
  kicker?: string
  /** Region name displayed inside the card — e.g. "USA". */
  title: string
  points: InsetPoint[]
  /** Optional staggered reveal — keep in sync with the parent header. */
  delay?: number
}

/**
 * Compact regional map card that floats over the main Europe canvas.
 * Uses the same atmospheric DNA (deep-ocean radial, nordlys glow ring,
 * land sheen) as <EuropeMapCanvas> so the inset reads as a sibling rather
 * than a tacked-on widget. Pins reuse <CustomerPin> verbatim — one pin
 * vocabulary across the whole dashboard.
 *
 * Currently hardcoded to USA. Designed to grow into a generic regional
 * inset (e.g. Asia, South America) by accepting projection + paths as
 * props once we have a second region in production.
 */
export function RegionalInset({ kicker, title, points, delay = 0 }: RegionalInsetProps) {
  const STATUS_COLORS = useStatusColors()
  const auroras = useAuroraColors()
  const customerColor = STATUS_COLORS.customer.icon

  const projected = points
    .map(p => {
      const xy = projectUs(p.lat, p.lng)
      if (!xy) return null
      return { ...p, x: xy.x, y: xy.y }
    })
    .filter((p): p is InsetPoint & { x: number; y: number } => p !== null)

  // Sort idle → week → today so lit pins float on top of dim ones when
  // coords collide (e.g. multiple customers in the NYC area).
  const rank: Record<CustomerPinState, number> = { idle: 0, week: 1, today: 2 }
  const sorted = projected.slice().sort((a, b) => rank[a.state] - rank[b.state])

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...spring.gentle, delay }}
      className="relative rounded-2xl overflow-hidden pointer-events-none"
      style={{
        width: 280,
        background:
          'radial-gradient(ellipse at 50% 45%, rgba(255,120,40,0.10) 0%, rgba(5,5,7,0) 70%)',
        border: '1px solid rgba(255,255,255,0.10)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.07), 0 24px 56px -28px rgba(0,0,0,0.7)',
      }}
    >
      {/* ── Title strip ─────────────────────────────────────────────── */}
      <div className="px-3 pt-2.5 pb-1.5 flex items-baseline justify-between relative">
        <div className="flex items-baseline gap-1.5">
          {kicker && (
            <span
              className="text-[8.5px] uppercase tracking-[0.22em]"
              style={{
                color: 'rgba(255,255,255,0.32)',
                fontFamily: 'var(--font-body)',
              }}
            >
              {kicker}
            </span>
          )}
          <span
            className="text-[12px] font-semibold tracking-tight"
            style={{
              color: 'rgba(255,255,255,0.85)',
              fontFamily: 'var(--font-fraunces)',
              letterSpacing: '-0.01em',
            }}
          >
            {title}
          </span>
        </div>
        <span
          className="text-[10px] tabular-nums"
          style={{
            color: customerColor,
            fontFamily: 'var(--font-fraunces)',
            fontWeight: 600,
            opacity: sorted.length === 0 ? 0.35 : 0.85,
          }}
        >
          {sorted.length}
        </span>
      </div>

      {/* ── Atmospheric canvas ──────────────────────────────────────── */}
      <div
        className="relative"
        style={{
          height: US_MAP_HEIGHT * (280 / US_MAP_WIDTH),
          background:
            'radial-gradient(ellipse 80% 75% at 50% 45%, ' +
            '#1a2e5a 0%, ' +
            '#0e1a38 42%, ' +
            '#070c1c 72%, ' +
            '#02040a 100%)',
        }}
      >
        <svg
          viewBox={`0 0 ${US_MAP_WIDTH} ${US_MAP_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 w-full h-full"
          style={{ display: 'block' }}
        >
          <defs>
            {/* Same warm atmosphere accent as main canvas — subtler radius
             *  because the inset is much smaller. */}
            <radialGradient id="us-atmosphere" cx="50%" cy="50%" r="60%">
              <stop offset="0%"   stopColor="#FF8A3D2A" />
              <stop offset="55%"  stopColor="#FF8A3D08" />
              <stop offset="100%" stopColor="#FF8A3D00" />
            </radialGradient>

            <linearGradient id="us-land" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%"   stopColor="rgba(188, 214, 250, 0.7)" />
              <stop offset="40%"  stopColor="rgba(124, 162, 228, 0.55)" />
              <stop offset="100%" stopColor="rgba(52, 82, 156, 0.42)" />
            </linearGradient>

            <linearGradient id="us-landSheen" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%"  stopColor="rgba(255,255,255,0.22)" />
              <stop offset="45%" stopColor="rgba(255,255,255,0)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </linearGradient>

            <filter id="us-landShadow" x="-5%" y="-5%" width="110%" height="115%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="1.6" />
              <feOffset dx="0" dy="2" result="offset" />
              <feComponentTransfer>
                <feFuncA type="linear" slope="0.45" />
              </feComponentTransfer>
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Atmosphere wash */}
          <circle cx={US_MAP_WIDTH / 2} cy={US_MAP_HEIGHT / 2} r={170} fill="url(#us-atmosphere)" />

          {/* Country outline */}
          <g filter="url(#us-landShadow)">
            {US_COUNTRY_PATHS.map((c, i) => (
              <motion.path
                key={c.name}
                d={c.d}
                fill="url(#us-land)"
                stroke="rgba(220,234,255,0.42)"
                strokeWidth={0.5}
                strokeLinejoin="round"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: delay + 0.1 + i * 0.05, ease: ease.out }}
              />
            ))}
          </g>

          {/* Sheen */}
          <g opacity={0.7} style={{ mixBlendMode: 'screen', pointerEvents: 'none' }}>
            {US_COUNTRY_PATHS.map(c => (
              <path key={`sheen-${c.name}`} d={c.d} fill="url(#us-landSheen)" />
            ))}
          </g>

          {/* Pins */}
          {sorted.map((p, i) => (
            <motion.g
              key={`pin-${p.id}`}
              transform={`translate(${p.x} ${p.y})`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: delay + 0.35 + i * 0.05 }}
            >
              <CustomerPin
                color={customerColor}
                auroraCompanion={auroras.customer}
                index={i + 100}
                state={p.state}
              />
            </motion.g>
          ))}

          {/* Labels — quiet captions under each pin so the inset reads
           *  immediately. Only shown when ≤3 pins to avoid clutter at
           *  this size; clusters fall back to side-list disclosure. */}
          {sorted.length > 0 && sorted.length <= 3 &&
            sorted.map((p, i) => (
              <motion.text
                key={`lbl-${p.id}`}
                x={p.x}
                y={p.y + 14}
                textAnchor="middle"
                fontSize={8.5}
                fontWeight={600}
                fontFamily="var(--font-body)"
                fill="rgba(255,255,255,0.78)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: delay + 0.55 + i * 0.05 }}
                style={{ letterSpacing: '0.02em' }}
              >
                {p.display}
              </motion.text>
            ))}

          {sorted.length === 0 && (
            <text
              x={US_MAP_WIDTH / 2}
              y={US_MAP_HEIGHT / 2}
              textAnchor="middle"
              fontSize={9}
              fontFamily="var(--font-body)"
              fill="rgba(255,255,255,0.32)"
              style={{ letterSpacing: '0.08em' }}
            >
              —
            </text>
          )}
        </svg>

        {/* Vignette */}
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
    </motion.div>
  )
}
