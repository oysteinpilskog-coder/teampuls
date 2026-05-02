'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { geoOrthographic, geoPath, geoGraticule10 } from 'd3-geo'

/**
 * Single office input to the globe. `id` survives across rotations so the
 * parent can correlate labels with `activeId` in the callback.
 */
export interface GlobePoint {
  id: string
  lat: number
  lng: number
  city: string
}

/**
 * Snapshot of one office after orthographic projection. `visible` reflects
 * whether the great-circle distance from the camera tangent point is < 90°
 * — d3-geo returns `null` for hidden points but we still want stable refs
 * for fade-out animations. `x/y` are SVG-coordinate pixels in the canvas
 * viewBox; consumers can transform overlays directly with these.
 */
export interface ProjectedPoint extends GlobePoint {
  visible: boolean
  x: number
  y: number
  /** 0 (limb) → 1 (centre). Drives label opacity so dots near the edge
   *  fade out gracefully instead of clipping mid-glyph. */
  prominence: number
}

interface GlobeCanvasProps {
  /** All offices to plot. Empty array → globe still renders, just no dots. */
  offices: GlobePoint[]
  /** Render-prop fired every animation frame. Receives projected points
   *  and the currently-focused office id (the one we're flying toward or
   *  holding on). Parents draw their own labels/UI on top. */
  children: (ctx: {
    points: ProjectedPoint[]
    activeId: string | null
    /** Globe centre in SVG coords — used by parents to anchor side labels. */
    centre: { x: number; y: number }
    /** Globe radius in SVG coords. */
    radius: number
  }) => React.ReactNode
}

// Canvas frame matches the other dashboard maps so chrome layout is shared.
const W = 1400
const H = 900
const CX = W / 2
// Slightly above-centre — lets the city tickers in the footer breathe
// without crowding the southern hemisphere.
const CY = H / 2 - 18
const R = 380

// Per-office hold time once we land on it, in ms. With ~5 offices and a
// 2.4s flight between them this gives ~6.4s/office × 5 = 32s for one full
// world tour, which matches the 30s default dwell in dashboard-defaults
// closely enough that a single rotation roughly fills one view tick.
const HOLD_MS = 4_000
const FLIGHT_MS = 2_400

// Idle drift speed when there are no offices to fly to (degrees per ms).
// 0.012°/ms ≈ 4.3°/s — slow enough to feel ambient, fast enough that the
// rotation is visibly alive on a TV across the room.
const IDLE_DRIFT = 0.012

/** Cubic ease-in-out — same curve d3-ease's easeCubicInOut would give us. */
function easeCubicInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/** Wrap longitude into [-180, 180] so flight tweens take the short way. */
function shortestLngDelta(from: number, to: number): number {
  let d = to - from
  while (d > 180) d -= 360
  while (d < -180) d += 360
  return d
}

/**
 * Subsolar point — the spot on Earth where the sun is directly overhead.
 * Drives the day/night terminator overlay.
 *
 * Approximation:
 *   λ_sun ≈ 180° − 15°·UTC_hour  (East-positive)
 *   φ_sun ≈ 23.44° · sin(2π · (DOY − 81) / 365)   (axial tilt)
 *
 * Good to ±1° year-round, which is well below what the eye can resolve
 * on a 380px-radius sphere. We don't need the equation of time here.
 */
function subsolarPoint(date: Date): { lat: number; lng: number } {
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
  const lng = 180 - 15 * utcHours

  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 0)
  const dayOfYear = Math.floor((date.getTime() - startOfYear) / 86_400_000)
  const lat = 23.44 * Math.sin((2 * Math.PI * (dayOfYear - 81)) / 365)

  return { lat, lng }
}

