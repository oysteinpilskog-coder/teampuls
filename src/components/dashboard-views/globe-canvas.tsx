'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { geoOrthographic, geoPath } from 'd3-geo'
import { loadLandDots, type LandDot } from '@/lib/globe-dots'

/**
 * One office input to the globe. `id` survives across rotations so
 * the parent can correlate labels with `activeId` in the callback.
 */
export interface GlobePoint {
  id: string
  lat: number
  lng: number
  city: string
}

/**
 * Snapshot of one office after orthographic projection. `visible`
 * reflects whether the great-circle distance from the camera tangent
 * point is < 90°. `prominence` ∈ [0, 1] decays smoothly toward the
 * limb so labels can fade out instead of clipping mid-glyph.
 */
export interface ProjectedPoint extends GlobePoint {
  visible: boolean
  x: number
  y: number
  prominence: number
}

interface GlobeCanvasProps {
  offices: GlobePoint[]
  /** Render-prop fired every animation frame. Receives projected
   *  points and the currently-focused office id. */
  children: (ctx: {
    points: ProjectedPoint[]
    activeId: string | null
    centre: { x: number; y: number }
    radius: number
  }) => React.ReactNode
}

// Canvas frame matches the other dashboard maps so chrome is shared.
const W = 1400
const H = 900
const CX = W / 2
const CY = H / 2 - 18
const R = 380

// Hold time per office for the side label cycle, in ms. The camera
// itself never flies — only the highlight + side label change.
const HOLD_MS = 6_000

// Globe rotation speed, degrees per ms. 0.012 = ~4.3°/s, so a full
// revolution every ~84s. Slow enough to feel ambient on a TV but
// fast enough that you can see Earth turning across the room.
const SPIN_RATE = 0.012

// Subsolar latitude is small year-round (max ±23.44°). For the
// hardcoded camera tilt we lock phi at -15° so northern offices
// (Nordics, UK) sit comfortably above the equator without putting
// the south pole on screen.
const CAMERA_PHI = -15

/** Cubic ease-in-out — for the active-office swap fade. */
function easeCubicInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/**
 * Subsolar point — where the sun is directly overhead.
 *   λ_sun ≈ 180° − 15°·UTC_hour
 *   φ_sun ≈ 23.44° · sin(2π · (DOY − 81) / 365)
 * Good to ±1° year-round.
 */
function subsolarPoint(date: Date): { lat: number; lng: number } {
  const utcHours =
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
  const lng = 180 - 15 * utcHours
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 0)
  const dayOfYear = Math.floor((date.getTime() - startOfYear) / 86_400_000)
  const lat = 23.44 * Math.sin((2 * Math.PI * (dayOfYear - 81)) / 365)
  return { lat, lng }
}

export function GlobeCanvas({ offices, children }: GlobeCanvasProps) {
  // Continuous-rotation state. lambda increments every frame, phi
  // is fixed so the world spins around its actual axis (no wobble).
  const [lambda, setLambda] = useState(0)
  const [activeIdx, setActiveIdx] = useState(0)
  const [now, setNow] = useState(() => new Date())
  // Land-dot grid is async-loaded; null until the first await resolves.
  // The globe still renders without it (just sphere + atmosphere) so
  // there's no blocking flash.
  const [landDots, setLandDots] = useState<LandDot[] | null>(null)

  const lambdaRef = useRef(lambda)
  const officesRef = useRef(offices)
  const activeIdxRef = useRef(activeIdx)
  const lastSwapRef = useRef(performance.now())
  lambdaRef.current = lambda
  officesRef.current = offices
  activeIdxRef.current = activeIdx

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // Pixel-ratio-aware backing-store sizing. Re-runs on mount to
  // catch retina TVs without forcing a re-layout every frame.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.scale(dpr, dpr)
  }, [])

  // Async-load the land mass dot grid. Once it lands we keep the
  // result in module-level cache so subsequent mounts (after a
  // BrandTransition or workspace switch) are instant.
  useEffect(() => {
    let cancelled = false
    loadLandDots()
      .then(dots => {
        if (!cancelled) setLandDots(dots)
      })
      .catch(err => {
        console.error('[globe-canvas] failed to load land dots', err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Reset the active-office cycle whenever the office set changes.
  const officeIds = offices.map(o => o.id).join('|')
  useEffect(() => {
    setActiveIdx(0)
    lastSwapRef.current = performance.now()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officeIds])

  // Animation loop — one rAF for everything that moves.
  // Updates rotation state continuously, swaps active office every
  // HOLD_MS. Solar position ticks separately (once a minute).
  useEffect(() => {
    let raf: number
    let lastT = performance.now()
    function tick(t: number) {
      const dt = t - lastT
      lastT = t
      const next = lambdaRef.current + SPIN_RATE * dt
      // Wrap to [-180, 180] so the number doesn't grow unboundedly
      // (would hurt floating-point precision after a long TV day).
      const wrapped = ((next + 180) % 360) - 180
      setLambda(wrapped)

      const list = officesRef.current
      if (list.length > 0 && t - lastSwapRef.current >= HOLD_MS) {
        setActiveIdx(i => (i + 1) % list.length)
        lastSwapRef.current = t
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const solarTick = setInterval(() => setNow(new Date()), 60_000)
    return () => {
      cancelAnimationFrame(raf)
      clearInterval(solarTick)
    }
  }, [])

  // Build the projection fresh per render. Cheap; allocating one
  // builder per frame is well below GC pressure.
  const projection = useMemo(() => {
    return geoOrthographic()
      .scale(R)
      .translate([CX, CY])
      .clipAngle(90)
      .rotate([lambda, CAMERA_PHI, 0])
  }, [lambda])

  const path = useMemo(() => geoPath(projection), [projection])
  const sphereD = useMemo(() => path({ type: 'Sphere' }) ?? '', [path])

  // Project each office through the current rotation.
  const points: ProjectedPoint[] = useMemo(() => {
    const tangent = projection.invert?.([CX, CY]) ?? [0, 0]
    const tLng = tangent[0]
    const tLat = tangent[1]
    const φ1 = (tLat * Math.PI) / 180

    // Unclipped projection so points on the back hemisphere still
    // get a stable (x,y) — they'll be hidden via the `visible` flag
    // and a 0-opacity fade rather than snapping to NaN.
    const unclipped = geoOrthographic()
      .scale(R)
      .translate([CX, CY])
      .rotate([lambda, CAMERA_PHI, 0])

    return offices.map(o => {
      const φ2 = (o.lat * Math.PI) / 180
      const dλ = ((o.lng - tLng) * Math.PI) / 180
      const cosD =
        Math.sin(φ1) * Math.sin(φ2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.cos(dλ)
      const visible = cosD > 0.02
      const prominence = Math.max(0, Math.min(1, cosD))
      const proj = unclipped([o.lng, o.lat])
      return {
        ...o,
        visible,
        x: proj?.[0] ?? CX,
        y: proj?.[1] ?? CY,
        prominence,
      }
    })
  }, [offices, projection, lambda])

  // Subsolar / antisolar projection for the day-night terminator.
  const sub = subsolarPoint(now)
  const subProj = useMemo(() => {
    const p = geoOrthographic()
      .scale(R)
      .translate([CX, CY])
      .clipAngle(180)
      .rotate([lambda, CAMERA_PHI, 0])([sub.lng, sub.lat])
    return p ?? [CX, CY]
  }, [lambda, sub.lng, sub.lat])
  const antiProj = useMemo(() => {
    const p = geoOrthographic()
      .scale(R)
      .translate([CX, CY])
      .clipAngle(180)
      .rotate([lambda, CAMERA_PHI, 0])([sub.lng + 180, -sub.lat])
    return p ?? [CX, CY]
  }, [lambda, sub.lng, sub.lat])

  // Imperative canvas paint of the land dots. Runs every frame the
  // rotation state changes — React's reconciler triggers our useEffect
  // through the lambda dependency. SVG would melt at 2 400 dots × 60 fps;
  // canvas does it cold.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !landDots) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const tangent = projection.invert?.([CX, CY]) ?? [0, 0]
    const tLng = tangent[0]
    const tLat = tangent[1]
    const φ1 = (tLat * Math.PI) / 180

    const subLngRad = (sub.lng * Math.PI) / 180
    const subLatRad = (sub.lat * Math.PI) / 180

    for (const dot of landDots) {
      const φ2 = (dot.lat * Math.PI) / 180
      const dλ = ((dot.lng - tLng) * Math.PI) / 180
      const cosD =
        Math.sin(φ1) * Math.sin(φ2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.cos(dλ)
      if (cosD <= 0.02) continue // back side

      const proj = projection([dot.lng, dot.lat])
      if (!proj) continue
      const [x, y] = proj

      // Day/night shading per dot — compute the great-circle distance
      // from the dot to the subsolar point. cos(d) > 0 → day side,
      // < 0 → night. Smooth blend so the terminator reads as a soft
      // band, not a hard line (gives that satellite-photo glow).
      const sλ = (dot.lng * Math.PI) / 180 - subLngRad
      const cosSun =
        Math.sin(subLatRad) * Math.sin(φ2) +
        Math.cos(subLatRad) * Math.cos(φ2) * Math.cos(sλ)
      // 0..1 day intensity. Soft 30° terminator band.
      const dayMix = Math.max(0, Math.min(1, (cosSun + 0.25) * 2))

      // Day side: warm cyan-blue. Night side: cool deep indigo.
      // Lerp by dayMix. Limb fade via cosD so the disc edge softens.
      const baseR = 80 + dayMix * 100
      const baseG = 130 + dayMix * 90
      const baseB = 200 + dayMix * 55
      const limbFade = Math.pow(cosD, 0.55) // crisper centre, softer limb
      const alpha = 0.35 + 0.55 * limbFade * (0.55 + 0.45 * dayMix)

      ctx.fillStyle = `rgba(${baseR | 0}, ${baseG | 0}, ${baseB | 0}, ${alpha.toFixed(3)})`
      const radius = 1.05 + 0.55 * limbFade
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [projection, landDots, sub.lng, sub.lat])

  const activeId = offices[activeIdx]?.id ?? null

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Star field — pure SVG, animated via CSS keyframes. Sits
          behind everything else. */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 w-full h-full"
        style={{ display: 'block' }}
        aria-hidden
      >
        <style>{`
          @keyframes globe-twinkle { 0%, 100% { opacity: var(--s-min); } 50% { opacity: var(--s-max); } }
          .globe-stars circle {
            animation: globe-twinkle var(--s-dur, 6s) ease-in-out infinite;
            animation-delay: var(--s-delay, 0s);
          }
          @media (prefers-reduced-motion: reduce) {
            .globe-stars circle { animation: none; opacity: var(--s-max); }
          }
        `}</style>
        <g className="globe-stars">
          {STAR_FIELD.map((s, i) => (
            <circle
              key={i}
              cx={s.x}
              cy={s.y}
              r={s.r}
              fill="white"
              style={{
                ['--s-min' as string]: (s.o * 0.35).toFixed(3),
                ['--s-max' as string]: s.o.toFixed(3),
                ['--s-dur' as string]: `${4 + (i % 5)}s`,
                ['--s-delay' as string]: `${(i % 9) * 0.3}s`,
              }}
            />
          ))}
        </g>
      </svg>

      {/* Atmospheric outer halo — large, soft, multi-stop so the
          edge-glow reads on a TV without looking like a Photoshop
          stroke. Two concentric circles with different blurs do the
          two-layer bloom. */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ display: 'block' }}
        aria-hidden
      >
        <defs>
          <radialGradient id="atm-outer" cx="50%" cy="50%" r="50%">
            <stop offset="74%" stopColor="rgba(120, 180, 255, 0)" />
            <stop offset="86%" stopColor="rgba(120, 180, 255, 0.1)" />
            <stop offset="94%" stopColor="rgba(140, 200, 255, 0.32)" />
            <stop offset="98%" stopColor="rgba(170, 220, 255, 0.18)" />
            <stop offset="100%" stopColor="rgba(140, 200, 255, 0)" />
          </radialGradient>
          <radialGradient id="atm-inner" cx="50%" cy="50%" r="50%">
            <stop offset="86%" stopColor="rgba(180, 220, 255, 0)" />
            <stop offset="96%" stopColor="rgba(200, 230, 255, 0.42)" />
            <stop offset="100%" stopColor="rgba(200, 230, 255, 0)" />
          </radialGradient>
          <radialGradient id="globe-disc-fill" cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#1e3970" stopOpacity={0.92} />
            <stop offset="45%" stopColor="#0d1f4a" stopOpacity={0.95} />
            <stop offset="78%" stopColor="#06102a" stopOpacity={1} />
            <stop offset="100%" stopColor="#020615" stopOpacity={1} />
          </radialGradient>
          <radialGradient
            id="globe-day"
            cx="50%"
            cy="50%"
            r="50%"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#fff5d6" stopOpacity={0.22} />
            <stop offset="40%" stopColor="#ffd587" stopOpacity={0.07} />
            <stop offset="100%" stopColor="#ffd587" stopOpacity={0} />
          </radialGradient>
          <radialGradient
            id="globe-night"
            cx="50%"
            cy="50%"
            r="50%"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#000010" stopOpacity={0.7} />
            <stop offset="55%" stopColor="#000018" stopOpacity={0.45} />
            <stop offset="85%" stopColor="#000000" stopOpacity={0.16} />
            <stop offset="100%" stopColor="#000000" stopOpacity={0} />
          </radialGradient>
          <clipPath id="globe-clip">
            <circle cx={CX} cy={CY} r={R} />
          </clipPath>
        </defs>

        {/* Outer atmosphere — extends 60 px past the sphere edge so
            the bloom is unmistakable on a 65" TV. */}
        <circle cx={CX} cy={CY} r={R + 60} fill="url(#atm-outer)" />
        <circle cx={CX} cy={CY} r={R + 14} fill="url(#atm-inner)" />

        {/* Sphere base fill. Dark inside the disc — the dotted layer
            on top reads against this as land. */}
        <path d={sphereD} fill="url(#globe-disc-fill)" />
      </svg>

      {/* Canvas layer for the dotted land masses. Sized to the same
          viewBox as the SVG; CSS scales them in lockstep. */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          // Keep the canvas centred and proportional like the SVGs
          // (preserveAspectRatio meet equivalent for canvas).
          objectFit: 'contain',
        }}
        aria-hidden
      />

      {/* Day/night overlay drawn on top of the canvas. Anchored to
          subsolar / antisolar projected coords so the terminator
          glides as the globe spins. */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ display: 'block' }}
        aria-hidden
      >
        <g clipPath="url(#globe-clip)">
          {/* Re-declare gradients in this SVG; SVG defs don't cross
              <svg> boundaries so we'd lose the fills otherwise. */}
          <defs>
            <radialGradient
              id="day-bloom"
              cx={subProj[0]}
              cy={subProj[1]}
              r={R * 0.95}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#fff5d6" stopOpacity={0.22} />
              <stop offset="40%" stopColor="#ffd587" stopOpacity={0.07} />
              <stop offset="100%" stopColor="#ffd587" stopOpacity={0} />
            </radialGradient>
            <radialGradient
              id="night-cap"
              cx={antiProj[0]}
              cy={antiProj[1]}
              r={R}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#000010" stopOpacity={0.7} />
              <stop offset="55%" stopColor="#000018" stopOpacity={0.45} />
              <stop offset="85%" stopColor="#000000" stopOpacity={0.16} />
              <stop offset="100%" stopColor="#000000" stopOpacity={0} />
            </radialGradient>
          </defs>
          <circle cx={subProj[0]} cy={subProj[1]} r={R * 0.95} fill="url(#day-bloom)" />
          <circle cx={antiProj[0]} cy={antiProj[1]} r={R * 1.05} fill="url(#night-cap)" />
        </g>

        {/* Crisp limb outline so the disc reads against deep space. */}
        <circle
          cx={CX}
          cy={CY}
          r={R}
          fill="none"
          stroke="rgba(180,210,255,0.42)"
          strokeWidth={1.4}
        />

        {/* Office markers + great-circle arcs between visible offices.
            Renders in SVG so animations can use SMIL (active halo
            pulse) and motion is decoupled from the 60 fps canvas
            draw. */}
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
                  stroke="rgba(150, 210, 255, 0.32)"
                  strokeWidth={1.1}
                  strokeLinecap="round"
                  strokeDasharray="2 7"
                />
              )
            })
          )}
        </g>

        <g>
          {points.map(p => {
            const opacity = p.visible ? 0.65 + 0.35 * p.prominence : 0
            const isActive = p.id === activeId
            return (
              <g
                key={p.id}
                transform={`translate(${p.x} ${p.y})`}
                style={{ opacity, transition: 'opacity 600ms ease' }}
              >
                {isActive && (
                  <circle r={20} fill="rgba(0, 245, 200, 0.22)">
                    <animate
                      attributeName="r"
                      values="14;30;14"
                      dur="2.4s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values="0.4;0.05;0.4"
                      dur="2.4s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}
                <circle
                  r={isActive ? 7.5 : 5.5}
                  fill={isActive ? '#00F5C8' : '#9FCBFF'}
                  stroke="rgba(255,255,255,0.92)"
                  strokeWidth={1.5}
                  style={{
                    filter: `drop-shadow(0 0 ${isActive ? 12 : 8}px ${
                      isActive ? 'rgba(0,245,200,0.7)' : 'rgba(159,203,255,0.55)'
                    })`,
                  }}
                />
              </g>
            )
          })}
        </g>
      </svg>

      {/* Render-prop slot — parent draws labels in normal DOM. */}
      {children({ points, activeId, centre: { x: CX, y: CY }, radius: R })}
    </div>
  )
}

// We keep `easeCubicInOut` exported as a named symbol so future
// callers (label fade-in, etc.) can share the same curve without
// duplicating the polynomial. Currently only used by the parent.
export { easeCubicInOut }

// ── Stable seeded star field ──────────────────────────────────────
const STAR_FIELD = (() => {
  const stars: Array<{ x: number; y: number; r: number; o: number }> = []
  let seed = 4242
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  for (let i = 0; i < 240; i++) {
    const x = rnd() * W
    const y = rnd() * H
    const dx = x - CX
    const dy = y - CY
    if (Math.sqrt(dx * dx + dy * dy) < R + 70) continue
    const bright = rnd()
    stars.push({
      x,
      y,
      r: bright > 0.92 ? 1.3 : bright > 0.7 ? 0.8 : 0.45,
      o: 0.18 + rnd() * 0.42,
    })
  }
  return stars
})()