export function GlobeCanvas({ offices, children }: GlobeCanvasProps) {
  // Flight tour: cycle through offices in array order, lingering on each.
  // When no offices are visible we fall back to idle east-bound drift so
  // the screen never freezes.
  const [rotation, setRotation] = useState<[number, number]>(() => {
    if (offices.length > 0) {
      return [-offices[0].lng, -offices[0].lat]
    }
    // Nordic-centric idle pose — Norway/Sweden visible, Atlantic on the
    // left limb, Baltic on the right. Works for any audience until we
    // know which offices to tour.
    return [-15, -55]
  })
  const [activeIdx, setActiveIdx] = useState(0)
  const [now, setNow] = useState(() => new Date())

  // Refs the rAF loop reads each frame — avoids re-creating the loop when
  // offices/activeIdx change, which would visibly judder the rotation.
  const rotationRef = useRef(rotation)
  const offsetsRef = useRef(offices)
  const activeIdxRef = useRef(activeIdx)
  const phaseStartRef = useRef<number>(0)
  const phaseRef = useRef<'flight' | 'hold'>('hold')
  const fromRotRef = useRef<[number, number]>(rotation)
  const toRotRef = useRef<[number, number]>(rotation)
  rotationRef.current = rotation
  offsetsRef.current = offices
  activeIdxRef.current = activeIdx

  // Reset the tour whenever the office set changes (new workspace,
  // realtime add/remove). Snap to the first office immediately so a
  // newly-added Vilnius doesn't get skipped on its first appearance.
  const officeIds = offices.map(o => o.id).join('|')
  useEffect(() => {
    if (offices.length === 0) return
    const first = offices[0]
    const r: [number, number] = [-first.lng, -first.lat]
    setRotation(r)
    fromRotRef.current = r
    toRotRef.current = r
    setActiveIdx(0)
    phaseStartRef.current = performance.now()
    phaseRef.current = 'hold'
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officeIds])

  // Animation loop. One rAF for the whole globe — graticule, sphere, dots
  // all read the same rotation tuple from React state. We tick `now` once
  // per second separately so the day/night terminator advances without
  // forcing a 60Hz re-derivation of solar position.
  useEffect(() => {
    let raf: number
    let lastT = performance.now()
    phaseStartRef.current = lastT

    function tick(t: number) {
      const dt = t - lastT
      lastT = t
      const list = offsetsRef.current

      if (list.length === 0) {
        // Idle: drift east by IDLE_DRIFT °/ms, no phi change.
        const [lambda, phi] = rotationRef.current
        const next: [number, number] = [lambda + IDLE_DRIFT * dt, phi]
        setRotation(next)
      } else {
        const elapsed = t - phaseStartRef.current
        if (phaseRef.current === 'hold') {
          if (elapsed >= HOLD_MS) {
            // Promote to flight phase: target the next office.
            const nextIdx = (activeIdxRef.current + 1) % list.length
            const target = list[nextIdx]
            const from = rotationRef.current
            // Take the short way around the globe. d3 orthographic
            // accepts unbounded longitudes, but visually we want a
            // ≤180° sweep — never the long way.
            const dLng = shortestLngDelta(from[0], -target.lng)
            const dPhi = (-target.lat) - from[1]
            fromRotRef.current = from
            toRotRef.current = [from[0] + dLng, from[1] + dPhi]
            phaseRef.current = 'flight'
            phaseStartRef.current = t
            setActiveIdx(nextIdx)
          }
        } else {
          // flight: ease from→to over FLIGHT_MS.
          const k = Math.min(1, elapsed / FLIGHT_MS)
          const eased = easeCubicInOut(k)
          const [fl, fp] = fromRotRef.current
          const [tl, tp] = toRotRef.current
          const next: [number, number] = [
            fl + (tl - fl) * eased,
            fp + (tp - fp) * eased,
          ]
          setRotation(next)
          if (k >= 1) {
            phaseRef.current = 'hold'
            phaseStartRef.current = t
          }
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    // Solar position update — once per minute is plenty for the
    // terminator. No reason to re-render the gradient at 60Hz.
    const solarTick = setInterval(() => setNow(new Date()), 60_000)

    return () => {
      cancelAnimationFrame(raf)
      clearInterval(solarTick)
    }
  }, [])

  // Build the projection fresh per render. Allocating ~one object per
  // frame is well below GC pressure and keeps state immutable. Memo on
  // rotation so other useMemos that depend on the projection don't
  // recompute unless rotation changed.
  const projection = useMemo(() => {
    return geoOrthographic()
      .scale(R)
      .translate([CX, CY])
      .clipAngle(90)
      .rotate([rotation[0], rotation[1], 0])
  }, [rotation])

  const path = useMemo(() => geoPath(projection), [projection])

  // Pre-render the sphere outline (just a circle, but consistent with
  // d3's path so any future projection change "just works") and the
  // graticule lines.
  const sphereD = useMemo(() => path({ type: 'Sphere' }) ?? '', [path])
  const graticuleD = useMemo(() => path(geoGraticule10()) ?? '', [path])

  // Project each office through the current rotation. d3-geo's
  // orthographic projection returns null for points on the far side
  // because we set clipAngle(90) — we rebuild the [x,y] manually for
  // those so the parent can fade them out smoothly instead of clipping.
  const points: ProjectedPoint[] = useMemo(() => {
    const rotateProj = geoOrthographic()
      .scale(R)
      .translate([CX, CY])
      .rotate([rotation[0], rotation[1], 0])
    const tangent = projection.invert?.([CX, CY]) ?? [0, 0]
    const tLng = tangent[0]
    const tLat = tangent[1]

    return offices.map(o => {
      // Great-circle distance from the camera tangent (subobserver) point.
      // cos(d) = sin(φ1)·sin(φ2) + cos(φ1)·cos(φ2)·cos(Δλ)
      const φ1 = (tLat * Math.PI) / 180
      const φ2 = (o.lat * Math.PI) / 180
      const dλ = ((o.lng - tLng) * Math.PI) / 180
      const cosD = Math.sin(φ1) * Math.sin(φ2) + Math.cos(φ1) * Math.cos(φ2) * Math.cos(dλ)
      const visible = cosD > 0.02 // ≈ within ~89° of camera centre
      // Prominence falls off near the limb so labels can fade gracefully.
      // Rather than a hard 1/0 visibility flag, the parent uses cosD
      // directly — we expose it as `prominence` ∈ [0, 1] capped.
      const prominence = Math.max(0, Math.min(1, cosD))

      // Use the unclipped projection for x/y so labels don't snap to (NaN, NaN)
      // right as a point disappears around the limb — they fade out instead.
      const proj = rotateProj.clipAngle(180)([o.lng, o.lat])
      return {
        ...o,
        visible,
        x: proj?.[0] ?? CX,
        y: proj?.[1] ?? CY,
        prominence,
      }
    })
  }, [offices, projection, rotation])

  // Day/night terminator — represented as a radial gradient masked to the
  // sphere. The gradient centre sits at the subsolar point; opacity peaks
  // on the night side. Pre-projection: project the subsolar lat/lng to
  // SVG coords through the same rotation as everything else.
  const sub = subsolarPoint(now)
  const subProj = useMemo(() => {
    const p = geoOrthographic()
      .scale(R)
      .translate([CX, CY])
      .clipAngle(180)
      .rotate([rotation[0], rotation[1], 0])([sub.lng, sub.lat])
    return p ?? [CX, CY]
  }, [rotation, sub.lng, sub.lat])

  // The antisolar point (opposite side of Earth) — that's where midnight
  // is. We anchor the night-shadow gradient there.
  const antiProj = useMemo(() => {
    const p = geoOrthographic()
      .scale(R)
      .translate([CX, CY])
      .clipAngle(180)
      .rotate([rotation[0], rotation[1], 0])([sub.lng + 180, -sub.lat])
    return p ?? [CX, CY]
  }, [rotation, sub.lng, sub.lat])

  const handleSphereClick = useCallback(() => {
    // Reserved for future deep-link → office settings; today the dashboard
    // is read-only so this is a no-op.
  }, [])

  const activeId = offices[activeIdx]?.id ?? null

  return (
    <div className="relative w-full h-full overflow-hidden">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 w-full h-full"
        style={{ display: 'block' }}
        role="img"
        aria-label="Verdensglobus med kontorer"
      >
        <defs>
          {/* Globe sphere fill — subtle blue gradient that suggests an
              illuminated atmosphere without committing to a specific
              sunlight direction. The day/night overlay does the actual
              lighting work. */}
          <radialGradient id="globe-sphere" cx="35%" cy="30%" r="80%">
            <stop offset="0%"   stopColor="#5b85d6" stopOpacity={0.92} />
            <stop offset="35%"  stopColor="#2e4f8f" stopOpacity={0.95} />
            <stop offset="75%"  stopColor="#0e1e44" stopOpacity={1} />
            <stop offset="100%" stopColor="#050a1a" stopOpacity={1} />
          </radialGradient>

          {/* Day-side bloom centred on the subsolar point — adds a warm
              highlight where the sun is overhead, like Apple's Earth
              widget. Subtle: peaks at ~0.18 opacity so it doesn't blow out
              the whole disc on a TV. */}
          <radialGradient id="globe-day" cx="50%" cy="50%" r="50%"
            gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#fff5d6" stopOpacity={0.18} />
            <stop offset="40%"  stopColor="#ffd587" stopOpacity={0.06} />
            <stop offset="100%" stopColor="#ffd587" stopOpacity={0} />
          </radialGradient>

          {/* Atmosphere ring — slight bloom outside the sphere edge. */}
          <radialGradient id="globe-atmosphere" cx="50%" cy="50%" r="50%">
            <stop offset="92%"  stopColor="#7fb2ff" stopOpacity={0} />
            <stop offset="96%"  stopColor="#7fb2ff" stopOpacity={0.32} />
            <stop offset="100%" stopColor="#7fb2ff" stopOpacity={0} />
          </radialGradient>

          {/* Clip path that bounds night/day overlays to the visible
              hemisphere. Without this they leak into deep space. */}
          <clipPath id="globe-disc">
            <circle cx={CX} cy={CY} r={R} />
          </clipPath>
        </defs>

        {/* ── Star field — same approach as europe-map-canvas. Distributed
            across the full canvas so stars surround the globe. */}
        <g aria-hidden>
          {STAR_FIELD.map((s, i) => (
            <circle
              key={i}
              cx={s.x}
              cy={s.y}
              r={s.r}
              fill="white"
              opacity={s.o}
            >
              <animate
                attributeName="opacity"
                values={`${s.o * 0.35};${s.o};${s.o * 0.35}`}
                dur={`${4 + (i % 5)}s`}
                begin={`${(i % 9) * 0.3}s`}
                repeatCount="indefinite"
              />
            </circle>
          ))}
        </g>

        {/* ── Atmospheric outer glow ring. ───────────────────────────── */}
        <circle
          cx={CX}
          cy={CY}
          r={R + 30}
          fill="url(#globe-atmosphere)"
          opacity={0.85}
        />

        {/* ── Sphere body. ─────────────────────────────────────────────
            We draw the sphere as a path from d3 (which respects the
            ortho boundary) layered with the gradient. Click handler is
            currently a no-op — wired for future deep-link. */}
        <path
          d={sphereD}
          fill="url(#globe-sphere)"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={0.8}
          onClick={handleSphereClick}
        />

        {/* ── Day-side highlight at subsolar point. ──────────────────── */}
        <g clipPath="url(#globe-disc)">
          <circle
            cx={subProj[0]}
            cy={subProj[1]}
            r={R * 0.95}
            fill="url(#globe-day)"
          />
        </g>

        {/* ── Graticule (lat/lng grid, 10° spacing). Drawn after sphere
            so the lines sit on the ball, before night shading so they
            disappear softly into the dark side. ─────────────────────── */}
        <path
          d={graticuleD}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={0.6}
        />

        {/* ── Night shading. Drawn on top so it dims everything beneath
            on the night hemisphere — sphere fill, graticule, even the
            limb of the day-side bloom. ─────────────────────────────── */}
        <g clipPath="url(#globe-disc)">
          <NightShadow centreX={antiProj[0]} centreY={antiProj[1]} r={R} />
        </g>

        {/* ── Sphere edge highlight — crisp limb so the disc reads
            against deep space even when the night side is facing us. */}
        <circle
          cx={CX}
          cy={CY}
          r={R}
          fill="none"
          stroke="rgba(180,210,255,0.32)"
          strokeWidth={1.2}
        />

        {/* ── Great-circle arcs connecting visible offices. Apple-vision-
            style "data flowing across the network" feel — only render
            arcs where both endpoints are on the visible hemisphere so
            we don't draw chords through the planet. ─────────────────── */}
        <g fill="none" pointerEvents="none">
          {points.map((a, i) =>
            points.slice(i + 1).map(b => {
              if (!a.visible || !b.visible) return null
              const arcPath = path({
                type: 'LineString',
                coordinates: [
                  [a.lng, a.lat],
                  [b.lng, b.lat],
                ],
              })
              if (!arcPath) return null
              return (
                <path
                  key={`arc-${a.id}-${b.id}`}
                  d={arcPath}
                  stroke="rgba(140, 200, 255, 0.22)"
                  strokeWidth={1.1}
                  strokeLinecap="round"
                  strokeDasharray="2 6"
                />
              )
            })
          )}
        </g>

        {/* ── Office dots. Pulsing on the visible side, hidden via opacity
            on the far side. Active office gets a brighter halo. */}
        <g>
          {points.map(p => {
            const opacity = p.visible ? 0.65 + 0.35 * p.prominence : 0
            const isActive = p.id === activeId
            return (
              <g key={p.id} transform={`translate(${p.x} ${p.y})`} style={{ opacity, transition: 'opacity 600ms ease' }}>
                {isActive && (
                  <circle r={18} fill="rgba(0, 245, 200, 0.2)">
                    <animate attributeName="r" values="14;26;14" dur="2.4s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.35;0.05;0.35" dur="2.4s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle
                  r={6.5}
                  fill={isActive ? '#00F5C8' : '#7FB2FF'}
                  stroke="rgba(255,255,255,0.85)"
                  strokeWidth={1.5}
                  style={{ filter: `drop-shadow(0 0 6px ${isActive ? 'rgba(0,245,200,0.7)' : 'rgba(127,178,255,0.55)'})` }}
                />
              </g>
            )
          })}
        </g>
      </svg>

      {/* Render-prop slot — parent draws labels in normal DOM (foreignObject
          inside SVG works but div-on-top with absolute positioning is
          easier to animate with framer-motion). The parent transforms
          using points[*].x / .y which are in viewBox space; pair with a
          containing element that scales the same way. */}
      {children({ points, activeId, centre: { x: CX, y: CY }, radius: R })}
    </div>
  )
}

/**
 * Night-side shadow helper. Splits into its own component so the
 * `<radialGradient>` defining the shadow centre can be re-anchored each
 * time the antisolar point moves without re-running every other defs
 * gradient through React's diff.
 */
function NightShadow({ centreX, centreY, r }: { centreX: number; centreY: number; r: number }) {
  const id = `night-${centreX.toFixed(0)}-${centreY.toFixed(0)}`
  return (
    <>
      <defs>
        <radialGradient
          id={id}
          cx={centreX}
          cy={centreY}
          r={r}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#000010" stopOpacity={0.74} />
          <stop offset="55%" stopColor="#000018" stopOpacity={0.5} />
          <stop offset="85%" stopColor="#000000" stopOpacity={0.18} />
          <stop offset="100%" stopColor="#000000" stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle cx={centreX} cy={centreY} r={r * 1.05} fill={`url(#${id})`} />
    </>
  )
}

// ── Stable pseudo-random star field. Seeded once at module load. ─────
const STAR_FIELD = (() => {
  const stars: Array<{ x: number; y: number; r: number; o: number }> = []
  let seed = 4242
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  for (let i = 0; i < 220; i++) {
    const x = rnd() * W
    const y = rnd() * H
    // Avoid stars inside the sphere — they'd render behind it anyway,
    // but cluster check keeps them clearly in deep space.
    const dx = x - CX
    const dy = y - CY
    if (Math.sqrt(dx * dx + dy * dy) < R + 20) continue
    const bright = rnd()
    stars.push({
      x,
      y,
      r: bright > 0.92 ? 1.2 : bright > 0.7 ? 0.75 : 0.45,
      o: 0.18 + rnd() * 0.4,
    })
  }
  return stars
})()
